/**
 * OgPressing — API /api/admin/rapports (GET) — LOT 12.1
 * -------------------------------------------------------
 * Renvoie l'ensemble des données agrégées pour la page /admin/rapports :
 *
 *   - 4 StatCards : CA total, Nombre de commandes, Panier moyen, Total remises
 *   - Graphique CA par jour (1 point par jour de la période)
 *   - Graphique CA par mode de paiement (espèces / mobile money / carte)
 *   - Graphique CA par type de service (5 types)
 *   - Liste clients avec impayés (solde_impaye > 0, top 20)
 *   - Liste remises appliquées sur la période
 *
 * Query params :
 *   - periode : aujourdhui | semaine | mois | perso (défaut : aujourdhui)
 *   - start   : YYYY-MM-DD (uniquement pour perso)
 *   - end     : YYYY-MM-DD (uniquement pour perso)
 *
 * 🔒 SÉCURITÉ :
 *   - getSupabaseServer() (client anon + JWT) → RLS `isolation_pressing`
 *     filtre automatiquement par pressing_id sur toutes les tables lues
 *     (commandes, clients, paiements, commande_lignes, services, personnel).
 *   - Auth : n'importe quel personnel actif du pressing (manager, comptable,
 *     réceptionniste, etc.) — même pattern que GET /api/admin/commandes.
 *   - 401 si non authentifié, 403 si personnel inactif/non trouvé.
 *
 * ⚠️ Aucune écriture — GET uniquement. Aucune donnée bancaire traitée
 *    (les paiements sont enregistrés de façon déclarative, voir
 *    PROJECT_CONTEXT.md §3).
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  computePeriode,
  COULEURS_MODE_PAIEMENT,
  COULEURS_TYPE_SERVICE,
  METHODE_PAIEMENT_LABELS,
  REMISE_TYPE_LABELS,
  TYPES_SERVICE_ORDONNES,
  TYPE_SERVICE_LABELS,
  type PeriodeRapport,
  type PointCaParJour,
  type PointCaParMode,
  type PointCaParTypeService,
  type RapportsDataResponse,
  type RemiseAppliquee,
  type ClientImpaye,
} from "@/components/ogpressing/admin/rapports/rapports-helpers";

export const dynamic = "force-dynamic";

/* -------------------------------------------------------------------------- */
/*  TYPES LOCAUX (réponse brute Supabase)                                      */
/* -------------------------------------------------------------------------- */

interface CommandeRow {
  id: string;
  numero_commande: string;
  montant_total: number | null;
  montant_paye: number | null;
  montant_remise: number | null;
  remise_type: string | null;
  statut_paiement: string | null;
  created_at: string;
  client_id: string | null;
}

interface ClientRow {
  id: string;
  nom_complet: string;
  telephone: string | null;
}

interface CommandeForImpayeRow {
  client_id: string;
  montant_total: number | null;
  montant_paye: number | null;
  statut_paiement: string | null;
}

interface PaiementRow {
  montant: number | null;
  methode: string | null;
}

interface LigneRow {
  montant_ligne: number | null;
  service: { type: string | null } | null;
}

interface CommandeAvecClientRow {
  id: string;
  numero_commande: string;
  montant_remise: number | null;
  remise_type: string | null;
  created_at: string;
  client: { nom_complet: string | null } | null;
}

/* -------------------------------------------------------------------------- */
/*  HELPERS                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Construit le tableau `ca_par_jour` : un point par jour UTC dans la période,
 * avec le CA total (somme des montant_total des commandes créées ce jour).
 * Cap à 120 jours pour éviter des graphiques illisibles sur les périodes
 * personnalisées très longues.
 */
function buildCaParJour(
  commandes: CommandeRow[],
  startISO: string,
  endISO: string
): PointCaParJour[] {
  // Indexe le CA par jour (clé "YYYY-MM-DD" en UTC)
  const caByDay = new Map<string, number>();
  for (const cmd of commandes) {
    const d = new Date(cmd.created_at);
    if (Number.isNaN(d.getTime())) continue;
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    const key = `${y}-${m}-${day}`;
    caByDay.set(key, (caByDay.get(key) || 0) + (cmd.montant_total || 0));
  }

  const startDate = new Date(startISO);
  const endDate = new Date(endISO);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return [];
  }

  const cursor = new Date(
    Date.UTC(
      startDate.getUTCFullYear(),
      startDate.getUTCMonth(),
      startDate.getUTCDate()
    )
  );
  const lastDay = new Date(
    Date.UTC(
      endDate.getUTCFullYear(),
      endDate.getUTCMonth(),
      endDate.getUTCDate()
    )
  );

  const points: PointCaParJour[] = [];
  let safety = 0;
  while (cursor.getTime() <= lastDay.getTime() && safety < 120) {
    const y = cursor.getUTCFullYear();
    const m = String(cursor.getUTCMonth() + 1).padStart(2, "0");
    const day = String(cursor.getUTCDate()).padStart(2, "0");
    const key = `${y}-${m}-${day}`;
    points.push({
      date: `${day}/${m}`,
      ca: caByDay.get(key) || 0,
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    safety += 1;
  }
  return points;
}

/**
 * Construit le tableau `ca_par_mode` : agrège les paiements par méthode,
 * mappe vers les libellés FR + couleurs oklch. Ne conserve que les modes
 * avec montant > 0.
 */
function buildCaParMode(paiements: PaiementRow[]): PointCaParMode[] {
  const sums = new Map<string, number>();
  for (const p of paiements) {
    if (!p.methode) continue;
    sums.set(p.methode, (sums.get(p.methode) || 0) + (p.montant || 0));
  }

  // Préserve l'ordre sémantique : espèces, mobile_money, carte_bancaire
  const ordre = ["especes", "mobile_money", "carte_bancaire"];
  const modesPresents = ordre.filter((m) => sums.has(m));
  // Ajoute aussi d'éventuels modes inattendus (robustesse)
  for (const m of sums.keys()) {
    if (!ordre.includes(m)) modesPresents.push(m);
  }

  return modesPresents
    .map((m) => ({
      mode: METHODE_PAIEMENT_LABELS[m] || m,
      montant: sums.get(m) || 0,
      couleur: COULEURS_MODE_PAIEMENT[m] || "oklch(0.627 0.265 303.9)",
    }))
    .filter((p) => p.montant > 0);
}

/**
 * Construit le tableau `ca_par_type_service` : agrège les montants_ligne
 * par service.type, mappe vers les libellés FR + couleurs. Ne conserve que
 * les types avec montant > 0. Préserve l'ordre TYPES_SERVICE_ORDONNES.
 */
function buildCaParTypeService(lignes: LigneRow[]): PointCaParTypeService[] {
  const sums = new Map<string, number>();
  for (const l of lignes) {
    const type = l.service?.type;
    if (!type) continue;
    sums.set(type, (sums.get(type) || 0) + (l.montant_ligne || 0));
  }

  // Préserve l'ordre canonique, puis ajoute d'éventuels types inattendus
  const typesPresents = [...TYPES_SERVICE_ORDONNES].filter((t) => sums.has(t));
  for (const t of sums.keys()) {
    if (!(TYPES_SERVICE_ORDONNES as readonly string[]).includes(t)) {
      typesPresents.push(t);
    }
  }

  return typesPresents
    .map((t) => ({
      type: TYPE_SERVICE_LABELS[t] || t,
      montant: sums.get(t) || 0,
      couleur: COULEURS_TYPE_SERVICE[t] || "oklch(0.546 0.215 262.88)",
    }))
    .filter((p) => p.montant > 0);
}

/* -------------------------------------------------------------------------- */
/*  GET — RAPPORTS                                                             */
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

  // Vérifie que l'appelant est un personnel actif du pressing
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

  // Paramètres de requête
  const sp = request.nextUrl.searchParams;
  const periodeParam = (sp.get("periode") || "aujourdhui") as PeriodeRapport;
  const periode: PeriodeRapport = [
    "aujourdhui",
    "semaine",
    "mois",
    "perso",
  ].includes(periodeParam)
    ? periodeParam
    : "aujourdhui";

  const customStart = sp.get("start") || "";
  const customEnd = sp.get("end") || "";

  const { start, end } = computePeriode(periode, customStart, customEnd);

  /* -------- 1. Commandes de la période (filtre created_at) -------- */
  const { data: commandes, error: cmdErr } = await supabase
    .from("commandes")
    .select(
      "id, numero_commande, montant_total, montant_paye, montant_remise, remise_type, statut_paiement, created_at, client_id"
    )
    .gte("created_at", start)
    .lte("created_at", end);

  if (cmdErr) {
    console.error("[api/admin/rapports] Erreur SELECT commandes:", cmdErr);
    return NextResponse.json(
      { success: false, error: "Erreur lors de la récupération des commandes" },
      { status: 500 }
    );
  }

  const commandesList: CommandeRow[] = (commandes || []) as CommandeRow[];

  /* -------- 2. Stats agrégées (4 StatCards) -------- */
  const ca_total = commandesList.reduce(
    (sum, c) => sum + (c.montant_total || 0),
    0
  );
  const nombre_commandes = commandesList.length;
  const panier_moyen = nombre_commandes > 0 ? Math.round(ca_total / nombre_commandes) : 0;
  const total_remises = commandesList
    .filter((c) => c.remise_type && c.remise_type !== "aucune")
    .reduce((sum, c) => sum + (c.montant_remise || 0), 0);

  /* -------- 3. CA par jour (1 point par jour UTC dans la période) -------- */
  const ca_par_jour = buildCaParJour(commandesList, start, end);

  /* -------- 4. CA par mode de paiement -------- */
  // Filtre sur date_paiement (préféré), fallback défensif sur created_at
  let paiementsResult = await supabase
    .from("paiements")
    .select("montant, methode")
    .gte("date_paiement", start)
    .lte("date_paiement", end);

  if (paiementsResult.error) {
    // Fallback : filtre sur created_at (si date_paiement n'existe pas en DB
    // ou si la colonne ne supporte pas le filtre range pour une raison
    // quelconque — robustesse face à un schéma évolutif)
    paiementsResult = await supabase
      .from("paiements")
      .select("montant, methode")
      .gte("created_at", start)
      .lte("created_at", end);
  }

  const paiementsList: PaiementRow[] = (paiementsResult.data ||
    []) as PaiementRow[];
  const ca_par_mode = buildCaParMode(paiementsList);

  /* -------- 5. CA par type de service -------- */
  // Récupère les lignes des commandes de la période, avec le type du service
  // lié. La RLS filtre via commande → pressing automatiquement.
  let ca_par_type_service: PointCaParTypeService[] = [];
  if (commandesList.length > 0) {
    const commandeIds = commandesList.map((c) => c.id);
    const { data: lignes, error: lignesErr } = await supabase
      .from("commande_lignes")
      .select("montant_ligne, service:services(type)")
      .in("commande_id", commandeIds);

    if (lignesErr) {
      console.error(
        "[api/admin/rapports] Erreur SELECT commande_lignes:",
        lignesErr
      );
      // Non bloquant : on renvoie un tableau vide
    } else {
      ca_par_type_service = buildCaParTypeService(
        (lignes || []) as LigneRow[]
      );
    }
  }

  /* -------- 6. Clients avec impayés (vue globale, non filtrée par période) -------- */
  // Récupère tous les clients du pressing (RLS filtre par pressing_id)
  const { data: clientsData, error: clientsErr } = await supabase
    .from("clients")
    .select("id, nom_complet, telephone");

  let clients_impayes: ClientImpaye[] = [];
  if (clientsErr) {
    console.error("[api/admin/rapports] Erreur SELECT clients:", clientsErr);
    // Non bloquant : on renvoie un tableau vide
  } else if (clientsData && clientsData.length > 0) {
    const clientIds = (clientsData as ClientRow[]).map((c) => c.id);

    // Récupère les commandes impayées (non_paye ou partiel) de ces clients
    const { data: cmdImpayees, error: cmdImpayeesErr } = await supabase
      .from("commandes")
      .select(
        "client_id, montant_total, montant_paye, statut_paiement"
      )
      .in("client_id", clientIds)
      .in("statut_paiement", ["non_paye", "partiel"]);

    if (cmdImpayeesErr) {
      console.error(
        "[api/admin/rapports] Erreur SELECT commandes impayées:",
        cmdImpayeesErr
      );
    } else {
      // Agrège par client : solde_impaye + nombre de commandes impayées
      const impayesByClient = new Map<
        string,
        { solde: number; count: number }
      >();
      for (const cmd of (cmdImpayees || []) as CommandeForImpayeRow[]) {
        const solde = Math.max(
          (cmd.montant_total || 0) - (cmd.montant_paye || 0),
          0
        );
        if (solde <= 0) continue;
        const prev = impayesByClient.get(cmd.client_id) || {
          solde: 0,
          count: 0,
        };
        prev.solde += solde;
        prev.count += 1;
        impayesByClient.set(cmd.client_id, prev);
      }

      clients_impayes = (clientsData as ClientRow[])
        .filter((c) => impayesByClient.has(c.id))
        .map((c) => {
          const agg = impayesByClient.get(c.id)!;
          return {
            id: c.id,
            nom_complet: c.nom_complet,
            telephone: c.telephone || "—",
            solde_impaye: agg.solde,
            nombre_commandes_impayees: agg.count,
          };
        })
        .sort((a, b) => b.solde_impaye - a.solde_impaye)
        .slice(0, 20); // Top 20 pour l'affichage
    }
  }

  /* -------- 7. Remises appliquées sur la période -------- */
  let remises_appliquees: RemiseAppliquee[] = [];
  const commandesAvecRemise = commandesList.filter(
    (c) => c.remise_type && c.remise_type !== "aucune"
  );

  if (commandesAvecRemise.length > 0) {
    // On a déjà les champs nécessaires dans commandesList, sauf le nom du
    // client. On fetch les clients associés (via la relation Supabase).
    const cmdIdsAvecRemise = commandesAvecRemise.map((c) => c.id);
    const { data: cmdAvecClient, error: cmdClientErr } = await supabase
      .from("commandes")
      .select(
        "id, numero_commande, montant_remise, remise_type, created_at, client:clients(nom_complet)"
      )
      .in("id", cmdIdsAvecRemise)
      .order("created_at", { ascending: false });

    if (cmdClientErr) {
      console.error(
        "[api/admin/rapports] Erreur SELECT commandes (remises):",
        cmdClientErr
      );
    } else {
      remises_appliquees = ((cmdAvecClient || []) as CommandeAvecClientRow[]).map(
        (c) => ({
          id: c.id,
          numero_commande: c.numero_commande,
          client_nom: c.client?.nom_complet || "Client inconnu",
          remise_type: c.remise_type || "aucune",
          remise_type_label:
            REMISE_TYPE_LABELS[c.remise_type || "aucune"] ||
            c.remise_type ||
            "—",
          montant_remise: c.montant_remise || 0,
          date: c.created_at,
        })
      );
    }
  }

  /* -------- 8. Réponse finale -------- */
  const response: RapportsDataResponse = {
    success: true,
    periode,
    start,
    end,
    stats: {
      ca_total,
      nombre_commandes,
      panier_moyen,
      total_remises,
    },
    ca_par_jour,
    ca_par_mode,
    ca_par_type_service,
    clients_impayes,
    remises_appliquees,
  };

  return NextResponse.json(response);
}
