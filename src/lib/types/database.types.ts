/**
 * e-pressing — Types Supabase (database.types.ts)
 * ------------------------------------------------
 * Types TypeScript du schéma de base de données e-pressing, dérivés des
 * migrations SQL du dossier /supabase/migrations/ (001 → 009).
 *
 * ⚠️ Ce fichier reflète le schéma APPLIQUÉ sur Supabase. Pour le regénérer
 *    automatiquement via le CLI officiel (nécessite un Personal Access Token) :
 *
 *      supabase login
 *      supabase gen types typescript --project-id yqaitafigfxlrprrouhr \
 *        > src/lib/types/database.types.ts
 *
 *    Ou via l'interface Supabase Dashboard → Settings → API → "TypeScript types".
 *
 * Conventions :
 *   - Row    : forme complète d'une ligne lue (toutes colonnes, nullables
 *              selon la contrainte NOT NULL de la DB)
 *   - Insert : forme pour un INSERT (colonnes auto-générées comme id,
 *              created_at, updated_at sont optionnelles)
 *   - Update : forme pour un UPDATE (toutes colonnes optionnelles)
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

/* ========================================================================== */
/*  ENUMS (migration 001_enums.sql)                                           */
/* ========================================================================== */

export type RolePersonnel =
  | "manager"
  | "receptionniste"
  | "caissier"
  | "laveur"
  | "repassage"
  | "livreur"
  | "comptable";

export type MethodeCreationPersonnel = "creation_directe" | "lien_invitation";

export type StatutComptePersonnel =
  | "invite_en_attente"
  | "actif"
  | "desactive";

export type StatutPressing = "actif" | "suspendu" | "essai";

export type StatutDemande =
  | "en_attente"
  | "contactee"
  | "validee"
  | "refusee";

export type PlanAbonnement = "starter" | "pro" | "business";

export type StatutAbonnement = "essai" | "actif" | "suspendu" | "expire";

export type StatutDemandeActivation = "en_attente" | "utilise" | "expire";

export type TypeVetement =
  | "chemise"
  | "pantalon"
  | "robe"
  | "costume"
  | "drap"
  | "couverture"
  | "autre";

export type CouleurVetement =
  | "blanc"
  | "noir"
  | "bleu"
  | "rouge"
  | "vert"
  | "jaune"
  | "gris"
  | "marron"
  | "autre";

export type EtatVetement = "bon" | "acceptable" | "use" | "dechire" | "tache";

export type StatutArticle =
  | "recu"
  | "en_traitement"
  | "lave"
  | "repasse"
  | "pret"
  | "retire"
  | "livre";

export type StatutCommande =
  | "recu"
  | "en_traitement"
  | "lave"
  | "repasse"
  | "pret"
  | "en_livraison"
  | "livre"
  | "retire";

export type StatutPaiement = "non_paye" | "partiel" | "paye";

export type RemiseType =
  | "aucune"
  | "pourcentage"
  | "montant_fixe"
  | "article_gratuit"
  | "fidelite";

export type MethodePaiement = "especes" | "mobile_money" | "carte_bancaire";

export type CategorieProduitStock = "biodetergent" | "consommable" | "autre";

export type UniteStock = "litre" | "kg" | "unite";

export type TypeAnomalie =
  | "vetement_endommage"
  | "vetement_perdu"
  | "erreur_facturation"
  | "retard_livraison"
  | "autre";

export type SeveriteAnomalie = "faible" | "moyenne" | "elevee";

export type CategorieDepense =
  | "loyer"
  | "eau"
  | "electricite"
  | "salaires"
  | "maintenance"
  | "fournitures"
  | "autre";

/* ========================================================================== */
/*  INTERFACE DATABASE (compatible client Supabase)                          */
/* ========================================================================== */

export interface Database {
  public: {
    Tables: {
      /* 1. super_admins */
      super_admins: {
        Row: {
          id: string;
          user_id: string;
          nom_complet: string;
          email: string;
          telephone: string | null;
          actif: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          nom_complet: string;
          email: string;
          telephone?: string | null;
          actif?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          nom_complet?: string;
          email?: string;
          telephone?: string | null;
          actif?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };

      /* 2. demandes_inscription */
      demandes_inscription: {
        Row: {
          id: string;
          nom_gerant: string;
          nom_pressing: string;
          telephone: string;
          email: string | null;
          ville: string | null;
          adresse: string | null;
          message: string | null;
          statut: StatutDemande;
          traite_par: string | null;
          date_traitement: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          nom_gerant: string;
          nom_pressing: string;
          telephone: string;
          email?: string | null;
          ville?: string | null;
          adresse?: string | null;
          message?: string | null;
          statut?: StatutDemande;
          traite_par?: string | null;
          date_traitement?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          nom_gerant?: string;
          nom_pressing?: string;
          telephone?: string;
          email?: string | null;
          ville?: string | null;
          adresse?: string | null;
          message?: string | null;
          statut?: StatutDemande;
          traite_par?: string | null;
          date_traitement?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };

      /* 3. codes_activation */
      codes_activation: {
        Row: {
          id: string;
          code: string;
          pressing_id_cible: string | null;
          genere_par: string | null;
          date_expiration: string | null;
          utilise: boolean;
          date_utilisation: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          code: string;
          pressing_id_cible?: string | null;
          genere_par?: string | null;
          date_expiration?: string | null;
          utilise?: boolean;
          date_utilisation?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          code?: string;
          pressing_id_cible?: string | null;
          genere_par?: string | null;
          date_expiration?: string | null;
          utilise?: boolean;
          date_utilisation?: string | null;
          created_at?: string;
        };
      };

      /* 4. pressing */
      pressing: {
        Row: {
          id: string;
          nom: string;
          slug: string | null;
          telephone: string | null;
          email: string | null;
          adresse: string | null;
          ville: string | null;
          logo_url: string | null;
          statut: StatutPressing;
          date_activation: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          nom: string;
          slug?: string | null;
          telephone?: string | null;
          email?: string | null;
          adresse?: string | null;
          ville?: string | null;
          logo_url?: string | null;
          statut?: StatutPressing;
          date_activation?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          nom?: string;
          slug?: string | null;
          telephone?: string | null;
          email?: string | null;
          adresse?: string | null;
          ville?: string | null;
          logo_url?: string | null;
          statut?: StatutPressing;
          date_activation?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };

      /* 5. abonnements */
      abonnements: {
        Row: {
          id: string;
          pressing_id: string;
          plan: PlanAbonnement;
          statut: StatutAbonnement;
          date_debut: string;
          date_fin: string | null;
          montant_mensuel: number;
          mode_paiement_derniere_echeance: MethodePaiement | null;
          date_derniere_echeance: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          pressing_id: string;
          plan?: PlanAbonnement;
          statut?: StatutAbonnement;
          date_debut: string;
          date_fin?: string | null;
          montant_mensuel: number;
          mode_paiement_derniere_echeance?: MethodePaiement | null;
          date_derniere_echeance?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          pressing_id?: string;
          plan?: PlanAbonnement;
          statut?: StatutAbonnement;
          date_debut?: string;
          date_fin?: string | null;
          montant_mensuel?: number;
          mode_paiement_derniere_echeance?: MethodePaiement | null;
          date_derniere_echeance?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };

      /* 6. personnel */
      personnel: {
        Row: {
          id: string;
          pressing_id: string;
          user_id: string | null;
          nom_complet: string;
          email: string | null;
          telephone: string | null;
          role: RolePersonnel;
          methode_creation: MethodeCreationPersonnel;
          statut_compte: StatutComptePersonnel;
          mot_de_passe_temporaire_hash: string | null;
          token_invitation: string | null;
          date_invitation: string | null;
          date_activation: string | null;
          date_desactivation: string | null;
          actif: boolean;
          cree_par: string | null;
          // Champs dédiés aux caissiers (AUDIT 9.7 — migration 019).
          // modes_paiement_autorises : JSONB array non-vide d'éléments
          //   parmi ['especes','mobile_money','carte','cheque','virement'].
          //   Default = tous les modes. Contrainte CHECK côté DB.
          // nom_affiche_recu : nom à imprimer sur les reçus (nullable,
          //   fallback sur nom_complet côté application).
          // seuil_alerte_impaye : entier 0..1 000 000 FCFA, default 5000.
          modes_paiement_autorises: string[];
          nom_affiche_recu: string | null;
          seuil_alerte_impaye: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          pressing_id: string;
          user_id?: string | null;
          nom_complet: string;
          email?: string | null;
          telephone?: string | null;
          role: RolePersonnel;
          methode_creation?: MethodeCreationPersonnel;
          statut_compte?: StatutComptePersonnel;
          mot_de_passe_temporaire_hash?: string | null;
          token_invitation?: string | null;
          date_invitation?: string | null;
          date_activation?: string | null;
          date_desactivation?: string | null;
          actif?: boolean;
          cree_par?: string | null;
          // Champs caissier (migration 019) — optionnels à l'insert,
          // des DEFAULT sont définis côté DB.
          modes_paiement_autorises?: string[];
          nom_affiche_recu?: string | null;
          seuil_alerte_impaye?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          pressing_id?: string;
          user_id?: string | null;
          nom_complet?: string;
          email?: string | null;
          telephone?: string | null;
          role?: RolePersonnel;
          methode_creation?: MethodeCreationPersonnel;
          statut_compte?: StatutComptePersonnel;
          mot_de_passe_temporaire_hash?: string | null;
          token_invitation?: string | null;
          date_invitation?: string | null;
          date_activation?: string | null;
          date_desactivation?: string | null;
          actif?: boolean;
          cree_par?: string | null;
          // Champs caissier (migration 019).
          modes_paiement_autorises?: string[];
          nom_affiche_recu?: string | null;
          seuil_alerte_impaye?: number;
          created_at?: string;
          updated_at?: string;
        };
      };

      /* 7. clients */
      clients: {
        Row: {
          id: string;
          pressing_id: string;
          nom_complet: string;
          telephone: string;
          email: string | null;
          adresse: string | null;
          points_fidelite: number;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          pressing_id: string;
          nom_complet: string;
          telephone: string;
          email?: string | null;
          adresse?: string | null;
          points_fidelite?: number;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          pressing_id?: string;
          nom_complet?: string;
          telephone?: string;
          email?: string | null;
          adresse?: string | null;
          points_fidelite?: number;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };

      /* 8. services */
      services: {
        Row: {
          id: string;
          pressing_id: string;
          nom: string;
          type: string | null;
          prix_unitaire: number;
          actif: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          pressing_id: string;
          nom: string;
          type?: string | null;
          prix_unitaire: number;
          actif?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          pressing_id?: string;
          nom?: string;
          type?: string | null;
          prix_unitaire?: number;
          actif?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };

      /* 9. commandes */
      commandes: {
        Row: {
          id: string;
          pressing_id: string;
          client_id: string | null;
          code: string | null;
          montant_total: number;
          montant_paye: number;
          statut: StatutCommande;
          statut_paiement: StatutPaiement;
          remise_type: RemiseType;
          remise_valeur: number;
          date_retire_prevue: string | null;
          date_retire_reelle: string | null;
          notes: string | null;
          cree_par: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          pressing_id: string;
          client_id?: string | null;
          code?: string | null;
          montant_total?: number;
          montant_paye?: number;
          statut?: StatutCommande;
          statut_paiement?: StatutPaiement;
          remise_type?: RemiseType;
          remise_valeur?: number;
          date_retire_prevue?: string | null;
          date_retire_reelle?: string | null;
          notes?: string | null;
          cree_par?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          pressing_id?: string;
          client_id?: string | null;
          code?: string | null;
          montant_total?: number;
          montant_paye?: number;
          statut?: StatutCommande;
          statut_paiement?: StatutPaiement;
          remise_type?: RemiseType;
          remise_valeur?: number;
          date_retire_prevue?: string | null;
          date_retire_reelle?: string | null;
          notes?: string | null;
          cree_par?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };

      /* 10. commande_lignes */
      commande_lignes: {
        Row: {
          id: string;
          commande_id: string;
          service_id: string | null;
          // ⚠️ Renommé en type_vetement_legacy par la migration 014 (LOT 15.1).
          // Conservé pour compatibilité historique mais non utilisé par le code métier.
          type_vetement: TypeVetement | null;
          type_vetement_legacy: TypeVetement | null;
          description: string | null;
          quantite: number;
          prix_unitaire: number;
          montant_ligne: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          commande_id: string;
          service_id?: string | null;
          type_vetement?: TypeVetement | null;
          type_vetement_legacy?: TypeVetement | null;
          description?: string | null;
          quantite?: number;
          prix_unitaire: number;
          montant_ligne?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          commande_id?: string;
          service_id?: string | null;
          type_vetement?: TypeVetement | null;
          type_vetement_legacy?: TypeVetement | null;
          description?: string | null;
          quantite?: number;
          prix_unitaire?: number;
          montant_ligne?: number;
          created_at?: string;
          updated_at?: string;
        };
      };

      /* 11. articles_vetements */
      articles_vetements: {
        Row: {
          id: string;
          commande_id: string;
          commande_ligne_id: string | null;
          qr_code: string | null;
          // ⚠️ Renommé en type_vetement_legacy par la migration 014 (LOT 15.1).
          type_vetement: TypeVetement | null;
          type_vetement_legacy: TypeVetement | null;
          // ⚠️ Ajouté par la migration 014 : FK vers catalogue_articles(id). NOT NULL.
          catalogue_article_id: string;
          couleur: CouleurVetement | null;
          etat: EtatVetement | null;
          statut: StatutArticle;
          notes: string | null;
          enregistre_par: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          commande_id: string;
          commande_ligne_id?: string | null;
          qr_code?: string | null;
          type_vetement?: TypeVetement | null;
          type_vetement_legacy?: TypeVetement | null;
          catalogue_article_id: string;
          couleur?: CouleurVetement | null;
          etat?: EtatVetement | null;
          statut?: StatutArticle;
          notes?: string | null;
          enregistre_par?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          commande_id?: string;
          commande_ligne_id?: string | null;
          qr_code?: string | null;
          type_vetement?: TypeVetement | null;
          type_vetement_legacy?: TypeVetement | null;
          catalogue_article_id?: string;
          couleur?: CouleurVetement | null;
          etat?: EtatVetement | null;
          statut?: StatutArticle;
          notes?: string | null;
          enregistre_par?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };

      /* 12. paiements */
      paiements: {
        Row: {
          id: string;
          commande_id: string;
          montant: number;
          methode: MethodePaiement;
          reference: string | null;
          enregistre_par: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          commande_id: string;
          montant: number;
          methode: MethodePaiement;
          reference?: string | null;
          enregistre_par?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          commande_id?: string;
          montant?: number;
          methode?: MethodePaiement;
          reference?: string | null;
          enregistre_par?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };

      /* 13. produits_stock */
      produits_stock: {
        Row: {
          id: string;
          pressing_id: string;
          nom: string;
          categorie: CategorieProduitStock;
          unite: UniteStock;
          quantite_actuelle: number;
          seuil_alerte: number;
          prix_achat_unitaire: number | null;
          fournisseur: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          pressing_id: string;
          nom: string;
          categorie: CategorieProduitStock;
          unite: UniteStock;
          quantite_actuelle?: number;
          seuil_alerte?: number;
          prix_achat_unitaire?: number | null;
          fournisseur?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          pressing_id?: string;
          nom?: string;
          categorie?: CategorieProduitStock;
          unite?: UniteStock;
          quantite_actuelle?: number;
          seuil_alerte?: number;
          prix_achat_unitaire?: number | null;
          fournisseur?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };

      /* 14. mouvements_stock */
      mouvements_stock: {
        Row: {
          id: string;
          produit_id: string;
          type_mouvement: string;
          quantite: number;
          motif: string | null;
          enregistre_par: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          produit_id: string;
          type_mouvement: string;
          quantite: number;
          motif?: string | null;
          enregistre_par?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          produit_id?: string;
          type_mouvement?: string;
          quantite?: number;
          motif?: string | null;
          enregistre_par?: string | null;
          created_at?: string;
        };
      };

      /* 15. machines */
      machines: {
        Row: {
          id: string;
          pressing_id: string;
          nom: string;
          type: string | null;
          capacite: number | null;
          unite: UniteStock | null;
          date_achat: string | null;
          statut: string;
          date_derniere_maintenance: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          pressing_id: string;
          nom: string;
          type?: string | null;
          capacite?: number | null;
          unite?: UniteStock | null;
          date_achat?: string | null;
          statut?: string;
          date_derniere_maintenance?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          pressing_id?: string;
          nom?: string;
          type?: string | null;
          capacite?: number | null;
          unite?: UniteStock | null;
          date_achat?: string | null;
          statut?: string;
          date_derniere_maintenance?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };

      /* 16. anomalies */
      anomalies: {
        Row: {
          id: string;
          pressing_id: string;
          commande_id: string | null;
          article_id: string | null;
          type: TypeAnomalie;
          severite: SeveriteAnomalie;
          description: string;
          statut: string;
          declare_par: string | null;
          date_declaration: string;
          date_resolution: string | null;
          resolu_par: string | null;
          solution: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          pressing_id: string;
          commande_id?: string | null;
          article_id?: string | null;
          type: TypeAnomalie;
          severite?: SeveriteAnomalie;
          description: string;
          statut?: string;
          declare_par?: string | null;
          date_declaration?: string;
          date_resolution?: string | null;
          resolu_par?: string | null;
          solution?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          pressing_id?: string;
          commande_id?: string | null;
          article_id?: string | null;
          type?: TypeAnomalie;
          severite?: SeveriteAnomalie;
          description?: string;
          statut?: string;
          declare_par?: string | null;
          date_declaration?: string;
          date_resolution?: string | null;
          resolu_par?: string | null;
          solution?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };

      /* 17. depenses */
      depenses: {
        Row: {
          id: string;
          pressing_id: string;
          montant: number;
          categorie: CategorieDepense;
          description: string | null;
          date_depense: string;
          enregistre_par: string | null;
          methode_paiement: MethodePaiement | null;
          reference: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          pressing_id: string;
          montant: number;
          categorie: CategorieDepense;
          description?: string | null;
          date_depense?: string;
          enregistre_par?: string | null;
          methode_paiement?: MethodePaiement | null;
          reference?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          pressing_id?: string;
          montant?: number;
          categorie?: CategorieDepense;
          description?: string | null;
          date_depense?: string;
          enregistre_par?: string | null;
          methode_paiement?: MethodePaiement | null;
          reference?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };

      /* 18. catalogue_articles (LOT 15.1) */
      catalogue_articles: {
        Row: {
          id: string;
          slug: string;
          nom: string;
          categorie: string;
          icone_url: string;
          actif: boolean;
          ordre_affichage: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          nom: string;
          categorie: string;
          icone_url: string;
          actif?: boolean;
          ordre_affichage?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          slug?: string;
          nom?: string;
          categorie?: string;
          icone_url?: string;
          actif?: boolean;
          ordre_affichage?: number;
          created_at?: string;
          updated_at?: string;
        };
      };
    };
    Views: {
      vue_clients_enrichis: {
        Row: {
          id: string;
          nom_complet: string;
          telephone: string;
          email: string | null;
          adresse: string | null;
          points_fidelite: number;
          solde_impaye: number;
          total_depense: number;
          nombre_commandes: number;
          derniere_commande: string | null;
          created_at: string;
        };
      };
    };
    Functions: Record<string, never>;
    Enums: {
      role_personnel: RolePersonnel;
      methode_creation_personnel: MethodeCreationPersonnel;
      statut_compte_personnel: StatutComptePersonnel;
      statut_pressing: StatutPressing;
      statut_demande: StatutDemande;
      plan_abonnement: PlanAbonnement;
      statut_abonnement: StatutAbonnement;
      statut_demande_activation: StatutDemandeActivation;
      type_vetement: TypeVetement;
      couleur_vetement: CouleurVetement;
      etat_vetement: EtatVetement;
      statut_article: StatutArticle;
      statut_commande: StatutCommande;
      statut_paiement: StatutPaiement;
      remise_type: RemiseType;
      methode_paiement: MethodePaiement;
      categorie_produit_stock: CategorieProduitStock;
      unite_stock: UniteStock;
      type_anomalie: TypeAnomalie;
      severite_anomalie: SeveriteAnomalie;
      categorie_depense: CategorieDepense;
    };
  };
}

/* ========================================================================== */
/*  HELPERS (compatibles client Supabase JS v2)                               */
/* ========================================================================== */

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];

export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];

export type TablesUpdate<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];

export type Views<V extends keyof Database["public"]["Views"]> =
  Database["public"]["Views"][V]["Row"];
