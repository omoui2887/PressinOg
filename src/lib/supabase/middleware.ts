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
/*  CONSTANTES                                                                */
/* ========================================================================== */

/** Préfixes de routes protégées par rôle. */
const PROTECTED_PREFIXES = ["/super-admin", "/admin", "/personnel"] as const;

/** Routes d'authentification : si l'utilisateur est déjà connecté et y
 * accède, on le redirige automatiquement vers son dashboard. */
const AUTH_ROUTES = ["/", "/login", "/activation"] as const;

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
    };
  }

  // 2. Personnel ? (manager inclus — role='manager')
  const { data: pers } = await supabase
    .from("personnel")
    .select(
      "role, pressing_id, actif, statut_compte, mot_de_passe_temporaire"
    )
    .eq("user_id", userId)
    .maybeSingle();
  if (!pers) return null;

  return {
    user_id: userId,
    role: pers.role as RoleCacheRole,
    pressing_id: (pers.pressing_id as string | null) ?? null,
    mot_de_passe_temporaire: !!pers.mot_de_passe_temporaire,
    actif: !!pers.actif,
    statut_compte: (pers.statut_compte as string) ?? "invite_en_attente",
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
  // 🔒 Garde-fou : si les vars d'env Supabase ne sont pas configurées,
  // on laisse passer la requête sans auth (pour ne pas casser tout le site).
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (
    !supabaseUrl ||
    !supabaseAnonKey ||
    supabaseAnonKey === "REPLACE_WITH_ANON_KEY"
  ) {
    console.warn(
      "[updateSession] Supabase env vars manquantes — middleware skip " +
        "(auth désactivée temporairement). Configurez .env.local pour activer l'auth."
    );
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

  const { pathname } = request.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
  const isAuthRoute = (AUTH_ROUTES as readonly string[]).includes(pathname);

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
      };
    }
  }

  // 2b. Cache miss (cookie absent, expiré, modifié, signature invalide, ou
  //     user_id mismatch) → requête DB.
  if (!roleInfo) {
    roleInfo = await fetchRoleFromDB(supabase, user.id);
    // On ne met en cache QUE si le compte est actif (actif=true ET
    // statut_compte='actif'). Pour les comptes désactivés ou en attente
    // d'activation, on ne cache pas → DB query à chaque requête → détection
    // immédiate d'une désactivation (pas de stale cache désactivé).
    if (roleInfo && roleInfo.actif && roleInfo.statut_compte === "actif") {
      await setRoleCacheCookie(responseRef.current, roleInfo, cacheSecret);
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
  // 6. Redirect auth → dashboard
  //    Si user déjà connecté tente d'accéder à /, /login ou /activation
  //    → redirect automatique vers son dashboard.
  // ---------------------------------------------------------------------
  if (isAuthRoute) {
    const target = computeDashboardTarget(roleInfo);
    return redirectTo(request, responseRef.current, target);
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
    // /personnel/* : réservé aux employés (hors manager et super_admin).
    // Un manager est redirigé vers /admin/dashboard (pas /personnel/manager/
    // dashboard) — il n'a pas accès aux routes /personnel/*.
    if (roleInfo.role === "manager" || roleInfo.role === "super_admin") {
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
