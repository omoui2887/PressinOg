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

/**
 * Catégorie de service POS (détermine l'ordre d'affichage dans le dialogue
 * d'action lorsqu'on clique sur un article du catalogue).
 *
 * L'utilisateur final choisit l'action (Lavage, Repassage, Laver-Repasser,
 * Nettoyage à sec, Détachage, Blanchisserie) via une boîte de dialogue —
 * cette enum sert principalement à ordonner les actions dans le dialogue
 * selon la préférence métier (voir ACTION_PRIORITY dans article-actions-dialog.tsx).
 */
export type PosCategorieId =
  | "tous"
  | "lavage"
  | "repassage"
  | "laver-repasser"
  | "nettoyage_sec"
  | "detachage"
  | "blanchisserie";

/** Article/prestation affiché dans la grille du catalogue. */
export interface PosArticle {
  /**
   * Identifiant stable unique — composite `${service_id}::${catalogue_slug}`.
   * Permet de différencier la même carte article entre plusieurs types de
   * service (ex : "chemise × lavage" vs "chemise × repassage") pour le
   * dédoublonnage des lignes panier.
   */
  id: string;
  /** FK vers services.id (pour la création de commande). */
  service_id: string;
  /** Libellé court du service (ex : "Laver-Repasser Complet Tunique"). */
  service_nom: string;
  /** Catégorie POS dérivée du type de service. */
  categorie: Exclude<PosCategorieId, "tous">;
  /** Slug du catalogue d'articles (pour l'illustration + identifiant lisible). */
  catalogue_slug: string;
  /** UUID du catalogue_articles (FK envoyée à POST /api/admin/commandes). */
  catalogue_article_id: string;
  /** Nom du catalogue (affiché sous l'image). */
  catalogue_nom: string;
  /** Catégorie du catalogue (Vêtements traités, Linge de maison, etc.). */
  catalogue_categorie: string;
  /** URL de l'illustration : /images/articles/{slug}.png. */
  icone_url: string;
  /** Prix unitaire en FCFA (entier). 0 si aucun tarif configuré. */
  prix: number;
  /** Délai estimé en heures (pour calculer la date de retrait). */
  duree_estimee_h?: number;
  /** True si un tarif spécifique existe pour cet article × ce service.
   *  False → l'action s'affiche « Non configuré » dans le dialogue et
   *  n'est pas cliquable (synergie avec Tarifs par article). */
  tarifConfigure: boolean;
}

/** Définition d'une catégorie POS (icône + libellé). */
export interface PosCategorie {
  id: Exclude<PosCategorieId, "tous">;
  label: string;
  /** Slug lucide-react → résolu côté composant (évite d'importer lucide ici). */
  icon: "washing" | "iron" | "shirt" | "sparkles" | "spray" | "washing-machine";
}

/**
 * Catégorie de catalogue (filtre par type de linge).
 * Indépendante de la catégorie POS (qui dérive du type de service) :
 * le catalogue est organisé en 9 grandes familles d'articles.
 */
export interface PosCatalogueCategorie {
  /** Identifiant = nom de catégorie (ex : "Vêtements traités"). */
  id: string;
  /** Libellé affiché dans la barre de filtre. */
  label: string;
  /** Icône lucide → résolue côté composant. */
  icon:
    | "shirt"
    | "bed"
    | "sparkles"
    | "briefcase"
    | "trophy"
    | "link"
    | "utensils"
    | "sofa"
    | "package";
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
