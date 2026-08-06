/**
 * OgPressing — Helpers partagés pour la page Tarifs par article (LOT 16)
 * --------------------------------------------------------------------
 * Centralise :
 *   - L'enum TYPES_SERVICES (5 valeurs) avec icône Lucide + label français
 *   - Les types `TarifArticle` (shape renvoyée par /api/admin/tarifs-articles)
 *     et `TarifsByArticle` (map articleId → serviceType → TarifArticle)
 *   - Deux helpers de formatage :
 *       • `formatFCFA(n)` → "1 500 FCFA" (séparateur de milliers espace)
 *       • `parseFCFA(s)` → entier (strip tout sauf les chiffres)
 *
 * ⚠️ Ce module est PUR (aucun import React) → utilisable côté client et
 *    serveur. Les icônes Lucide sont des composants React mais ne sont
 *    importées que via `TYPES_SERVICES` (pas déstructurées au niveau module).
 *
 * Référence spec : LOT 16 — prompt task 4.
 */
import {
  Droplets,
  Wind,
  Sparkles,
  SprayCan,
  Shirt,
  WashingMachine,
  type LucideIcon,
} from "lucide-react";

// ============================================================
// Types de service (enum DB `type_service`)
// ============================================================

/**
 * Les 6 types de prestation du pressing. L'ordre du tableau définit l'ordre
 * d'affichage dans la liste des prix par service (sur chaque carte article).
 *
 * `icon` : icône Lucide illustrant visuellement la catégorie de service.
 *   - lavage          → Droplets (eau)
 *   - repassage       → Wind (vapeur / flux d'air du fer)
 *   - laver_repasser  → Shirt (lavage + repassage combinés)
 *   - nettoyage_sec   → Sparkles (éclat du nettoyage à sec)
 *   - detachage       → SprayCan (spray détachant)
 *   - blanchisserie   → WashingMachine (blanchisserie industrielle)
 *
 * ⚠️  Nécessite la migration DB 021 (ALTER TYPE type_service ADD VALUE
 *     'laver_repasser') pour que la valeur soit acceptée par PostgreSQL.
 */
export const TYPES_SERVICES = [
  { value: "lavage", label: "Lavage", icon: Droplets },
  { value: "repassage", label: "Repassage", icon: Wind },
  { value: "laver_repasser", label: "Laver-Repasser", icon: Shirt },
  { value: "nettoyage_sec", label: "Nettoyage à sec", icon: Sparkles },
  { value: "detachage", label: "Détachage", icon: SprayCan },
  { value: "blanchisserie", label: "Blanchisserie", icon: WashingMachine },
] as const;

export type TypeService = (typeof TYPES_SERVICES)[number]["value"];

/** Label français d'un type de service depuis sa valeur DB. */
export function typeServiceLabel(value: string): string {
  return TYPES_SERVICES.find((t) => t.value === value)?.label ?? value;
}

/** Icône Lucide d'un type de service. Retourne `Sparkles` par défaut. */
export function typeServiceIcon(value: string): LucideIcon {
  return TYPES_SERVICES.find((t) => t.value === value)?.icon ?? Sparkles;
}

// ============================================================
// Types partagés
// ============================================================

/**
 * Un tarif article-spécifique (renvoyé par GET /api/admin/tarifs-articles).
 * Correspond à une ligne de la table `tarifs_articles` (migration 020).
 *
 * `catalogue_article` est la jointure optionnelle sur `catalogue_articles`
 * (présente quand on liste via l'API ; absente si on crée un tarif isolé).
 */
export interface TarifArticle {
  id: string;
  pressing_id: string;
  catalogue_article_id: string;
  type_service: TypeService;
  prix: number;
  duree_estimee: string | null;
  actif: boolean;
  created_at: string;
  updated_at: string;
  catalogue_article?: {
    id: string;
    slug: string;
    nom: string;
    icone_url: string;
    categorie: string;
  } | null;
}

/**
 * Map d'accès rapide : `tarifMap[articleId][serviceType] = TarifArticle`.
 * Construit côté client à partir du tableau `TarifArticle[]` renvoyé par
 * l'API, pour éviter un `.find()` à chaque rendu de carte.
 */
export type TarifsByArticle = Record<
  string,
  Partial<Record<TypeService, TarifArticle>>
>;

// ============================================================
// Formatage FCFA
// ============================================================

/**
 * Formate un entier en "1 500 FCFA" (séparateur de milliers = espace
 * insécable \u00A0). Variante locale du helper `formatFCFA` de
 * `@/lib/utils/format` — conservée ici pour respecter le contrat du
 * module (aucun import externe requis).
 *
 * @example
 *   formatFCFA(1500)      → "1 500 FCFA"
 *   formatFCFA(0)         → "0 FCFA"
 *   formatFCFA(1000000)   → "1 000 000 FCFA"
 *   formatFCFA(null)      → "0 FCFA"
 */
export function formatFCFA(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "0 FCFA";
  const entier = Math.trunc(n);
  const signe = entier < 0 ? "-" : "";
  const abs = Math.abs(entier);
  const avecSeparateurs = abs
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, "\u00A0");
  return `${signe}${avecSeparateurs}\u00A0FCFA`;
}

/**
 * Parse une saisie utilisateur (ex : "1 500", "1500 FCFA", "  2000 ") en
 * entier. Retourne 0 si la chaîne ne contient aucun chiffre.
 *
 * @example
 *   parseFCFA("1500")        → 1500
 *   parseFCFA("1 500")       → 1500
 *   parseFCFA("1 500 FCFA")  → 1500
 *   parseFCFA("")            → 0
 *   parseFCFA("abc")         → 0
 */
export function parseFCFA(s: string | null | undefined): number {
  if (!s) return 0;
  // On garde uniquement les chiffres (le signe négatif n'a pas de sens
  // pour un prix de pressing). Permet aussi de coller "1 500 FCFA" depuis
  // un copier-coller sans casser le parseur.
  const cleaned = s.replace(/[^\d]/g, "");
  if (cleaned === "") return 0;
  const n = parseInt(cleaned, 10);
  return Number.isNaN(n) ? 0 : n;
}
