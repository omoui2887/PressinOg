/**
 * OgPressing — API /api/super-admin/demandes/[id]/generer-code (POST)
 * --------------------------------------------------------------------
 * Génère un code d'activation pour une demande d'inscription et passe la
 * demande au statut 'validee'.
 *
 * Body (JSON) : { plan: 'starter' | 'pro' | 'business' }
 *
 * Étapes :
 *   1. Auth + vérif Super Admin actif.
 *   2. Vérifie que la demande existe et n'est pas 'refusee'.
 *   3. Génère un code unique au format PRS-XXXX-XXXX (alphabet sans I, O,
 *      0, 1 — cf. CODE_ALPHABET). Vérifie l'unicité dans `codes_activation`
 *      (retry max 5 tentatives).
 *   4. INSERT dans codes_activation : { code, demande_id, cree_par, plan_initial,
 *      date_expiration = NOW + 7 jours, utilise = false }.
 *      ⚠️ La colonne DB réelle est `cree_par` (NOT NULL) — le spec mentionne
 *         `genere_par` mais le schéma réel utilise `cree_par`.
 *   5. UPDATE demandes_inscription.statut='validee', traite_par, date_traitement.
 *   6. Retourne { success, data: { code, date_expiration, demande_id } }.
 *
 * 🔒 SÉCURITÉ : getSupabaseServer() (anon + JWT). RLS super_admin_full_access
 *    sur codes_activation et demandes_inscription via is_super_admin().
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const PLANS_VALID = ["starter", "pro", "business"] as const;

/**
 * Alphabet de génération du code (32 caractères).
 * Exclut I, O (confusables avec 1, 0) et 0, 1 (confusables avec O, I, L).
 * Cela évite les erreurs de saisie lors de l'activation par le prospect.
 */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const CODE_DURATION_DAYS = 7;
const MAX_GENERATION_ATTEMPTS = 5;

/**
 * Génère un segment de code de `length` caractères issus de CODE_ALPHABET.
 * Utilise Web Crypto (crypto.getRandomValues) — disponible en Node et Edge.
 *
 * Comme 256 % 32 = 0, il n'y a aucun biais de modulo à corriger.
 */
function generateSegment(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return out;
}

/** Génère un code complet au format PRS-XXXX-XXXX. */
function generateCode(): string {
  return `PRS-${generateSegment(4)}-${generateSegment(4)}`;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await getSupabaseServer();
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) {
    return NextResponse.json(
      { success: false, error: "Non authentifié" },
      { status: 401 }
    );
  }

  // Vérifie Super Admin actif
  const { data: superAdmin } = await supabase
    .from("super_admins")
    .select("id")
    .eq("user_id", userData.user.id)
    .eq("actif", true)
    .maybeSingle();

  if (!superAdmin) {
    return NextResponse.json(
      { success: false, error: "Accès refusé — Super Admin requis" },
      { status: 403 }
    );
  }

  const { id: demandeId } = await params;

  // Parse le body
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Corps de requête invalide (JSON attendu)" },
      { status: 400 }
    );
  }

  const planRaw = typeof body.plan === "string" ? body.plan : "";
  if (!(PLANS_VALID as readonly string[]).includes(planRaw)) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Plan invalide. Valeurs attendues : 'starter', 'pro' ou 'business'.",
      },
      { status: 400 }
    );
  }
  const plan = planRaw as (typeof PLANS_VALID)[number];

  // Vérifie que la demande existe et n'est pas refusée
  const { data: demande } = await supabase
    .from("demandes_inscription")
    .select("id, statut, nom_gerant, nom_pressing")
    .eq("id", demandeId)
    .maybeSingle();

  if (!demande) {
    return NextResponse.json(
      { success: false, error: "Demande introuvable" },
      { status: 404 }
    );
  }

  if (demande.statut === "refusee") {
    return NextResponse.json(
      {
        success: false,
        error:
          "Cette demande a été refusée. Impossible de générer un code d'activation.",
      },
      { status: 400 }
    );
  }

  // Vérifie qu'aucun code non utilisé n'existe déjà pour cette demande
  // (évite les doublons si le Super Admin clique 2x par erreur)
  const { data: existingCodes } = await supabase
    .from("codes_activation")
    .select("code, date_expiration, utilise")
    .eq("demande_id", demandeId)
    .order("created_at", { ascending: false })
    .limit(1);

  const existingCode = (existingCodes ?? [])[0];
  if (existingCode && !existingCode.utilise) {
    // Un code non utilisé existe déjà pour cette demande — on le retourne
    // au lieu d'en générer un nouveau.
    return NextResponse.json({
      success: true,
      data: {
        code: existingCode.code,
        date_expiration: existingCode.date_expiration,
        demande_id: demandeId,
        deja_existant: true,
      },
    });
  }

  // Génération du code avec retry en cas de collision (UNIQUE sur codes_activation.code)
  let code = "";
  let attempt = 0;
  let generationOk = false;
  while (attempt < MAX_GENERATION_ATTEMPTS && !generationOk) {
    attempt += 1;
    code = generateCode();

    // Vérifie l'unicité
    const { data: collision, error: collisionErr } = await supabase
      .from("codes_activation")
      .select("id")
      .eq("code", code)
      .maybeSingle();

    if (collisionErr) {
      console.error(
        "[api/super-admin/demandes/[id]/generer-code] Erreur lookup collision:",
        collisionErr
      );
      return NextResponse.json(
        { success: false, error: "Erreur lors de la vérification du code" },
        { status: 500 }
      );
    }

    if (!collision) {
      generationOk = true;
    }
  }

  if (!generationOk) {
    console.error(
      "[api/super-admin/demandes/[id]/generer-code] Échec génération code unique après",
      MAX_GENERATION_ATTEMPTS,
      "tentatives"
    );
    return NextResponse.json(
      {
        success: false,
        error:
          "Impossible de générer un code unique après plusieurs tentatives. Réessayez.",
      },
      { status: 500 }
    );
  }

  // Calcule la date d'expiration (J+7)
  const now = new Date();
  const expiration = new Date(
    now.getTime() + CODE_DURATION_DAYS * 24 * 60 * 60 * 1000
  );

  // INSERT dans codes_activation
  // ⚠️ Schéma réel : cree_par (NOT NULL) — le spec mentionnait genere_par.
  const { data: inserted, error: insertErr } = await supabase
    .from("codes_activation")
    .insert({
      code,
      demande_id: demandeId,
      cree_par: superAdmin.id,
      plan_initial: plan,
      date_expiration: expiration.toISOString(),
      utilise: false,
    })
    .select("id, code, date_expiration, created_at")
    .single();

  if (insertErr || !inserted) {
    console.error(
      "[api/super-admin/demandes/[id]/generer-code] Erreur INSERT codes_activation:",
      insertErr
    );
    return NextResponse.json(
      { success: false, error: "Erreur lors de la création du code" },
      { status: 500 }
    );
  }

  // UPDATE demandes_inscription.statut='validee'
  const { error: updateErr } = await supabase
    .from("demandes_inscription")
    .update({
      statut: "validee",
      traite_par: superAdmin.id,
      date_traitement: now.toISOString(),
    })
    .eq("id", demandeId);

  if (updateErr) {
    console.error(
      "[api/super-admin/demandes/[id]/generer-code] Erreur UPDATE demande:",
      updateErr
    );
    // Le code a été créé mais la demande n'est pas marquée validee → on
    // signale l'erreur au client sans rollback (le code reste utilisable,
    // le Super Admin peut relancer la mise à jour via PATCH).
    return NextResponse.json(
      {
        success: false,
        error:
          "Code généré mais erreur lors de la mise à jour de la demande. Veuillez rafraîchir la page.",
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    data: {
      code: inserted.code,
      date_expiration: inserted.date_expiration,
      demande_id: demandeId,
      deja_existant: false,
    },
  });
}
