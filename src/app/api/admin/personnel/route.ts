/**
 * OgPressing — API /api/admin/personnel (GET + POST)
 * ---------------------------------------------------
 *
 * GET — Liste des employés du pressing connecté avec :
 *   - recherche par nom ou téléphone (param `q`)
 *   - filtre par rôle (param `role` : manager|receptionniste|caissier|laveur|repassage|livreur|comptable|all)
 *   - filtre par statut de compte (param `statut` : actif|invite_en_attente|desactive|all)
 *   - pagination (param `page` 1-indexed, `pageSize` default 20)
 *   - Infos de limite du plan (plan, limit, count, limitAtteinte)
 *
 * POST — Création d'un compte employé (LOT 9.2) :
 *   Body : { methode, nom, prenom, telephone, email, role, password? }
 *   - methode = "creation_directe" :
 *       * Génère un email technique si non fourni ({telephone}@ogpressing.local)
 *       * supabase.auth.admin.createUser({ email, password, email_confirm: true })
 *       * INSERT personnel (statut='actif', mot_de_passe_temporaire=true)
 *       * Retourne les identifiants à communiquer
 *   - methode = "lien_invitation" :
 *       * supabase.auth.admin.inviteUserByEmail(email, { redirectTo })
 *       * INSERT personnel (statut='invite_en_attente', mot_de_passe_temporaire=true)
 *       * Retourne confirmation d'envoi
 *
 * 🔒 SÉCURITÉ :
 *   - GET  : getSupabaseServer() (anon + JWT). RLS isole par pressing.
 *   - POST : Manager authentifié + actif (vérifié). Utilise getSupabaseAdmin()
 *     (service_role) pour createUser / inviteUserByEmail — opérations Admin
 *     Auth impossibles avec la clé anon. L'INSERT personnel est fait avec
 *     le client admin (contourne RLS) car le user_id cible n'appartient pas
 *     encore à la session courante. Le pressing_id est FORCÉ à celui du
 *     manager connecté (défense en profondeur).
 *   - Vérification de la limite du plan avant création (anti-dépassement).
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isValidCIPhone, normalizeCIPhone } from "@/lib/validations/phone";

export const dynamic = "force-dynamic";

// Limites de sièges par plan (PRD §16).
const PLAN_LIMITS: Record<string, number | null> = {
  starter: 3,
  pro: 8,
  business: null, // illimité
};

const ROLES_VALID = [
  "manager",
  "receptionniste",
  "caissier",
  "laveur",
  "repassage",
  "livreur",
  "comptable",
] as const;

const STATUTS_VALID = ["actif", "invite_en_attente", "desactive"] as const;

export async function GET(request: NextRequest) {
  const supabase = await getSupabaseServer();
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) {
    return NextResponse.json(
      { success: false, error: "Non authentifié" },
      { status: 401 }
    );
  }

  // Récupère le pressing_id + rôle du manager connecté (défense en profondeur)
  const { data: me } = await supabase
    .from("personnel")
    .select("pressing_id, role, actif, statut_compte")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (
    !me ||
    me.role !== "manager" ||
    me.actif !== true ||
    me.statut_compte !== "actif"
  ) {
    return NextResponse.json(
      { success: false, error: "Accès refusé — manager requis" },
      { status: 403 }
    );
  }

  const pressingId = me.pressing_id;

  // ---- Récupère le plan d'abonnement actuel (le plus récent) ----
  const { data: latestAbonnement } = await supabase
    .from("abonnements")
    .select("plan")
    .eq("pressing_id", pressingId)
    .order("date_debut", { ascending: false })
    .limit(1)
    .maybeSingle();

  const plan = latestAbonnement?.plan ?? "starter";
  const limit = PLAN_LIMITS[plan] ?? null; // null = illimité

  // ---- Compte les employés occupant un siège (actif + invite_en_attente) ----
  const { count: seatCount } = await supabase
    .from("personnel")
    .select("id", { count: "exact", head: true })
    .eq("pressing_id", pressingId)
    .in("statut_compte", ["actif", "invite_en_attente"]);

  const count = seatCount ?? 0;
  const limitAtteinte = limit !== null && count >= limit;

  // ---- Paramètres de requête ----
  const searchParams = request.nextUrl.searchParams;
  const q = (searchParams.get("q") || "").trim();
  const roleParam = searchParams.get("role") || "all";
  const statutParam = searchParams.get("statut") || "all";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const pageSize = Math.min(
    100,
    Math.max(1, parseInt(searchParams.get("pageSize") || "20", 10))
  );

  const role = (ROLES_VALID as readonly string[]).includes(roleParam)
    ? roleParam
    : null;
  const statut = (STATUTS_VALID as readonly string[]).includes(statutParam)
    ? statutParam
    : null;

  // ---- Construction de la requête sur `personnel` (RLS isole par pressing) ----
  let query = supabase
    .from("personnel")
    .select(
      "id, nom_complet, email, telephone, role, methode_creation, statut_compte, date_invitation, date_activation, date_desactivation, actif, created_at",
      { count: "exact" }
    )
    .eq("pressing_id", pressingId);

  if (q) {
    const safe = q.replace(/,/g, "");
    query = query.or(`nom_complet.ilike.%${safe}%,telephone.ilike.%${safe}%`);
  }
  if (role) {
    query = query.eq("role", role);
  }
  if (statut) {
    query = query.eq("statut_compte", statut);
  }

  query = query
    .order("created_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  const { data: personnel, error: personnelErr, count: total } = await query;

  if (personnelErr) {
    console.error("[api/admin/personnel] Erreur SELECT:", personnelErr);
    return NextResponse.json(
      { success: false, error: "Erreur lors de la récupération du personnel" },
      { status: 500 }
    );
  }

  const totalRows = total ?? 0;

  return NextResponse.json({
    success: true,
    data: personnel ?? [],
    total: totalRows,
    page,
    pageSize,
    totalPages: Math.ceil(totalRows / pageSize),
    // Infos de limite de plan
    plan,
    limit,
    count,
    limitAtteinte,
  });
}

/* ================================================================
 *  POST — Création d'un compte employé (LOT 9.2)
 * ================================================================ */

const ROLES_VALID_SET = new Set([
  "manager",
  "receptionniste",
  "caissier",
  "laveur",
  "repassage",
  "livreur",
  "comptable",
]);

/** Génère un mot de passe aléatoire sécurisé de 10 caractères. */
function generateRandomPassword(): string {
  const chars =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  let pwd = "";
  const array = new Uint8Array(10);
  crypto.getRandomValues(array);
  for (let i = 0; i < 10; i++) {
    pwd += chars[array[i] % chars.length];
  }
  return pwd;
}

/** Nettoie un numéro de téléphone pour générer un email technique. */
function phoneToEmail(telephone: string): string {
  const digits = telephone.replace(/\D/g, "");
  return `${digits}@ogpressing.local`;
}

interface CreateBody {
  methode?: unknown;
  nom?: unknown;
  prenom?: unknown;
  telephone?: unknown;
  email?: unknown;
  role?: unknown;
  password?: unknown;
}

export async function POST(request: NextRequest) {
  // ---- 1. Authentification + autorisation (manager actif) ----
  const supabase = await getSupabaseServer();
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) {
    return NextResponse.json(
      { success: false, error: "Non authentifié" },
      { status: 401 }
    );
  }

  const { data: me } = await supabase
    .from("personnel")
    .select("id, pressing_id, role, actif, statut_compte")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (
    !me ||
    me.role !== "manager" ||
    me.actif !== true ||
    me.statut_compte !== "actif"
  ) {
    return NextResponse.json(
      { success: false, error: "Accès refusé — manager requis" },
      { status: 403 }
    );
  }

  const pressingId = me.pressing_id;
  const creatorId = me.id;

  // ---- 2. Vérification de la limite du plan ----
  const { data: latestAbonnement } = await supabase
    .from("abonnements")
    .select("plan")
    .eq("pressing_id", pressingId)
    .order("date_debut", { ascending: false })
    .limit(1)
    .maybeSingle();

  const plan = latestAbonnement?.plan ?? "starter";
  const limit = PLAN_LIMITS[plan] ?? null;

  const { count: seatCount } = await supabase
    .from("personnel")
    .select("id", { count: "exact", head: true })
    .eq("pressing_id", pressingId)
    .in("statut_compte", ["actif", "invite_en_attente"]);

  const count = seatCount ?? 0;
  if (limit !== null && count >= limit) {
    return NextResponse.json(
      {
        success: false,
        error: `Limite atteinte pour votre plan (${limit} employés). Passez au plan supérieur pour en ajouter plus.`,
      },
      { status: 403 }
    );
  }

  // ---- 3. Parse + validation du body ----
  let body: CreateBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Corps de requête invalide (JSON attendu)" },
      { status: 400 }
    );
  }

  const methode = typeof body.methode === "string" ? body.methode : "";
  if (methode !== "creation_directe" && methode !== "lien_invitation") {
    return NextResponse.json(
      {
        success: false,
        error: "Méthode invalide. Valeurs attendues : 'creation_directe' ou 'lien_invitation'.",
      },
      { status: 400 }
    );
  }

  const nom = typeof body.nom === "string" ? body.nom.trim() : "";
  const prenom = typeof body.prenom === "string" ? body.prenom.trim() : "";
  const telephone =
    typeof body.telephone === "string" ? body.telephone.trim() : "";
  const emailRaw =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const role = typeof body.role === "string" ? body.role : "";

  if (!nom || !prenom || !telephone) {
    return NextResponse.json(
      {
        success: false,
        error: "Nom, prénom et téléphone sont obligatoires.",
      },
      { status: 400 }
    );
  }

  // AUDIT-B-03 — Validation du téléphone ivoirien (centralisée dans
  // `isValidCIPhone`). Avant ce fix, seul le non-vide était vérifié, ce qui
  // permettait de stocker des numéros mal formés (ex : "abc", "123").
  if (!isValidCIPhone(telephone)) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Le téléphone doit être un numéro ivoirien valide (ex : 07 00 00 00 00 ou +225 07 00 00 00 00).",
      },
      { status: 400 }
    );
  }

  // AUDIT-B-03 — Normalisation vers +225XXXXXXXXXX pour cohérence avec les
  // autres routes (activation, inscription, clients).
  const telephoneNorm = normalizeCIPhone(telephone);

  if (!ROLES_VALID_SET.has(role)) {
    return NextResponse.json(
      { success: false, error: "Rôle invalide." },
      { status: 400 }
    );
  }

  // Selon la méthode, l'email est obligatoire (invitation) ou optionnel (directe)
  let email = emailRaw;
  if (methode === "lien_invitation") {
    if (!email || !email.includes("@")) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Un email valide est obligatoire pour la méthode 'lien d'invitation'.",
        },
        { status: 400 }
      );
    }
  } else {
    // creation_directe : si pas d'email, on génère un email technique
    if (!email || !email.includes("@")) {
      email = phoneToEmail(telephoneNorm);
    }
  }

  const nomComplet = `${prenom} ${nom}`;

  // ---- 4. Vérification anti-doublon (email ou téléphone) ----
  const { data: existing } = await supabase
    .from("personnel")
    .select("id, email, telephone")
    .eq("pressing_id", pressingId)
    .or(`email.eq.${email},telephone.eq.${telephoneNorm}`)
    .limit(1)
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Un employé avec cet email ou ce téléphone existe déjà dans votre pressing.",
      },
      { status: 409 }
    );
  }

  // ---- 5. Création du compte Auth côté Supabase (service_role) ----
  const admin = getSupabaseAdmin();

  if (methode === "creation_directe") {
    // Mot de passe : fourni par l'admin OU généré aléatoirement
    const password =
      typeof body.password === "string" && body.password.length >= 8
        ? body.password
        : generateRandomPassword();

    const { data: createdUser, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // pas besoin de vérification email pour création directe
      user_metadata: {
        nom_complet: nomComplet,
        telephone: telephoneNorm,
        role,
      },
    });

    if (createErr || !createdUser.user) {
      console.error("[api/admin/personnel POST] createUser error:", createErr);
      // Sécurité (audit #8) : masque le message Supabase brut.
      return NextResponse.json(
        {
          success: false,
          error: "Erreur interne du serveur",
        },
        { status: 500 }
      );
    }

    const newUserId = createdUser.user.id;

    // ---- 6a. INSERT dans personnel (service_role — contourne RLS) ----
    // #12 — date_activation est un timestamp serveur (UTC). La colonne n'a
    // pas de DEFAULT NOW() (002_tables.sql:189 — nullable), on DOIT donc
    // fournir une valeur explicite. On utilise new Date() côté serveur
    // (jamais trusté du client).
    const { data: newEmploye, error: insertErr } = await admin
      .from("personnel")
      .insert({
        pressing_id: pressingId,
        user_id: newUserId,
        nom_complet: nomComplet,
        email,
        telephone: telephoneNorm,
        role,
        methode_creation: "creation_directe",
        statut_compte: "actif",
        actif: true,
        mot_de_passe_temporaire: true,
        cree_par: creatorId,
        date_activation: new Date().toISOString(),
      })
      .select(
        "id, nom_complet, email, telephone, role, methode_creation, statut_compte, actif, created_at"
      )
      .maybeSingle();

    if (insertErr || !newEmploye) {
      console.error("[api/admin/personnel POST] INSERT error:", insertErr);
      // Rollback : supprimer le user Auth qu'on vient de créer
      await admin.auth.admin.deleteUser(newUserId);
      return NextResponse.json(
        {
          success: false,
          error: "Erreur lors de l'enregistrement du personnel. Le compte Auth a été annulé.",
        },
        { status: 500 }
      );
    }

    // ---- 7a. Réponse : identifiants à communiquer ----
    return NextResponse.json({
      success: true,
      data: newEmploye,
      methode: "creation_directe",
      credentials: {
        email,
        telephone: telephoneNorm,
        password,
        nom_complet: nomComplet,
      },
    });
  }

  // ---- methode === "lien_invitation" ----

  // 🔒 SÉCURITÉ (AUDIT_SECURITE.md Conclusion #7) : on NE fait PLUS confiance
  // à request.nextUrl.origin (spoofable via header Host) ni à un fallback
  // hardcoded. Si NEXT_PUBLIC_SITE_URL n'est pas configuré, on refuse
  // l'invitation plutôt que d'exposer un risque d'open redirect qui
  // permettrait à un attaquant de faire partir l'email avec un lien
  // https://evil.com/?code=<PKCE> et de voler le code d'invitation.
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!siteUrl || !siteUrl.startsWith("https://") && !siteUrl.startsWith("http://localhost:")) {
    console.error(
      "[api/admin/personnel POST] NEXT_PUBLIC_SITE_URL non configuré ou non sécurisé — " +
        "invitation refusée pour éviter un open redirect."
    );
    return NextResponse.json(
      {
        success: false,
        error:
          "Configuration serveur incomplète (NEXT_PUBLIC_SITE_URL manquant). " +
          "Impossible d'envoyer une invitation par email.",
      },
      { status: 500 }
    );
  }
  // 🔒 SÉCURITÉ (AUDIT_SECURITE.md Conclusion #7) :
  // Le `redirectTo` passé à Supabase pointe vers /auth/callback (et NON
  // plus directement vers /personnel/changer-mot-de-passe). Supabase
  // génèrera un email contenant un lien de la forme :
  //   https://app.ogpressing.com/auth/callback?code=<PKCE>&next=/personnel/changer-mot-de-passe
  // La route /auth/callback se charge alors :
  //   1. d'échanger le code PKCE contre une session (cookie httpOnly),
  //   2. de valider `next` contre une whitelist stricte (anti open redirect),
  //   3. de rediriger vers `next` (/personnel/changer-mot-de-passe) en
  //      propageant les cookies de session.
  // Avant cette correction, /personnel/changer-mot-de-passe était appelée
  // sans session → getUser() retournait null → le middleware redirigeait
  // vers /login → le flux d'invitation était CASSÉ.
  const inviteRedirect = `${siteUrl}/auth/callback?next=/personnel/changer-mot-de-passe`;

  const { data: invitedUser, error: inviteErr } =
    await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: inviteRedirect,
    });

  if (inviteErr || !invitedUser || !invitedUser.user) {
    console.error("[api/admin/personnel POST] inviteUser error:", inviteErr);
    // Sécurité (audit #8) : masque le message Supabase brut.
    return NextResponse.json(
      {
        success: false,
        error: "Erreur interne du serveur",
      },
      { status: 500 }
    );
  }

  // ⚠️ FIX BUG-AUDIT-RUNTIME #1 (P0) : `inviteUserByEmail` retourne
  // `{ data: { user: User | null } }` (et non `{ data: User }` comme
  // `createUser`). Avant on écrivait `invitedUser.id` qui était `undefined`,
  // causant un INSERT avec user_id=NULL → violation FK + employé orphelin.
  const newUserId = invitedUser.user?.id;
  if (!newUserId) {
    console.error(
      "[api/admin/personnel POST] inviteUserByEmail: user.id manquant",
      invitedUser
    );
    return NextResponse.json(
      { success: false, error: "Erreur interne du serveur" },
      { status: 500 }
    );
  }

  // ---- 6b. INSERT dans personnel ----
  // #12 — date_invitation est un timestamp serveur (UTC). La colonne n'a
  // pas de DEFAULT NOW() (002_tables.sql:188 — nullable), on DOIT donc
  // fournir une valeur explicite. On utilise new Date() côté serveur.
  const { data: newEmploye, error: insertErr } = await admin
    .from("personnel")
    .insert({
      pressing_id: pressingId,
      user_id: newUserId,
      nom_complet: nomComplet,
      email,
      telephone: telephoneNorm,
      role,
      methode_creation: "lien_invitation",
      statut_compte: "invite_en_attente",
      actif: true,
      mot_de_passe_temporaire: true,
      cree_par: creatorId,
      date_invitation: new Date().toISOString(),
    })
    .select(
      "id, nom_complet, email, telephone, role, methode_creation, statut_compte, actif, created_at"
    )
    .maybeSingle();

  if (insertErr || !newEmploye) {
    console.error("[api/admin/personnel POST] INSERT error:", insertErr);
    // Rollback : supprimer le user Auth invité
    await admin.auth.admin.deleteUser(newUserId);
    return NextResponse.json(
      {
        success: false,
        error: "Erreur lors de l'enregistrement du personnel. L'invitation a été annulée.",
      },
      { status: 500 }
    );
  }

  // ---- 7b. Réponse : confirmation d'envoi ----
  return NextResponse.json({
    success: true,
    data: newEmploye,
    methode: "lien_invitation",
    invitedEmail: email,
  });
}
