/**
 * OgPressing — POS / Caisse : types partagés
 * ==========================================
 * Types de l'écran de prise de commande POS (Point de Vente).
 *
 * Conçus pour être indépendants du schéma DB : la couche `data.ts` adapte
 * les données Supabase (services + catalogue_articles + clients) vers ces
 * types. Les composants POS ne dépendent que de ces types — jamais de la DB.
 *
 * Conventions projet :
 *   - Tous les montants sont des entiers FCFA (jamais de flottant).
 *   - Devise formatée avec séparateurs de milliers " " (ex : 2 000 Fcfa).
 *   - Dates JJ/MM/AAAA, heures HH:mm.
 */

/** Catégorie de service POS (barre du bas du panneau gauche). */
export type PosCategorieId =
  | "tous"
  | "lavage"
  | "repassage"
  | "laver-repasser"
  | "sechage"
  | "nettoyage_sec";

/** Article/prestation affiché dans la grille du catalogue. */
export interface PosArticle {
  /** Identifiant stable unique (service_id + "::" + catalogue_slug). */
  id: string;
  /** FK vers services.id (pour la création de commande). */
  service_id: string;
  /** Libellé court du service (ex : "Laver-Repasser Complet Tunique"). */
  service_nom: string;
  /** Catégorie POS dérivée du type de service. */
  categorie: Exclude<PosCategorieId, "tous">;
  /** Slug du catalogue d'articles (pour l'illustration). */
  catalogue_slug: string;
  /** Nom du catalogue (affiché sous l'image). */
  catalogue_nom: string;
  /** URL de l'illustration : /images/articles/{slug}.png. */
  icone_url: string;
  /** Prix unitaire en FCFA (entier). */
  prix: number;
  /** Délai estimé en heures (pour calculer la date de retrait). */
  duree_estimee_h?: number;
}

/** Définition d'une catégorie POS (icône + libellé). */
export interface PosCategorie {
  id: Exclude<PosCategorieId, "tous">;
  label: string;
  /** Slug lucide-react → résolu côté composant (évite d'importer lucide ici). */
  icon: "washing" | "iron" | "shirt" | "sun" | "sparkles";
}

/** Ligne du panier (commande en cours). */
export interface PosCartLine {
  /** UUID local (clé React). */
  id: string;
  /** Article source (snapshot au moment de l'ajout). */
  article: PosArticle;
  /** Quantité (>= 1). */
  quantite: number;
  /** Option Express (majoration de tarif si configurée). */
  express: boolean;
  /** Note courte par ligne (ex : "tache encre col"). */
  note?: string;
  /** Couleur dominante (enum DB). Défaut "autre". */
  couleur?: string;
  /** État du vêtement (enum DB). Défaut "correct". */
  etat?: string;
}

/** Client du pressing (recherche/sélection). */
export interface PosClient {
  id: string;
  nom: string;
  telephone: string;
  email?: string | null;
  commune?: string | null;
  /** Solde impayé actuel (FCFA). 0 si aucun. */
  solde_impaye: number;
}

/** Type de remise. */
export type PosRemiseType = "aucune" | "pourcentage" | "montant_fixe";

/** Méthode de paiement déclaratif (encaissé au comptoir). */
export type PosMethodePaiement = "especes" | "mobile_money" | "carte_bancaire";

/** Statut de paiement dérivé. */
export type PosStatutPaiement = "impaye" | "acompte" | "paye";

/** Informations financières calculées (fonction pure). */
export interface PosFinance {
  sous_total: number;
  remise_montant: number;
  net_a_payer: number;
  paye: number;
  reste: number;
  statut: PosStatutPaiement;
}

/** Payload envoyé à createCommande (aligné sur POST /api/admin/commandes). */
export interface PosCommandePayload {
  client_id: string;
  date_pret_prevue: string; // ISO
  notes?: string;
  articles: Array<{
    service_id: string;
    catalogue_article_id?: string;
    catalogue_article_nom: string;
    couleur?: string;
    couleur_libre?: string;
    etat?: string;
    description_etat?: string;
    quantite: number;
  }>;
  remise?: { type: PosRemiseType; valeur: number };
  acompte?: {
    montant: number;
    methode: PosMethodePaiement;
    reference?: string;
  };
}

/** Snapshot de la commande créée (retour de l'API). */
export interface PosCommandeCree {
  id: string;
  pressing_id: string;
  numero_commande: string;
  montant_total: number;
  montant_paye: number;
  statut: string;
  statut_paiement: string;
}

/** Référence de commande générée au format DEP + AAAAMMJJHHMMSSmmm. */
export type PosReference = string;
