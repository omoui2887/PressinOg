/**
 * OgPressing — API /api/admin/rapports/impayes (GET) — LOT 12.2
 * --------------------------------------------------------------
 * Export .xlsx — Rapport Impayés : clients avec solde_impaye > 0 uniquement.
 *
 * Aucun filtre de période. Tous les clients du pressing ( sans pagination ).
 *
 * Colonnes retournées ( alignées sur COLONNES_IMPAYES ) :
 *   nom | telephone | solde_impaye | nombre_commandes_impayees |
 *   date_plus_ancienne_impayee
 *
 * - solde_impaye = SUM(montant_total - montant_paye) pour commandes WHERE
 *   statut_paiement IN ( non_paye, partiel ).
 * - nombre_commandes_impayees = COUNT des commandes non soldées.
 * - date_plus_ancienne_impayee = MIN(created_at) des commandes non soldées,
 *   au format "JJ/MM/AAAA", ou "—" si aucune.
 * - Tri : solde_impaye DESC.
 *
 * 🔒 SÉCURITÉ : getSupabaseServer() (anon + JWT) → RLS isole par pressing_id.
 *   Auth : n'importe quel personnel actif du pressing.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { formatDateOnly } from "@/lib/utils/format";

export const dynamic = "force-dynamic";

/* -------------------------------------------------------------------------- */
/*  TYPES                                                                      */
/* -------------------------------------------------------------------------- */

interface ClientRow {
  id: string;
  nom_complet: string;
  telephone: string;
}

interface CommandeImpayeeRow {
  client_id: string;
  montant_total: number;
  montant_paye: number;
  statut_paiement: string;
  created_at: string;
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
    .select("id, actif, statut_compte")
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

  // Pas de paramètres de requête pour cette route
  void request;

  // 1) Récupère tous les clients du pressing ( RLS isole par pressing_id )
  const { data: clients, error: clientsErr } = await supabase
    .from("clients")
    .select("id, nom_complet, telephone")
    .order("nom_complet", { ascending: true });

  if (clientsErr) {
    console.error("[api/admin/rapports/impayes] Erreur SELECT clients:", clientsErr);
    return NextResponse.json(
      { success: false, error: "Erreur lors de la récupération des clients" },
      { status: 500 }
    );
  }

  if (!clients || clients.length === 0) {
    return NextResponse.json({ success: true, data: [] });
  }

  // 2) Récupère uniquement les commandes non soldées ( non_paye ou partiel )
  const clientIds = (clients as ClientRow[]).map((c) => c.id);
  const { data: commandes, error: cmdErr } = await supabase
    .from("commandes")
    .select("client_id, montant_total, montant_paye, statut_paiement, created_at")
    .in("client_id", clientIds)
    .in("statut_paiement", ["non_paye", "partiel"]);

  if (cmdErr) {
    console.error("[api/admin/rapports/impayes] Erreur SELECT commandes:", cmdErr);
    return NextResponse.json(
      { success: false, error: "Erreur lors de la récupération des commandes" },
      { status: 500 }
    );
  }

  // 3) Agrège par client : solde_impaye, nombre_commandes_impayees, date la plus
  //    ancienne
  interface Agg {
    solde_impaye: number;
    nombre_commandes_impayees: number;
    datePlusAncienneMs: number | null; // timestamp MS pour comparaison
  }
  const aggsByClient = new Map<string, Agg>();

  if (commandes) {
    for (const cmdRaw of commandes as CommandeImpayeeRow[]) {
      let agg = aggsByClient.get(cmdRaw.client_id);
      if (!agg) {
        agg = {
          solde_impaye: 0,
          nombre_commandes_impayees: 0,
          datePlusAncienneMs: null,
        };
        aggsByClient.set(cmdRaw.client_id, agg);
      }
      const impaye = Math.max(
        Math.trunc(cmdRaw.montant_total ?? 0) - Math.trunc(cmdRaw.montant_paye ?? 0),
        0
      );
      agg.solde_impaye += impaye;
      agg.nombre_commandes_impayees += 1;
      const t = new Date(cmdRaw.created_at).getTime();
      if (!isNaN(t) && (agg.datePlusAncienneMs === null || t < agg.datePlusAncienneMs)) {
        agg.datePlusAncienneMs = t;
      }
    }
  }

  // 4) Construit les lignes uniquement pour les clients avec solde_impaye > 0
  const rows: Record<string, unknown>[] = [];
  for (const client of clients as ClientRow[]) {
    const agg = aggsByClient.get(client.id);
    if (!agg || agg.solde_impaye <= 0) continue;
    rows.push({
      nom: client.nom_complet ?? "",
      telephone: client.telephone ?? "—",
      solde_impaye: agg.solde_impaye,
      nombre_commandes_impayees: agg.nombre_commandes_impayees,
      date_plus_ancienne_impayee:
        agg.datePlusAncienneMs !== null
          ? formatDateOnly(new Date(agg.datePlusAncienneMs).toISOString())
          : "—",
    });
  }

  // Tri par solde_impaye décroissant
  rows.sort((a, b) => {
    const sa = typeof a.solde_impaye === "number" ? a.solde_impaye : 0;
    const sb = typeof b.solde_impaye === "number" ? b.solde_impaye : 0;
    return sb - sa;
  });

  return NextResponse.json({ success: true, data: rows });
}
