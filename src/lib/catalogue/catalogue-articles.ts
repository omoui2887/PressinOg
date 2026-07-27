/**
 * OgPressing — Helpers pour le catalogue d'articles (LOT 15.1)
 * -----------------------------------------------------------
 * Centralise :
 *   - Le type `CatalogueArticle` (shape DB de la table `catalogue_articles`)
 *   - Les 9 catégories du catalogue initial (ordonnées, avec icône lucide)
 *   - Le mapping `slug catalogue → type_vetement_legacy` (backfill inverse
 *     utilisé par l'API POST /api/admin/commandes pour rester compatible
 *     avec les anciens composants qui lisent encore `type_vetement_legacy`
 *     comme commande-print.ts, avant la migration complète de l'affichage).
 *   - Un helper `iconeUrlForSlug(slug)` construisant l'URL standardisée.
 *
 * Utilisé par :
 *   - `ArticleCatalogPicker` (PROMPT 15.2)
 *   - `step-articles.tsx` (intégration PROMPT 15.3)
 *   - `commande-print.ts` + `step-confirmation.tsx` (affichage du nom)
 *   - API `/api/admin/commandes` (POST) et `/api/admin/commandes/[id]` (GET)
 *   - Page Super Admin `/super-admin/catalogue` (PROMPT 15.4)
 *
 * ⚠️ Le catalogue est GLOBAL (commun à tous les pressings, non filtré par
 *    pressing_id). La source de vérité est la table `catalogue_articles`
 *    côté DB. Les constantes ci-dessous ne sont que des helpers d'UI et
 *    de mapping ; la liste réelle des articles est chargée dynamiquement
 *    via `/api/public/catalogue-articles` ou `/api/super-admin/catalogue`.
 */
import {
  Shirt,
  BedDouble,
  Sparkles,
  Briefcase,
  Trophy,
  Link as LinkIcon,
  UtensilsCrossed,
  Sofa,
  Package,
  type LucideIcon,
} from "lucide-react";

import type { TypeVetement } from "@/lib/types/database.types";

// ============================================================
// Type principal
// ============================================================

/**
 * Article du catalogue global. Correspond à une ligne de la table
 * `catalogue_articles` (migration 014).
 *
 * `id` est un UUID généré côté DB. `slug` est l'identifiant technique
 * stable (ex: 'costume-ceremonie') utilisé pour construire `icone_url`
 * et pour le reverse-mapping vers `type_vetement_legacy`.
 */
export interface CatalogueArticle {
  id: string;
  slug: string;
  nom: string;
  categorie: string;
  icone_url: string;
  actif: boolean;
  ordre_affichage: number;
  created_at?: string;
  updated_at?: string;
}

/**
 * Version étendue retournée par l'API quand on a aussi besoin du nom
 * (ex: GET /api/admin/commandes/[id] renvoie les articles avec leur
 * catalogue_article_nom joint).
 */
export interface CatalogueArticleWithNom extends CatalogueArticle {
  catalogue_article_nom?: string;
}

// ============================================================
// Catégories du catalogue initial (9)
// ============================================================

/**
 * Les 9 catégories du catalogue initial OgPressing. L'ordre ici est
 * utilisé pour le tri côté picker quand on n'a pas d'`ordre_affichage`
 * (et aussi pour l'affichage des onglets de filtre en haut du picker).
 *
 * Le champ `icon` est le composant lucide-react à afficher à côté du
 * nom de la catégorie dans les onglets/filtres.
 *
 * ⚠️ Cette liste est un aide-UI statique. La table `catalogue_articles`
 *    peut contenir d'autres catégories ajoutées dynamiquement par le
 *    Super Admin (champ `categorie` en TEXT libre). Le picker gère
 *    aussi ces catégories imprévues (onglet générique "Autres" ou
 *    onglet dynamique avec le nom saisi).
 */
export interface CatalogueCategorieDef {
  nom: string;
  icon: LucideIcon;
}

export const CATALOGUE_CATEGORIES: CatalogueCategorieDef[] = [
  { nom: "Vêtements traités", icon: Shirt },
  { nom: "Linge de maison", icon: BedDouble },
  { nom: "Cuir et fourrure", icon: Sparkles },
  { nom: "Travail et uniformes", icon: Briefcase },
  { nom: "Textiles spéciaux", icon: Trophy },
  { nom: "Accessoires de mode", icon: LinkIcon },
  { nom: "Petits textiles & linge de table", icon: UtensilsCrossed },
  { nom: "Maison et décoration", icon: Sofa },
  { nom: "Articles spéciaux", icon: Package },
];

/**
 * Liste des noms de catégories (sans les icônes). Utilisé pour le
 * dropdown de catégorie dans le formulaire d'ajout/édition d'article
 * côté Super Admin.
 */
export const CATALOGUE_CATEGORIES_NOMS: string[] = CATALOGUE_CATEGORIES.map(
  (c) => c.nom
);

/**
 * Retourne l'icône lucide associée à une catégorie. Si la catégorie
 * n'est pas dans la liste initiale (catégorie personnalisée ajoutée
 * par le Super Admin), retourne `Package` (icône générique carton).
 */
export function getIconForCategorie(categorie: string): LucideIcon {
  const def = CATALOGUE_CATEGORIES.find((c) => c.nom === categorie);
  return def?.icon ?? Package;
}

// ============================================================
// Mapping slug catalogue → type_vetement_legacy (backfill inverse)
// ============================================================

/**
 * Mapping inverse utilisé par l'API POST /api/admin/commandes pour
 * remplir `type_vetement_legacy` (colonne historique conservée par
 * la migration 014) à partir du slug du catalogue sélectionné.
 *
 * Ce mapping permet aux anciens composants qui n'ont pas encore été
 * migrés (ex: lecture de `type_vetement_legacy` au lieu de JOIN
 * catalogue_articles) de continuer à afficher un libellé correct.
 *
 * Mapping :
 *   - Slugs commençant par 'chemise'            → chemise
 *   - Slugs contenant 'robe'                    → robe
 *   - Slugs contenant 'costume-ceremonie'       → costume
 *   - Slugs contenant 'manteau' ou 'blouson'    → costume (fallback costume)
 *   - Slugs contenant 'parure-lit'              → drap
 *   - Slugs contenant 'serviette' / 'peignoir'  → drap (fallback linge maison)
 *   - Slugs contenant 'cravate' / 'foulard'     → autre
 *   - Sinon                                     → autre
 *
 * ⚠️ Ce mapping est une approximation : il n'existe pas de bijection
 *    parfaite entre 33 articles et 7 enums. L'affichage définitif
 *    doit toujours utiliser `catalogue_article.nom` (via JOIN).
 */
export function slugToLegacyTypeVetement(slug: string): TypeVetement {
  if (!slug) return "autre";
  if (slug === "chemise" || slug.startsWith("chemise-")) return "chemise";
  if (slug.includes("robe")) return "robe";
  if (slug === "costume-ceremonie" || slug.includes("costume")) return "costume";
  if (
    slug.includes("manteau") ||
    slug.includes("blouson") ||
    slug.includes("fourrure")
  )
    return "costume";
  if (slug.includes("parure-lit") || slug.includes("drap")) return "drap";
  if (slug.includes("couverture")) return "couverture";
  if (
    slug.includes("serviette") ||
    slug.includes("peignoir") ||
    slug.includes("rideau") ||
    slug.includes("nappe") ||
    slug.includes("houssse-coussin") ||
    slug.includes("tapis") ||
    slug.includes("decoration")
  )
    return "drap";
  return "autre";
}

// ============================================================
// Helper construction icone_url
// ============================================================

/**
 * Construit l'URL standardisée de l'icône pour un slug donné.
 * Convention : '/images/articles/{slug}.png'
 *
 * Les fichiers PNG correspondants doivent être déposés dans
 * `/public/images/articles/` du projet Next.js. Si le fichier
 * n'existe pas encore (assets manquants), le composant
 * `ArticleCatalogPicker` affiche l'icône lucide "Shirt" en repli
 * via onError sur next/image.
 */
export function iconeUrlForSlug(slug: string): string {
  return `/images/articles/${slug}.png`;
}

// ============================================================
// Slugs réservés (constants)
// ============================================================

/**
 * Slug du catalogue utilisé comme fallback ultime (backfill, valeur
 * par défaut si un article_vetement n'a pas de catalogue_article_id
 * renseigné pour une raison quelconque). Doit exister en base.
 */
export const CATALOGUE_SLUG_FALLBACK = "chemise";

/**
 * Slugs initiaux du catalogue (33). Utilisé pour :
 *   - valider qu'un slug reçu de l'UI est bien un slug connu
 *   - générer la liste statique côté tests
 *
 * ⚠️ Cette liste est STATIQUE et reflète l'état du catalogue à
 *    l'installation (migration 014). Le Super Admin peut ajouter
 *    d'autres articles via la page /super-admin/catalogue — ces
 *    nouveaux articles ne sont PAS dans cette liste. Ne pas
 *    utiliser pour valider l'existence d'un article : faire un
 *    SELECT côté API.
 */
export const CATALOGUE_SLUGS_INITIAUX: readonly string[] = [
  // Vêtements traités (5)
  "costume-ceremonie",
  "chemise",
  "robe-textile-delicat",
  "pull-maille",
  "manteau-doudoune",
  // Linge de maison (4)
  "rideau-voilage",
  "nappe-chemin-table",
  "parure-lit",
  "serviette-peignoir",
  // Cuir et fourrure (3)
  "blouson-cuir",
  "manteau-fourrure",
  "bottes-accessoires-cuir",
  // Travail et uniformes (3)
  "costume-medical",
  "uniforme-hotellerie",
  "bleu-travail-securite",
  // Textiles spéciaux (3)
  "costume-danse-sport",
  "sacs-bagages",
  "jouet-peluche",
  // Accessoires de mode (4)
  "cravate-foulard",
  "ceinture-tissu",
  "gants-cuir",
  "chapeau-casquette",
  // Petits textiles & linge de table (3)
  "mouchoir-tissu",
  "set-de-table",
  "serviette-table",
  // Maison et décoration (4)
  "houssse-coussin",
  "chemin-de-table-deco",
  "tapis-bain",
  "decoration-murale-tissu",
  // Articles spéciaux (4)
  "sac-main-tissu",
  "chaussettes-luxe",
  "accessoire-animaux",
  "houssse-vetement-perso",
] as const;
