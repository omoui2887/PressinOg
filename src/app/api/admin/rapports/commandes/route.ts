/**
 * e-pressing — API /api/admin/rapports/commandes (GET) — LOT 12.2
 * ---------------------------------------------------------------
 * Export .xlsx — Rapport Commandes : liste complète de toutes les commandes.
 *
 * Aucun filtre de période. Limité à 1000 lignes ( .limit(1000) ).
 *
 * Colonnes retournées ( alignées sur COLONNES_COMMANDES ) :
 *   numero_ticket | client | date_creation | date_retrait_prevue |
 *   statut | statut_paiement | montant_total | remise_appliquee
 *
 * - Montants : entiers ( sans suffixe FCFA, pour calculs Excel ).
 * - Dates    : "JJ/MM/AAAA" ( formatDateOnly ).
 * - Enums    : libellés FR ( STATUT_COMMANDE_LABELS, STATUT_PAIEMENT_LABELS,
 *   REMISE_TYPE_LABELS ).
 * - Tri      : created_at DESC.
 *
 * 🔒 SÉCURITÉ : getSupabaseServer() (anon + JWT) → RLS isole par pressing_id.
 *   Auth : n'importe quel personnel actif du pressing.
 */
import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requirePlanFeature,
  getPressingPlan,
  getHistoryCutoff,
} from "@/lib/auth/plan-gating";
import { formatDateOnly } from "@/lib/utils/format";
import {
  STATUT_COMMANDE_LABELS,
  STATUT_PAIEMENT_LABELS,
  REMISE_TYPE_LABELS,
} from "@/components/ogpressing/admin/rapports/rapports-helpers";

export const dynamic = "force-dynamic";

/* -------------------------------------------------------------------------- */
/*  TYPES                                                                      */
/* -------------------------------------------------------------------------- */

interface CommandeRow {
  id: string;
  numero_commande: string;
  statut: string;
  statut_paiement: string;
  montant_total: number;
  remise_type: string | null;
  remise_valeur: number | null;
  montant_remise: number | null;
  date_pret_prevue: string | null;
  created_at: string;
  client: { nom_complet: string | null } | null;
}

/* -------------------------------------------------------------------------- */
/*  HELPERS                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Construit le libellé "Remise appliquée".
 * - Si remise_type === "aucune" ou null → "Aucune"
 * - Sinon : `${Label FR} ${valeur}${unit} = ${montant_remise} FCFA`
 *   où unit = "%" pour pourcentage, " FCFA" pour les autres types.
 */
function buildRemiseLabel(cmd: CommandeRow): string {
  const type = cmd.remise_type;
  if (!type || type === "aucune") return "Aucune";
  const label = REMISE_TYPE_LABELS[type] ?? type;
  const valeur = cmd.remise_valeur ?? 0;
  const montantRemise = Math.trunc(cmd.montant_remise ?? 0);
  const unit = type === "pourcentage" ? "%" : " FCFA";
  return `${label} ${valeur}${unit} = ${montantRemise} FCFA`;
}

/* -------------------------------------------------------------------------- */
/*  GET                                                                        */
/* -------------------------------------------------------------------------- */

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

  // 🚫 PLAN GATING (PRD §16) — Starter ne peut pas exporter en .xlsx.
  const forbidden = await requirePlanFeature(
    supabase,
    me.pressing_id,
    "export_xlsx"
  );
  if (forbidden) return forbidden;

  // 🚫 PLAN GATING (PRD §16) — limitation d'historique selon le plan :
  //   starter → 3 derniers mois, pro → 12 derniers mois, business → illimité.
  // Fix (FIX-WAVE1-A #4) : cutoff appliqué sur la colonne `created_at` pour
  // ne pas exporter de commandes au-delà de la limite du plan.
  const plan = await getPressingPlan(supabase, me.pressing_id);
  const historyCutoff = getHistoryCutoff(plan);

  // Cette route ne lit aucun paramètre de requête.

  let query = supabase
    .from("commandes")
    .select(
      `
      id,
      numero_commande,
      statut,
      statut_paiement,
      montant_total,
      remise_type,
      remise_valeur,
      montant_remise,
      date_pret_prevue,
      created_at,
      client:clients(nom_complet)
      `
    )
    .order("created_at", { ascending: false })
    .limit(1000);

  if (historyCutoff) {
    query = query.gte("created_at", historyCutoff);
  }

  const { data: commandes, error: cmdErr } = await query;

  if (cmdErr) {
    console.error("[api/admin/rapports/commandes] Erreur SELECT:", cmdErr);
    return NextResponse.json(
      { success: false, error: "Erreur lors de la récupération des commandes" },
      { status: 500 }
    );
  }

  const rows: Record<string, unknown>[] = (commandes ?? []).map((cmdRaw) => {
    const cmd = cmdRaw as unknown as CommandeRow;
    return {
      numero_ticket: cmd.numero_commande ?? "",
      client: cmd.client?.nom_complet ?? "—",
      date_creation: formatDateOnly(cmd.created_at),
      date_retrait_prevue: cmd.date_pret_prevue
        ? formatDateOnly(cmd.date_pret_prevue)
        : "—",
      statut: STATUT_COMMANDE_LABELS[cmd.statut] ?? cmd.statut ?? "—",
      statut_paiement:
        STATUT_PAIEMENT_LABELS[cmd.statut_paiement] ?? cmd.statut_paiement ?? "—",
      montant_total: Math.trunc(cmd.montant_total ?? 0),
      remise_appliquee: buildRemiseLabel(cmd),
    };
  });

  return NextResponse.json({ success: true, data: rows });
}
