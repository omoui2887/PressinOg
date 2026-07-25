/**
 * OgPressing — Helpers d'affichage pour les articles (LOT 7.3)
 * ------------------------------------------------------------
 * Centralise les libellés FR, pastilles de couleur et variantes de
 * badge pour les 3 enums DB liés aux articles :
 *
 *   - TypeVetement  : chemise, pantalon, robe, costume, drap, couverture, autre
 *   - CouleurVetement : blanc, noir, bleu, rouge, vert, jaune, gris, marron, autre
 *   - EtatVetement  : bon, acceptable, use, dechire, tache
 *
 * Utilisé par :
 *   - `step-articles.tsx` (formulaire + liste des articles)
 *   - `step-recap.tsx` (récapitulatif — Task 26-d)
 *   - `step-confirmation.tsx` (étiquettes — Task 26-e)
 *
 * ⚠️ Les types `TypeVetement | CouleurVetement | EtatVetement` sont
 * importés depuis `database.types.ts` (enums SQL du schéma OgPressing).
 * Ne PAS modifier ces mappings sans vérifier la cohérence avec le
 * schéma DB applicatif (migrations 010+).
 */
import type {
  CouleurVetement,
  EtatVetement,
  TypeVetement,
} from "@/lib/types/database.types";

/**
 * Variante visuelle pour le badge d'état (cf. `StatusBadge` de
 * `components/shared/status-badge.tsx`).
 *
 * Mapping :
 *   - bon         → success (vert)    → aucune alerte
 *   - acceptable  → info (bleu)       → état correct, à noter
 *   - use         → warning (orange)  → usure notable
 *   - dechire     → danger (rouge)    → attirer l'attention
 *   - tache       → danger (rouge)    → attirer l'attention
 */
export type EtatBadgeVariant = "success" | "info" | "warning" | "danger";

// ============================================================
// Type de vêtement
// ============================================================

export const TYPE_VETEMENT_LABELS: Record<TypeVetement, string> = {
  chemise: "Chemise",
  pantalon: "Pantalon",
  robe: "Robe",
  costume: "Costume",
  drap: "Drap",
  couverture: "Couverture",
  autre: "Autre",
};

// ============================================================
// Couleur
// ============================================================

export const COULEUR_LABELS: Record<CouleurVetement, string> = {
  blanc: "Blanc",
  noir: "Noir",
  bleu: "Bleu",
  rouge: "Rouge",
  vert: "Vert",
  jaune: "Jaune",
  gris: "Gris",
  marron: "Marron",
  autre: "Autre",
};

/**
 * Pastille CSS (className Tailwind) pour visualiser la couleur.
 *
 * La couleur "blanc" a besoin d'une bordure pour rester visible sur
 * fond clair. La couleur "autre" est représentée par un dégradé
 * multicolore (rouge/vert/bleu) signalant une couleur non standard.
 *
 * Usage :
 *   <span className={`inline-block size-3 rounded-full ${COULEUR_SWATCH[c]}`} />
 */
export const COULEUR_SWATCH: Record<CouleurVetement, string> = {
  blanc: "bg-white border border-gray-300",
  noir: "bg-gray-900",
  bleu: "bg-blue-600",
  rouge: "bg-red-600",
  vert: "bg-green-600",
  jaune: "bg-yellow-400",
  gris: "bg-gray-500",
  marron: "bg-amber-800",
  autre: "bg-gradient-to-br from-red-500 via-green-500 to-blue-500",
};

// ============================================================
// État du vêtement
// ============================================================

export const ETAT_LABELS: Record<EtatVetement, string> = {
  bon: "Bon",
  acceptable: "Acceptable",
  use: "Usé",
  dechire: "Déchiré",
  tache: "Taché",
};

/**
 * Variante du `StatusBadge` pour chaque état — attire l'œil sur
 * les états dégradés (dechire / tache = danger rouge).
 */
export const ETAT_VARIANT: Record<EtatVetement, EtatBadgeVariant> = {
  bon: "success",
  acceptable: "info",
  use: "warning",
  dechire: "danger",
  tache: "danger",
};

/**
 * Icône emoji pour chaque état (rendu visuel rapide dans les Select
 * options et la liste d'articles).
 */
export const ETAT_ICONS: Record<EtatVetement, string> = {
  bon: "✅",
  acceptable: "⚠️",
  use: "⚠️",
  dechire: "❌",
  tache: "❌",
};
