/**
 * OgPressing — API /api/super-admin/abonnements/[id]/renouveler (POST)
 * --------------------------------------------------------------------
 * Enregistre un NOUVEAU paiement d'échéance pour un abonnement (renouvellement).
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
 *     duree_mois?:   1 | 3 | 6 | 12,                      // durée du plan attribué (défaut: 1)
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
 *        - si date_fin actuelle est dans le futur → date_fin + duree_mois mois
 *        - si date_fin passée ou NULL → now() + duree_mois mois
 *   5. UPDATE `abonnements` : date_fin, statut='actif',
 *      mode_paiement_derniere_echeance, date_derniere_echeance=now,
 *      reference_paiement, justificatif_url, enregistre_par
 *   6. AUDIT-B-09 — Réactivation du pressing : si pressing.statut était
 *      'suspendu' ou 'essai', on le repasse à 'actif'. Le personnel
 *      désactivé n'est PAS réactivé automatiquement (le manager doit le
 *      faire manuellement — on ne sait pas distinguer désactivation
 *      légitime vs désactivation suite à suspension).
 *
 * 🔒 SÉCURITÉ : getSupabaseServer() + RLS super_admin_full_access sur
 *    abonnements & paiements. Aucune transaction bancaire n'est effectuée —
 *    seule une ligne de paiement (déclarative) est insérée.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const METHODES_VALID = ["especes", "mobile_money", "carte_bancaire"] as const;

/** Durées de plan autorisées (en mois). Le Super Admin peut attribuer
 *  un plan de 1, 3, 6 ou 12 mois à un pressing. */
const DUREES_MOIS_VALID = [1, 3, 6, 12] as const;
type DureeMois = (typeof DUREES_MOIS_VALID)[number];

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

  // ---- Durée du plan (1, 3, 6 ou 12 mois — défaut 1) ----
  // Permet au Super Admin d'attribuer un plan d'abonnement de 1 mois,
  // 3 mois, 6 mois ou 1 an en une seule opération.
  const rawDuree = body.duree_mois;
  const dureeMois: DureeMois =
    typeof rawDuree === "number" &&
    Number.isInteger(rawDuree) &&
    (DUREES_MOIS_VALID as readonly number[]).includes(rawDuree)
      ? (rawDuree as DureeMois)
      : 1;

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
  //
  // ⚠️ FIX BUG-AUDIT-RUNTIME (P0, découvert en E2E) : `paiements.enregistre_par`
  // a une FK vers `personnel(id)`. Mais l'action est effectuée par un Super
  // Admin dont l'ID est dans `super_admins` (pas dans `personnel`). Passer
  // `superAdmin.id` violait la FK → erreur 23503. On met NULL ici ; l'identité
  // du Super Admin reste tracée via la session auth + les logs serveur, et
  // `abonnements.enregistre_par` (qui n'a PAS cette FK restrictive) garde
  // l'attribution explicite ci-dessous.
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
      enregistre_par: null,
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
  //   - si date_fin actuelle est dans le futur → date_fin + dureeMois mois
  //   - si date_fin passée ou NULL → now() + dureeMois mois
  // dureeMois peut être 1, 3, 6 ou 12 (par défaut 1) — permet au Super Admin
  // d'attribuer un plan d'1 mois, 3 mois, 6 mois ou 1 an.
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
    baseDate.getMonth() + dureeMois,
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

  // --- Audit log #1 : renew_abonnement (Task FIX-ENCAISSER-SUPERADMIN) ---
  // Best-effort : logAudit() ne JAMAIS throw. On journalise le renouvellement
  // avec before_state = abonnement AVANT update, after_state = abonnement
  // APRÈS update. pressing_id = le pressing propriétaire de l'abonnement
  // (récupéré du SELECT abonnement initial).
  // user_id = l'UUID auth.users du super admin (superAdmin.user_id).
  await logAudit({
    pressing_id: abonnement.pressing_id,
    user_id: superAdmin.user_id,
    action: "renew_abonnement",
    entity_type: "abonnement",
    entity_id: abonnementId,
    before_state: {
      id: abonnement.id,
      pressing_id: abonnement.pressing_id,
      plan: abonnement.plan,
      statut: abonnement.statut,
      date_fin: abonnement.date_fin,
      montant_mensuel: abonnement.montant_mensuel,
    },
    after_state: {
      id: updatedAbonnement.id,
      plan: updatedAbonnement.plan,
      statut: updatedAbonnement.statut,
      date_fin: updatedAbonnement.date_fin,
      montant_mensuel: updatedAbonnement.montant_mensuel,
      mode_paiement_derniere_echeance:
        updatedAbonnement.mode_paiement_derniere_echeance,
      date_derniere_echeance: updatedAbonnement.date_derniere_echeance,
      reference_paiement: updatedAbonnement.reference_paiement,
      paiement_id: paiement.id,
      duree_mois: dureeMois,
    },
    req: request,
  });

  // ---- 4. AUDIT-B-09 — Réactivation du pressing ----
  // Lors d'un renouvellement, si le pressing était suspendu (non-paiement)
  // ou en essai (période d'essai 7 jours), on le repasse en 'actif'. Le
  // pressing.statut est l'enum `statut_pressing` (migration 001_enums.sql) :
  // 'actif' | 'suspendu' | 'essai' — il n'existe PAS de valeur 'essai_expire'
  // (l'essai expiré est représenté par `abonnements.statut='essai' AND
  // date_fin<NOW()`, géré par le middleware — voir P1-A section 5.6).
  // On ne réactive QUE si le statut est 'suspendu' ou 'essai' ; 'actif' est
  // laissé inchangé (cas nominal : renouvellement avant expiration).
  //
  // ⚠️ On ne réactive PAS automatiquement le personnel dont le compte aurait
  // pu être désactivé (statut_compte='desactive') : on ne sait pas distinguer
  // une désactivation légitime (fin de contrat) d'une désactivation suite à
  // suspension. Le manager devra réactiver manuellement les comptes concernés.
  const pressingIdRenew = abonnement.pressing_id;
  const { data: pressingRow, error: pressingSelErr } = await supabase
    .from("pressing")
    .select("id, statut")
    .eq("id", pressingIdRenew)
    .maybeSingle();

  if (pressingSelErr) {
    console.error(
      "[api/super-admin/abonnements/[id]/renouveler] Erreur SELECT pressing (réactivation):",
      pressingSelErr
    );
    // Non bloquant : l'abonnement est renouvelé, on log l'erreur et on continue.
  } else if (pressingRow && (pressingRow.statut === "suspendu" || pressingRow.statut === "essai")) {
    const oldStatut = pressingRow.statut;
    const { error: pressingUpdErr } = await supabase
      .from("pressing")
      .update({ statut: "actif" as const })
      .eq("id", pressingIdRenew)
      // Garde défensive : on ne met à jour QUE si le statut est toujours
      // 'suspendu' ou 'essai' (évite un race condition avec une autre
      // opération concurrente sur le pressing).
      .in("statut", ["suspendu", "essai"]);
    if (pressingUpdErr) {
      console.error(
        "[api/super-admin/abonnements/[id]/renouveler] Erreur UPDATE pressing (réactivation):",
        pressingUpdErr
      );
      // Non bloquant : l'abonnement est renouvelé, on log l'erreur et on
      // continue. Le super-admin pourra réactiver le pressing manuellement.
    } else {
      console.log(
        `[renewal] Pressing ${pressingIdRenew} reactivated from ${oldStatut} to actif`
      );
      // --- Audit log #2 : reactivate_pressing (Task FIX-ENCAISSER-SUPERADMIN) ---
      // Le pressing vient d'être reactivé (suspendu/essai → actif) suite au
      // renouvellement. On journalise cette transition pour traçabilité.
      // before_state = pressing AVANT (statut = oldStatut),
      // after_state = pressing APRÈS (statut = 'actif').
      await logAudit({
        pressing_id: pressingIdRenew,
        user_id: superAdmin.user_id,
        action: "reactivate_pressing",
        entity_type: "pressing",
        entity_id: pressingIdRenew,
        before_state: {
          id: pressingRow.id,
          statut: oldStatut,
        },
        after_state: {
          id: pressingRow.id,
          statut: "actif",
        },
        req: request,
      });
    }
  }

  return NextResponse.json({
    success: true,
    data: {
      abonnement: updatedAbonnement,
      paiement,
      duree_mois: dureeMois,
    },
  });
}
