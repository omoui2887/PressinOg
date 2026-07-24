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

// ============================================================
// Types
// ============================================================

export type WizardStep = 1 | 2 | 3 | 4;

export interface ClientInfo {
  id: string;
  nom: string;
  telephone: string;
  email?: string;
}

export interface ArticleInfo {
  id: string;
  designation: string;
  service: string;
  prix: number; // FCFA
  quantite: number;
}

export interface Remise {
  type: "pourcentage" | "montant";
  valeur: number;
}

export interface WizardState {
  /** Étape courante (1-4). */
  step: WizardStep;
  /** Étape la plus avancée atteinte (pour autoriser le retour-arrière via stepper). */
  maxReachedStep: WizardStep;
  client: ClientInfo | null;
  articles: ArticleInfo[];
  remise: Remise | null;
  acompte: number | null;
  /** Référence commande générée au passage à l'étape 4 (mock). */
  commandeId: string | null;
}

export type WizardAction =
  | { type: "GO_TO_STEP"; step: WizardStep }
  | { type: "NEXT_STEP" }
  | { type: "PREV_STEP" }
  | { type: "SET_CLIENT"; client: ClientInfo }
  | { type: "CLEAR_CLIENT" }
  | { type: "ADD_ARTICLE"; article: ArticleInfo }
  | { type: "REMOVE_ARTICLE"; id: string }
  | { type: "SET_REMISE"; remise: Remise | null }
  | { type: "SET_ACOMPTE"; acompte: number | null }
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

export const initialState: WizardState = {
  step: 1,
  maxReachedStep: 1,
  client: null,
  articles: [],
  remise: null,
  acompte: null,
  commandeId: null,
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
      const newState: WizardState = {
        ...state,
        step: nextStep,
        maxReachedStep: Math.max(state.maxReachedStep, nextStep),
      };
      // Génère un identifiant de commande mock au passage à l'étape 4.
      if (nextStep === 4 && !state.commandeId) {
        newState.commandeId = `CMD-${Date.now().toString(36).toUpperCase()}`;
      }
      return newState;
    }

    case "PREV_STEP": {
      const prevStep = Math.max(1, state.step - 1) as WizardStep;
      return { ...state, step: prevStep };
    }

    case "SET_CLIENT":
      return { ...state, client: action.client };

    case "CLEAR_CLIENT":
      return { ...state, client: null };

    case "ADD_ARTICLE":
      return { ...state, articles: [...state.articles, action.article] };

    case "REMOVE_ARTICLE":
      return {
        ...state,
        articles: state.articles.filter((a) => a.id !== action.id),
      };

    case "SET_REMISE":
      return { ...state, remise: action.remise };

    case "SET_ACOMPTE":
      return { ...state, acompte: action.acompte };

    case "RESET":
      return { ...initialState };

    default:
      return state;
  }
}

// ============================================================
// Sélecteurs utilitaires (calculs dérivés)
// ============================================================

/** Sous-total = somme(prix × quantité) des articles. */
export function computeSousTotal(state: WizardState): number {
  return state.articles.reduce((sum, a) => sum + a.prix * a.quantite, 0);
}

/** Montant de la remise en FCFA. */
export function computeMontantRemise(state: WizardState): number {
  if (!state.remise) return 0;
  const sousTotal = computeSousTotal(state);
  return state.remise.type === "pourcentage"
    ? Math.round((sousTotal * state.remise.valeur) / 100)
    : state.remise.valeur;
}

/** Total = sous-total - remise. */
export function computeTotal(state: WizardState): number {
  return computeSousTotal(state) - computeMontantRemise(state);
}
