/**
 * e-pressing — API /api/admin/rapports/stock (GET) — PRD §14 + §15
 * ----------------------------------------------------------------
 * Export .xlsx — Rapport Stock : mouvements entrées/sorties du pressing.
 *
 * Le PRD §15 liste explicitement « Stock — Mouvements entrées/sorties »
 * parmi les 8 rapports obligatoires. Cette route était manquante.
 *
 * Query params (tous optionnels) :
 *   - date_start : YYYY-MM-DD (incluse, filtre sur `date_mouvement`)
 *   - date_end   : YYYY-MM-DD (incluse)
 *   - produit_id : filtre par produit
 *   - type       : 'entree' | 'sortie' | 'ajustement' (tous par défaut)
 *
 * Colonnes retournées (alignées sur COLONNES_STOCK) :
 *   date | produit_nom | type_mouvement | quantite | motif | utilisateur_nom
 *
 * - Dates  : "JJ/MM/AAAA HH:mm" (formatDateTime — un mouvement a une heure
 *   précise, pas juste un jour).
 * - Quantités : nombre (entier ou décimal selon l'unité) — pas de suffixe
 *   pour permettre les calculs Excel.
 * - Enums  : libellés FR ("Entrée", "Sortie", "Ajustement").
 * - Tri    : date_mouvement DESC (du plus récent au plus ancien).
 * - Limite : 5000 lignes (anti-explosion mémoire côté client xlsx).
 *
 * 🔒 SÉCURITÉ :
 *   - getSupabaseServer() (anon + JWT) → RLS isole par pressing_id via
 *     le JOIN produits_stock.pressing_id.
 *   - Auth : n'importe quel personnel actif du pressing.
 *
 * 🚫 PLAN GATING (PRD §16) :
 *   - Starter  → export .xlsx interdit → 403
 *   - Pro/Business → autorisé
 *   Voir `src/lib/auth/plan-gating.ts`.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requirePlanFeature } from "@/lib/auth/plan-gating";
import { formatDateOnly, formatTime } from "@/lib/utils/format";

export const dynamic = "force-dynamic";

/* -------------------------------------------------------------------------- */
/*  TYPES — forme des lignes retournées par Supabase                           */
/* -------------------------------------------------------------------------- */

interface ProduitJoin {
  nom: string | null;
  unite: string | null;
}

interface PersonnelJoin {
  nom_complet: string | null;
}

interface MouvementRow {
  id: string;
  type_mouvement: string;
  quantite: number | string;
  motif: string | null;
  date_mouvement: string;
  produit: ProduitJoin | null;
  enregistre_par_personnel: PersonnelJoin | null;
}

/* -------------------------------------------------------------------------- */
/*  HELPERS                                                                    */
/* -------------------------------------------------------------------------- */

const TYPE_MOUVEMENT_LABELS: Record<string, string> = {
  entree: "Entrée",
  sortie: "Sortie",
  ajustement: "Ajustement",
};

const TYPES_VALIDES = new Set(["entree", "sortie", "ajustement"]);

/** Limite anti-explosion mémoire côté génération .xlsx. */
const MAX_ROWS = 5000;

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

  // Auth : n'importe quel personnel actif du pressing — on récupère
  // `pressing_id` pour le gating par plan.
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

  // Paramètres de requête (tous optionnels)
  const sp = request.nextUrl.searchParams;
  const dateStart = sp.get("date_start") || null;
  const dateEnd = sp.get("date_end") || null;
  const produitId = sp.get("produit_id") || null;
  const typeParam = sp.get("type") || null;
  const typeFiltre =
    typeParam && TYPES_VALIDES.has(typeParam) ? typeParam : null;

  // Construction de la requête avec JOINs.
  // RLS isole via produits_stock.pressing_id (la policy `mouvements_stock_isolation_pressing`
  // filtre par le pressing propriétaire du produit).
  let query = supabase
    .from("mouvements_stock")
    .select(
      "id, type_mouvement, quantite, motif, date_mouvement, produit:produits_stock(nom, unite), enregistre_par_personnel:personnel!mouvements_stock_enregistre_par_fkey(nom_complet)"
    );

  if (produitId) {
    query = query.eq("produit_id", produitId);
  }
  if (typeFiltre) {
    query = query.eq("type_mouvement", typeFiltre);
  }
  if (dateStart) {
    query = query.gte("date_mouvement", `${dateStart}T00:00:00.000Z`);
  }
  if (dateEnd) {
    query = query.lte("date_mouvement", `${dateEnd}T23:59:59.999Z`);
  }

  query = query
    .order("date_mouvement", { ascending: false })
    .limit(MAX_ROWS);

  const { data: mouvements, error: mvErr } = await query;

  if (mvErr) {
    console.error("[api/admin/rapports/stock] Erreur SELECT:", mvErr);
    return NextResponse.json(
      {
        success: false,
        error: "Erreur lors de la récupération des mouvements de stock",
      },
      { status: 500 }
    );
  }

  // Aplatit les JOINs + formate les valeurs pour l'export Excel.
  const rows: Record<string, unknown>[] = (mouvements ?? []).map((mRaw) => {
    const m = mRaw as unknown as MouvementRow;
    const produit = m.produit ?? { nom: null, unite: null };
    const personnel = m.enregistre_par_personnel ?? { nom_complet: null };
    const type = m.type_mouvement ?? "";
    const qte =
      typeof m.quantite === "string" ? parseFloat(m.quantite) : m.quantite;

    return {
      date: `${formatDateOnly(m.date_mouvement)} ${formatTime(m.date_mouvement)}`,
      produit_nom: produit.nom ?? "—",
      type_mouvement: TYPE_MOUVEMENT_LABELS[type] ?? type ?? "—",
      quantite: Number.isFinite(qte) ? qte : 0,
      motif: m.motif && m.motif.trim() ? m.motif.trim() : "—",
      utilisateur_nom: personnel.nom_complet ?? "—",
    };
  });

  return NextResponse.json({
    success: true,
    data: rows,
    meta: {
      total: rows.length,
      filtres: {
        date_start: dateStart,
        date_end: dateEnd,
        produit_id: produitId,
        type: typeFiltre,
      },
    },
  });
}
