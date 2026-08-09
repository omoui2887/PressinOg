/**
 * OgPressing — Helpers partagés pour le module Rapports (LOT 12)
 * ---------------------------------------------------------------
 * Centralise :
 *   - Types & libellés FR pour les périodes (aujourdhui / semaine / mois / perso)
 *   - Calcul des bornes de période (start/end ISO) selon le type
 *   - Libellés FR réutilisés pour les enums (statut commande, statut paiement,
 *     méthode paiement, type remise, type service) — alignés sur les helpers
 *     existants (commandes-helpers, remise-labels, services-helpers)
 *   - Couleurs des graphiques Recharts (oklch extraits de globals.css)
 *   - Définitions des colonnes pour les 9 exports .xlsx (clés + en-têtes FR)
 *
 * Utilisé par :
 *   - `rapports-page.tsx` + sous-composants (period-selector, charts, sections)
 *   - `rapport-export-button.tsx` (bouton générique d'export)
 *   - Les 9 routes API `/api/admin/rapports/{rapport}` (pour aligner les clés)
 *
 * ⚠️ Les colonnes définies ici DOIVENT rester synchronisées avec les clés
 *    retournées par chaque route API d'export. Toute modification d'une
 *    colonne (ajout / suppression / renommage) doit être répercutée dans
 *    la route API correspondante.
 */
import type { ExportColumn } from "@/lib/utils/export-xlsx";

/* ========================================================================== */
/*  PÉRIODES                                                                   */
/* ========================================================================== */

export type PeriodeRapport = "aujourdhui" | "semaine" | "mois" | "perso";

export interface OptionPeriode {
  value: PeriodeRapport;
  label: string;
}

/** Options du sélecteur de période (ordre d'affichage). */
export const OPTIONS_PERIODE: OptionPeriode[] = [
  { value: "aujourdhui", label: "Aujourd'hui" },
  { value: "semaine", label: "Cette semaine" },
  { value: "mois", label: "Ce mois-ci" },
  { value: "perso", label: "Période personnalisée" },
];

/** Borne de période (ISO 8601 UTC). */
export interface PeriodeConfig {
  start: string; // ex : "2026-07-24T00:00:00.000Z"
  end: string; // ex : "2026-07-24T23:59:59.999Z"
}

/**
 * Calcule les bornes [start, end] d'une période en UTC.
 *
 * - aujourdhui : du jour courant 00:00:00.000 au jour courant 23:59:59.999
 * - semaine    : du lundi de la semaine courante 00:00:00.000 au jour courant
 *                23:59:59.999 (semaine ISO, lundi = 1er jour)
 * - mois       : du 1er du mois courant 00:00:00.000 au jour courant 23:59:59.999
 * - perso      : bornes fournies par l'appelant (dates au format "YYYY-MM-DD")
 *
 * @param periode       - Type de période
 * @param customStart   - Date de début "YYYY-MM-DD" (uniquement pour perso)
 * @param customEnd     - Date de fin "YYYY-MM-DD" (uniquement pour perso)
 */
export function computePeriode(
  periode: PeriodeRapport,
  customStart?: string,
  customEnd?: string
): PeriodeConfig {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const d = now.getUTCDate();

  const todayStart = new Date(Date.UTC(y, m, d, 0, 0, 0, 0));
  const todayEnd = new Date(Date.UTC(y, m, d, 23, 59, 59, 999));

  switch (periode) {
    case "aujourdhui":
      return { start: todayStart.toISOString(), end: todayEnd.toISOString() };

    case "semaine": {
      // Jour de la semaine en UTC (0 = dimanche, 1 = lundi, ..., 6 = samedi)
      // Pour une semaine ISO (lundi = 1er jour), on calcule l'écart depuis le lundi
      const dayOfWeek = todayStart.getUTCDay();
      const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const monday = new Date(todayStart);
      monday.setUTCDate(todayStart.getUTCDate() - daysSinceMonday);
      return { start: monday.toISOString(), end: todayEnd.toISOString() };
    }

    case "mois": {
      const firstOfMonth = new Date(Date.UTC(y, m, 1, 0, 0, 0, 0));
      return { start: firstOfMonth.toISOString(), end: todayEnd.toISOString() };
    }

    case "perso": {
      const start = customStart
        ? new Date(customStart + "T00:00:00.000Z")
        : todayStart;
      const end = customEnd
        ? new Date(customEnd + "T23:59:59.999Z")
        : todayEnd;
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return { start: todayStart.toISOString(), end: todayEnd.toISOString() };
      }
      return { start: start.toISOString(), end: end.toISOString() };
    }
  }
}

/* ========================================================================== */
/*  LIBELLÉS ENUM (réutilisés des helpers existants pour cohérence)           */
/* ========================================================================== */

// --- Statut commande (7 valeurs, aligné sur commandes-helpers.ts) ---
export const STATUT_COMMANDE_LABELS: Record<string, string> = {
  recu: "Reçu",
  en_traitement: "En traitement",
  lave: "Lavé",
  repasse: "Repassé",
  pret: "Prêt",
  retire: "Retiré",
  livre: "Livré",
  en_livraison: "En livraison",
};

// --- Statut paiement (3 valeurs) ---
export const STATUT_PAIEMENT_LABELS: Record<string, string> = {
  non_paye: "Non payé",
  partiel: "Partiel",
  paye: "Payé",
};

// --- Méthode de paiement (3 valeurs, aligné sur remise-labels.ts) ---
export const METHODE_PAIEMENT_LABELS: Record<string, string> = {
  especes: "Espèces",
  mobile_money: "Mobile Money",
  carte_bancaire: "Carte bancaire",
};

// --- Type de remise (5 valeurs, aligné sur remise-labels.ts) ---
export const REMISE_TYPE_LABELS: Record<string, string> = {
  aucune: "Aucune",
  pourcentage: "Pourcentage",
  montant_fixe: "Montant fixe",
  article_gratuit: "Article gratuit",
  fidelite: "Remise fidélité",
};

// --- Type de service (6 valeurs, aligné sur services-helpers.tsx) ---
export const TYPE_SERVICE_LABELS: Record<string, string> = {
  lavage: "Lavage",
  repassage: "Repassage",
  laver_repasser: "Laver-Repasser",
  nettoyage_sec: "Nettoyage à sec",
  detachage: "Détachage",
  blanchisserie: "Blanchisserie",
};

/** Liste ordonnée des types de service (pour les graphiques). */
export const TYPES_SERVICE_ORDONNES = [
  "lavage",
  "repassage",
  "laver_repasser",
  "nettoyage_sec",
  "detachage",
  "blanchisserie",
] as const;

/* ========================================================================== */
/*  COULEURS DES GRAPHIQUES (extraits de globals.css)                         */
/* ========================================================================== */

/**
 * Couleurs oklch utilisées par Recharts. Les valeurs proviennent de
 * `globals.css` (variables --chart-1 à --chart-5 + --primary, --secondary,
 * --warning, --danger).
 *
 * Recharts n'accepte pas les variables CSS — il faut des couleurs concrètes.
 */
export const CHART_COLORS = {
  primary: "oklch(0.546 0.215 262.88)", // bleu
  secondary: "oklch(0.696 0.17 162.48)", // vert
  warning: "oklch(0.769 0.188 70.08)", // ambre
  danger: "oklch(0.637 0.237 25.18)", // rouge
  chart3: "oklch(0.769 0.188 70.08)", // ambre (identique warning)
  chart4: "oklch(0.637 0.237 25.18)", // rouge (identique danger)
  chart5: "oklch(0.627 0.265 303.9)", // violet
  muted: "oklch(0.922 0 0)", // gris clair (grid)
  textMuted: "oklch(0.556 0 0)", // gris texte axes
} as const;

/** Couleurs pour le pie chart "CA par mode de paiement". */
export const COULEURS_MODE_PAIEMENT: Record<string, string> = {
  especes: CHART_COLORS.secondary, // vert — le plus fréquent
  mobile_money: CHART_COLORS.primary, // bleu
  carte_bancaire: CHART_COLORS.warning, // ambre
};

/** Couleurs pour le bar chart "CA par type de service". */
export const COULEURS_TYPE_SERVICE: Record<string, string> = {
  lavage: CHART_COLORS.primary, // bleu
  repassage: CHART_COLORS.secondary, // vert
  laver_repasser: CHART_COLORS.chart4, // rouge (laver-repasser)
  nettoyage_sec: CHART_COLORS.chart3, // ambre
  detachage: CHART_COLORS.warning, // ambre (identique chart3 — distingué par libellé)
  blanchisserie: CHART_COLORS.chart5, // violet
};

/* ========================================================================== */
/*  TYPES DE DONNÉES — RÉPONSE API /admin/rapports                            */
/* ========================================================================== */

/** Statistiques agrégées pour la période (4 StatCards). */
export interface StatsPeriode {
  ca_total: number;
  nombre_commandes: number;
  panier_moyen: number;
  total_remises: number;
}

/** Point du graphique "CA par jour". */
export interface PointCaParJour {
  date: string; // "JJ/MM" (libellé axe X)
  ca: number; // CA du jour en FCFA
}

/** Point du graphique "CA par mode de paiement". */
export interface PointCaParMode {
  mode: string; // libellé FR ("Espèces", "Mobile Money", "Carte bancaire")
  montant: number; // somme en FCFA
  couleur: string; // couleur oklch pour le pie chart
}

/** Point du graphique "CA par type de service". */
export interface PointCaParTypeService {
  type: string; // libellé FR ("Lavage", "Repassage", ...)
  montant: number; // somme en FCFA
  couleur: string; // couleur oklch pour le bar chart
}

/** Ligne de la section "Clients avec impayés". */
export interface ClientImpaye {
  id: string;
  nom_complet: string;
  telephone: string;
  solde_impaye: number;
  nombre_commandes_impayees: number;
}

/** Ligne de la section "Remises appliquées". */
export interface RemiseAppliquee {
  id: string;
  numero_commande: string;
  client_nom: string;
  remise_type: string; // valeur enum brute
  remise_type_label: string; // libellé FR
  montant_remise: number;
  date: string; // ISO
}

/** Réponse complète de GET /api/admin/rapports. */
export interface RapportsDataResponse {
  success: boolean;
  periode: PeriodeRapport;
  start: string;
  end: string;
  stats: StatsPeriode;
  ca_par_jour: PointCaParJour[];
  ca_par_mode: PointCaParMode[];
  ca_par_type_service: PointCaParTypeService[];
  clients_impayes: ClientImpaye[];
  remises_appliquees: RemiseAppliquee[];
  error?: string;
}

/* ========================================================================== */
/*  DÉFINITIONS DES COLONNES POUR LES 9 EXPORTS .xlsx                         */
/* ========================================================================== */
/*
 * Chaque tableau défini ci-dessous correspond à un rapport. Les `key`
 * correspondent aux clés renvoyées par la route API associée. Les `header`
 * sont les en-têtes de colonnes affichés dans le fichier Excel.
 *
 * Les montants sont des nombres entiers (sans suffixe FCFA) pour permettre
 * les calculs Excel. Les dates sont au format "JJ/MM/AAAA".
 */

// 1. Rapport Journalier
export const COLONNES_JOURNALIER: ExportColumn[] = [
  { key: "numero_ticket", header: "Numéro ticket" },
  { key: "client", header: "Client" },
  { key: "articles", header: "Articles" },
  { key: "montant_total", header: "Montant total" },
  { key: "statut_paiement", header: "Statut paiement" },
  { key: "mode_paiement", header: "Mode de paiement" },
  { key: "heure", header: "Heure" },
];

// 2. Rapport Hebdomadaire (mêmes colonnes que journalier + Date)
export const COLONNES_HEBDOMADAIRE: ExportColumn[] = [
  { key: "numero_ticket", header: "Numéro ticket" },
  { key: "client", header: "Client" },
  { key: "articles", header: "Articles" },
  { key: "montant_total", header: "Montant total" },
  { key: "statut_paiement", header: "Statut paiement" },
  { key: "mode_paiement", header: "Mode de paiement" },
  { key: "date", header: "Date" },
  { key: "heure", header: "Heure" },
];

// 3. Rapport Mensuel (CA par jour + répartition par service)
export const COLONNES_MENSUEL: ExportColumn[] = [
  { key: "date", header: "Date" },
  { key: "nombre_commandes", header: "Nombre de commandes" },
  { key: "ca_jour", header: "CA du jour" },
  { key: "repartition_service", header: "Répartition par service" },
];

// 4. Rapport Commandes (liste complète)
export const COLONNES_COMMANDES: ExportColumn[] = [
  { key: "numero_ticket", header: "Numéro ticket" },
  { key: "client", header: "Client" },
  { key: "date_creation", header: "Date création" },
  { key: "date_retrait_prevue", header: "Date retrait prévue" },
  { key: "statut", header: "Statut" },
  { key: "statut_paiement", header: "Statut paiement" },
  { key: "montant_total", header: "Montant total" },
  { key: "remise_appliquee", header: "Remise appliquée" },
];

// 5. Rapport Clients (liste complète CRM)
export const COLONNES_CLIENTS: ExportColumn[] = [
  { key: "nom", header: "Nom" },
  { key: "telephone", header: "Téléphone" },
  { key: "email", header: "Email" },
  { key: "points_fidelite", header: "Points fidélité" },
  { key: "solde_impaye", header: "Solde impayé" },
  { key: "total_depense", header: "Total dépensé" },
  { key: "nombre_commandes", header: "Nombre de commandes" },
  { key: "preferences_lavage", header: "Préférences de lavage résumées" },
];

// 6. Rapport Paiements (historique complet)
export const COLONNES_PAIEMENTS: ExportColumn[] = [
  { key: "date", header: "Date" },
  { key: "commande_numero", header: "Commande liée" },
  { key: "client", header: "Client" },
  { key: "montant", header: "Montant" },
  { key: "methode", header: "Méthode" },
  { key: "est_acompte", header: "Est un acompte" },
  { key: "reference", header: "Référence" },
  { key: "caissier", header: "Caissier" },
];

// 7. Rapport Impayés (clients avec solde_impaye > 0)
export const COLONNES_IMPAYES: ExportColumn[] = [
  { key: "nom", header: "Nom" },
  { key: "telephone", header: "Téléphone" },
  { key: "solde_impaye", header: "Solde impayé" },
  { key: "nombre_commandes_impayees", header: "Nombre de commandes non soldées" },
  {
    key: "date_plus_ancienne_impayee",
    header: "Date de la commande la plus ancienne impayée",
  },
];

// 8. Rapport Remises (commandes ayant bénéficié d'une remise)
export const COLONNES_REMISES: ExportColumn[] = [
  { key: "numero_ticket", header: "Numéro ticket" },
  { key: "client", header: "Client" },
  { key: "date", header: "Date" },
  { key: "remise_type", header: "Type de remise" },
  { key: "remise_valeur", header: "Valeur de la remise" },
  { key: "montant_remise", header: "Montant de la remise en FCFA" },
  { key: "montant_total_avant_apres", header: "Montant total avant/après remise" },
];

// 9. Rapport Personnel (LOT 12.3 — liste des employés)
export const COLONNES_PERSONNEL: ExportColumn[] = [
  { key: "nom", header: "Nom" },
  { key: "prenom", header: "Prénom" },
  { key: "role", header: "Rôle" },
  { key: "telephone", header: "Téléphone" },
  { key: "email", header: "Email" },
  { key: "statut_compte", header: "Statut du compte" },
  { key: "methode_creation", header: "Méthode de création" },
  { key: "date_creation", header: "Date de création du compte" },
];

// 10. Rapport Stock — Mouvements entrées/sorties (PRD §14 + §15)
export const COLONNES_STOCK: ExportColumn[] = [
  { key: "date", header: "Date" },
  { key: "produit_nom", header: "Produit" },
  { key: "type_mouvement", header: "Type de mouvement" },
  { key: "quantite", header: "Quantité" },
  { key: "motif", header: "Motif" },
  { key: "utilisateur_nom", header: "Enregistré par" },
];

/* ========================================================================== */
/*  CONFIGURATION DES RAPPORTS (mapping type → colonnes + nom de fichier)      */
/* ========================================================================== */

export type TypeRapport =
  | "journalier"
  | "hebdomadaire"
  | "mensuel"
  | "commandes"
  | "clients"
  | "paiements"
  | "impayes"
  | "remises"
  | "personnel"
  | "stock";

export interface ConfigRapport {
  type: TypeRapport;
  label: string; // libellé du bouton
  fileName: string; // nom de base du fichier .xlsx
  columns: ExportColumn[];
  /** Le rapport accepte un paramètre de période (start/end ISO). */
  withPeriode?: boolean;
  /** Le rapport accepte un paramètre de date unique (YYYY-MM-DD). */
  withDate?: boolean;
  /** Le rapport accepte un paramètre de mois (YYYY-MM). */
  withMois?: boolean;
}

/**
 * Configuration centralisée des 9 rapports. Utilisée par le composant
 * `<RapportExportButton>` pour connaître les colonnes et le nom de fichier
 * à utiliser pour chaque type de rapport.
 */
export const CONFIG_RAPPORTS: Record<TypeRapport, ConfigRapport> = {
  journalier: {
    type: "journalier",
    label: "Rapport journalier",
    fileName: "rapport_journalier",
    columns: COLONNES_JOURNALIER,
    withDate: true,
  },
  hebdomadaire: {
    type: "hebdomadaire",
    label: "Rapport hebdomadaire",
    fileName: "rapport_hebdomadaire",
    columns: COLONNES_HEBDOMADAIRE,
    withDate: true,
  },
  mensuel: {
    type: "mensuel",
    label: "Rapport mensuel",
    fileName: "rapport_mensuel",
    columns: COLONNES_MENSUEL,
    withMois: true,
  },
  commandes: {
    type: "commandes",
    label: "Rapport des commandes",
    fileName: "rapport_commandes",
    columns: COLONNES_COMMANDES,
  },
  clients: {
    type: "clients",
    label: "Rapport des clients",
    fileName: "rapport_clients",
    columns: COLONNES_CLIENTS,
  },
  paiements: {
    type: "paiements",
    label: "Rapport des paiements",
    fileName: "rapport_paiements",
    columns: COLONNES_PAIEMENTS,
  },
  impayes: {
    type: "impayes",
    label: "Rapport des impayés",
    fileName: "rapport_impayes",
    columns: COLONNES_IMPAYES,
  },
  remises: {
    type: "remises",
    label: "Rapport des remises",
    fileName: "rapport_remises",
    columns: COLONNES_REMISES,
  },
  personnel: {
    type: "personnel",
    label: "Rapport du personnel",
    fileName: "rapport_personnel",
    columns: COLONNES_PERSONNEL,
  },
  stock: {
    type: "stock",
    label: "Stock — Mouvements",
    fileName: "rapport_stock_mouvements",
    columns: COLONNES_STOCK,
    withPeriode: true,
  },
};
