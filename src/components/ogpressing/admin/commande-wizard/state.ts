/**
 * OgPressing — Wizard Nouvelle Commande : état partagé
 * ----------------------------------------------------
 * Gestion centralisée de l'état du wizard 4 étapes avec useReducer.
 *
 * Étapes :
 *   1. Sélection du client
 *   2. Enregistrement des articles
 *   3. Récapitulatif, remise et acompte
 *   4. Confirmation avec QR Code et étiquettes
 *
 * Le reducer conserve toutes les données saisies à travers les 4 étapes
 * avant la soumission finale. La navigation avant (NEXT_STEP) n'est
 * possible que si l'étape courante est valide (isStepValid).
 *
 * Navigation arrière : l'utilisateur peut revenir sur n'importe quelle
 * étape déjà atteinte (≤ maxReachedStep) en cliquant sur le stepper.
 * maxReachedStep n'est pas réinitialisé lors d'un retour arrière →
 * l'utilisateur peut librement aller-retour parmi les étapes validées.
 */

import type {
  CouleurVetement,
  EtatVetement,
  MethodePaiement,
  RemiseType,
} from "@/lib/types/database.types";

// ============================================================
// Types
// ============================================================

export type WizardStep = 1 | 2 | 3 | 4;

/**
 * Préférences de lavage stockées sur un client (champ JSONB
 * `clients.preferences_lavage`). Toutes les clés sont optionnelles : un
 * client peut n'avoir aucune préférence renseignée (null ou {}).
 *
 * Schéma strict partagé entre l'API (`/api/admin/clients/[id]` PATCH),
 * le wizard (`state.ts`) et les helpers d'affichage
 * (`preferences-labels.ts`).
 */
export interface PreferencesLavage {
  detergent?: "classique" | "bio" | "sans_phosphore";
  temperature?: "froid" | "tiede" | "chaud";
  adoucissant?: "oui" | "non";
  detachage_prealable?: "oui" | "non";
  pressing_intensif?: "oui" | "non";
  repassage?: "standard" | "leger" | "aucun";
}

/**
 * Informations client portées par l'état du wizard (Étape 1).
 *
 * `nom` correspond à `clients.nom_complet` côté DB. `solde_impaye` et
 * `preferences_lavage` sont récupérés au moment de la sélection (le search
 * API ne renvoie pas `preferences_lavage` → on fetch le détail client).
 *
 * `points_fidelite` est utilisé par l'Étape 3 (récap) pour calculer la
 * remise fidélité automatique (computeFideliteRemisePercent).
 */
export interface ClientInfo {
  id: string;
  /** Nom complet du client (= `clients.nom_complet`). */
  nom: string;
  telephone: string;
  email?: string | null;
  /** Solde impayé actuel (FCFA). 0 pour un nouveau client. */
  solde_impaye: number;
  /** Préférences de lavage sauvegardées (null si aucune). */
  preferences_lavage?: PreferencesLavage | null;
  /**
   * Points de fidélité accumulés (utilisé par l'Étape 3 pour calculer
   * la remise fidélité automatique — 50 pts → 3 %, 100 pts → 5 %).
   * 0 pour un nouveau client.
   */
  points_fidelite?: number;
}

/**
 * Article enregistré dans la commande (Étape 2).
 *
 * Schéma aligné sur la table `articles_vetements` côté DB (champs
 * `catalogue_article_id`, `couleur`, `couleur_libre`, `etat`,
 * `description_etat`) + la table `commande_lignes` (`service_id`,
 * `prix_unitaire`, `quantite`). L'id est local (UUID généré côté
 * client) : il sert de clé React dans la liste d'articles avant
 * soumission finale à l'API.
 *
 * Depuis le LOT 15 (migration 014), l'ancien champ `type_vetement`
 * (ENUM figé à 7 valeurs) est remplacé par `catalogue_article_id`
 * (FK vers la table `catalogue_articles` qui contient 33+ articles
 * illustrés). Le `catalogue_article_nom`, `catalogue_article_slug`
 * et `catalogue_article_icone_url` sont dénormalisés au moment de la
 * sélection (snapshot) pour ne pas avoir à refetch lors de l'affichage
 * ultérieur (récap, étiquettes, ticket imprimable).
 *
 * Le `service_nom` et `prix_unitaire` sont également dénormalisés depuis
 * la table `services` au moment de l'ajout (snapshot).
 */
export interface ArticleInfo {
  /** UUID local (clé React). Sert aussi d'id temporaire avant INSERT. */
  id: string;
  /** FK vers `services.id`. */
  service_id: string;
  /** Libellé du service au moment de l'ajout (snapshot). */
  service_nom: string;
  /** FK vers `catalogue_articles.id` (LOT 15). */
  catalogue_article_id: string;
  /** Nom du catalogue au moment de la sélection (snapshot, LOT 15). */
  catalogue_article_nom: string;
  /** Slug du catalogue au moment de la sélection (snapshot, LOT 15). */
  catalogue_article_slug: string;
  /** URL de l'icône du catalogue (snapshot, LOT 15). */
  catalogue_article_icone_url: string;
  /** Couleur dominante (enum DB). */
  couleur: CouleurVetement;
  /** Texte libre obligatoire si `couleur === "autre"`. */
  couleur_libre?: string;
  /** État du vêtement à la réception (enum DB). */
  etat: EtatVetement;
  /** Notes / réserves (optionnel, protège contre les réclamations). */
  description_etat?: string;
  /** Prix unitaire snapshot du service au moment de l'ajout (FCFA). */
  prix_unitaire: number;
  /** Quantité (>= 1). */
  quantite: number;
}

/**
 * Remise appliquée à la commande (Étape 3).
 *
 * Schéma aligné sur l'enum DB `RemiseType` :
 *   - `aucune`         → pas de remise (état par défaut, `valeur=0`, `montant=0`)
 *   - `pourcentage`    → `valeur` = pourcentage en % (ex : 10 pour 10 %)
 *   - `montant_fixe`   → `valeur` = montant en FCFA (plafonné au sous-total)
 *   - `article_gratuit`→ `valeur` = index de l'article offert dans `state.articles`
 *   - `fidelite`       → `valeur` = pourcentage auto dérivé des points fidélité
 *                        (non modifiable manuellement — cf. `computeFideliteRemisePercent`)
 *
 * `montant` est le montant en FCFA calculé (snapshot au moment de la saisie)
 * — évite de refaire le calcul côté affichage (récap, confirmation, étiquettes).
 *
 * ⚠️ Lorsque `state.remise === null`, aucune remise n'est appliquée (défaut).
 * Le type `aucune` n'est utilisé que si l'utilisateur a explicitement ouvert
 * la section remise et sélectionné « Aucune ».
 */
export interface Remise {
  type: RemiseType;
  valeur: number;
  /** Montant en FCFA calculé (snapshot). Toujours >= 0. */
  montant: number;
}

/**
 * Acompte versé par le client à la création de la commande (Étape 3).
 *
 * Schéma aligné sur l'enum DB `MethodePaiement`. `reference` est optionnel
 * (ex : numéro de transaction Mobile Money, 4 derniers chiffres de carte).
 *
 * ⚠️ `state.acompte === null` → aucun acompte versé (défaut).
 */
export interface Acompte {
  montant: number;
  methode: MethodePaiement;
  reference?: string;
}

/**
 * Snapshot de la commande créée en base après clic sur « Confirmer et créer »
 * dans l'Étape 4. Contient tout ce dont l'écran de confirmation a besoin
 * pour afficher le numéro de ticket, le QR Code, le statut paiement et
 * déclencher l'impression du ticket + étiquettes.
 *
 * `pressing_id` est renvoyé par le POST /api/admin/commandes (cf. route.ts
 * Task 26-a modifié par Task 26-e) pour permettre la génération du QR Code
 * sans avoir à refetch la commande.
 */
export interface CommandeCree {
  id: string;
  numero_commande: string;
  pressing_id: string;
  montant_total: number;
  montant_paye: number;
  statut: string;
  statut_paiement: string;
}

export interface WizardState {
  /** Étape courante (1-4). */
  step: WizardStep;
  /** Étape la plus avancée atteinte (pour autoriser le retour-arrière via stepper). */
  maxReachedStep: WizardStep;
  client: ClientInfo | null;
  /**
   * Si true (défaut), les préférences lavage du client sélectionné seront
   * appliquées à la commande. Éditable via une checkbox dans l'Étape 1.
   * N'a d'effet que si `client.preferences_lavage` est non null.
   */
  appliquerPreferences: boolean;
  articles: ArticleInfo[];
  remise: Remise | null;
  acompte: Acompte | null;
  /**
   * Date de retrait prévue (format ISO string). Défaut : aujourd'hui + 2 jours
   * (J+2, cf. `defaultJPlus2()`). Éditable via le date picker de l'Étape 3.
   */
  date_pret_prevue: string;
  /**
   * Notes libres optionnelles sur la commande (champ `commandes.notes` côté DB).
   * L'utilisateur peut saisir des instructions spécifiques (taches tenaces,
   * contraintes client, etc.). Si non renseigné, envoyé comme `undefined` au
   * POST /api/admin/commandes (la colonne sera `null` en DB).
   */
  notes?: string;
  /**
   * Snapshot de la commande créée en base (POST /api/admin/commandes).
   * Null tant que l'utilisateur n'a pas cliqué sur « Confirmer et créer la
   * commande » dans l'Étape 4. Set via `SET_COMMANDE_CREE`. Reset sur RESET.
   */
  commandeCree: CommandeCree | null;
}

export type WizardAction =
  | { type: "GO_TO_STEP"; step: WizardStep }
  | { type: "NEXT_STEP" }
  | { type: "PREV_STEP" }
  | { type: "SET_CLIENT"; client: ClientInfo }
  | { type: "CLEAR_CLIENT" }
  | { type: "SET_APPLIQUER_PREFERENCES"; value: boolean }
  | { type: "ADD_ARTICLE"; article: ArticleInfo }
  | { type: "EDIT_ARTICLE"; id: string; article: ArticleInfo }
  | { type: "REMOVE_ARTICLE"; id: string }
  | { type: "SET_REMISE"; remise: Remise | null }
  | { type: "SET_ACOMPTE"; acompte: Acompte | null }
  | { type: "SET_DATE_PRET_PREVUE"; date: string }
  | { type: "SET_COMMANDE_CREE"; commande: CommandeCree }
  | { type: "RESET" };

export type WizardDispatch = React.Dispatch<WizardAction>;

export interface StepProps {
  state: WizardState;
  dispatch: WizardDispatch;
}

// ============================================================
// Définition des étapes (libellés courts pour le stepper)
// ============================================================

export interface StepperStepDef {
  number: WizardStep;
  label: string;
  /** Titre long affiché dans le header de l'étape. */
  title: string;
  /** Description courte de l'étape. */
  description: string;
}

export const WIZARD_STEPS: StepperStepDef[] = [
  {
    number: 1,
    label: "Client",
    title: "Sélection du client",
    description: "Choisissez le client pour cette commande.",
  },
  {
    number: 2,
    label: "Articles",
    title: "Enregistrement des articles",
    description: "Ajoutez les articles à nettoyer et leur service.",
  },
  {
    number: 3,
    label: "Paiement",
    title: "Récapitulatif, remise et acompte",
    description: "Vérifiez la commande, appliquez une remise et un acompte.",
  },
  {
    number: 4,
    label: "Confirmation",
    title: "Confirmation et QR Code",
    description: "Commande enregistrée. QR Code et étiquettes prêts.",
  },
];

// ============================================================
// État initial
// ============================================================

/**
 * Renvoie la date du jour + 2 jours au format ISO (avec timezone locale).
 * Utilisé comme défaut pour `date_pret_prevue` (retrait prévu J+2 — délai
 * standard d'un pressing). L'utilisateur peut modifier cette date dans
 * l'Étape 3.
 */
export function defaultJPlus2(): string {
  return new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString();
}

export const initialState: WizardState = {
  step: 1,
  maxReachedStep: 1,
  client: null,
  appliquerPreferences: true,
  articles: [],
  remise: null,
  acompte: null,
  date_pret_prevue: defaultJPlus2(),
  commandeCree: null,
};

// ============================================================
// Validation par étape
// ============================================================

/**
 * Renvoie true si l'étape donnée est valide (tous les champs
 * obligatoires remplis). Utilisé pour désactiver le bouton "Suivant".
 *
 * ⚠️ Pour l'instant (placeholders), la validation est minimale :
 *   - Étape 1 : un client doit être sélectionné
 *   - Étape 2 : au moins un article doit être enregistré
 *   - Étape 3 : toujours valide (remise/acompte optionnels)
 *   - Étape 4 : toujours valide (étape de confirmation)
 *
 * La validation sera enrichie au fur et à mesure du développement
 * du contenu détaillé de chaque étape.
 */
export function isStepValid(state: WizardState, step: WizardStep): boolean {
  switch (step) {
    case 1:
      return state.client !== null;
    case 2:
      return state.articles.length > 0;
    case 3:
      return true;
    case 4:
      return true;
  }
}

// ============================================================
// Reducer
// ============================================================

export function wizardReducer(
  state: WizardState,
  action: WizardAction
): WizardState {
  switch (action.type) {
    case "GO_TO_STEP": {
      // Autorise uniquement la navigation vers une étape déjà atteinte.
      if (action.step > state.maxReachedStep) return state;
      return { ...state, step: action.step };
    }

    case "NEXT_STEP": {
      if (!isStepValid(state, state.step)) return state;
      const nextStep = Math.min(4, state.step + 1) as WizardStep;
      // NOTE : la commande n'est PAS créée au passage à l'étape 4. Elle sera
      // créée par un clic explicite sur « Confirmer et créer la commande »
      // dans step-confirmation.tsx (POST /api/admin/commandes), puis le
      // snapshot `commandeCree` sera peuplé via `SET_COMMANDE_CREE`.
      return {
        ...state,
        step: nextStep,
        maxReachedStep: Math.max(state.maxReachedStep, nextStep),
      };
    }

    case "PREV_STEP": {
      const prevStep = Math.max(1, state.step - 1) as WizardStep;
      return { ...state, step: prevStep };
    }

    case "SET_CLIENT":
      // Lorsqu'on sélectionne un client, on réinitialise le flag
      // appliquerPreferences à true (défaut) pour ce nouveau client.
      return { ...state, client: action.client, appliquerPreferences: true };

    case "CLEAR_CLIENT":
      return { ...state, client: null, appliquerPreferences: true };

    case "SET_APPLIQUER_PREFERENCES":
      return { ...state, appliquerPreferences: action.value };

    case "ADD_ARTICLE":
      return { ...state, articles: [...state.articles, action.article] };

    case "EDIT_ARTICLE":
      return {
        ...state,
        articles: state.articles.map((a) =>
          a.id === action.id ? action.article : a
        ),
      };

    case "REMOVE_ARTICLE":
      return {
        ...state,
        articles: state.articles.filter((a) => a.id !== action.id),
      };

    case "SET_REMISE":
      return { ...state, remise: action.remise };

    case "SET_ACOMPTE":
      return { ...state, acompte: action.acompte };

    case "SET_DATE_PRET_PREVUE":
      return { ...state, date_pret_prevue: action.date };

    case "SET_COMMANDE_CREE":
      return { ...state, commandeCree: action.commande };

    case "RESET":
      return { ...initialState };

    default:
      return state;
  }
}

// ============================================================
// Sélecteurs utilitaires (calculs dérivés)
// ============================================================

/** Sous-total = somme(prix_unitaire × quantité) des articles. */
export function computeSousTotal(state: WizardState): number {
  return state.articles.reduce(
    (sum, a) => sum + a.prix_unitaire * a.quantite,
    0
  );
}

/** Montant de la remise en FCFA. */
export function computeMontantRemise(state: WizardState): number {
  return state.remise?.montant ?? 0;
}

/** Total = sous-total - remise. */
export function computeTotal(state: WizardState): number {
  return computeSousTotal(state) - computeMontantRemise(state);
}
