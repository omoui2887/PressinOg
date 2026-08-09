/**
 * OgPressing — Gating des fonctionnalités par plan d'abonnement (PRD §16)
 * ====================================================================
 * Centralise la vérification des features plan-gated :
 *
 *   - `export_xlsx`  → interdit pour `starter`, autorisé pour `pro` + `business`
 *   - `fds_upload`   → interdit pour `starter`, autorisé pour `pro` + `business`
 *   - `qr_scan`      → interdit pour `starter`, autorisé pour `pro` + `business`
 *
 * Limite d'employés (déjà gérée dans `/api/admin/personnel`) :
 *   - starter  → 3 sièges
 *   - pro      → 8 sièges
 *   - business → illimité
 *
 * Limitation d'historique (PRD §16) :
 *   - starter  → 3 derniers mois
 *   - pro      → 12 derniers mois
 *   - business → illimité
 *
 * 🔒 SÉCURITÉ :
 *   - `assertPlanFeature(plan, feature)` est une fonction pure (testable).
 *   - `getPressingPlan(supabase, pressingId)` lit la table `abonnements`
 *     via le client RLS-bound — l'isolation est garantie par la policy
 *     `abonnements_isolation_pressing` (lecture par pressing_id).
 *   - `requirePlanFeature(supabase, pressingId, feature)` retourne un
 *     `NextResponse` 403 si la feature est interdite, sinon `null`.
 *
 * Référence : PRD §16 — Plans tarifaires (Starter / Pro / Business).
 */
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

/* -------------------------------------------------------------------------- */
/*  TYPES                                                                      */
/* -------------------------------------------------------------------------- */

export type PlanAbonnement = "starter" | "pro" | "business";

export type PlanFeature = "export_xlsx" | "fds_upload" | "qr_scan";

/* -------------------------------------------------------------------------- */
/*  MATRICE FEATURE × PLAN                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Matrice centralisée : pour chaque feature, les plans qui l'autorisent.
 * Une feature absente du mapping est considérée comme autorisée pour tous
 * les plans (fail-open par défaut — choisir explicitement fail-closed en
 * listant la feature si elle doit être restreinte).
 */
const FEATURES_PAR_PLAN: Record<PlanFeature, PlanAbonnement[]> = {
  export_xlsx: ["pro", "business"],
  fds_upload: ["pro", "business"],
  qr_scan: ["pro", "business"],
};

/* -------------------------------------------------------------------------- */
/*  HELPERS PURS                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Vérifie qu'un plan autorise une feature donnée.
 *
 * @example
 *   assertPlanFeature("starter", "export_xlsx") → false
 *   assertPlanFeature("pro", "export_xlsx")     → true
 *   assertPlanFeature("business", "qr_scan")    → true
 */
export function assertPlanFeature(
  plan: PlanAbonnement | string | null | undefined,
  feature: PlanFeature
): boolean {
  if (!plan) return false;
  const allowed = FEATURES_PAR_PLAN[feature];
  return (allowed as string[]).includes(plan);
}

/**
 * Retourne le libellé FR d'un plan pour les messages utilisateur.
 */
export function planLabel(plan: PlanAbonnement | string | null | undefined): string {
  switch (plan) {
    case "business":
      return "Business";
    case "pro":
      return "Pro";
    case "starter":
      return "Starter";
    default:
      return "Starter";
  }
}

/**
 * Construit le message FR standard pour une feature interdite par le plan
 * Starter. Le message invite l'utilisateur à passer au plan Pro.
 */
export function planFeatureForbiddenMessage(
  feature: PlanFeature,
  plan: PlanAbonnement | string | null | undefined
): string {
  const libelleFeature: Record<PlanFeature, string> = {
    export_xlsx: "l'export Excel",
    fds_upload: "l'upload de Fiche de Données de Sécurité",
    qr_scan: "le scan QR Code",
  };
  const planCourant = planLabel(plan);
  return `Fonctionnalité non disponible dans votre plan ${planCourant}. Passez au plan Pro pour activer ${libelleFeature[feature]}.`;
}

/* -------------------------------------------------------------------------- */
/*  HISTORIQUE LIMITÉ (PRD §16)                                                */
/* -------------------------------------------------------------------------- */

/**
 * Retourne la date de coupure (cutoff) pour la limitation d'historique
 * selon le plan. Les commandes/clients créés AVANT cette date ne sont
 * pas visibles dans les listes (uniquement pour starter / pro).
 *
 *   - starter  → NOW() - 3 mois
 *   - pro      → NOW() - 12 mois
 *   - business → null (illimité)
 *
 * @returns Date ISO ou `null` si pas de limitation.
 */
export function getHistoryCutoff(
  plan: PlanAbonnement | string | null | undefined
): string | null {
  const now = new Date();
  switch (plan) {
    case "starter": {
      const d = new Date(now);
      d.setUTCMonth(d.getUTCMonth() - 3);
      return d.toISOString();
    }
    case "pro": {
      const d = new Date(now);
      d.setUTCMonth(d.getUTCMonth() - 12);
      return d.toISOString();
    }
    case "business":
    default:
      return null;
  }
}

/* -------------------------------------------------------------------------- */
/*  HELPERS AVEC I/O SUPABASE                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Récupère le plan d'abonnement actuel du pressing (le plus récent
 * abonnement en date_debut). Retourne `'starter'` par défaut si aucun
 * abonnement n'est trouvé (fail-safe côté gating : starter = le plus
 * restrictif).
 *
 * Utilise le client RLS-bound : la policy `abonnements_isolation_pressing`
 * garantit que l'on ne lit QUE les abonnements du pressing courant.
 *
 * @returns Le plan ('starter' | 'pro' | 'business') ou 'starter' par défaut.
 */
export async function getPressingPlan(
  supabase: SupabaseClient,
  pressingId: string
): Promise<PlanAbonnement> {
  if (!pressingId) return "starter";
  const { data } = await supabase
    .from("abonnements")
    .select("plan")
    .eq("pressing_id", pressingId)
    .order("date_debut", { ascending: false })
    .limit(1)
    .maybeSingle();
  const plan = data?.plan as PlanAbonnement | undefined;
  return plan ?? "starter";
}

/**
 * Vérifie qu'une feature est autorisée pour le pressing courant. Si elle
 * ne l'est PAS, retourne un `NextResponse` 403 prêt à être renvoyé par la
 * route API. Sinon retourne `null` (la route peut continuer).
 *
 * Usage typique dans un Route Handler :
 *
 *   const forbidden = await requirePlanFeature(supabase, pressingId, "export_xlsx");
 *   if (forbidden) return forbidden;
 *
 * @returns NextResponse 403 si interdit, `null` si autorisé.
 */
export async function requirePlanFeature(
  supabase: SupabaseClient,
  pressingId: string,
  feature: PlanFeature
): Promise<NextResponse | null> {
  const plan = await getPressingPlan(supabase, pressingId);
  if (assertPlanFeature(plan, feature)) {
    return null;
  }
  return NextResponse.json(
    {
      success: false,
      error: planFeatureForbiddenMessage(feature, plan),
      code: "PLAN_FEATURE_FORBIDDEN",
      plan,
      feature,
    },
    { status: 403 }
  );
}
