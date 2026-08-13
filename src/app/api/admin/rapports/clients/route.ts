/**
 * e-pressing — API /api/admin/rapports/clients (GET) — LOT 12.2
 * --------------------------------------------------------------
 * Export .xlsx — Rapport Clients : liste complète avec données CRM agrégées.
 *
 * Aucun filtre de période. Tous les clients du pressing ( sans pagination ).
 *
 * Colonnes retournées ( alignées sur COLONNES_CLIENTS ) :
 *   nom | telephone | email | points_fidelite | solde_impaye |
 *   total_depense | nombre_commandes | preferences_lavage
 *
 * - Montants : entiers ( sans suffixe FCFA, pour calculs Excel ).
 * - Agrégats : solde_impaye = SUM(montant_total - montant_paye) pour commandes
 *   WHERE statut_paiement IN ( non_paye, partiel ). total_depense = SUM(montant_total).
 * - Tri : nom_complet ASC.
 *
 * 🔒 SÉCURITÉ : getSupabaseServer() (anon + JWT) → RLS isole par pressing_id.
 *   Auth : n'importe quel personnel actif du pressing.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requirePlanFeature,
  getPressingPlan,
  getHistoryCutoff,
} from "@/lib/auth/plan-gating";

export const dynamic = "force-dynamic";

/* -------------------------------------------------------------------------- */
/*  TYPES                                                                      */
/* -------------------------------------------------------------------------- */

interface ClientRow {
  id: string;
  nom_complet: string;
  telephone: string;
  email: string | null;
  points_fidelite: number;
  notes: string | null;
}

interface CommandeAggRow {
  client_id: string;
  montant_total: number;
  montant_paye: number;
  statut_paiement: string;
}

/* -------------------------------------------------------------------------- */
/*  GET                                                                        */
/* -------------------------------------------------------------------------- */

export async function GET(request: NextRequest) {
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
  // Fix (FIX-WAVE1-A #4) : cutoff appliqué sur les commandes agrégées pour
  // ne comptabiliser que les commandes dans la fenêtre d'historique du plan.
  // Les clients master data restent tous visibles (le cutoff ne s'applique
  // qu'aux transactions, pas au référentiel client).
  const plan = await getPressingPlan(supabase, me.pressing_id);
  const historyCutoff = getHistoryCutoff(plan);

  // Pas de paramètres de requête pour cette route
  void request;

  // 1) Récupère tous les clients du pressing ( RLS isole par pressing_id )
  const { data: clients, error: clientsErr } = await supabase
    .from("clients")
    .select(
      "id, nom_complet, telephone, email, points_fidelite, notes"
    )
    .order("nom_complet", { ascending: true });

  if (clientsErr) {
    console.error("[api/admin/rapports/clients] Erreur SELECT clients:", clientsErr);
    return NextResponse.json(
      { success: false, error: "Erreur lors de la récupération des clients" },
      { status: 500 }
    );
  }

  if (!clients || clients.length === 0) {
    return NextResponse.json({ success: true, data: [] });
  }

  // 2) Récupère toutes les commandes pour agréger par client
  //    ( RLS isole par pressing_id côté commandes également )
  const clientIds = (clients as ClientRow[]).map((c) => c.id);
  let cmdQuery = supabase
    .from("commandes")
    .select("client_id, montant_total, montant_paye, statut_paiement, created_at")
    .in("client_id", clientIds);

  if (historyCutoff) {
    cmdQuery = cmdQuery.gte("created_at", historyCutoff);
  }

  const { data: commandes, error: cmdErr } = await cmdQuery;

  if (cmdErr) {
    console.error("[api/admin/rapports/clients] Erreur SELECT commandes:", cmdErr);
    // On continue sans agrégations plutôt que de tout faire échouer
  }

  // Agrège par client
  interface Agg {
    solde_impaye: number;
    total_depense: number;
    nombre_commandes: number;
  }
  const aggsByClient = new Map<string, Agg>();
  for (const client of clients as ClientRow[]) {
    aggsByClient.set(client.id, {
      solde_impaye: 0,
      total_depense: 0,
      nombre_commandes: 0,
    });
  }

  if (commandes) {
    for (const cmdRaw of commandes as CommandeAggRow[]) {
      const agg = aggsByClient.get(cmdRaw.client_id);
      if (!agg) continue;
      agg.nombre_commandes += 1;
      agg.total_depense += Math.trunc(cmdRaw.montant_total ?? 0);
      if (
        cmdRaw.statut_paiement === "non_paye" ||
        cmdRaw.statut_paiement === "partiel"
      ) {
        const impaye = Math.max(
          Math.trunc(cmdRaw.montant_total ?? 0) - Math.trunc(cmdRaw.montant_paye ?? 0),
          0
        );
        agg.solde_impaye += impaye;
      }
    }
  }

  // 3) Construit les lignes du rapport
  const rows: Record<string, unknown>[] = (clients as ClientRow[]).map((c) => {
    const agg = aggsByClient.get(c.id) ?? {
      solde_impaye: 0,
      total_depense: 0,
      nombre_commandes: 0,
    };
    return {
      nom: c.nom_complet ?? "",
      telephone: c.telephone ?? "—",
      email: c.email && c.email.trim() ? c.email : "—",
      points_fidelite: Math.trunc(c.points_fidelite ?? 0),
      solde_impaye: agg.solde_impaye,
      total_depense: agg.total_depense,
      nombre_commandes: agg.nombre_commandes,
      preferences_lavage:
        c.notes && c.notes.trim() ? c.notes.trim() : "—",
    };
  });

  return NextResponse.json({ success: true, data: rows });
}
