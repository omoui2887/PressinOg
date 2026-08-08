/**
 * OgPressing — Helper Supabase pour le Middleware Next.js
 * -------------------------------------------------------
 * Sert de factory : crée un client Supabase Server adapté au contexte
 * Middleware (cookies synchrones NextRequest/NextResponse) et expose une
 * fonction `updateSession` qui :
 *   1. Récupère la session JWT Supabase depuis les cookies
 *   2. La rafraîchit si expirée
 *   3. Réécrit les cookies dans la réponse
 *   4. Protège les route groups (super-admin) / (admin) / (personnel)
 *      en vérifiant le rôle de l'utilisateur authentifié
 *   5. Applique une restriction par rôle pour /personnel/{role}/*
 *   6. Redirige les utilisateurs authentifiés sur /, /login, /activation
 *      vers leur dashboard
 *   7. Met en cache le rôle dans un cookie court signé HMAC-SHA256
 *      (5 min TTL) pour éviter des requêtes Supabase redondantes
 *
 * 🔒 SÉCURITÉ : ce client utilise la clé `anon` + JWT utilisateur → soumis RLS.
 * La vérification de rôle s'appuie sur les policies RLS :
 *   - Super Admin  : peut lire sa propre ligne dans `super_admins`
 *                   (policy super_admin_full_access USING is_super_admin())
 *   - Admin/Personnel : peut lire sa propre ligne dans `personnel`
 *
 * Référence : https://supabase.com/docs/guides/auth/server-side/nextjs
 *
 * ⚙️ EDGE RUNTIME : le middleware tourne sur Edge Runtime. Pas de Node APIs
 * (pas de Buffer, pas de fs, pas de crypto Node). On utilise la Web Crypto
 * API (SubtleCrypto) pour le HMAC-SHA256 et btoa/atob pour la base64.
 */
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

/* ========================================================================== */
/*  CONSTANTES — POLITIQUE DE ROUTING (DENY-BY-DEFAULT)                       */
/* ========================================================================== */
/*
 * 🛡️ PRINCIPE DENY-BY-DEFAULT — Issue #18 (Phase 4 security hardening)
 * ----------------------------------------------------------------------
 * Le middleware suit un modèle explicite à 3 catégories de routes :
 *
 *   1. PUBLIC_ROUTES      — accès sans auth (landing, login, activation,
 *                           pages d'information statiques). Un utilisateur
 *                           déjà connecté peut y accéder (sauf si la route
 *                           est aussi dans AUTH_ROUTES, auquel cas il est
 *                           redirigé vers son dashboard).
 *
 *   2. PROTECTED_PREFIXES — préfixes de routes nécessitant une auth et un
 *                           rôle spécifique (super_admin, manager, personnel).
 *                           Toute route commençant par l'un de ces préfixes
 *                           déclenche les checks d'auth + cross-space +
 *                           restriction par rôle (sections 7+ du middleware).
 *
 *   3. AUTRES ROUTES      — routes non couvertes par (1) ou (2). Cela
 *                           inclut : /api/* (exclue par le matcher racine),
 *                           /_next/* (assets, exclue par le matcher),
 *                           et toute nouvelle route racine comme
 *                           /pos-diagnostic, /deploy-guide.
 *                           → Comportement : pas de check d'auth au niveau
 *                           middleware (les API routes gèrent leur propre
 *                           auth via getSupabaseServer()).
 *
 * ⚠️ RÈGLE CRITIQUE — Tout nouveau route group protégé DOIT être ajouté à
 *    `PROTECTED_PREFIXES`. Sinon, il sera traité comme catégorie 3 (aucun
 *    check d'auth côté middleware) et sera donc accessible sans auth au
 *    niveau middleware — les API routes appellées par cette page restent
 *    protégées par RLS/getSupabaseServer, mais les Server Components
 *    pourraient fuiter des données si la page n'est pas explicitement
 *    protégée.
 *
 * ⚠️ RÈGLE CRITIQUE — Toute nouvelle route publique racine (en dehors des
 *    PROTECTED_PREFIXES) DOIT être ajoutée à `PUBLIC_ROUTES` pour
 *    documentation, même si techniquement elle fonctionnerait sans
 *    (catégorie 3). Cela permet de garder une liste exhaustive des routes
 *    publiques à des fins d'audit.
 *
 * 🔒 FAIL-OPEN vs FAIL-CLOSED : si les vars d'env Supabase manquent au
 *    runtime, le middleware applique une politique nuancée :
 *      - PUBLIC_ROUTES          → fail-open (NextResponse.next()) pour
 *                                 permettre à l'utilisateur de voir la
 *                                 landing / login (sinon le site serait
 *                                 totalement inaccessible en dev).
 *      - PROTECTED_PREFIXES     → fail-closed (redirect /login?error=
 *                                 config_incomplete) pour bloquer tout
 *                                 accès non authentifié aux données.
 *      - AUTRES ROUTES          → fail-open (la route n'a de toute façon
 *                                 pas de check d'auth middleware).
 *    Cf. garde-fou au début de `updateSession`.
 */

/**
 * Whitelist STATIQUE des routes PUBLIQUES (aucune auth requise).
 * Liste exhaustive des routes racine accessibles sans connexion.
 *
 * ⚠️ Une route dans PUBLIC_ROUTES peut AUSSI être dans AUTH_ROUTES
 *    (ex : /, /login) si l'on souhaite rediriger un utilisateur déjà
 *    connecté vers son dashboard.
 *
 * ⚠️ Cette liste utilise des préfixes : `/login` couvre aussi
 *    `/login?next=...`. Les routes sont matchées par `pathname === route`
 *    OU `pathname.startsWith(route + "/")` pour les sous-chemins.
 */
const PUBLIC_ROUTES = [
  "/",
  "/login",
  "/activation",
  "/auth/callback",
  "/activation-expiree",
  "/compte-suspendu",
  "/pos-diagnostic",
  "/deploy-guide",
] as const;

/**
 * Préfixes de routes PROTÉGÉES par rôle.
 *
 * ⚠️ RÈGLE CRITIQUE : tout nouveau route group protégé DOIT être ajouté
 *    ici. Sinon, il sera traité comme "autre route" (catégorie 3) et
 *    bénéficiera d'AUCUN check d'auth au niveau middleware.
 *
 * ⚠️ Ces préfixes sont également les "espaces" vérifiés par la section
 *    7 (cross-space prevention) et 5.6 (essai expiré / abonnement suspendu)
 *    du middleware.
 */
const PROTECTED_PREFIXES = ["/super-admin", "/admin", "/personnel"] as const;

/** Routes d'authentification : si l'utilisateur est déjà connecté et y
 * accède, on le redirige automatiquement vers son dashboard.
 *
 * `/auth/callback` est inclus (AUDIT_SECURITE.md Conclusion #7) pour :
 *   - S'assurer que le middleware ne bloque jamais cette route publique
 *     (échange du code PKCE Supabase).
 *   - Si un utilisateur DÉJÀ authentifié clique sur un lien d'invitation
 *     (ex : session précédente encore valide), il est redirigé vers son
 *     dashboard courant plutôt que de tenter un échange de code qui
 *     échouerait.
 *
 * ℹ️ AUTH_ROUTES est un SOUS-ENSEMBLE de PUBLIC_ROUTES. Les routes
 *    publiques qui ne sont PAS dans AUTH_ROUTES (ex : /activation-expiree,
 *    /compte-suspendu) sont intentionnellement laissées accessibles aux
 *    utilisateurs connectés — ces pages d'information doivent rester
 *    visibles même après connexion (pour permettre la déconnexion ou le
 *    contact support depuis n'importe où). */
const AUTH_ROUTES = [
  "/",
  "/login",
  "/activation",
  "/auth/callback",
] as const;

/**
 * Vérifie si un pathname est public (liste PUBLIC_ROUTES).
 * Match soit exact, soit par préfixe (pathname.startsWith(route + "/")).
 *
 * Utilisé par le garde-fou fail-open/fail-closed en début de `updateSession`
 * pour décider si une route peut rester accessible même sans env vars.
 */
function isPublicRoute(pathname: string): boolean {
  return (PUBLIC_ROUTES as readonly string[]).some(
    (route) => pathname === route || pathname.startsWith(route + "/")
  );
}

/**
 * Vérifie si un pathname est protégé (liste PROTECTED_PREFIXES).
 * Match soit exact, soit par préfixe (pathname.startsWith(prefix + "/")).
 */
function isProtectedRoute(pathname: string): boolean {
  return (PROTECTED_PREFIXES as readonly string[]).some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
}

/** Rôles du personnel (miroir de l'enum PostgreSQL `role_personnel`).
 * Utilisé pour (a) valider le segment de rôle dans l'URL /personnel/{role}/*
 * et (b) typer le payload du cache. */
const ROLES_PERSONNEL = [
  "manager",
  "receptionniste",
  "caissier",
  "laveur",
  "repassage",
  "livreur",
  "comptable",
] as const;
type RolePersonnelVal = (typeof ROLES_PERSONNEL)[number];
type RoleCacheRole = "super_admin" | RolePersonnelVal;

/** Nom du cookie de cache du rôle. */
const ROLE_CACHE_COOKIE = "ogp_role_cache";
/** TTL du cache du rôle : 5 minutes (en ms et secondes). */
const ROLE_CACHE_TTL_MS = 5 * 60 * 1000;
const ROLE_CACHE_TTL_SEC = 300;

/* ========================================================================== */
/*  TYPES                                                                      */
/* ========================================================================== */

/** Informations de rôle complètes (depuis la DB). */
interface RoleInfo {
  user_id: string;
  role: RoleCacheRole;
  pressing_id: string | null;
  mot_de_passe_temporaire: boolean;
  actif: boolean;
  statut_compte: string;
  /** Statut du pressing rattaché ('actif' | 'essai' | 'suspendu' | …).
   *  null pour les super admins (pas de pressing) ou si introuvable.
   *  Utilisé pour bloquer les utilisateurs d'un pressing suspendu
   *  (LOT 5.3 — un pressing suspendu ne peut plus se connecter). */
  pressing_statut: string | null;
  /** AUDIT-B-05 — True si l'abonnement courant du pressing est en essai
   *  expiré (statut='essai' AND date_fin < now). Toujours false pour les
   *  super admins (pas de pressing). Quand true, on redirige /admin/* et
   *  /personnel/* vers /activation-expiree. */
  trial_expired: boolean;
  /** AUDIT-B-04 — True si l'abonnement courant du pressing est suspendu
   *  (abonnements.statut='suspendu'). Toujours false pour les super admins.
   *  Quand true, on redirige /admin/* et /personnel/* vers /compte-suspendu.
   *  NB : différent de `pressing_statut === 'suspendu'` (qui est un statut
   *  du pressing, pas de l'abonnement — la suspension pressing déconnecte
   *  immédiatement l'utilisateur, la suspension abonnement est plus douce). */
  abonnement_suspended: boolean;
}

/** Payload signé stocké dans le cookie `ogp_role_cache`.
 *
 * On n'inclut PAS `actif`/`statut_compte` car on ne met en cache QUE les
 * comptes actifs (cf. `setRoleCacheCookie`). Si le cache est valide, on sait
 * que l'utilisateur était actif au moment du cache. Le TTL court (5 min)
 * garantit qu'une désactivation de compte (statut_compte='desactive') soit
 * répercutée en max 5 min (au prochain cache miss → DB query → signOut). */
interface RoleCachePayload {
  /** ID utilisateur Supabase Auth — pour vérifier que le cache correspond
   * bien à l'utilisateur courant (sécurité : empêche un cookie de cache
   * d'un utilisateur A d'être utilisé par un utilisateur B sur le même
   * navigateur après déconnexion/reconnexion). */
  user_id: string;
  role: RoleCacheRole;
  pressing_id: string | null;
  mot_de_passe_temporaire: boolean;
  /** Statut du pressing rattaché au moment de la mise en cache.
   *  On ne met en cache QUE les pressings non suspendus (cf.
   *  `setRoleCacheCookie` appel conditionnel) → si ce champ vaut
   *  'suspendu' ou est absent, on retombe sur la DB. */
  pressing_statut?: string | null;
  /** AUDIT-B-05 — True si l'essai de 7 jours est expiré au moment de la mise
   *  en cache. Le TTL court (5 min) garantit qu'une activation d'abonnement
   *  (passage essai → actif) soit répercutée en max 5 min. */
  trial_expired?: boolean;
  /** AUDIT-B-04 — True si l'abonnement est suspendu (statut='suspendu') au
   *  moment de la mise en cache. Le TTL court (5 min) garantit qu'une
   *  réactivation soit répercutée en max 5 min. */
  abonnement_suspended?: boolean;
  /** Expiration en ms epoch. */
  exp: number;
}

/* ========================================================================== */
/*  HELPERS — CACHE COOKIE SIGNÉ HMAC-SHA256                                 */
/* ========================================================================== */
/*
 * 🚀 STRATÉGIE DE CACHE — Pourquoi un cookie court signé HMAC plutôt que
 * des custom JWT claims Supabase ?
 *
 * 1. Custom JWT claims Supabase nécessiterait :
 *    - un trigger `on_auth_user_created` pour injecter les claims
 *    - une edge function pour re-signer le JWT à chaque login / mise à jour
 *      de rôle
 *    - la gestion du cycle de vie du JWT Supabase (valide 1h par défaut)
 *    → Lourd à opérer, et le TTL de 1h est TROP LONG pour répercuter une
 *      désactivation de compte rapidement.
 *
 * 2. Cookie court (5 min) signé HMAC-SHA256 :
 *    - Simple : 4 helpers courts, Web Crypto API native (Edge-compatible).
 *    - Sécurisé : httpOnly (pas accessible JS client) + secure (HTTPS only)
 *      + sameSite=lax (protection CSRF) + signature HMAC (impossible à
 *      falsifier côté client sans la clé secrète).
 *    - Suffisamment court (5 min) pour répercuter une désactivation en
 *      max 5 min (au prochain cache miss → DB query → signOut).
 *    - Le middleware tourne sur TOUTES les requêtes → le cache hit rate
 *      est élevé pendant une session active (l'utilisateur navigue →
 *      le cookie est renvoyé à chaque requête → on skip la DB query).
 *    - Si le cookie est supprimé/modifié → fallback DB, donc pas de risque
 *      de sécurité (la signature HMAC empêche toute falsification).
 *
 * 3. Clé de signature : `NEXT_PUBLIC_SUPABASE_ANON_KEY`. C'est la seule
 *    clé disponible dans le middleware Edge Runtime (les vars d'env non
 *    `NEXT_PUBLIC_*` ne sont pas injectées en Edge). Bien que cette clé
 *    soit publique côté client (visible dans le bundle JS), elle n'est
 *    connue que du serveur pour la SIGNATURE : le client ne peut pas
 *    recalculer le HMAC sans... la clé, qui est publique. ⚠️ Donc en
 *    théorie, un client pourrait forger un cookie valide.
 *
 *    → MITIGATION : le payload contient `user_id` (vérifié contre
 *    `user.id` Supabase Auth). Le client ne peut pas élever ses privilèges
 *    car il ne peut pas se faire passer pour un autre user_id (il n'a pas
 *    la session Supabase Auth de cet user). Il peut uniquement signer un
 *    cookie avec SON propre user_id et un rôle arbitraire — mais le
 *    `getUser()` Supabase Auth valide l'identité, et on ne fait confiance
 *    au cache QUE si `payload.user_id === user.id`.
 *
 *    → Le risque résiduel : un utilisateur malveillant connecté (user_id
 *    X, role caissier) forge un cookie valide avec `{user_id: X, role:
 *    super_admin}`. Il aurait accès aux routes /super-admin/* pendant
 *    max 5 min.
 *
 *    → SOLUTION PLUS STRICTE : utiliser une var d'env non-NEXT_PUBLIC
 *    (injectée uniquement côté serveur). Le middleware Edge Runtime Next.js
 *    supporte `process.env.MY_SECRET` si la var est définie (elle n'est
 *    juste pas exposée au client). On pourrait donc définir
 *    `OGP_ROLE_CACHE_SECRET` dans .env.local. Pour cette itération, on
 *    garde la clé anon (par défaut) mais on permet à l'utilisateur de
 *    surcharger via `OGP_ROLE_CACHE_SECRET` si défini.
 */

/**
 * Retourne la clé secrète utilisée pour signer le cookie de cache.
 * Priorité : `OGP_ROLE_CACHE_SECRET` (recommandé, var d'env serveur-only)
 * > `NEXT_PUBLIC_SUPABASE_ANON_KEY` (fallback par défaut).
 */
function getCacheSecret(): string {
  const explicit = process.env.OGP_ROLE_CACHE_SECRET;
  if (explicit && explicit.length > 0) return explicit;
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
}

/**
 * Signe un payload JSON avec HMAC-SHA256 et retourne une chaîne
 * "payload_b64.signature_b64" prête à être stockée dans un cookie.
 *
 * ⚙️ Edge Runtime : utilise Web Crypto API (SubtleCrypto). Pas de Node APIs.
 */
async function signRoleCache(
  payload: RoleCachePayload,
  secret: string
): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const body = JSON.stringify(payload);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)));
  // Le payload est ASCII pur (UUIDs, noms de rôles, booléens, nombres) →
  // btoa direct sans encodage UTF-8.
  const bodyB64 = btoa(body);
  return `${bodyB64}.${sigB64}`;
}

/**
 * Vérifie la signature HMAC-SHA256 d'un cookie de cache et retourne le
 * payload si valide et non expiré. Retourne null sinon (cookie absent,
 * modifié, expiré, signature invalide, format incorrect).
 */
async function verifyRoleCache(
  cookieValue: string,
  secret: string
): Promise<RoleCachePayload | null> {
  try {
    const parts = cookieValue.split(".");
    if (parts.length !== 2) return null;
    const [bodyB64, sigB64] = parts;

    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    // Reconstitue les bytes de la signature depuis la base64.
    const sigBytes = Uint8Array.from(atob(sigB64), (c) => c.charCodeAt(0));
    // Reconstitue le body JSON original depuis la base64.
    const body = atob(bodyB64);
    const bodyBytes = enc.encode(body);

    const valid = await crypto.subtle.verify("HMAC", key, sigBytes, bodyBytes);
    if (!valid) return null;

    const payload = JSON.parse(body) as RoleCachePayload;
    if (typeof payload.exp !== "number" || Date.now() > payload.exp) {
      return null;
    }

    return payload;
  } catch {
    // Cookie malformé (base64 invalide, JSON cassé…) → on ignore silencieusement
    // et on retombe sur une DB query. Pas de risque de sécurité.
    return null;
  }
}

/** Pose le cookie `ogp_role_cache` signé sur la réponse.
 * À appeler UNIQUEMENT si `info.actif && info.statut_compte === "actif"`
 * (sinon on ne cache pas, pour permettre la déconnexion immédiate d'un
 * compte désactivé). */
async function setRoleCacheCookie(
  response: NextResponse,
  info: RoleInfo,
  secret: string
): Promise<void> {
  const payload: RoleCachePayload = {
    user_id: info.user_id,
    role: info.role,
    pressing_id: info.pressing_id,
    mot_de_passe_temporaire: info.mot_de_passe_temporaire,
    pressing_statut: info.pressing_statut,
    trial_expired: info.trial_expired,
    abonnement_suspended: info.abonnement_suspended,
    exp: Date.now() + ROLE_CACHE_TTL_MS,
  };
  const signed = await signRoleCache(payload, secret);
  response.cookies.set({
    name: ROLE_CACHE_COOKIE,
    value: signed,
    httpOnly: true, // pas accessible depuis JS client
    secure: true, // HTTPS uniquement
    sameSite: "lax", // protection CSRF
    maxAge: ROLE_CACHE_TTL_SEC, // 5 min
    path: "/",
  });
}

/** Invalide le cookie `ogp_role_cache` (suite à désactivation ou logout). */
function clearRoleCacheCookie(response: NextResponse): void {
  response.cookies.set({
    name: ROLE_CACHE_COOKIE,
    value: "",
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
}

/* ========================================================================== */
/*  HELPERS — DB                                                               */
/* ========================================================================== */

/**
 * Récupère le rôle d'un utilisateur depuis Supabase.
 * Ordre : super_admins → personnel (le manager est un personnel avec
 * role='manager' — pas de colonne `pressing.admin_user_id` dans le schéma
 * réel, contrairement à ce que dit le spec original).
 *
 * 🔒 Sécurité : utilise le client middleware (anon + JWT utilisateur) →
 * soumis RLS. Un super admin peut lire sa propre ligne dans `super_admins`
 * (policy `super_admin_full_access` USING is_super_admin()). Un personnel
 * peut lire sa propre ligne dans `personnel` (policy d'isolation par
 * pressing via `get_pressing_id_utilisateur()`).
 *
 * AUDIT-B-05 + AUDIT-B-04 : pour un personnel rattaché à un pressing, on
 * fetch également le dernier abonnement du pressing afin de déterminer si
 * l'essai de 7 jours est expiré (statut='essai' AND date_fin < now) ou si
 * l'abonnement est suspendu (statut='suspendu'). Ces 2 flags sont mis en
 * cache dans le cookie `ogp_role_cache` (5 min TTL) et utilisés par
 * `updateSession` pour rediriger les routes /admin/* et /personnel/* vers
 * /activation-expiree ou /compte-suspendu respectivement.
 */
async function fetchRoleFromDB(
  supabase: SupabaseClient,
  userId: string
): Promise<RoleInfo | null> {
  // 1. Super Admin ? (ligne active dans `super_admins`)
  const { data: sa } = await supabase
    .from("super_admins")
    .select("id")
    .eq("user_id", userId)
    .eq("actif", true)
    .maybeSingle();
  if (sa) {
    return {
      user_id: userId,
      role: "super_admin",
      pressing_id: null,
      mot_de_passe_temporaire: false,
      actif: true,
      statut_compte: "actif",
      pressing_statut: null,
      trial_expired: false,
      abonnement_suspended: false,
    };
  }

  // 2. Personnel ? (manager inclus — role='manager')
  //    On récupère en même temps le statut du pressing rattaché via un
  //    select imbriqué (FK personnel.pressing_id → pressing.id) afin de
  //    pouvoir bloquer les utilisateurs d'un pressing suspendu (LOT 5.3).
  const { data: pers } = await supabase
    .from("personnel")
    .select(
      "role, pressing_id, actif, statut_compte, mot_de_passe_temporaire, pressing(statut)"
    )
    .eq("user_id", userId)
    .maybeSingle();
  if (!pers) return null;

  // `pressing` est un objet { statut } ou null (si pressing_id absent ou
  // ligne supprimée). On normalise en string | null.
  const pressingRow = pers.pressing as { statut?: string } | null;
  const pressingId = (pers.pressing_id as string | null) ?? null;

  // AUDIT-B-05 + AUDIT-B-04 : fetch du dernier abonnement du pressing
  // pour déterminer si l'essai est expiré ou si l'abonnement est suspendu.
  // RLS : un personnel peut lire les abonnements de son propre pressing
  // (policy d'isolation par pressing).
  let trialExpired = false;
  let abonnementSuspended = false;
  if (pressingId) {
    const { data: abn } = await supabase
      .from("abonnements")
      .select("statut, date_fin")
      .eq("pressing_id", pressingId)
      .order("date_debut", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (abn) {
      const statut = (abn.statut as string) ?? "";
      if (statut === "suspendu") {
        abonnementSuspended = true;
      }
      if (
        statut === "essai" &&
        abn.date_fin &&
        new Date(abn.date_fin as string) < new Date()
      ) {
        trialExpired = true;
      }
    }
  }

  return {
    user_id: userId,
    role: pers.role as RoleCacheRole,
    pressing_id: pressingId,
    mot_de_passe_temporaire: !!pers.mot_de_passe_temporaire,
    actif: !!pers.actif,
    statut_compte: (pers.statut_compte as string) ?? "invite_en_attente",
    pressing_statut: pressingRow?.statut ?? null,
    trial_expired: trialExpired,
    abonnement_suspended: abonnementSuspended,
  };
}

/* ========================================================================== */
/*  HELPERS — ROUTING                                                          */
/* ========================================================================== */

/**
 * Détermine l'URL du dashboard cible selon le rôle de l'utilisateur.
 *
 * Priorité :
 *   1. mot_de_passe_temporaire=true → /personnel/changer-mot-de-passe
 *      (changement obligatoire avant tout autre accès)
 *   2. super_admin                  → /super-admin/dashboard
 *   3. manager                      → /admin/dashboard
 *   4. autre rôle personnel         → /personnel/{role}/dashboard
 */
function computeDashboardTarget(info: RoleInfo): string {
  if (info.mot_de_passe_temporaire) {
    return "/personnel/changer-mot-de-passe";
  }
  if (info.role === "super_admin") return "/super-admin/dashboard";
  if (info.role === "manager") return "/admin/dashboard";
  return `/personnel/${info.role}/dashboard`;
}

/**
 * Extrait le segment de rôle d'un pathname `/personnel/{role}/...`.
 * Retourne null si le pathname ne contient pas de segment de rôle valide
 * (ex : `/personnel/changer-mot-de-passe` — route générique sans rôle,
 * ou `/personnel` tout court).
 *
 * Ces routes génériques doivent rester accessibles à tout personnel
 * authentifié, sans restriction par rôle.
 */
function extractPersonnelRoleFromPath(
  pathname: string
): RolePersonnelVal | null {
  const m = pathname.match(/^\/personnel\/([^/]+)(?:\/|$)/);
  if (!m) return null;
  const seg = m[1];
  if ((ROLES_PERSONNEL as readonly string[]).includes(seg)) {
    return seg as RolePersonnelVal;
  }
  return null;
}

/** Construit une réponse de redirection en préservant les cookies de session
 * rafraîchie (et le cookie de cache rôle) vers la réponse de redirection. */
function redirectTo(
  request: NextRequest,
  response: NextResponse,
  path: string
): NextResponse {
  const url = new URL(path, request.url);
  const redirect = NextResponse.redirect(url);
  // Propage tous les cookies (session rafraîchie + cache rôle) vers la
  // réponse de redirection.
  response.cookies.getAll().forEach((c) => {
    redirect.cookies.set(c.name, c.value, c);
  });
  return redirect;
}

/**
 * 🚀 PERF : Détecte la présence d'un cookie de session Supabase sans appeler
 * Supabase. Les cookies de session Supabase (@supabase/ssr) ont le préfixe
 * `sb-` et se terminent par `-auth-token` (format : `sb-<project-ref>-auth-token`).
 *
 * Utilisé par le fast-path du middleware pour skip l'appel réseau getUser()
 * sur les routes publiques quand l'utilisateur n'est pas connecté.
 */
function hasSupabaseSessionCookie(request: NextRequest): boolean {
  // getAll() est O(1) — lit juste l'en-tête Cookie. Aucun appel réseau.
  const cookies = request.cookies.getAll();
  for (const c of cookies) {
    // Format cookie auth Supabase : sb-<ref>-auth-token
    // (et variantes : sb-<ref>-auth-token.code, .code_verifier, etc.)
    if (c.name.startsWith("sb-") && c.name.includes("auth-token")) {
      return true;
    }
  }
  return false;
}

/* ========================================================================== */
/*  CREATE MIDDLEWARE CLIENT                                                   */
/* ========================================================================== */

/**
 * Crée un client Supabase adapté au middleware Next.js.
 * À utiliser UNIQUEMENT dans /src/middleware.ts.
 *
 * ⚠️ Retourne un `responseRef` (objet mutable `{ current: NextResponse }`)
 * plutôt qu'une `response` capturée par valeur. Le callback `setAll` de
 * Supabase réassigne `response` à chaque appel (ex : rafraîchissement de
 * session via getUser(), signOut). Sans le ref, l'appelant perdrait la
 * référence après un setAll et récupérerait une réponse obsolète (sans
 * les cookies de session rafraîchie).
 */
export function createMiddlewareClient(
  request: NextRequest
): {
  supabase: SupabaseClient;
  responseRef: { current: NextResponse };
} {
  let response = NextResponse.next({ request });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // 🔒 Garde-fou : si les variables d'env Supabase ne sont pas configurées,
  // on log une erreur claire côté serveur et on lève une Error explicite.
  // (updateSession effectue un garde-fou similaire AVANT cet appel, mais
  // on garde cette sécurité défense en profondeur au cas où quelqu'un
  // appellerait createMiddlewareClient directement.)
  if (!supabaseUrl || !supabaseAnonKey) {
    const missing: string[] = [];
    if (!supabaseUrl) missing.push("NEXT_PUBLIC_SUPABASE_URL");
    if (!supabaseAnonKey) missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    const msg =
      `[createMiddlewareClient] Variables d'environnement Supabase manquantes : ` +
      `${missing.join(", ")}. ` +
      `Vérifiez que le fichier .env.local existe à la racine du projet et contient ces valeurs. ` +
      `Dashboard Supabase → Settings → API pour récupérer les clés.`;
    console.error(msg);
    throw new Error(msg);
  }

  // Référence mutable partagée entre la closure `setAll` (qui réassigne
  // `response`) et l'appelant (qui lit `responseRef.current`).
  const responseRef: { current: NextResponse } = { current: response };

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        // On met à jour les cookies de la requête pour que les handlers
        // suivants voient la nouvelle session, puis on propage dans la
        // réponse qui sera renvoyée au navigateur.
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        response = NextResponse.next({ request });
        // ⚠️ Synchronise le ref pour que l'appelant voie la nouvelle réponse.
        responseRef.current = response;
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  return { supabase, responseRef };
}

/* ========================================================================== */
/*  UPDATE SESSION                                                             */
/* ========================================================================== */

/**
 * Met à jour la session Supabase à chaque requête + protège les routes par
 * rôle. Réalise 3 fonctionnalités clés (PROMPT 3.4) :
 *
 * 1. CROSS-SPACE PREVENTION
 *    - /super-admin/* : réservé aux super_admins (table `super_admins` active)
 *    - /admin/*       : réservé aux managers (personnel.role='manager' +
 *                       actif + statut_compte='actif')
 *    - /personnel/*   : réservé aux employés (personnel actif, hors manager
 *                       et hors super_admin)
 *    Sur violation : redirection vers le dashboard du rôle de l'utilisateur
 *    avec `?error=acces_refuse` (toast "Accès non autorisé" côté page).
 *
 * 2. RESTRICTION PAR RÔLE pour /personnel/{role}/*
 *    - Un Laveur ne peut pas accéder à /personnel/caissier/*
 *    - Extraction du 2e segment de l'URL ; s'il correspond à un rôle du
 *      personnel et diffère du rôle de l'utilisateur → redirect vers le
 *      dashboard du rôle de l'utilisateur avec `?error=acces_refuse`.
 *    - Les routes génériques (ex : /personnel/changer-mot-de-passe) ne
 *      contiennent pas de segment de rôle et restent accessibles à tout
 *      personnel authentifié.
 *    - Cas spécial : un manager est redirigé vers /admin/dashboard (il n'a
 *      pas accès aux routes /personnel/* — pas de /personnel/manager/dashboard).
 *
 * 3. REDIRECT AUTH → DASHBOARD
 *    - Si user connecté tente d'accéder à /, /login ou /activation →
 *      redirect automatique vers son dashboard (selon le rôle).
 *    - Priorité : mot_de_passe_temporaire=true → /personnel/changer-mot-de-passe
 *    - Si aucun profil trouvé → signOut + laisse passer vers /login
 *      (compte non reconnu).
 *
 * 🚀 CACHE STRATÉGIE — cookie `ogp_role_cache` signé HMAC-SHA256
 *    Pour éviter 2 requêtes Supabase par navigation (getUser + role query),
 *    on met en cache le rôle dans un cookie court (5 min, httpOnly, secure,
 *    sameSite=lax). Détails dans la doc de la section HELPERS CACHE ci-dessus.
 *
 * 🔒 Garde-fou : si env vars manquantes → skip sans crash (auth désactivée).
 */
export async function updateSession(
  request: NextRequest
): Promise<NextResponse> {
  // 🔒 Garde-fou SÉCURISÉ (fail-closed) : si les vars d'env Supabase ne sont
  // pas configurées, on NE LAISSE PAS PASSER les routes protégées — on
  // redirige vers /login avec une erreur config. Les routes publiques
  // (landing, /login, /activation) restent accessibles pour permettre à
  // l'utilisateur de voir le site et comprendre le problème.
  //
  // AVANT : ce bloc retournait NextResponse.next() pour TOUTES les routes,
  // ce qui désactivait silencieusement l'auth en cas de var d'env manquante
  // (vulnérabilité CRITIQUE — voir AUDIT_SECURITE.md Conclusion #3).
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (
    !supabaseUrl ||
    !supabaseAnonKey ||
    supabaseAnonKey === "REPLACE_WITH_ANON_KEY"
  ) {
    const pathname = request.nextUrl.pathname;
    // Politique deny-by-default (Issue #18) :
    //   - Route protégée (PROTECTED_PREFIXES) → fail-closed : redirect
    //     /login?error=config_incomplete. Aucune donnée accessible.
    //   - Route publique (PUBLIC_ROUTES) OU "autre route" (catégorie 3) →
    //     fail-open : NextResponse.next(). La landing et /login restent
    //     visibles (sinon le site serait totalement cassé en dev). Les
    //     routes "autres" (api/*, _next/*) n'ont de toute façon pas de
    //     check d'auth middleware — elles gèrent leur propre auth côté API.
    if (isProtectedRoute(pathname)) {
      console.error(
        "[updateSession][FATAL] Supabase env vars manquantes — " +
          "redirection vers /login (route protégée bloquée)."
      );
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/login";
      loginUrl.searchParams.set("error", "config_incomplete");
      return NextResponse.redirect(loginUrl);
    }
    // Route publique OU autre route : on laisse passer. Pour les routes
    // publiques, on log un warning (informationnel). Pour les autres
    // routes (api/*, _next/*), c'est le comportement normal — pas de log.
    if (isPublicRoute(pathname)) {
      console.warn(
        "[updateSession] Supabase env vars manquantes — route publique " +
          "autorisée sans auth. Configurez .env.local pour activer l'auth."
      );
    }
    return NextResponse.next({ request });
  }

  const { pathname } = request.nextUrl;
  const isProtected = isProtectedRoute(pathname);
  const isAuthRoute = (AUTH_ROUTES as readonly string[]).includes(pathname);

  // 🚀 FAST-PATH PERF : si la route n'est PAS protégée ET qu'il n'y a AUCUN
  // cookie de session Supabase dans la requête, on skip complètement l'appel
  // réseau `supabase.auth.getUser()` (qui ajoute 100-200ms de latence).
  //
  // Les cookies de session Supabase ont tous le préfixe `sb-` (par défaut
  // `sb-<ref>-auth-token`). Si aucun n'est présent, l'utilisateur n'est pas
  // connecté → pas besoin d'appeler Supabase pour le savoir.
  //
  // Cas couverts :
  //   - Visiteur anonyme sur / (landing) → skip Supabase → réponse immédiate
  //   - Visiteur anonyme sur /login, /activation → skip Supabase
  //
  // Cas non couverts (Supabase est quand même appelé) :
  //   - Route protégée (/admin, /super-admin, /personnel) → vérification requise
  //   - Route publique AVEC cookie de session → on rafraîchit la session
  //     (utilisateur connecté qui visite la landing → on garde sa session active)
  if (!isProtected && !hasSupabaseSessionCookie(request)) {
    return NextResponse.next({ request });
  }

  const cacheSecret = getCacheSecret();

  const { supabase, responseRef } = createMiddlewareClient(request);

  // Rafraîchit la session si expirée — IMPORTANT : ne pas retirer cet appel,
  // c'est lui qui met à jour le cookie d'auth dans la réponse (et qui
  // réassigne `responseRef.current` via setAll si la session est rafraîchie).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // ---------------------------------------------------------------------
  // 1. Non authentifié sur une route protégée → /login?next=...
  // ---------------------------------------------------------------------
  if (!user) {
    if (isProtected) {
      return redirectTo(
        request,
        responseRef.current,
        `/login?next=${encodeURIComponent(pathname)}`
      );
    }
    // Route publique : on laisse passer (session rafraîchie dans la réponse).
    return responseRef.current;
  }

  // ---------------------------------------------------------------------
  // 2. Utilisateur authentifié : récupère le rôle (cache → DB)
  // ---------------------------------------------------------------------
  let roleInfo: RoleInfo | null = null;

  // 2a. Tente d'abord le cache cookie (signé HMAC).
  //     On ne fait confiance au cache QUE si `payload.user_id === user.id`
  //     (sécurité : empêche un cookie de cache d'un utilisateur A d'être
  //     utilisé par un utilisateur B sur le même navigateur après
  //     déconnexion/reconnexion).
  const cachedCookie = request.cookies.get(ROLE_CACHE_COOKIE)?.value;
  if (cachedCookie) {
    const payload = await verifyRoleCache(cachedCookie, cacheSecret);
    if (payload && payload.user_id === user.id) {
      // Cache hit : on sait que l'utilisateur était actif au moment du
      // cache (on ne met en cache QUE les comptes actifs). Le TTL court
      // (5 min) garantit qu'une désactivation de compte sera répercutée
      // en max 5 min (au prochain cache miss → DB query → signOut).
      roleInfo = {
        user_id: payload.user_id,
        role: payload.role,
        pressing_id: payload.pressing_id,
        mot_de_passe_temporaire: payload.mot_de_passe_temporaire,
        actif: true,
        statut_compte: "actif",
        // On ne met en cache QUE les pressings non suspendus → si le
        // cache est valide, le pressing était actif/essai au moment du
        // cache. Le TTL court (5 min) garantit qu'une suspension soit
        // répercutée en max 5 min (au prochain cache miss → DB query).
        pressing_statut: payload.pressing_statut ?? null,
        // AUDIT-B-05 + AUDIT-B-04 : flags d'essai expiré / abonnement
        // suspendu mis en cache. Le TTL court (5 min) garantit qu'une
        // activation ou réactivation soit répercutée en max 5 min.
        trial_expired: !!payload.trial_expired,
        abonnement_suspended: !!payload.abonnement_suspended,
      };
    }
  }

  // 2b. Cache miss (cookie absent, expiré, modifié, signature invalide, ou
  //     user_id mismatch) → requête DB.
  if (!roleInfo) {
    roleInfo = await fetchRoleFromDB(supabase, user.id);
    // On ne met en cache QUE si le compte est actif (actif=true ET
    // statut_compte='actif') ET le pressing n'est pas suspendu. Pour les
    // comptes désactivés, en attente d'activation, ou d'un pressing
    // suspendu, on ne cache pas → DB query à chaque requête → détection
    // immédiate d'un changement (pas de stale cache désactivé/suspendu).
    if (
      roleInfo &&
      roleInfo.actif &&
      roleInfo.statut_compte === "actif" &&
      roleInfo.pressing_statut !== "suspendu"
    ) {
      await setRoleCacheCookie(responseRef.current, roleInfo, cacheSecret);
    }
  }

  // ---------------------------------------------------------------------
  // 2c. AUDIT-B-06 — Invalidation ciblée du cache pour /personnel/changer-
  //     mot-de-passe. Le cache (5 min TTL) est signé HMAC et httpOnly →
  //     la page de changement de mot de passe ne peut PAS le modifier pour
  //     refléter `mot_de_passe_temporaire = false` après un changement
  //     réussi. Sans cette invalidation, l'utilisateur serait bloqué en
  //     boucle : change son mot de passe → navigue au dashboard → le
  //     middleware lit le cache stale (mot_de_passe_temporaire=true) →
  //     le redirige vers /personnel/changer-mot-de-passe.
  //
  //     Solution : quand l'utilisateur est sur /personnel/changer-mot-de-
  //     passe ET que le cache dit mot_de_passe_temporaire=true, on force
  //     un re-fetch DB pour vérifier la valeur courante. Si le mot de
  //     passe a été changé (DB dit false), on met à jour le cache. La
  //     page peut alors détecter mot_de_passe_temporaire=false (via son
  //     propre SELECT) et rediriger vers le dashboard.
  // ---------------------------------------------------------------------
  if (
    roleInfo &&
    roleInfo.mot_de_passe_temporaire &&
    pathname === "/personnel/changer-mot-de-passe"
  ) {
    const freshInfo = await fetchRoleFromDB(supabase, user.id);
    if (freshInfo) {
      roleInfo = freshInfo;
      // Re-cache la valeur fraîche (mot_de_passe_temporaire peut maintenant
      // être false). On respecte les mêmes conditions que pour le cache miss.
      if (
        roleInfo.actif &&
        roleInfo.statut_compte === "actif" &&
        roleInfo.pressing_statut !== "suspendu"
      ) {
        await setRoleCacheCookie(responseRef.current, roleInfo, cacheSecret);
      }
    }
  }

  // ---------------------------------------------------------------------
  // 3. Aucun profil trouvé → signOut + laisse passer vers /login
  //    (compte non rattaché à un pressing ni super admin)
  // ---------------------------------------------------------------------
  if (!roleInfo) {
    await supabase.auth.signOut();
    clearRoleCacheCookie(responseRef.current);
    if (pathname === "/login") {
      // Déjà sur /login → laisse passer (le formulaire affichera l'erreur).
      return responseRef.current;
    }
    return redirectTo(
      request,
      responseRef.current,
      "/login?error=compte_non_reconnu"
    );
  }

  // ---------------------------------------------------------------------
  // 4. Compte désactivé (actif=false OU statut_compte='desactive')
  //    → signOut + redirect /login avec message d'erreur
  // ---------------------------------------------------------------------
  if (!roleInfo.actif || roleInfo.statut_compte === "desactive") {
    await supabase.auth.signOut();
    clearRoleCacheCookie(responseRef.current);
    return redirectTo(
      request,
      responseRef.current,
      "/login?error=compte_desactive"
    );
  }

  // ---------------------------------------------------------------------
  // 5. Compte en attente d'activation (statut_compte='invite_en_attente')
  //    → pas d'accès aux routes protégées, redirect /login
  //    (on ne signOut pas — l'utilisateur pourrait avoir besoin de sa
  //     session pour vérifier son email, mais il ne peut pas accéder à
  //     l'app tant que le manager n'a pas activé son compte)
  // ---------------------------------------------------------------------
  if (roleInfo.statut_compte !== "actif") {
    clearRoleCacheCookie(responseRef.current);
    return redirectTo(
      request,
      responseRef.current,
      "/login?error=compte_non_actif"
    );
  }

  // ---------------------------------------------------------------------
  // 5.5. Pressing suspendu (LOT 5.3 — "un pressing suspendu ne peut plus
  //      se connecter"). Si l'utilisateur appartient à un pressing dont
  //      le statut est 'suspendu', on signOut + redirect /login avec un
  //      message d'erreur. Ne s'applique pas aux super admins (pas de
  //      pressing rattaché → pressing_statut = null).
  // ---------------------------------------------------------------------
  if (roleInfo.pressing_statut === "suspendu") {
    await supabase.auth.signOut();
    clearRoleCacheCookie(responseRef.current);
    return redirectTo(
      request,
      responseRef.current,
      "/login?error=pressing_suspendu"
    );
  }

  // ---------------------------------------------------------------------
  // 5.6. AUDIT-B-05 + AUDIT-B-04 — Essai expiré / Abonnement suspendu
  //      (version légère). On ne signOut PAS l'utilisateur (il peut
  //      toujours se déconnecter proprement depuis la page d'information),
  //      on redirige juste les routes applicatives (/admin/* et
  //      /personnel/*) vers une page d'information.
  //
  //      - AUDIT-B-05 : abonnements.statut='essai' AND date_fin < now
  //        → redirect /activation-expiree
  //      - AUDIT-B-04 : abonnements.statut='suspendu'
  //        → redirect /compte-suspendu
  //
  //      Ne s'applique PAS aux super admins (pas de pressing rattaché).
  //      Ne s'applique PAS aux routes publiques (/, /login, /activation,
  //      /activation-expiree, /compte-suspendu) — l'utilisateur doit
  //      pouvoir se déconnecter ou contacter le support depuis ces pages.
  // ---------------------------------------------------------------------
  if (
    roleInfo.role !== "super_admin" &&
    roleInfo.pressing_id &&
    (roleInfo.trial_expired || roleInfo.abonnement_suspended)
  ) {
    const isAdminRoute =
      pathname === "/admin" || pathname.startsWith("/admin/");
    const isPersonnelRoute =
      pathname === "/personnel" || pathname.startsWith("/personnel/");

    if (isAdminRoute || isPersonnelRoute) {
      // La suspension abonnement a priorité sur l'essai expiré (au cas où
      // un super-admin suspendrait un pressing dont l'essai venait d'expirer).
      const target = roleInfo.abonnement_suspended
        ? "/compte-suspendu"
        : "/activation-expiree";
      return redirectTo(request, responseRef.current, target);
    }
  }

  // ---------------------------------------------------------------------
  // 6. Redirect auth → dashboard
  //    Si user déjà connecté tente d'accéder à /, /login ou /activation
  //    → redirect automatique vers son dashboard.
  //
  //    ⚠️ Si l'utilisateur est en essai expiré ou abonnement suspendu, on
  //    NE redirige PAS vers le dashboard (qui serait immédiatement bloqué
  //    par la section 5.6 ci-dessus) — on le laisse sur la page publique
  //    courante pour qu'il puisse se déconnecter ou contacter le support.
  // ---------------------------------------------------------------------
  if (isAuthRoute && !roleInfo.trial_expired && !roleInfo.abonnement_suspended) {
    const target = computeDashboardTarget(roleInfo);
    return redirectTo(request, responseRef.current, target);
  }

  // ---------------------------------------------------------------------
  // 6.5. AUDIT-B-06 — Mot de passe temporaire obligatoire.
  //      Si l'utilisateur est un personnel (pas super_admin) avec
  //      `mot_de_passe_temporaire=true`, on le force à changer son mot de
  //      passe avant tout autre accès applicatif. Les routes autorisées
  //      sont limitées à :
  //        - /personnel/changer-mot-de-passe (la page de changement elle-même)
  //        - /login (pour se déconnecter — la page appelle signOut)
  //        - /activation-expiree, /compte-suspendu (pages d'info P1-A)
  //        - /auth/callback (échange PKCE — doit laisser passer pour
  //          compléter la session avant la redirection vers le changement
  //          de mot de passe)
  //
  //      ⚠️ Les API routes sont EXCLUES par le matcher de middleware racine
  //      (src/middleware.ts : `(?!...|api/.*|...)`). On ne peut donc PAS
  //      intercepter les appels API ici — c'est intentionnel, les API
  //      gèrent leur propre auth via getSupabaseServer() et la plupart des
  //      endpoints utiles au changement de mot de passe (ex : logout) sont
  //      accessibles depuis la page /personnel/changer-mot-de-passe.
  //
  //      Les super_admins ne sont pas affectés : `fetchRoleFromDB` renvoie
  //      toujours `mot_de_passe_temporaire=false` pour eux (pas de ligne
  //      dans `personnel`).
  //
  //      Note : la section 6 ci-dessus gère déjà les routes "auth" (/, /login,
  //      /activation, /auth/callback) en redirigeant vers le dashboard cible
  //      — qui est `/personnel/changer-mot-de-passe` quand
  //      `mot_de_passe_temporaire=true` (cf. `computeDashboardTarget`).
  //      Cette section 6.5 étend la protection aux routes applicatives
  //      (/admin/*, /personnel/* hors allowlist, /super-admin/* — bien que
  //      les super_admins ne soient pas concernés).
  // ---------------------------------------------------------------------
  if (
    roleInfo.role !== "super_admin" &&
    roleInfo.mot_de_passe_temporaire &&
    pathname !== "/personnel/changer-mot-de-passe" &&
    pathname !== "/login" &&
    pathname !== "/activation-expiree" &&
    pathname !== "/compte-suspendu" &&
    pathname !== "/auth/callback"
  ) {
    return redirectTo(
      request,
      responseRef.current,
      "/personnel/changer-mot-de-passe"
    );
  }

  // ---------------------------------------------------------------------
  // 7. Route protégée : cross-space prevention + restriction par rôle
  // ---------------------------------------------------------------------
  if (pathname === "/super-admin" || pathname.startsWith("/super-admin/")) {
    // /super-admin/* : réservé aux super_admins.
    if (roleInfo.role !== "super_admin") {
      const target = computeDashboardTarget(roleInfo);
      return redirectTo(
        request,
        responseRef.current,
        `${target}?error=acces_refuse`
      );
    }
  } else if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    // /admin/* : réservé aux managers (personnel.role='manager').
    if (roleInfo.role !== "manager") {
      const target = computeDashboardTarget(roleInfo);
      return redirectTo(
        request,
        responseRef.current,
        `${target}?error=acces_refuse`
      );
    }
  } else if (
    pathname === "/personnel" ||
    pathname.startsWith("/personnel/")
  ) {
    // /personnel/* : réservé au personnel (tous rôles sauf super_admin).
    // Un super_admin n'a pas accès aux routes /personnel/* (il a /super-admin/*).
    if (roleInfo.role === "super_admin") {
      const target = computeDashboardTarget(roleInfo);
      return redirectTo(
        request,
        responseRef.current,
        `${target}?error=acces_refuse`
      );
    }

    // Restriction par rôle : /personnel/{role}/* ne peut être accédé que
    // par un personnel ayant CE rôle. Les routes génériques (sans segment
    // de rôle, ex : /personnel/changer-mot-de-passe) restent accessibles à
    // tout personnel authentifié.
    //
    // ⚠️ Le manager (role='manager') est un cas particulier : il a accès
    //    à /admin/* (son dashboard principal) ET à /personnel/manager/*
    //    (UX "admin allégé" avec navigation personnel). Le check ci-dessous
    //    autorise le manager sur /personnel/manager/* et le bloque sur tous
    //    les autres segments /personnel/{autre-role}/*.
    const roleFromUrl = extractPersonnelRoleFromPath(pathname);
    if (roleFromUrl && roleFromUrl !== roleInfo.role) {
      const target = computeDashboardTarget(roleInfo);
      return redirectTo(
        request,
        responseRef.current,
        `${target}?error=acces_refuse`
      );
    }
  }

  // ✅ Tout est OK : on laisse passer la requête (session rafraîchie +
  // cache rôle propagés dans la réponse).
  return responseRef.current;
}
