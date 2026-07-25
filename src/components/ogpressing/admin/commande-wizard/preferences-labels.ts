/**
 * OgPressing — Labels & helpers pour `PreferencesLavage`
 * -------------------------------------------------------
 * Centralise le mappage des clés/valeurs du JSONB `clients.preferences_lavage`
 * vers des libellés FR affichables (Étape 1 du wizard commande, fiche client,
 * étiquettes de production…).
 *
 * Le type `PreferencesLavage` est importé depuis `./state` (source de vérité
 * unique du schéma — partagée avec l'API `PATCH /api/admin/clients/[id]`).
 */
import type { PreferencesLavage } from "./state";

// ============================================================
// Tables de libellés (valeur brute → libellé FR)
// ============================================================

export const DETERGENT_LABELS: Record<string, string> = {
  classique: "Classique",
  bio: "Bio",
  sans_phosphore: "Sans phosphore",
};

export const TEMPERATURE_LABELS: Record<string, string> = {
  froid: "Froid",
  tiede: "Tiède",
  chaud: "Chaud",
};

export const ADOUCISSANT_LABELS: Record<string, string> = {
  oui: "Oui",
  non: "Non",
};

export const DETACHAGE_LABELS: Record<string, string> = {
  oui: "Oui",
  non: "Non",
};

export const PRESSING_INTENSIF_LABELS: Record<string, string> = {
  oui: "Oui",
  non: "Non",
};

export const REPASSAGE_LABELS: Record<string, string> = {
  standard: "Standard",
  leger: "Léger",
  aucun: "Aucun",
};

// ============================================================
// Icônes emoji par clé (rendu compact côté wizard)
// ============================================================

export const PREF_ICONS: Record<keyof PreferencesLavage, string> = {
  detergent: "🧴",
  temperature: "🌡️",
  adoucissant: "✨",
  detachage_prealable: "🧽",
  pressing_intensif: "💪",
  repassage: "👔",
};

// ============================================================
// Helpers de formatage
// ============================================================

/**
 * Métadonnée d'affichage d'une préférence : clé, icône emoji, libellé du
 * champ (ex : "Détergent") et valeur libellée (ex : "Bio").
 */
export interface PreferenceItem {
  key: keyof PreferencesLavage;
  icon: string;
  label: string;
  value: string;
}

/** Libellé court du champ (ex : detergent → "Détergent"). */
const FIELD_LABELS: Record<keyof PreferencesLavage, string> = {
  detergent: "Détergent",
  temperature: "Température",
  adoucissant: "Adoucissant",
  detachage_prealable: "Détachage préalable",
  pressing_intensif: "Pressing intensif",
  repassage: "Repassage",
};

/** Table de libellés associée à chaque clé (valeur → libellé FR). */
const VALUE_LABELS_BY_KEY: Record<keyof PreferencesLavage, Record<string, string>> = {
  detergent: DETERGENT_LABELS,
  temperature: TEMPERATURE_LABELS,
  adoucissant: ADOUCISSANT_LABELS,
  detachage_prealable: DETACHAGE_LABELS,
  pressing_intensif: PRESSING_INTENSIF_LABELS,
  repassage: REPASSAGE_LABELS,
};

/**
 * Convertit un objet `PreferencesLavage` en liste de `PreferenceItem`
 * (uniquement pour les clés définies et non nulles).
 *
 * @example
 *   preferencesToList({ detergent: "bio", temperature: "froid" })
 *   // → [
 *   //   { key: "detergent", icon: "🧴", label: "Détergent", value: "Bio" },
 *   //   { key: "temperature", icon: "🌡️", label: "Température", value: "Froid" },
 *   //   ]
 */
export function preferencesToList(
  prefs: PreferencesLavage | null | undefined
): PreferenceItem[] {
  if (!prefs) return [];
  const items: PreferenceItem[] = [];
  const keys = Object.keys(prefs) as (keyof PreferencesLavage)[];

  for (const key of keys) {
    const raw = prefs[key];
    if (raw === undefined || raw === null) continue;
    const valueLabel = VALUE_LABELS_BY_KEY[key]?.[raw] ?? raw;
    items.push({
      key,
      icon: PREF_ICONS[key],
      label: FIELD_LABELS[key],
      value: valueLabel,
    });
  }
  return items;
}

/**
 * Formate un objet `PreferencesLavage` en une chaîne lisible résumant les
 * préférences (ex : "Détergent : Bio, Température : Froid, Adoucissant : Oui").
 *
 * Renvoie "" si l'objet est null/undefined ou ne contient aucune clé définie.
 */
export function formatPreferencesLavage(
  prefs: PreferencesLavage | null | undefined
): string {
  const items = preferencesToList(prefs);
  if (items.length === 0) return "";
  return items.map((it) => `${it.label} : ${it.value}`).join(", ");
}

/**
 * Indique si l'objet `PreferencesLavage` contient au moins une préférence
 * définie (utile pour conditionner l'affichage de l'encart dans le wizard).
 */
export function hasPreferences(
  prefs: PreferencesLavage | null | undefined
): boolean {
  if (!prefs) return false;
  return preferencesToList(prefs).length > 0;
}
