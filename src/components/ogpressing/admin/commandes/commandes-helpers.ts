/**
 * e-pressing — Helpers d'affichage pour la liste / détail des commandes (LOT 7.6)
 * -----------------------------------------------------------------------------
 * Centralise :
 *   - Les types TypeScript pour les réponses API `/api/admin/commandes`
 *   - Les libellés FR pour les enums `StatutCommande` et `StatutPaiement`
 *   - Les mappings statut → variante `StatusBadge` (couleur sémantique)
 *
 * Utilisé par :
 *   - `commandes-page.tsx` (orchestrateur liste)
 *   - `commandes-list.tsx` (table desktop + cards mobile)
 *   - `commandes-filters.tsx` (options des Select)
 *   - `commande-detail.tsx` (page détail)
 *
 * ⚠️ Les valeurs de `StatutCommande` proviennent de l'enum SQL du PRD §18.5
 *    (cf. `lib/types/database.types.ts`). On n'inclut PAS `en_livraison` car
 *    le workflow de livraison n'est pas géré dans ce lot — la liste reste
 *    alignée sur l'enum `StatutArticle` (7 valeurs) qui est l'unité de
 *    suivi réelle en atelier.
 */
import type { StatusVariant } from "@/components/shared/status-badge";

// ============================================================
// Types — shapes des réponses API
// ============================================================

/** Client imbriqué dans la réponse liste (GET /api/admin/commandes). */
export interface CommandeListClient {
  id: string;
  nom_complet: string;
  telephone: string;
}

/** Ligne renvoyée par GET /api/admin/commandes (liste paginée). */
export interface CommandeListItem {
  id: string;
  numero_commande: string;
  statut: string;
  statut_paiement: string;
  montant_total: number;
  montant_paye: number;
  date_reception: string | null;
  date_pret_prevue: string | null;
  /** Date à laquelle la commande a été livrée (statut "livre"). */
  date_livraison: string | null;
  /** Indique si la commande est à livrer chez le client (true) ou à retirer sur place (false). */
  livraison: boolean | null;
  /** Adresse de livraison saisie à la commande (si livraison=true). */
  adresse_livraison: string | null;
  /** Frais de livraison facturés au client (FCFA). */
  frais_livraison: number | null;
  created_at: string;
  client: CommandeListClient | null;
}

/** Shape de la réponse JSON de GET /api/admin/commandes. */
export interface CommandesApiResponse {
  success: boolean;
  data: CommandeListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  error?: string;
}

// ============================================================
// Libellés FR — Statut commande (aligné sur StatutArticle)
// ============================================================

/**
 * Mapping statut → libellé FR. 7 valeurs de l'enum `StatutArticle` :
 *   recu, en_traitement, lave, repasse, pret, retire, livre
 *
 * On accepte aussi les autres valeurs de `StatutCommande` (en_livraison)
 * par défensif, avec un fallback sur la valeur brute.
 */
export const STATUT_LABELS: Record<string, string> = {
  recu: "Reçu",
  en_traitement: "En traitement",
  lave: "Lavé",
  repasse: "Repassé",
  pret: "Prêt",
  retire: "Retiré",
  livre: "Livré",
  en_livraison: "En livraison",
};

/**
 * Variante `StatusBadge` pour chaque statut commande.
 *
 * Mapping couleur (PRD §7.1) :
 *   - recu            → info (bleu)     → nouvellement reçu
 *   - en_traitement   → warning (jaune) → en cours
 *   - lave            → info (bleu)     → étape intermédiaire
 *   - repasse         → info (bleu)     → étape intermédiaire
 *   - pret            → success (vert)  → prêt à être retiré
 *   - retire          → neutral (gris)  → terminé
 *   - livre           → neutral (gris)  → terminé
 *   - en_livraison    → info (bleu)     → en cours
 */
export function statutVariant(statut: string): StatusVariant {
  switch (statut) {
    case "pret":
      return "success";
    case "en_traitement":
      return "warning";
    case "recu":
    case "lave":
    case "repasse":
    case "en_livraison":
      return "info";
    case "retire":
    case "livre":
      return "neutral";
    default:
      return "neutral";
  }
}

// ============================================================
// Libellés FR — Statut paiement
// ============================================================

export const STATUT_PAIEMENT_LABELS: Record<string, string> = {
  non_paye: "Non payé",
  partiel: "Partiel",
  paye: "Payé",
};

/** Variante `StatusBadge` pour le statut paiement. */
export function statutPaiementVariant(
  statutPaiement: string
): StatusVariant {
  switch (statutPaiement) {
    case "paye":
      return "success";
    case "partiel":
      return "warning";
    case "non_paye":
      return "danger";
    default:
      return "neutral";
  }
}

// ============================================================
// Options pour les <Select> des filtres
// ============================================================

/** Options statut commande pour le filtre (Tous + 7 statuts). */
export const STATUT_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Tous les statuts" },
  { value: "recu", label: "Reçu" },
  { value: "en_traitement", label: "En traitement" },
  { value: "lave", label: "Lavé" },
  { value: "repasse", label: "Repassé" },
  { value: "pret", label: "Prêt" },
  { value: "retire", label: "Retiré" },
  { value: "livre", label: "Livré" },
];

/** Options statut paiement pour le filtre (Tous + 3). */
export const STATUT_PAIEMENT_FILTER_OPTIONS: {
  value: string;
  label: string;
}[] = [
  { value: "", label: "Tous les paiements" },
  { value: "non_paye", label: "Non payé" },
  { value: "partiel", label: "Partiel" },
  { value: "paye", label: "Payé" },
];
