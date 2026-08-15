/**
 * e-pressing — API /api/admin/rapports/paiements-financier (GET)
 * --------------------------------------------------------------
 * Rapport financier immuable (migration 043) — agrège les paiements valides,
 * les paiements annulés (statut_row='annule'), les remboursements (type=
 * 'remboursement' dans paiement_annulations) et calcule le montant net
 * encaissé sur la période sélectionnée.
 *
 * ⚠️ PRINCIPE FONDAMENTAL (migration 043) :
 *   - Un paiement enregistré ne doit JAMAIS être supprimé physiquement.
 *   - Paiement valide    = statut_row='actif'  (comptabilisé dans montant_paye)
 *   - Paiement annulé    = statut_row='annule' (reversal, ne compte plus)
 *   - Paiement_annulations.type ∈ {erreur_saisie, doublon, remboursement, autre}
 *
 * Query params (optionnels, filtre sur paiements.date_paiement ET sur
 * paiement_annulations.date_annulation) :
 *   - start : ISO 8601 (inclus)
 *   - end   : ISO 8601 (inclus)
 *
 * Réponse JSON :
 *   {
 *     "success": true,
 *     "data": {
 *       "periode": { "start": "...", "end": "..." },
 *       "valides": { "count": 0, "montant": 0 },
 *       "annules": { "count": 0, "montant": 0 },
 *       "remboursements": { "count": 0, "montant": 0 },
 *       "par_type_annulation": [
 *         { "type": "erreur_saisie", "count": 0, "montant": 0 },
 *         { "type": "doublon",      "count": 0, "montant": 0 },
 *         { "type": "remboursement","count": 0, "montant": 0 },
 *         { "type": "autre",        "count": 0, "montant": 0 }
 *       ],
 *       "montant_net_encaisse": 0
 *     }
 *   }
 *
 *   montant_net_encaisse = valides.montant - remboursements.montant
 *
 * 🔒 SÉCURITÉ :
 *   - Authentification : getSupabaseServer() + getCurrentPersonnel (JWT).
 *     Tout personnel actif peut consulter (manager, comptable, ...).
 *   - L'agrégation utilise getSupabaseAdmin() (service_role) pour contourner
 *     RLS — RLS sur paiement_annulations est restrictive (SELECT only own
 *     pressing) et l'agrégation via PostgREST embedded resource serait
 *     complexe. On filtre EXPLICITEMENT par `pressing_id` depuis le personnel
 *     authentifié (défense en profondeur).
 *   - 401 si non authentifié, 403 si compte inactif, 503 si service admin
 *     indisponible (env vars manquantes).
 *
 * 📌 PLAN GATING (PRD §16) :
 *   - starter  → 3 derniers mois
 *   - pro      → 12 derniers mois
 *   - business → illimité
 *   Le cutoff est appliqué sur `date_paiement` (paiements) ET sur
 *   `date_annulation` (paiement_annulations) — le filtre le plus restrictif
 *   entre `start` utilisateur et `historyCutoff` gagne.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getCurrentPersonnel,
  isPersonnelActive,
} from "@/lib/auth/roles";
import {
  getPressingPlan,
  getHistoryCutoff,
} from "@/lib/auth/plan-gating";

export const dynamic = "force-dynamic";

/* -------------------------------------------------------------------------- */
/*  TYPES                                                                      */
/* -------------------------------------------------------------------------- */

/** Type d'annulation d'un paiement (enum `type_annulation_paiement`). */
type TypeAnnulationPaiement =
  | "erreur_saisie"
  | "doublon"
  | "remboursement"
  | "autre";

/** Agrégat (count + montant total) pour une catégorie de paiements. */
interface PaiementAgg {
  count: number;
  montant: number;
}

/** Ligne de la répartition par type d'annulation. */
interface ParTypeAnnulationRow {
  type: TypeAnnulationPaiement;
  count: number;
  montant: number;
}

/** Réponse complète du endpoint. */
interface PaiementsFinancierData {
  periode: { start: string | null; end: string | null };
  valides: PaiementAgg;
  annules: PaiementAgg;
  remboursements: PaiementAgg;
  par_type_annulation: ParTypeAnnulationRow[];
  montant_net_encaisse: number;
}

/**
 * Ligne brute retournée par la requête sur `paiements` avec la jointure
 * interne sur `commandes` (pour filtrer par pressing_id).
 */
interface PaiementRowBrut {
  montant: number | null;
  date_paiement: string | null;
  created_at: string;
  commande: { pressing_id: string } | null;
}

/** Ligne brute retournée par la requête sur `paiement_annulations`. */
interface AnnulationRowBrut {
  type: string;
  montant: number;
  date_annulation: string;
}

/** Liste ordonnée des 4 types d'annulation (pour garantir 4 lignes). */
const TOUS_TYPES_ANNULATION: TypeAnnulationPaiement[] = [
  "erreur_saisie",
  "doublon",
  "remboursement",
  "autre",
];

/* -------------------------------------------------------------------------- */
/*  GET                                                                        */
/* -------------------------------------------------------------------------- */

export async function GET(request: NextRequest) {
  // ---- 1. Authentification via client RLS-bound (JWT) ----
  const supabase = await getSupabaseServer();
  const me = await getCurrentPersonnel(supabase);
  if (!me) {
    return NextResponse.json(
      { success: false, error: "Non authentifié" },
      { status: 401 }
    );
  }
  if (!isPersonnelActive(me)) {
    return NextResponse.json(
      { success: false, error: "Accès refusé — compte inactif" },
      { status: 403 }
    );
  }

  // ---- 2. Plan gating — cutoff d'historique selon le plan ----
  const plan = await getPressingPlan(supabase, me.pressing_id);
  const historyCutoff = getHistoryCutoff(plan);

  // ---- 3. Query params : start (ISO), end (ISO) — optionnels ----
  const sp = request.nextUrl.searchParams;
  const userStart = sp.get("start") || null;
  const userEnd = sp.get("end") || null;

  // ---- 4. Initialisation du client admin (service_role) ----
  // Le client admin contourne la RLS — on filtre EXPLICITEMENT par pressing_id
  // ci-dessous pour garantir l'isolation des données entre pressings.
  let admin: ReturnType<typeof getSupabaseAdmin>;
  try {
    admin = getSupabaseAdmin();
  } catch (err) {
    console.error(
      "[api/admin/rapports/paiements-financier] getSupabaseAdmin error:",
      err
    );
    return NextResponse.json(
      {
        success: false,
        error:
          "Service admin indisponible — variables SUPABASE_SERVICE_ROLE_KEY manquantes.",
      },
      { status: 503 }
    );
  }

  // ---- 5. Construction des requêtes (en parallèle pour réduire la latence) ----
  //
  // Requête 1 : paiements valides (statut_row='actif')
  //   - join interne sur commandes pour filtrer par pressing_id
  //   - filtres période sur date_paiement
  //
  // Requête 2 : paiements annulés (statut_row='annule')
  //   - même join + filtres
  //
  // Requête 3 : paiement_annulations (reversal entries)
  //   - filtre direct sur pressing_id (la table a sa propre colonne)
  //   - filtres période sur date_annulation
  let validesQuery = admin
    .from("paiements")
    .select(
      "montant, date_paiement, created_at, commande:commandes!inner(pressing_id)"
    )
    .eq("statut_row", "actif")
    .eq("commandes.pressing_id", me.pressing_id);

  let annulesQuery = admin
    .from("paiements")
    .select(
      "montant, date_paiement, created_at, commande:commandes!inner(pressing_id)"
    )
    .eq("statut_row", "annule")
    .eq("commandes.pressing_id", me.pressing_id);

  let annulationsQuery = admin
    .from("paiement_annulations")
    .select("type, montant, date_annulation")
    .eq("pressing_id", me.pressing_id);

  // Application du cutoff d'historique (le plus restrictif gagne).
  // ⚠️ On filtre sur date_paiement pour les paiements (colonne métier) et
  // sur date_annulation pour les annulations. Les lignes avec date_paiement
  // null (cas anormal) ne seront pas retournées par le filtre gte — c'est
  // acceptable car une telle ligne est suspecte et ne devrait pas exister.
  if (historyCutoff) {
    validesQuery = validesQuery.gte("date_paiement", historyCutoff);
    annulesQuery = annulesQuery.gte("date_paiement", historyCutoff);
    annulationsQuery = annulationsQuery.gte(
      "date_annulation",
      historyCutoff
    );
  }
  if (userStart) {
    validesQuery = validesQuery.gte("date_paiement", userStart);
    annulesQuery = annulesQuery.gte("date_paiement", userStart);
    annulationsQuery = annulationsQuery.gte("date_annulation", userStart);
  }
  if (userEnd) {
    validesQuery = validesQuery.lte("date_paiement", userEnd);
    annulesQuery = annulesQuery.lte("date_paiement", userEnd);
    annulationsQuery = annulationsQuery.lte("date_annulation", userEnd);
  }

  // ---- 6. Exécution parallèle des 3 requêtes ----
  const [validesResult, annulesResult, annulationsResult] = await Promise.all([
    validesQuery,
    annulesQuery,
    annulationsQuery,
  ]);

  if (validesResult.error) {
    console.error(
      "[api/admin/rapports/paiements-financier] Erreur SELECT valides:",
      validesResult.error
    );
    return NextResponse.json(
      {
        success: false,
        error: "Erreur lors de la récupération des paiements valides.",
      },
      { status: 500 }
    );
  }
  if (annulesResult.error) {
    console.error(
      "[api/admin/rapports/paiements-financier] Erreur SELECT annules:",
      annulesResult.error
    );
    return NextResponse.json(
      {
        success: false,
        error: "Erreur lors de la récupération des paiements annulés.",
      },
      { status: 500 }
    );
  }
  if (annulationsResult.error) {
    console.error(
      "[api/admin/rapports/paiements-financier] Erreur SELECT annulations:",
      annulationsResult.error
    );
    return NextResponse.json(
      {
        success: false,
        error:
          "Erreur lors de la récupération des écritures d'annulation.",
      },
      { status: 500 }
    );
  }

  // ---- 7. Agrégation côté serveur ----
  const validesRows =
    (validesResult.data ?? []) as unknown as PaiementRowBrut[];
  const annulesRows =
    (annulesResult.data ?? []) as unknown as PaiementRowBrut[];
  const annulationsRows =
    (annulationsResult.data ?? []) as unknown as AnnulationRowBrut[];

  // Validés : count + somme des montants
  const validesMontant = validesRows.reduce(
    (sum, r) => sum + (r.montant ?? 0),
    0
  );
  const valides: PaiementAgg = {
    count: validesRows.length,
    montant: Math.trunc(validesMontant),
  };

  // Annulés : count + somme des montants (toutes catégories confondues)
  const annulesMontant = annulesRows.reduce(
    (sum, r) => sum + (r.montant ?? 0),
    0
  );
  const annules: PaiementAgg = {
    count: annulesRows.length,
    montant: Math.trunc(annulesMontant),
  };

  // Répartition par type d'annulation (4 lignes, même si count=0)
  const sumsByType = new Map<
    TypeAnnulationPaiement,
    { count: number; montant: number }
  >();
  for (const t of TOUS_TYPES_ANNULATION) {
    sumsByType.set(t, { count: 0, montant: 0 });
  }
  for (const r of annulationsRows) {
    // Cast défensif : si la BDD renvoie un type inconnu (enum modifié), on
    // l'ignore — pas de crash. On n'utilise pas `as TypeAnnulationPaiement`
    // directement car cela masquerait un éventuel enum corrompu.
    if (!sumsByType.has(r.type as TypeAnnulationPaiement)) continue;
    const key = r.type as TypeAnnulationPaiement;
    const prev = sumsByType.get(key)!;
    prev.count += 1;
    prev.montant += r.montant ?? 0;
  }

  const par_type_annulation: ParTypeAnnulationRow[] = TOUS_TYPES_ANNULATION.map(
    (t) => {
      const agg = sumsByType.get(t)!;
      return {
        type: t,
        count: agg.count,
        montant: Math.trunc(agg.montant),
      };
    }
  );

  // Remboursements = subset des annulations de type='remboursement'
  const rembAgg = sumsByType.get("remboursement")!;
  const remboursements: PaiementAgg = {
    count: rembAgg.count,
    montant: Math.trunc(rembAgg.montant),
  };

  // Montant net encaissé = valides - remboursements
  // (un remboursement signifie que l'argent a été rendu au client → réduit le
  // revenu net. Les autres types d'annulation sont des corrections comptables
  // qui ne sortent pas d'argent du pressing → ne réduisent pas le net.)
  const montant_net_encaisse = Math.trunc(
    valides.montant - remboursements.montant
  );

  // ---- 8. Réponse JSON ----
  const data: PaiementsFinancierData = {
    periode: { start: userStart, end: userEnd },
    valides,
    annules,
    remboursements,
    par_type_annulation,
    montant_net_encaisse,
  };

  return NextResponse.json({ success: true, data });
}
