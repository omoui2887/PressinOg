/**
 * OgPressing — Helpers pour la fiche client détaillée (LOT 8.2)
 * -------------------------------------------------------------
 * Centralise :
 *   - Les types TypeScript pour le client, ses commandes et ses paiements
 *     (passés en props du Server Component au Client Component).
 *   - Les libellés FR pour les enums `StatutCommande`, `StatutPaiement`
 *     et `MethodePaiement`.
 *   - Les mappings statut → variante `StatusBadge` (couleur sémantique).
 *
 * Utilisé par :
 *   - `src/app/(admin)/admin/clients/[id]/page.tsx` (Server Component —
 *     construit les objets typés passés en props).
 *   - `src/components/ogpressing/admin/clients/client-detail-page.tsx`
 *     (Client Component orchestrator — rend les badges, tableaux, cards).
 *
 * ⚠️ On duplique volontairement les libellés de `commandes-helpers.ts` du
 *    LOT 7.6 plutôt que de l'importer : la fiche client est un module
 *    autonome du LOT 8 et ces tables de libellés sont stables. La
 *    duplication évite un couplage transversal entre lots différents.
 */
import type { StatusVariant } from "@/components/shared/status-badge";
import type { PreferencesLavage } from "@/components/ogpressing/admin/commande-wizard/state";

// ============================================================
// Types — shapes des données passées en props
// ============================================================

/**
 * Détail client tel que fetché par le Server Component et passé en props au
 * Client Component `ClientDetailPage`. Toutes les colonnes sont incluses
 * (GET /api/admin/clients/[id] renvoie la même shape).
 */
export interface ClientDetail {
  id: string;
  pressing_id: string;
  nom_complet: string;
  telephone: string;
  email: string | null;
  adresse: string | null;
  points_fidelite: number;
  notes: string | null;
  preferences_lavage: PreferencesLavage | null;
  created_at: string;
  updated_at: string | null;
}

/**
 * Ligne de commande (historique du client). Subset des colonnes de la table
 * `commandes` (sans les nested relations — on n'a pas besoin du client
 * imbriqué puisqu'on est déjà sur sa fiche).
 */
export interface CommandeListItem {
  id: string;
  numero_commande: string;
  statut: string;
  statut_paiement: string;
  montant_total: number;
  montant_paye: number;
  date_reception: string | null;
  date_pret_prevue: string | null;
  date_livraison: string | null;
  date_retrait: string | null;
  created_at: string;
}

/**
 * Paiement d'une commande du client. Récupéré via une 2e requête Supabase
 * (SELECT paiements WHERE commande_id IN (...)). Toutes les colonnes
 * pertinentes pour l'affichage sont incluses.
 */
export interface Paiement {
  id: string;
  commande_id: string;
  montant: number;
  methode: string;
  reference: string | null;
  date_paiement: string;
  est_acompte: boolean | null;
  notes: string | null;
  created_at: string;
}

// ============================================================
// Libellés FR — Statut commande
// ============================================================

/**
 * Mapping statut commande → libellé FR (7 valeurs de l'enum StatutArticle
 * + 1 valeur défensive en_livraison). Aligné sur `commandes-helpers.ts`.
 */
export const STATUT_CMD_LABELS: Record<string, string> = {
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
 *   - pret            → success (vert) → prêt à être retiré
 *   - en_traitement   → warning (jaune) → en cours
 *   - recu / lave / repasse / en_livraison → info (bleu)
 *   - retire / livre  → neutral (gris) → terminé
 */
export function statutCmdVariant(statut: string): StatusVariant {
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
export function statutPaiementVariant(statutPaiement: string): StatusVariant {
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
// Libellés FR — Méthode de paiement
// ============================================================

/**
 * Mapping méthode paiement → libellé FR. 3 valeurs de l'enum
 * `MethodePaiement` : especes, mobile_money, carte_bancaire.
 */
export const METHODE_PAIEMENT_LABELS: Record<string, string> = {
  especes: "Espèces",
  mobile_money: "Mobile Money",
  carte_bancaire: "Carte bancaire",
};

// ============================================================
// Helpers de calcul (agrégations statistiques)
// ============================================================

/**
 * Calcule le total dépensé par le client (somme des `montant_total` des
 * commandes, hors commandes annulées — mais notre schéma n'a pas de statut
 * "annule" côté commande, on somme donc tout).
 */
export function computeTotalDepense(commandes: CommandeListItem[]): number {
  return commandes.reduce((sum, c) => sum + (c.montant_total || 0), 0);
}

/**
 * Calcule le solde impayé du client : somme des restes à payer des
 * commandes non payées ou partiellement payées.
 */
export function computeSoldeImpaye(commandes: CommandeListItem[]): number {
  return commandes.reduce((sum, c) => {
    if (c.statut_paiement === "non_paye" || c.statut_paiement === "partiel") {
      return sum + Math.max((c.montant_total || 0) - (c.montant_paye || 0), 0);
    }
    return sum;
  }, 0);
}
