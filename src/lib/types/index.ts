/**
 * e-pressing — Types TypeScript partagés
 * --------------------------------------
 *
 * Ce fichier sera enrichi au fur et à mesure des prompts de développement.
 * Pour l'instant, on déclare les types transverses (rôles, enums communs)
 * afin que les composants partagés puissent les importer.
 *
 * Les types précis par table Supabase seront générés/intégrés dans le
 * prompt P0 (schéma SQL) via `supabase gen types`.
 */

/* -------------------------------------------------------------------------- */
/*  RÔLES UTILISATEURS                                                        */
/* -------------------------------------------------------------------------- */

/** Rôles du personnel d'un pressing (PRD §3.3). */
export type RolePersonnel =
  | "manager"
  | "receptionniste"
  | "caissier"
  | "laveur"
  | "repassage"
  | "livreur"
  | "comptable";

/** Type global d'utilisateur (Super Admin / Admin / Personnel). */
export type TypeUtilisateur = "super_admin" | "admin" | RolePersonnel;

/* -------------------------------------------------------------------------- */
/*  ENUMS MÉTIER (PRD §18.5)                                                  */
/* -------------------------------------------------------------------------- */

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

export type EtatVetement =
  | "bon"
  | "acceptable"
  | "use"
  | "dechire"
  | "tache";

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

export type MethodePaiement = "especes" | "mobile_money" | "carte_bancaire";

export type RemiseType =
  | "aucune"
  | "pourcentage"
  | "montant_fixe"
  | "article_gratuit"
  | "fidelite";

export type CategorieDepense =
  | "loyer"
  | "eau"
  | "electricite"
  | "salaires"
  | "maintenance"
  | "fournitures"
  | "autre";

export type MethodeCreationPersonnel = "creation_directe" | "lien_invitation";

export type StatutComptePersonnel =
  | "invite_en_attente"
  | "actif"
  | "desactive";

export type PlanAbonnement = "starter" | "pro" | "business";

/* -------------------------------------------------------------------------- */
/*  TYPES GÉNÉRIQUES UTILITAIRES                                             */
/* -------------------------------------------------------------------------- */

/** Réponse API standard pour les Route Handlers. */
export type ApiResponse<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string };

/** Format de date ISO renvoyé par Supabase (TIMESTAMPTZ). */
export type ISODateString = string;
