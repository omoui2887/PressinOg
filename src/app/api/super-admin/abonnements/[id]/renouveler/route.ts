/**
 * OgPressing — API /api/super-admin/abonnements/[id]/renouveler (POST)
 * --------------------------------------------------------------------
 * Enregistre un NOUVEAU paiement d'échéance pour un abonnement (renouvellement
 * mensuel).
 *
 * ⚠️ DÉCLARATIF : aucune transaction bancaire réelle n'est initiée. Ce
 *    formulaire enregistre simplement une déclaration de paiement pour tracer
 *    les échéances. Le règlement réel (espèces, Mobile Money, carte) se fait
 *    HORS application, comme indiqué dans le PRD.
 *
 * Body JSON attendu :
 *   {
 *     montant:       number,                              // > 0, entier, FCFA
 *     methode:       'especes' | 'mobile_money' | 'carte_bancaire',
 *     reference?:    string,                              // libellé libre (n° transaction MOMO, n° reçu espèces…)
 *     justificatif_url?: string                          // URL Storage Supabase (upload côté client)
 *   }
 *
 * Logique :
 *   1. Vérifie super admin actif → récupère super_admins.id (pour `enregistre_par`)
 *   2. Vérifie que l'abonnement existe (RLS isole aux super admins)
 *   3. INSERT dans `paiements` (abonnement_id renseigné, commande_id NULL —
 *      contrainte CHECK XOR respectée)
 *   4. Calcule la nouvelle date_fin :
 *        - si date_fin actuelle est dans le futur → date_fin + 1 mois
 *        - si date_fin passée ou NULL → now() + 1 mois
 *   5. UPDATE `abonnements` : date_fin, statut='actif',
 *      mode_paiement_derniere_echeance, date_derniere_echeance=now,
 *      reference_paiement, justificatif_url, enregistre_par
 *
 * 🔒 SÉCURITÉ : getSupabaseServer() + RLS super_admin_full_access sur
 *    abonnements & paiements. Aucune transaction bancaire n'est effectuée —
 *    seule une ligne de paiement (déclarative) est insérée.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const METHODES_VALID = ["especes", "mobile_money", "carte_bancaire"] as const;

/** Vérifie que l'appelant est bien un super admin actif et renvoie sa ligne. */
async function ensureSuperAdmin(
  supabase: Awaited<ReturnType<typeof getSupabaseServer>>
) {
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) {
    return {
      error: NextResponse.json(
        { success: false, error: "Non authentifié" },
        { status: 401 }
      ),
    };
  }
  const { data: superAdmin } = await supabase
    .from("super_admins")
    .select("id, user_id, nom_complet, email")
    .eq("user_id", userData.user.id)
    .eq("actif", true)
    .maybeSingle();
  if (!superAdmin) {
    return {
      error: NextResponse.json(
        { success: false, error: "Accès refusé — super admin requis" },
        { status: 403 }
      ),
    };
  }
  return { superAdmin };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await getSupabaseServer();
  const guard = await ensureSuperAdmin(supabase);
  if ("error" in guard) return guard.error;
  const superAdmin = guard.superAdmin;

  const { id: abonnementId } = await params;

  // ---- Parse body ----
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Corps de requête invalide (JSON attendu)" },
      { status: 400 }
    );
  }

  // ---- Validation des champs ----
  const montant =
    typeof body.montant === "number" &&
    Number.isFinite(body.montant) &&
    Number.isInteger(body.montant) &&
    body.montant > 0
      ? body.montant
      : null;

  if (montant === null) {
    return NextResponse.json(
      {
        success: false,
        error: "Le montant doit être un entier positif (en FCFA)",
      },
      { status: 400 }
    );
  }

  const methode = typeof body.methode === "string" ? body.methode : "";
  if (!(METHODES_VALID as readonly string[]).includes(methode)) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Mode de paiement invalide. Valeurs attendues : 'especes', 'mobile_money', 'carte_bancaire'.",
      },
      { status: 400 }
    );
  }

  const reference =
    typeof body.reference === "string" && body.reference.trim()
      ? body.reference.trim().slice(0, 500)
      : null;
  const justificatifUrl =
    typeof body.justificatif_url === "string" && body.justificatif_url.trim()
      ? body.justificatif_url.trim()
      : null;

  // ---- Vérifie que l'abonnement existe (RLS isole aux super admins) ----
  const { data: abonnement, error: abErr } = await supabase
    .from("abonnements")
    .select(
      "id, pressing_id, plan, statut, date_fin, montant_mensuel"
    )
    .eq("id", abonnementId)
    .maybeSingle();

  if (abErr) {
    console.error(
      "[api/super-admin/abonnements/[id]/renouveler] Erreur SELECT abonnement:",
      abErr
    );
    return NextResponse.json(
      { success: false, error: "Erreur lors de la vérification de l'abonnement" },
      { status: 500 }
    );
  }
  if (!abonnement) {
    return NextResponse.json(
      { success: false, error: "Abonnement introuvable" },
      { status: 404 }
    );
  }

  // ⚠️ DÉCLARATIF : aucune transaction bancaire réelle n'est initiée.
  // Ce formulaire enregistre simplement une déclaration de paiement pour
  // tracer les échéances. Le règlement réel (espèces, Mobile Money, carte)
  // se fait HORS application.

  // ---- 1. INSERT dans paiements (abonnement_id renseigné, commande_id NULL) ----
  // La contrainte CHECK XOR (paiements_commande_abonnement_xor_check) exige
  // exactement UN des deux non-null. Ici on renseigne abonnement_id.
  const { data: paiement, error: paiementErr } = await supabase
    .from("paiements")
    .insert({
      commande_id: null,
      abonnement_id: abonnementId,
      montant,
      methode: methode as "especes" | "mobile_money" | "carte_bancaire",
      reference,
      justificatif_url: justificatifUrl,
      // `est_acompte` n'a pas de sens pour un abonnement, on le force à false
      // (valeur par défaut de la colonne). On ne le précise pas explicitement
      // pour éviter une erreur si la colonne n'existe pas encore en base
      // (migration 010), mais elle est appliquée d'après le worklog Task 22.
      enregistre_par: superAdmin.id,
    })
    .select("id, montant, methode, reference, justificatif_url, created_at")
    .single();

  if (paiementErr) {
    console.error(
      "[api/super-admin/abonnements/[id]/renouveler] Erreur INSERT paiements:",
      paiementErr
    );
    return NextResponse.json(
      { success: false, error: "Erreur lors de l'enregistrement du paiement" },
      { status: 500 }
    );
  }

  // ---- 2. Calcule la nouvelle date_fin ----
  // Règle :
  //   - si date_fin actuelle est dans le futur → date_fin + 1 mois
  //   - si date_fin passée ou NULL → now() + 1 mois
  const now = new Date();
  let baseDate: Date;
  if (abonnement.date_fin) {
    const currentFin = new Date(abonnement.date_fin);
    baseDate = currentFin.getTime() > now.getTime() ? currentFin : now;
  } else {
    baseDate = now;
  }
  const newDateFin = new Date(
    baseDate.getFullYear(),
    baseDate.getMonth() + 1,
    baseDate.getDate(),
    baseDate.getHours(),
    baseDate.getMinutes(),
    baseDate.getSeconds()
  );

  // ---- 3. UPDATE abonnements ----
  const { data: updatedAbonnement, error: updateErr } = await supabase
    .from("abonnements")
    .update({
      date_fin: newDateFin.toISOString(),
      statut: "actif" as const,
      mode_paiement_derniere_echeance: methode as
        | "especes"
        | "mobile_money"
        | "carte_bancaire",
      date_derniere_echeance: now.toISOString(),
      reference_paiement: reference,
      justificatif_url: justificatifUrl,
      enregistre_par: superAdmin.id,
    })
    .eq("id", abonnementId)
    .select(
      "id, plan, statut, date_debut, date_fin, montant_mensuel, mode_paiement_derniere_echeance, date_derniere_echeance, reference_paiement, justificatif_url"
    )
    .single();

  if (updateErr) {
    console.error(
      "[api/super-admin/abonnements/[id]/renouveler] Erreur UPDATE abonnements:",
      updateErr
    );
    // Le paiement est déjà inséré ; on signale l'erreur mais on renvoie le
    // paiement pour que l'opérateur puisse comprendre ce qui s'est passé.
    return NextResponse.json(
      {
        success: false,
        error:
          "Paiement enregistré mais échec de la mise à jour de l'abonnement. Contactez un développeur.",
        paiement,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    data: {
      abonnement: updatedAbonnement,
      paiement,
    },
  });
}
