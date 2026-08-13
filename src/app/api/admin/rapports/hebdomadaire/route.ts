/**
 * e-pressing — API /api/admin/rapports/hebdomadaire (GET) — LOT 12.2
 * -------------------------------------------------------------------
 * Export .xlsx — Rapport Hebdomadaire : commandes et paiements de la semaine.
 *
 * Query params :
 *   - date : YYYY-MM-DD ( défaut : aujourd'hui UTC )
 *
 * La semaine est ISO ( lundi = 1er jour, dimanche = 7e ). La semaine est celle
 * contenant la date passée en paramètre.
 *
 * Colonnes retournées ( alignées sur COLONNES_HEBDOMADAIRE —
 *   mêmes que journalier + colonne Date ) :
 *   numero_ticket | client | articles | montant_total |
 *   statut_paiement | mode_paiement | date | heure
 *
 * - Montants : entiers ( sans suffixe FCFA, pour calculs Excel ).
 * - Dates    : "JJ/MM/AAAA" ( formatDateOnly ).
 * - Heures   : "HH:mm" ( formatTime ).
 * - Enums    : libellés FR ( STATUT_PAIEMENT_LABELS, METHODE_PAIEMENT_LABELS ).
 * - Tri      : created_at ASC ( chronologique ).
 *
 * 🔒 SÉCURITÉ : getSupabaseServer() (anon + JWT) → RLS isole par pressing_id.
 *   Auth : n'importe quel personnel actif du pressing.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requirePlanFeature } from "@/lib/auth/plan-gating";
import { formatDateOnly, formatTime } from "@/lib/utils/format";
import {
  STATUT_PAIEMENT_LABELS,
  METHODE_PAIEMENT_LABELS,
} from "@/components/ogpressing/admin/rapports/rapports-helpers";

export const dynamic = "force-dynamic";

/* -------------------------------------------------------------------------- */
/*  TYPES                                                                      */
/* -------------------------------------------------------------------------- */

interface LigneRow {
  quantite: number;
  description: string | null;
  service: { nom: string | null } | null;
}

interface PaiementRow {
  methode: string | null;
}

interface CommandeRow {
  id: string;
  numero_commande: string;
  statut_paiement: string;
  montant_total: number;
  created_at: string;
  client: { nom_complet: string | null } | null;
  lignes: LigneRow[] | null;
  paiements: PaiementRow[] | null;
}

/* -------------------------------------------------------------------------- */
/*  HELPERS                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Calcule les bornes [start, end] UTC de la semaine ISO ( lundi → dimanche )
 * contenant la date passée. Retourne null si la date est invalide.
 */
function computeWeekBounds(dateStr: string): { start: string; end: string } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!y || !mo || !d) return null;
  const ref = new Date(Date.UTC(y, mo - 1, d, 0, 0, 0, 0));
  if (isNaN(ref.getTime())) return null;
  // Jour de la semaine UTC ( 0 = dimanche, 1 = lundi, ..., 6 = samedi )
  // Pour une semaine ISO ( lundi = 1er jour ), on calcule l'écart depuis le lundi
  const dayOfWeek = ref.getUTCDay();
  const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const monday = new Date(ref);
  monday.setUTCDate(ref.getUTCDate() - daysSinceMonday);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const start = new Date(
    Date.UTC(
      monday.getUTCFullYear(),
      monday.getUTCMonth(),
      monday.getUTCDate(),
      0,
      0,
      0,
      0
    )
  );
  const end = new Date(
    Date.UTC(
      sunday.getUTCFullYear(),
      sunday.getUTCMonth(),
      sunday.getUTCDate(),
      23,
      59,
      59,
      999
    )
  );
  return { start: start.toISOString(), end: end.toISOString() };
}

/** Construit le libellé "Articles" à partir des lignes de commande. */
function buildArticlesLabel(lignes: LigneRow[] | null): string {
  if (!lignes || lignes.length === 0) return "—";
  const parts = lignes
    .filter((l) => l && (l.service?.nom || l.description))
    .map((l) => {
      const nom = l.service?.nom || l.description || "";
      return `${l.quantite ?? 0} ${nom}`.trim();
    });
  return parts.length > 0 ? parts.join(", ") : "—";
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

  const sp = request.nextUrl.searchParams;
  const dateParam = sp.get("date") || new Date().toISOString().slice(0, 10);
  const bounds = computeWeekBounds(dateParam);
  if (!bounds) {
    return NextResponse.json(
      { success: false, error: "Format de date invalide (attendu : YYYY-MM-DD)" },
      { status: 400 }
    );
  }

  const { data: commandes, error: cmdErr } = await supabase
    .from("commandes")
    .select(
      `
      id,
      numero_commande,
      statut_paiement,
      montant_total,
      created_at,
      client:clients(nom_complet),
      lignes:commande_lignes(quantite, description, service:services(nom)),
      paiements:paiements(methode)
      `
    )
    .gte("created_at", bounds.start)
    .lte("created_at", bounds.end)
    .order("created_at", { ascending: true });

  if (cmdErr) {
    console.error("[api/admin/rapports/hebdomadaire] Erreur SELECT:", cmdErr);
    return NextResponse.json(
      { success: false, error: "Erreur lors de la récupération des commandes" },
      { status: 500 }
    );
  }

  const rows: Record<string, unknown>[] = (commandes ?? []).map((cmdRaw) => {
    const cmd = cmdRaw as unknown as CommandeRow;
    const firstPaiement =
      cmd.paiements && cmd.paiements.length > 0 ? cmd.paiements[0] : null;
    return {
      numero_ticket: cmd.numero_commande ?? "",
      client: cmd.client?.nom_complet ?? "—",
      articles: buildArticlesLabel(cmd.lignes),
      montant_total: Math.trunc(cmd.montant_total ?? 0),
      statut_paiement:
        STATUT_PAIEMENT_LABELS[cmd.statut_paiement] ?? cmd.statut_paiement ?? "—",
      mode_paiement: firstPaiement?.methode
        ? METHODE_PAIEMENT_LABELS[firstPaiement.methode] ?? firstPaiement.methode
        : "—",
      date: formatDateOnly(cmd.created_at),
      heure: formatTime(cmd.created_at),
    };
  });

  return NextResponse.json({ success: true, data: rows });
}
