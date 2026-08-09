/**
 * OgPressing — API /api/admin/rapports/mensuel (GET) — LOT 12.2
 * --------------------------------------------------------------
 * Export .xlsx — Rapport Mensuel : CA et répartition par service du mois.
 *
 * Query params :
 *   - mois : YYYY-MM ( défaut : mois courant UTC )
 *
 * Colonnes retournées ( alignées sur COLONNES_MENSUEL ) :
 *   date | nombre_commandes | ca_jour | repartition_service
 *
 * - Tous les jours du mois sont listés, même ceux sans commande ( 0 / 0 / "—" ).
 * - repartition_service : "Lavage: 5000, Repassage: 3000" — agrégat de
 *   montant_ligne par service.type, uniquement les types avec montant > 0.
 * - Tri : date ASC.
 *
 * 🔒 SÉCURITÉ : getSupabaseServer() (anon + JWT) → RLS isole par pressing_id.
 *   Auth : n'importe quel personnel actif du pressing.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requirePlanFeature } from "@/lib/auth/plan-gating";
import { formatDateOnly } from "@/lib/utils/format";
import {
  TYPE_SERVICE_LABELS,
} from "@/components/ogpressing/admin/rapports/rapports-helpers";

export const dynamic = "force-dynamic";

/* -------------------------------------------------------------------------- */
/*  TYPES                                                                      */
/* -------------------------------------------------------------------------- */

interface LigneRow {
  montant_ligne: number;
  service: { type: string | null } | null;
}

interface CommandeRow {
  id: string;
  montant_total: number;
  created_at: string;
  lignes: LigneRow[] | null;
}

/* -------------------------------------------------------------------------- */
/*  HELPERS                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Calcule les bornes [start, end] UTC d'un mois ( YYYY-MM ).
 * Retourne null si le mois est invalide.
 */
function computeMonthBounds(moisStr: string): {
  start: string;
  end: string;
  year: number;
  month: number; // 1-indexed (1-12)
  lastDay: number;
} | null {
  const m = /^(\d{4})-(\d{2})$/.exec(moisStr);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (!year || month < 1 || month > 12) return null;
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  if (isNaN(start.getTime())) return null;
  // Dernier jour du mois : on prend le jour 0 du mois suivant
  const lastDayDate = new Date(Date.UTC(year, month, 0));
  const lastDay = lastDayDate.getUTCDate();
  const end = new Date(Date.UTC(year, month - 1, lastDay, 23, 59, 59, 999));
  return { start: start.toISOString(), end: end.toISOString(), year, month, lastDay };
}

/**
 * Construit le libellé "Répartition par service" pour une journée.
 * Format : "Lavage: 5000, Repassage: 3000" — uniquement les types avec
 * montant > 0, ordonnés selon l'ordre naturel des types de service.
 */
function buildRepartitionLabel(
  parType: Map<string, number>,
  ordreTypes: readonly string[]
): string {
  const parts: string[] = [];
  for (const type of ordreTypes) {
    const montant = parType.get(type) ?? 0;
    if (montant > 0) {
      const label = TYPE_SERVICE_LABELS[type] ?? type;
      parts.push(`${label}: ${montant}`);
    }
  }
  return parts.length > 0 ? parts.join(", ") : "—";
}

/** Retourne la clé UTC "YYYY-MM-DD" d'une date ISO ( pour grouper par jour ). */
function utcDayKey(iso: string): string {
  const d = new Date(iso);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/* -------------------------------------------------------------------------- */
/*  GET                                                                        */
/* -------------------------------------------------------------------------- */

// Ordre naturel des types de service ( aligné sur TYPES_SERVICE_ORDONNES )
const ORDRE_TYPES = [
  "lavage",
  "repassage",
  "laver_repasser",
  "nettoyage_sec",
  "detachage",
  "blanchisserie",
] as const;

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
  const nowIso = new Date().toISOString();
  const moisParam = sp.get("mois") || nowIso.slice(0, 7); // YYYY-MM
  const bounds = computeMonthBounds(moisParam);
  if (!bounds) {
    return NextResponse.json(
      { success: false, error: "Format de mois invalide (attendu : YYYY-MM)" },
      { status: 400 }
    );
  }

  const { data: commandes, error: cmdErr } = await supabase
    .from("commandes")
    .select(
      `
      id,
      montant_total,
      created_at,
      lignes:commande_lignes(montant_ligne, service:services(type))
      `
    )
    .gte("created_at", bounds.start)
    .lte("created_at", bounds.end)
    .order("created_at", { ascending: true });

  if (cmdErr) {
    console.error("[api/admin/rapports/mensuel] Erreur SELECT:", cmdErr);
    return NextResponse.json(
      { success: false, error: "Erreur lors de la récupération des commandes" },
      { status: 500 }
    );
  }

  // Agrège par jour UTC
  interface DayAgg {
    nombre_commandes: number;
    ca_jour: number;
    repartition: Map<string, number>;
  }
  const parJour = new Map<string, DayAgg>();

  for (const cmdRaw of commandes ?? []) {
    const cmd = cmdRaw as unknown as CommandeRow;
    const dayKey = utcDayKey(cmd.created_at);
    let agg = parJour.get(dayKey);
    if (!agg) {
      agg = {
        nombre_commandes: 0,
        ca_jour: 0,
        repartition: new Map<string, number>(),
      };
      parJour.set(dayKey, agg);
    }
    agg.nombre_commandes += 1;
    agg.ca_jour += Math.trunc(cmd.montant_total ?? 0);
    if (cmd.lignes && Array.isArray(cmd.lignes)) {
      for (const ligne of cmd.lignes) {
        const type = ligne.service?.type;
        const montant = Math.trunc(ligne.montant_ligne ?? 0);
        if (type && montant > 0) {
          agg.repartition.set(type, (agg.repartition.get(type) ?? 0) + montant);
        }
      }
    }
  }

  // Construit toutes les lignes du mois ( même les jours sans commande )
  const rows: Record<string, unknown>[] = [];
  for (let dayNum = 1; dayNum <= bounds.lastDay; dayNum++) {
    const dayKey = `${bounds.year}-${String(bounds.month).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
    const isoDay = `${dayKey}T12:00:00.000Z`; // midi UTC pour éviter effets de bord
    const agg = parJour.get(dayKey);
    if (agg) {
      rows.push({
        date: formatDateOnly(isoDay),
        nombre_commandes: agg.nombre_commandes,
        ca_jour: agg.ca_jour,
        repartition_service: buildRepartitionLabel(agg.repartition, ORDRE_TYPES),
      });
    } else {
      rows.push({
        date: formatDateOnly(isoDay),
        nombre_commandes: 0,
        ca_jour: 0,
        repartition_service: "—",
      });
    }
  }

  return NextResponse.json({ success: true, data: rows });
}
