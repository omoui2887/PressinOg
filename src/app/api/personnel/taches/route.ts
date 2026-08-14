/**
 * e-pressing — API /api/personnel/taches
 * --------------------------------------
 * GET : Liste des commandes contenant des articles assignés au personnel
 *       connecté, avec filtrage SERVEUR-SIDE par assigne_a = me.id.
 *
 *       C'est le cœur du "véritable système d'assignation" : un laveur
 *       ne voit QUE les commandes où au moins un article lui est assigné,
 *       et pour chaque commande, seuls SES articles sont comptés.
 *
 *       Le filtrage ne se fait JAMAIS uniquement côté frontend — la
 *       requête SQL filtre par assigne_a = me.id dès la source.
 *
 * Paramètres query :
 *   - statut      : filtre par statut COMMANDE (recu, en_traitement, lave, ...)
 *   - q           : recherche texte (numero_commande OU nom client)
 *   - page        : page courante (défaut 1)
 *   - pageSize    : taille de page (défaut 20, max 100)
 *
 * Réponse :
 *   {
 *     success: true,
 *     data: CommandeAvecMesArticles[],
 *     total, page, pageSize, totalPages,
 *     counters: { total_assignees, a_traiter, en_cours, termines }
 *   }
 *
 * 🔒 SÉCURITÉ :
 *   - Auth : personnel actif avec rôle de production (laveur, repassage,
 *     livreur) OU manager (le manager peut consulter ses propres tâches
 *     s'il s'en est assigné).
 *   - RLS isole par pressing_id (un laveur ne voit jamais les articles
 *     d'un autre pressing).
 *   - Le filtre assigne_a = me.id garantit qu'un laveur ne voit pas les
 *     tâches d'un autre laveur du même pressing.
 *   - Les compteurs sont calculés sur TOUS mes articles assignés (pas
 *     seulement la page courante) → totaux exacts.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  getCurrentPersonnel,
  isPersonnelActive,
  type PersonnelRole,
} from "@/lib/auth/roles";
import { getPressingPlan, getHistoryCutoff } from "@/lib/auth/plan-gating";

export const dynamic = "force-dynamic";

/** Rôles autorisés à consulter leurs tâches assignées. */
const ROLES_AUTORISES: ReadonlySet<PersonnelRole> = new Set([
  "manager",
  "laveur",
  "repassage",
  "livreur",
]);

/** Statuts considérés comme "à traiter" selon le rôle. */
const STATUTS_A_TRAITER: Record<string, ReadonlySet<string>> = {
  laveur: new Set(["recu", "en_traitement"]),
  repassage: new Set(["lave"]),
  livreur: new Set(["pret"]),
  manager: new Set(["recu", "en_traitement", "lave", "repasse", "pret"]),
};

/** Statuts considérés comme "en cours" selon le rôle. */
const STATUTS_EN_COURS: Record<string, ReadonlySet<string>> = {
  laveur: new Set(["en_traitement"]),
  repassage: new Set(["repasse"]),
  livreur: new Set(["en_livraison"]),
  manager: new Set(["en_traitement", "repasse", "en_livraison"]),
};

/** Statuts considérés comme "terminés" selon le rôle. */
const STATUTS_TERMINES: Record<string, ReadonlySet<string>> = {
  laveur: new Set(["lave", "repasse", "pret", "retire", "livre"]),
  repassage: new Set(["pret", "retire", "livre"]),
  livreur: new Set(["livre", "retire"]),
  manager: new Set(["retire", "livre"]),
};

interface MesArticlesBreakdown {
  total: number;
  a_traiter: number;
  en_cours: number;
  termines: number;
  by_statut: Record<string, number>;
  /** IDs des articles assignés à moi dans cette commande. */
  ids: string[];
  /** IDs des articles à traiter (recu/en_traitement selon le rôle). */
  ids_a_traiter: string[];
}

interface CommandeAvecMesArticles {
  id: string;
  numero_commande: string;
  statut: string;
  statut_paiement: string;
  montant_total: number;
  montant_paye: number;
  date_reception: string | null;
  date_pret_prevue: string | null;
  priorite: string | null;
  created_at: string;
  client: { id: string; nom_complet: string; telephone: string | null } | null;
  mes_articles: MesArticlesBreakdown;
}

export async function GET(request: NextRequest) {
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
  if (!ROLES_AUTORISES.has(me.role)) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Accès refusé — seuls les rôles de production (laveur, repassage, livreur, manager) peuvent consulter leurs tâches.",
      },
      { status: 403 }
    );
  }

  // Plan gating — limitation d'historique
  const plan = await getPressingPlan(supabase, me.pressing_id);
  const historyCutoff = getHistoryCutoff(plan);

  // Paramètres
  const sp = request.nextUrl.searchParams;
  const q = (sp.get("q") || "").trim();
  const statut = sp.get("statut") || "";
  const page = Math.max(1, parseInt(sp.get("page") || "1", 10));
  const pageSize = Math.min(
    100,
    Math.max(1, parseInt(sp.get("pageSize") || "20", 10))
  );

  // ------------------------------------------------------------------
  // ÉTAPE 1 : Récupérer TOUS mes articles assignés (pour les compteurs
  // globaux + le set de commande_ids à afficher).
  // RLS isole par pressing ; le filtre assigne_a = me.id isole par employé.
  // ------------------------------------------------------------------
  let articlesQuery = supabase
    .from("articles_vetements")
    .select("id, commande_id, statut")
    .eq("assigne_a", me.id);

  if (historyCutoff) {
    // On ne peut pas filtrer articles_vetements par created_at directement
    // pour le plan gating (la limite porte sur la commande). On filtrera
    // les commande_ids à l'étape 2 via la requête commandes.
  }

  const { data: mesArticles, error: articlesErr } = await articlesQuery;

  if (articlesErr) {
    console.error("[api/personnel/taches] Erreur SELECT articles:", articlesErr);
    return NextResponse.json(
      { success: false, error: "Erreur lors de la récupération des tâches." },
      { status: 500 }
    );
  }

  if (!mesArticles || mesArticles.length === 0) {
    // Aucun article assigné → réponse vide avec compteurs à 0
    return NextResponse.json({
      success: true,
      data: [],
      total: 0,
      page,
      pageSize,
      totalPages: 0,
      counters: {
        total_assignees: 0,
        a_traiter: 0,
        en_cours: 0,
        termines: 0,
      },
    });
  }

  // ------------------------------------------------------------------
  // ÉTAPE 2 : Calculer les compteurs globaux (sur TOUS mes articles)
  // ------------------------------------------------------------------
  const statutsATraiter = STATUTS_A_TRAITER[me.role] ?? new Set();
  const statutsEnCours = STATUTS_EN_COURS[me.role] ?? new Set();
  const statutsTermines = STATUTS_TERMINES[me.role] ?? new Set();

  let totalAssignees = mesArticles.length;
  let countATraiter = 0;
  let countEnCours = 0;
  let countTermines = 0;
  const byStatut: Record<string, number> = {};
  // Map: commande_id → breakdown des articles
  const commandeArticleMap = new Map<
    string,
    {
      total: number;
      a_traiter: number;
      en_cours: number;
      termines: number;
      by_statut: Record<string, number>;
      ids: string[];
      ids_a_traiter: string[];
    }
  >();

  for (const a of mesArticles) {
    const s = a.statut as string;
    const aid = a.id as string;
    byStatut[s] = (byStatut[s] ?? 0) + 1;
    if (statutsATraiter.has(s)) countATraiter++;
    if (statutsEnCours.has(s)) countEnCours++;
    if (statutsTermines.has(s)) countTermines++;

    const cid = a.commande_id as string;
    if (!commandeArticleMap.has(cid)) {
      commandeArticleMap.set(cid, {
        total: 0,
        a_traiter: 0,
        en_cours: 0,
        termines: 0,
        by_statut: {},
        ids: [],
        ids_a_traiter: [],
      });
    }
    const entry = commandeArticleMap.get(cid)!;
    entry.total++;
    entry.ids.push(aid);
    entry.by_statut[s] = (entry.by_statut[s] ?? 0) + 1;
    if (statutsATraiter.has(s)) {
      entry.a_traiter++;
      entry.ids_a_traiter.push(aid);
    }
    if (statutsEnCours.has(s)) entry.en_cours++;
    if (statutsTermines.has(s)) entry.termines++;
  }

  const allCommandeIds = [...commandeArticleMap.keys()];

  // ------------------------------------------------------------------
  // ÉTAPE 3 : Recherche texte sur les clients (si q fourni)
  // ------------------------------------------------------------------
  let matchingClientIds: string[] | null = null;
  if (q) {
    const safeQ = q.replace(/%/g, "\\%").replace(/_/g, "\\_");
    const { data: matchingClients } = await supabase
      .from("clients")
      .select("id")
      .ilike("nom_complet", `%${safeQ}%`);
    matchingClientIds = (matchingClients ?? []).map((c) => c.id);
  }

  // ------------------------------------------------------------------
  // ÉTAPE 4 : Requête paginée sur commandes WHERE id IN (allCommandeIds)
  // ------------------------------------------------------------------
  let query = supabase
    .from("commandes")
    .select(
      "id, numero_commande, statut, statut_paiement, montant_total, montant_paye, date_reception, date_pret_prevue, priorite, created_at, client:clients(id, nom_complet, telephone)",
      { count: "exact" }
    )
    .in("id", allCommandeIds);

  if (statut) {
    query = query.eq("statut", statut);
  }

  if (historyCutoff) {
    query = query.gte("created_at", historyCutoff);
  }

  if (q) {
    const safeQ = q
      .replace(/%/g, "\\%")
      .replace(/_/g, "\\_")
      .replace(/,/g, "");
    if (matchingClientIds && matchingClientIds.length > 0) {
      const inList = matchingClientIds.join(",");
      query = query.or(
        `numero_commande.ilike.%${safeQ}%,client_id.in.(${inList})`
      );
    } else if (matchingClientIds && matchingClientIds.length === 0) {
      query = query.ilike("numero_commande", `%${safeQ}%`);
    }
  }

  query = query
    .order("created_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  const { data: commandes, error: cmdErr, count } = await query;

  if (cmdErr) {
    console.error("[api/personnel/taches] Erreur SELECT commandes:", cmdErr);
    return NextResponse.json(
      { success: false, error: "Erreur lors de la récupération des commandes." },
      { status: 500 }
    );
  }

  // ------------------------------------------------------------------
  // ÉTAPE 5 : Fusion des breakdowns articles dans chaque commande
  // ------------------------------------------------------------------
  const data: CommandeAvecMesArticles[] = (commandes ?? []).map((cmd) => {
    const breakdown = commandeArticleMap.get(cmd.id) ?? {
      total: 0,
      a_traiter: 0,
      en_cours: 0,
      termines: 0,
      by_statut: {},
      ids: [],
      ids_a_traiter: [],
    };
    return {
      ...(cmd as Record<string, unknown>),
      mes_articles: {
        total: breakdown.total,
        a_traiter: breakdown.a_traiter,
        en_cours: breakdown.en_cours,
        termines: breakdown.termines,
        by_statut: breakdown.by_statut,
        ids: breakdown.ids,
        ids_a_traiter: breakdown.ids_a_traiter,
      },
    } as CommandeAvecMesArticles;
  });

  const total = count ?? 0;

  return NextResponse.json({
    success: true,
    data,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
    counters: {
      total_assignees: totalAssignees,
      a_traiter: countATraiter,
      en_cours: countEnCours,
      termines: countTermines,
    },
  });
}
