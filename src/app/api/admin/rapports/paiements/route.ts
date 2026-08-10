/**
 * OgPressing — API /api/admin/rapports/paiements (GET) — LOT 12.2
 * ---------------------------------------------------------------
 * Export .xlsx — Rapport Paiements : historique complet des paiements.
 *
 * Query params ( optionnels, filtre sur date_paiement ) :
 *   - start : ISO 8601 ( inclus )
 *   - end   : ISO 8601 ( inclus )
 *
 * Si start/end absents → tous les paiements du pressing.
 *
 * Colonnes retournées ( alignées sur COLONNES_PAIEMENTS ) :
 *   date | commande_numero | client | montant | methode | est_acompte |
 *   reference | caissier
 *
 * - Montants : entiers ( sans suffixe FCFA, pour calculs Excel ).
 * - Dates    : "JJ/MM/AAAA" ( formatDateOnly ). Utilise date_paiement si
 *   non-null, sinon created_at ( défensif ).
 * - Enums    : libellés FR ( METHODE_PAIEMENT_LABELS ).
 * - Boolean  : est_acompte → "Oui" / "Non".
 * - Tri      : created_at DESC ( ou date_paiement DESC ).
 * - Limite   : 1000 lignes.
 *
 * 🔒 SÉCURITÉ : getSupabaseServer() (anon + JWT) → RLS isole par pressing_id
 *   ( paiements → commandes → pressing_id ). Auth : personnel actif.
 *
 * ⚠️ PostgREST relation paiements.enregistre_par → personnel : il peut y avoir
 *    plusieurs FK de paiements vers personnel (enregistre_par, etc.) ou de
 *    commandes vers personnel. Pour éviter toute ambiguïté, on utilise la
 *    forme explicite `personnel!paiements_enregistre_par_fkey` qui désigne
 *    la contrainte FK précise. C'est la forme utilisée dans
 *    `src/app/api/admin/commandes/[id]/route.ts` pour `cree_par`.
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
  METHODE_PAIEMENT_LABELS,
} from "@/components/ogpressing/admin/rapports/rapports-helpers";

export const dynamic = "force-dynamic";

/* -------------------------------------------------------------------------- */
/*  TYPES                                                                      */
/* -------------------------------------------------------------------------- */

interface CommandeNested {
  id: string;
  numero_commande: string;
  client: { nom_complet: string | null } | null;
}

interface CaissierNested {
  nom_complet: string | null;
}

interface PaiementRow {
  id: string;
  montant: number;
  methode: string;
  reference: string | null;
  date_paiement: string | null;
  est_acompte: boolean;
  created_at: string;
  commande: CommandeNested | null;
  caissier: CaissierNested | null;
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
  // Fix (FIX-WAVE1-A #4) : cutoff appliqué sur la colonne `date_paiement`
  // (ou `created_at` si date_paiement est null) pour ne pas exporter de
  // paiements au-delà de la limite du plan. Si l'utilisateur fournit un
  // `start` plus récent que le cutoff, le filtre le plus restrictif gagne.
  const plan = await getPressingPlan(supabase, me.pressing_id);
  const historyCutoff = getHistoryCutoff(plan);

  const sp = request.nextUrl.searchParams;
  const start = sp.get("start") || null;
  const end = sp.get("end") || null;

  // Construction de la requête avec filtre période optionnel
  // On utilise la forme explicite `personnel!paiements_enregistre_par_fkey`
  // pour désigner sans ambiguïté la FK paiements.enregistre_par → personnel.id
  let query = supabase
    .from("paiements")
    .select(
      `
      id,
      montant,
      methode,
      reference,
      date_paiement,
      est_acompte,
      created_at,
      commande:commandes(id, numero_commande, client:clients(nom_complet)),
      caissier:personnel!paiements_enregistre_par_fkey(nom_complet)
      `
    );

  // Cutoff d'historique (PRD §16) — appliqué sur `date_paiement`. Les
  // paiements sans `date_paiement` (cas anormal) ne seront pas filtrés
  // par ce critère, mais le filtre `start` user s'applique aussi.
  if (historyCutoff) {
    query = query.gte("date_paiement", historyCutoff);
  }
  if (start) {
    query = query.gte("date_paiement", start);
  }
  if (end) {
    query = query.lte("date_paiement", end);
  }

  // Tri : date_paiement DESC ( avec fallback created_at )
  // PostgREST permet de trier sur la colonne ; les paiements avec date_paiement
  // null seront placés en dernier par Supabase par défaut.
  query = query.order("date_paiement", { ascending: false, nullsFirst: false });

  const { data: paiements, error: paiementsErr } = await query.limit(1000);

  if (paiementsErr) {
    console.error("[api/admin/rapports/paiements] Erreur SELECT:", paiementsErr);
    return NextResponse.json(
      { success: false, error: "Erreur lors de la récupération des paiements" },
      { status: 500 }
    );
  }

  const rows: Record<string, unknown>[] = (paiements ?? []).map((pRaw) => {
    const p = pRaw as unknown as PaiementRow;
    const dateEffective = p.date_paiement ?? p.created_at;
    return {
      date: formatDateOnly(dateEffective),
      commande_numero: p.commande?.numero_commande ?? "—",
      client: p.commande?.client?.nom_complet ?? "—",
      montant: Math.trunc(p.montant ?? 0),
      methode: p.methode
        ? METHODE_PAIEMENT_LABELS[p.methode] ?? p.methode
        : "—",
      est_acompte: p.est_acompte === true ? "Oui" : "Non",
      reference: p.reference && p.reference.trim() ? p.reference : "—",
      caissier: p.caissier?.nom_complet ?? "—",
    };
  });

  return NextResponse.json({ success: true, data: rows });
}
