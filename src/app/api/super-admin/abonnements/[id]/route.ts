/**
 * OgPressing — API /api/super-admin/abonnements/[id] (PATCH)
 * -----------------------------------------------------------
 * Met à jour un abonnement : changement de plan, suspension OU réactivation.
 *
 * Actions supportées (via body.action) :
 *   - "changer_plan" : body.plan = 'starter' | 'pro' | 'business'
 *                      → met à jour abonnements.plan + abonnements.montant_mensuel
 *                        (cf. PLAN_PRICING ci-dessous, valeurs réelles de la
 *                        landing page pricing.tsx).
 *   - "suspendre"    : → met à jour abonnements.statut = 'suspendu'
 *   - "reactiver"    : → met à jour abonnements.statut = 'actif'
 *                      + AUDIT-B-09 : réactive aussi pressing.statut='actif'
 *                        si le pressing était suspendu/essai (sans toucher au
 *                        personnel — voir renouveler/route.ts pour le détail).
 *
 * 🔒 SÉCURITÉ : getSupabaseServer() + RLS super_admin_full_access sur
 *    abonnements. Aucune transaction bancaire.
 *
 * ℹ️ NOTE : le spec mentionne "met à jour abonnements.plan et pressing
 *    correspondant". La table `pressing` n'a pas de colonne `plan`, on
 *    interprète donc "pressing correspondant" comme : l'abonnement est
 *    rattaché au bon pressing (déjà le cas via pressing_id, immuable).
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const PLANS_VALID = ["starter", "pro", "business"] as const;

/** Tarifs mensuels réels en FCFA (conformes à landing/pricing.tsx). */
const PLAN_PRICING: Record<string, number> = {
  starter: 9900,
  pro: 24900,
  business: 49900,
};

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

export async function PATCH(
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

  const action = typeof body.action === "string" ? body.action : "";

  if (
    action !== "changer_plan" &&
    action !== "suspendre" &&
    action !== "reactiver"
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Action invalide. Valeurs attendues : 'changer_plan', 'suspendre' ou 'reactiver'.",
      },
      { status: 400 }
    );
  }

  // ---- Vérifie que l'abonnement existe ----
  const { data: abonnement, error: abErr } = await supabase
    .from("abonnements")
    .select("id, plan, statut, montant_mensuel, pressing_id")
    .eq("id", abonnementId)
    .maybeSingle();

  if (abErr) {
    console.error(
      "[api/super-admin/abonnements/[id]] Erreur SELECT abonnement:",
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

  // ---- Applique l'action ----
  if (action === "changer_plan") {
    const plan = typeof body.plan === "string" ? body.plan : "";
    if (!(PLANS_VALID as readonly string[]).includes(plan)) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Plan invalide. Valeurs attendues : 'starter', 'pro' ou 'business'.",
        },
        { status: 400 }
      );
    }

    if (plan === abonnement.plan) {
      return NextResponse.json(
        { success: false, error: "L'abonnement est déjà sur ce plan" },
        { status: 400 }
      );
    }

    const nouveauMontant = PLAN_PRICING[plan];
    const { data: updated, error: updateErr } = await supabase
      .from("abonnements")
      .update({
        plan: plan as "starter" | "pro" | "business",
        montant_mensuel: nouveauMontant,
        enregistre_par: superAdmin.id,
      })
      .eq("id", abonnementId)
      .select(
        "id, plan, statut, date_debut, date_fin, montant_mensuel, mode_paiement_derniere_echeance, date_derniere_echeance, reference_paiement, justificatif_url"
      )
      .single();

    if (updateErr) {
      console.error(
        "[api/super-admin/abonnements/[id]] Erreur UPDATE (changer_plan):",
        updateErr
      );
      return NextResponse.json(
        { success: false, error: "Erreur lors du changement de plan" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: updated,
      action,
    });
  }

  // ---- action === "reactiver" — AUDIT-B-09 ----
  // Réactive un abonnement suspendu (statut='actif') ET réactive le pressing
  // associé si son statut était 'suspendu' ou 'essai'. Le personnel désactivé
  // n'est PAS réactivé automatiquement (le manager doit le faire manuellement —
  // cf. commentaire dans renouveler/route.ts étape 4).
  //
  // Cette action est distincte de "renouveler" : elle ne crée PAS de paiement
  // ni ne modifie date_fin. Elle sert à lever manuellement une suspension sans
  // nouvelle échéance (ex : erreur de saisie, retard régularisé hors SaaS).
  if (action === "reactiver") {
    if (abonnement.statut === "actif") {
      return NextResponse.json(
        { success: false, error: "Cet abonnement est déjà actif" },
        { status: 400 }
      );
    }

    const { data: updated, error: updateErr } = await supabase
      .from("abonnements")
      .update({
        statut: "actif" as const,
        enregistre_par: superAdmin.id,
      })
      .eq("id", abonnementId)
      .select(
        "id, plan, statut, date_debut, date_fin, montant_mensuel, mode_paiement_derniere_echeance, date_derniere_echeance, reference_paiement, justificatif_url"
      )
      .single();

    if (updateErr) {
      console.error(
        "[api/super-admin/abonnements/[id]] Erreur UPDATE (reactiver):",
        updateErr
      );
      return NextResponse.json(
        { success: false, error: "Erreur lors de la réactivation" },
        { status: 500 }
      );
    }

    // AUDIT-B-09 — Réactivation du pressing (même logique que renouveler/route.ts).
    // On ne réactive QUE si pressing.statut est 'suspendu' ou 'essai' (pas 'actif').
    // Le personnel désactivé n'est PAS réactivé automatiquement.
    const pressingIdReact = abonnement.pressing_id;
    const { data: pressingRow, error: pressingSelErr } = await supabase
      .from("pressing")
      .select("id, statut")
      .eq("id", pressingIdReact)
      .maybeSingle();

    if (pressingSelErr) {
      console.error(
        "[api/super-admin/abonnements/[id]] Erreur SELECT pressing (réactivation):",
        pressingSelErr
      );
      // Non bloquant : l'abonnement est réactivé, on log l'erreur.
    } else if (
      pressingRow &&
      (pressingRow.statut === "suspendu" || pressingRow.statut === "essai")
    ) {
      const oldStatut = pressingRow.statut;
      const { error: pressingUpdErr } = await supabase
        .from("pressing")
        .update({ statut: "actif" as const })
        .eq("id", pressingIdReact)
        .in("statut", ["suspendu", "essai"]);
      if (pressingUpdErr) {
        console.error(
          "[api/super-admin/abonnements/[id]] Erreur UPDATE pressing (réactivation):",
          pressingUpdErr
        );
      } else {
        console.log(
          `[reactiver] Pressing ${pressingIdReact} reactivated from ${oldStatut} to actif`
        );
      }
    }

    return NextResponse.json({
      success: true,
      data: updated,
      action,
    });
  }

  // action === "suspendre"
  if (abonnement.statut === "suspendu") {
    return NextResponse.json(
      { success: false, error: "Cet abonnement est déjà suspendu" },
      { status: 400 }
    );
  }

  const { data: updated, error: updateErr } = await supabase
    .from("abonnements")
    .update({
      statut: "suspendu" as const,
      enregistre_par: superAdmin.id,
    })
    .eq("id", abonnementId)
    .select(
      "id, plan, statut, date_debut, date_fin, montant_mensuel, mode_paiement_derniere_echeance, date_derniere_echeance, reference_paiement, justificatif_url"
    )
    .single();

  if (updateErr) {
    console.error(
      "[api/super-admin/abonnements/[id]] Erreur UPDATE (suspendre):",
      updateErr
    );
    return NextResponse.json(
      { success: false, error: "Erreur lors de la suspension" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    data: updated,
    action,
  });
}
