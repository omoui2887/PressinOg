/**
 * OgPressing — Helpers partagés pour la page Catalogue (LOT 15.4)
 * ---------------------------------------------------------------
 * Fournit :
 *   - Le type `CatalogueArticle` (re-exporté depuis `@/lib/catalogue/catalogue-articles`
 *     pour un import unique depuis les composants de la page Super Admin).
 *   - Le type `CatalogueArticleRow` (shape allégée utilisée pour l'affichage
 *     de la liste ; identique à `CatalogueArticle` pour l'instant mais
 *     découplé, pour pouvoir le restreindre plus tard sans impacter l'API).
 *   - `CATEGORIE_LABELS` : map categorie → libellé affiché (identity pour
 *     l'instant, mais centralisé pour une future personnalisation i18n).
 *   - `groupArticlesByCategorie(articles)` : regroupe les articles par
 *     categorie, en respectant l'ordre de `CATALOGUE_CATEGORIES` (les 9
 *     catégories initiales), puis les catégories inconnues triées par ordre
 *     alphabétique à la fin.
 *
 * Utilisé par :
 *   - `catalogue-page.tsx` (orchestrateur client)
 *   - `catalogue-form.tsx` (labels de catégories)
 */
import {
  CATALOGUE_CATEGORIES,
  type CatalogueArticle,
} from "@/lib/catalogue/catalogue-articles";

// Re-export du type pour un import unique depuis les composants de la page.
export type { CatalogueArticle };

/**
 * Shape utilisée pour l'affichage dans la liste. Pour l'instant identique
 * à `CatalogueArticle`, mais découplé afin de pouvoir restreindre les champs
 * affichés sans casser l'API ni les autres consommateurs de `CatalogueArticle`.
 */
export type CatalogueArticleRow = CatalogueArticle;

/**
 * Map categorie → libellé affiché. Pour l'instant identity (le nom de la
 * catégorie en base est déjà le libellé FR). Centralisé ici pour permettre
 * une future personnalisation i18n ou un affichage plus convivialial sans
 * toucher aux composants.
 */
export const CATEGORIE_LABELS: Record<string, string> =
  Object.fromEntries(CATALOGUE_CATEGORIES.map((c) => [c.nom, c.nom]));

/**
 * Renvoie le libellé d'affichage d'une catégorie. Si la catégorie n'est pas
 * dans `CATEGORIE_LABELS` (catégorie personnalisée ajoutée par le Super
 * Admin), renvoie la catégorie telle quelle (qui est déjà un libellé FR
 * libre saisi par l'admin).
 */
export function labelForCategorie(categorie: string): string {
  return CATEGORIE_LABELS[categorie] ?? categorie;
}

/**
 * Regroupe les articles par categorie, en respectant l'ordre de
 * `CATALOGUE_CATEGORIES` (les 9 catégories initiales). Les catégories
 * personnalisées (non dans la liste initiale) sont ajoutées à la fin,
 * triées par ordre alphabétique pour un affichage stable.
 *
 * @param articles Liste complète des articles (actifs + inactifs)
 * @returns Tableau de groupes `{ categorie, articles }` triés
 */
export function groupArticlesByCategorie(
  articles: CatalogueArticle[]
): Array<{ categorie: string; articles: CatalogueArticle[] }> {
  // Index des catégories initiales pour préserver l'ordre défini.
  const knownOrder = new Map(
    CATALOGUE_CATEGORIES.map((c, i) => [c.nom, i] as const)
  );

  // Map categorie → articles (préserve l'ordre d'insertion pour les
  // catégories connues ; les inconnues seront collectées séparément).
  const groupedKnown = new Map<string, CatalogueArticle[]>();
  for (const c of CATALOGUE_CATEGORIES) {
    groupedKnown.set(c.nom, []);
  }
  const groupedUnknown = new Map<string, CatalogueArticle[]>();

  for (const article of articles) {
    const cat = article.categorie;
    if (knownOrder.has(cat)) {
      groupedKnown.get(cat)!.push(article);
    } else {
      const arr = groupedUnknown.get(cat) ?? [];
      arr.push(article);
      groupedUnknown.set(cat, arr);
    }
  }

  // Construit le résultat : catégories connues dans l'ordre (même si vides,
  // on ne les inclut que si elles ont au moins un article), puis catégories
  // inconnues triées alphabétiquement.
  const result: Array<{ categorie: string; articles: CatalogueArticle[] }> = [];

  for (const c of CATALOGUE_CATEGORIES) {
    const items = groupedKnown.get(c.nom) ?? [];
    if (items.length > 0) {
      result.push({ categorie: c.nom, articles: items });
    }
  }

  const unknownCats = Array.from(groupedUnknown.keys()).sort((a, b) =>
    a.localeCompare(b, "fr")
  );
  for (const cat of unknownCats) {
    const items = groupedUnknown.get(cat) ?? [];
    if (items.length > 0) {
      result.push({ categorie: cat, articles: items });
    }
  }

  return result;
}
