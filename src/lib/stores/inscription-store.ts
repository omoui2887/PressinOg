/**
 * OgPressing — Store d'inscription (Zustand)
 * ------------------------------------------
 * Partage l'état "plan sélectionné" entre la section Tarifs de la landing
 * et le formulaire d'inscription (#inscription).
 *
 * Quand un visiteur clique sur "Choisir ce plan" dans la grille tarifaire,
 * le plan est mémorisé ici ; le formulaire (à venir) pourra le pré-remplir
 * et afficher le choix à l'utilisateur.
 */
import { create } from "zustand";

export type PlanId = "starter" | "pro" | "business";

interface InscriptionState {
  /** Plan tarifaire présélectionné par l'utilisateur (null = aucun). */
  selectedPlan: PlanId | null;
  /** Mémorise le plan choisi et déclenche le scroll vers #inscription. */
  selectPlan: (plan: PlanId) => void;
  /** Réinitialise la sélection. */
  clearPlan: () => void;
}

export const useInscriptionStore = create<InscriptionState>((set) => ({
  selectedPlan: null,
  selectPlan: (plan) => {
    set({ selectedPlan: plan });
    // Scroll fluide vers le formulaire (ancre #inscription)
    if (typeof document !== "undefined") {
      const el = document.getElementById("inscription");
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  },
  clearPlan: () => set({ selectedPlan: null }),
}));

/** Libellés d'affichage associés à chaque plan. */
export const PLAN_LABELS: Record<PlanId, string> = {
  starter: "Starter",
  pro: "Pro",
  business: "Business",
};
