/**
 * OgPressing — Helpers d'affichage pour la remise et l'acompte (LOT 7.4)
 * --------------------------------------------------------------------------
 * Centralise les libellés FR pour les enums DB liés à la remise et à
 * l'acompte de la commande :
 *
 *   - RemiseType     : aucune, pourcentage, montant_fixe, article_gratuit, fidelite
 *   - MethodePaiement: especes, mobile_money, carte_bancaire
 *
 * Utilisé par :
 *   - `step-recap.tsx` (formulaire remise + acompte de l'Étape 3)
 *   - `step-confirmation.tsx` (affichage du récap final — Task 26-e)
 *   - tout composant amené à afficher une remise ou un acompte
 *
 * ⚠️ Les types `RemiseType | MethodePaiement` sont importés depuis
 * `database.types.ts` (enums SQL du schéma OgPressing). Ne PAS modifier
 * ces mappings sans vérifier la cohérence avec le schéma DB applicatif.
 */
import type {
  MethodePaiement,
  RemiseType,
} from "@/lib/types/database.types";

// ============================================================
// Type de remise
// ============================================================

export const REMISE_TYPE_LABELS: Record<RemiseType, string> = {
  aucune: "Aucune",
  pourcentage: "Pourcentage",
  montant_fixe: "Montant fixe",
  article_gratuit: "Article gratuit",
  fidelite: "Remise fidélité",
};

/**
 * Liste ordonnée des types de remise pour le `<Select>` de l'Étape 3.
 * L'ordre reflète la fréquence d'usage (Aucune en premier = défaut,
 * Remise fidélité en dernier = cas avancé).
 */
export const REMISE_TYPE_OPTIONS: { value: RemiseType; label: string }[] = [
  { value: "aucune", label: REMISE_TYPE_LABELS.aucune },
  { value: "pourcentage", label: REMISE_TYPE_LABELS.pourcentage },
  { value: "montant_fixe", label: REMISE_TYPE_LABELS.montant_fixe },
  { value: "article_gratuit", label: REMISE_TYPE_LABELS.article_gratuit },
  { value: "fidelite", label: REMISE_TYPE_LABELS.fidelite },
];

// ============================================================
// Méthode de paiement (acompte)
// ============================================================

export const METHODE_PAIEMENT_LABELS: Record<MethodePaiement, string> = {
  especes: "Espèces",
  mobile_money: "Mobile Money",
  carte_bancaire: "Carte bancaire",
};

/**
 * Liste ordonnée des méthodes de paiement pour le `<Select>` acompte.
 * Espèces en premier (cas le plus fréquent en pressing).
 */
export const METHODE_PAIEMENT_OPTIONS: {
  value: MethodePaiement;
  label: string;
}[] = [
  { value: "especes", label: METHODE_PAIEMENT_LABELS.especes },
  { value: "mobile_money", label: METHODE_PAIEMENT_LABELS.mobile_money },
  { value: "carte_bancaire", label: METHODE_PAIEMENT_LABELS.carte_bancaire },
];

// ============================================================
// Fidélité
// ============================================================

/**
 * Calcule le pourcentage de remise fidélité applicable en fonction du
 * nombre de points du client.
 *
 * Seuils :
 *   - >= 100 points → 5 % (clients les plus fidèles)
 *   - >=  50 points → 3 % (clients réguliers)
 *   -  <  50 points → 0 % (pas encore assez de points)
 *
 * Renvoie 0 si le client n'a pas encore atteint le seuil minimum (50 pts).
 *
 * @example
 *   computeFideliteRemisePercent(120)  → 5
 *   computeFideliteRemisePercent(75)   → 3
 *   computeFideliteRemisePercent(49)   → 0
 */
export function computeFideliteRemisePercent(points: number): number {
  if (points >= 100) return 5;
  if (points >= 50) return 3;
  return 0;
}

/** Seuil minimum de points pour débloquer la 1re remise fidélité (3 %). */
export const FIDELITE_SEUIL_MIN = 50;
