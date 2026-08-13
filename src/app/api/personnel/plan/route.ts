/**
 * e-pressing — API /api/personnel/plan (GET) — PRD §16
 * -----------------------------------------------------
 * Retourne le plan d'abonnement actuel du pressing du personnel connecté,
 * ainsi que les features disponibles selon ce plan.
 *
 * Utilisé côté client (scanner-qr pages, etc.) pour afficher les bannières
 * "Passez au plan Pro" sans devoir exposer toute la logique de gating.
 *
 * Réponse :
 *   {
 *     success: true,
 *     data: {
 *       plan: 'starter' | 'pro' | 'business',
 *       features: {
 *         export_xlsx: boolean,
 *         fds_upload: boolean,
 *         qr_scan: boolean
 *       },
 *       historyMonths: 3 | 12 | null  // null = illimité
 *     }
 *   }
 *
 * 🔒 SÉCURITÉ :
 *   - getSupabaseServer() (anon + JWT) → RLS isole par pressing_id.
 *   - Auth : n'importe quel personnel actif du pressing.
 *   - Aucune donnée sensible renvoyée (juste le plan + booléens de feature).
 */
import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  assertPlanFeature,
  getPressingPlan,
  type PlanFeature,
} from "@/lib/auth/plan-gating";

export const dynamic = "force-dynamic";

export async function GET() {
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
    .select("id, pressing_id, actif, statut_compte")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (!me) {
    return NextResponse.json(
      { success: false, error: "Accès refusé — personnel introuvable" },
      { status: 403 }
    );
  }
  if (me.actif !== true || me.statut_compte !== "actif") {
    return NextResponse.json(
      { success: false, error: "Accès refusé — compte inactif" },
      { status: 403 }
    );
  }

  const plan = await getPressingPlan(supabase, me.pressing_id);

  const features: Record<PlanFeature, boolean> = {
    export_xlsx: assertPlanFeature(plan, "export_xlsx"),
    fds_upload: assertPlanFeature(plan, "fds_upload"),
    qr_scan: assertPlanFeature(plan, "qr_scan"),
  };

  const historyMonths: number | null =
    plan === "starter" ? 3 : plan === "pro" ? 12 : null;

  return NextResponse.json({
    success: true,
    data: {
      plan,
      features,
      historyMonths,
    },
  });
}
