/**
 * OgPressing — API /api/admin/rapports/remises (GET) — LOT 12.2
 * --------------------------------------------------------------
 * Export .xlsx — Rapport Remises : commandes ayant bénéficié d'une remise.
 *
 * Query params ( optionnels, filtre sur created_at ) :
 *   - start : ISO 8601 ( inclus )
 *   - end   : ISO 8601 ( inclus )
 *
 * Si start/end absents → toutes les remises du pressing.
 *
 * Colonnes retournées ( alignées sur COLONNES_REMISES ) :
 *   numero_ticket | client | date | remise_type | remise_valeur |
 *   montant_remise | montant_total_avant_apres
 *
 * - Montants : entiers ( sans suffixe FCFA, pour calculs Excel ).
 * - Dates    : "JJ/MM/AAAA" ( formatDateOnly ).
 * - remise_type : libellé FR ( REMISE_TYPE_LABELS ).
 * - remise_valeur : `${valeur}${unit}` où unit = "%" pour pourcentage,
 *   " FCFA" pour les autres types ( montant_fixe, article_gratuit, fidelite ).
 *   Note : "aucune" est exclu par le filtre SQL ( remise_type != 'aucune' ).
 * - montant_total_avant_apres : "${montant_total_avant_remise} → ${montant_total} FCFA"
 * - Tri : created_at DESC.
 * - Limite : 1000 lignes.
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
import { formatDateOnly } from "@/lib/utils/format";
import {
  REMISE_TYPE_LABELS,
} from "@/components/ogpressing/admin/rapports/rapports-helpers";

export const dynamic = "force-dynamic";

/* -------------------------------------------------------------------------- */
/*  TYPES                                                                      */
/* -------------------------------------------------------------------------- */

interface CommandeRow {
  id: string;
  numero_commande: string;
  remise_type: string;
  remise_valeur: number;
  montant_remise: number;
  montant_total_avant_remise: number | null;
  montant_total: number;
  created_at: string;
  client: { nom_complet: string | null } | null;
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
  // Fix (FIX-WAVE1-A #4) : cutoff appliqué sur `created_at` des commandes
  // ayant bénéficié d'une remise. Si l'utilisateur fournit un `start` plus
  // récent que le cutoff, le filtre le plus restrictif gagne.
  const plan = await getPressingPlan(supabase, me.pressing_id);
  const historyCutoff = getHistoryCutoff(plan);

  const sp = request.nextUrl.searchParams;
  const start = sp.get("start") || null;
  const end = sp.get("end") || null;

  // Filtre : remise_type != 'aucune' ( on veut les remises appliquées ).
  // PostgREST : .neq("remise_type", "aucune") — mais cela exclura aussi les
  // NULL. Comme toutes les commandes ont un remise_type NOT NULL ( défaut
  // "aucune" ), c'est OK.
  let query = supabase
    .from("commandes")
    .select(
      `
      id,
      numero_commande,
      remise_type,
      remise_valeur,
      montant_remise,
      montant_total_avant_remise,
      montant_total,
      created_at,
      client:clients(nom_complet)
      `
    )
    .neq("remise_type", "aucune");

  if (historyCutoff) {
    query = query.gte("created_at", historyCutoff);
  }
  if (start) {
    query = query.gte("created_at", start);
  }
  if (end) {
    query = query.lte("created_at", end);
  }

  query = query
    .order("created_at", { ascending: false })
    .limit(1000);

  const { data: commandes, error: cmdErr } = await query;

  if (cmdErr) {
    console.error("[api/admin/rapports/remises] Erreur SELECT:", cmdErr);
    return NextResponse.json(
      { success: false, error: "Erreur lors de la récupération des remises" },
      { status: 500 }
    );
  }

  const rows: Record<string, unknown>[] = (commandes ?? []).map((cmdRaw) => {
    const cmd = cmdRaw as unknown as CommandeRow;
    const type = cmd.remise_type;
    const label = REMISE_TYPE_LABELS[type] ?? type;
    const valeur = cmd.remise_valeur ?? 0;
    const unit = type === "pourcentage" ? "%" : " FCFA";
    const avantRemise = Math.trunc(cmd.montant_total_avant_remise ?? 0);
    const apresRemise = Math.trunc(cmd.montant_total ?? 0);
    return {
      numero_ticket: cmd.numero_commande ?? "",
      client: cmd.client?.nom_complet ?? "—",
      date: formatDateOnly(cmd.created_at),
      remise_type: label,
      remise_valeur: `${valeur}${unit}`,
      montant_remise: Math.trunc(cmd.montant_remise ?? 0),
      montant_total_avant_apres: `${avantRemise} → ${apresRemise} FCFA`,
    };
  });

  return NextResponse.json({ success: true, data: rows });
}
