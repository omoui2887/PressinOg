/**
 * <ProductGrid /> — Grille filtrée des articles du catalogue (vue article-centric).
 * =================================================================================
 *
 * AFFICHE UNE SEULE CARTE PAR ARTICLE DU CATALOGUE (33 max), au lieu du produit
 * cartésien service × article (165 cartes). Le prix affiché sur chaque carte
 * correspond au tarif de l'article pour le service actuellement sélectionné
 * dans la <CategoryBar /> du bas :
 *
 *   - Si `activeCategorie === "tous"` : on choisit la 1ère variante disponible
 *     pour chaque article (priorité : lavage → repassage → laver-repasser →
 *     séchage → nettoyage à sec), afin qu'une carte ait toujours un prix
 *     pertinent à afficher en mode « Tous ».
 *
 *   - Si `activeCategorie === "lavage"` (ou autre service spécifique) : on
 *     cherche la variante dont `article.categorie === activeCategorie`. Si
 *     aucune variante ne correspond (le pressing n'offre pas ce service pour
 *     cet article), la carte est affichée en état désactivé avec « — » comme
 *     prix, pour que l'utilisateur comprenne qu'il n'y a pas de tarif pour
 *     ce couple (article × service).
 *
 * SYNCHRONISATION AVEC LE MODULE « TARIFS PAR ARTICLE » :
 *   Les prix affichés sont ceux retournés par /api/admin/tarifs-articles
 *   (tarifs spécifiques par article × type_service) avec fallback sur le prix
 *   générique du service. Lorsque l'administrateur modifie un tarif dans le
 *   module /admin/tarifs, la prochaine fois que le POS recharge les données
 *   (au focus de la fenêtre, au clic sur le bouton refresh, ou à la navigation),
 *   le nouveau prix est automatiquement reflété ici.
 *
 * Filtres combinés (ET logique) :
 *   - `activeCatalogueCategorie` (catégorie du catalogue : Vêtements, Linge, …)
 *   - `activeCategorie`         (type de service : lavage, repassage, …)
 *   - recherche textuelle       (sur catalogue_nom + catalogue_slug)
 */
"use client";
import { memo, useMemo } from "react";
import { SearchX } from "lucide-react";
import type { PosArticle, PosCategorieId } from "@/lib/pos/types";
import { ProductCard } from "./product-card";

interface ProductGridProps {
  articles: PosArticle[];
  query: string;
  /** Filtre par type de service (dimension 1). */
  activeCategorie: PosCategorieId;
  /** Filtre par catégorie du catalogue (dimension 2). */
  activeCatalogueCategorie: string | "tous";
  quantiteParArticle: Record<string, number>;
  flashId: string | null;
  onAdd: (article: PosArticle) => void;
}

/** Normalise une chaîne (minuscules, sans accents). */
function normalize(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Priorité d'affichage en mode « Tous » : on préfère toujours montrer le
 * tarif Lavage (le plus courant), puis Repassage, puis Laver-Repasser, etc.
 * Cela donne une cohérence visuelle : toutes les cartes affichent un prix
 * Lavage si disponible, plutôt qu'un mélange aléatoire de services.
 */
const CATEGORIE_PRIORITY: Exclude<PosCategorieId, "tous">[] = [
  "lavage",
  "repassage",
  "laver-repasser",
  "sechage",
  "nettoyage_sec",
];

/** Libellé court d'un service pour le tooltip / aria-label de la carte. */
const SERVICE_LABEL: Record<Exclude<PosCategorieId, "tous">, string> = {
  lavage: "Lavage",
  repassage: "Repassage",
  "laver-repasser": "Laver-Repasser",
  sechage: "Séchage",
  nettoyage_sec: "Nettoyage à sec",
};

interface ResolvedCard {
  /** Article choisi pour l'affichage (variante correspondant au service sélectionné). */
  article: PosArticle;
  /** true si un prix existe (variante trouvée), false sinon (carte désactivée). */
  hasPrice: boolean;
  /** Libellé court du service associé au prix affiché. */
  serviceLabel: string;
}

function ProductGridImpl({
  articles,
  query,
  activeCategorie,
  activeCatalogueCategorie,
  quantiteParArticle,
  flashId,
  onAdd,
}: ProductGridProps) {
  const q = normalize(query.trim());

  /**
   * Construit la liste des cartes à afficher : une par article unique.
   *
   * Étapes :
   *   1. Filtrer par catégorie de catalogue + recherche textuelle
   *      (on garde toutes les variantes service × article qui matchent).
   *   2. Grouper par `catalogue_article_id` (Map<id, PosArticle[]>).
   *   3. Pour chaque groupe, choisir la variante à afficher selon
   *      `activeCategorie` :
   *      - "tous" → 1ère variante selon la priorité CATEGORIE_PRIORITY
   *      - "lavage" (ou autre) → variante dont `categorie === activeCategorie`,
   *        ou aucune (carte désactivée avec « — »).
   */
  const cards = useMemo<ResolvedCard[]>(() => {
    // Étape 1 : filtrer
    const filtered = articles.filter((a) => {
      if (
        activeCatalogueCategorie !== "tous" &&
        a.catalogue_categorie !== activeCatalogueCategorie
      ) {
        return false;
      }
      if (!q) return true;
      return (
        normalize(a.catalogue_nom).includes(q) ||
        normalize(a.catalogue_slug).includes(q) ||
        normalize(a.service_nom).includes(q)
      );
    });

    // Étape 2 : grouper par catalogue_article_id
    const grouped = new Map<string, PosArticle[]>();
    for (const a of filtered) {
      const key = a.catalogue_article_id;
      if (!key) continue;
      let bucket = grouped.get(key);
      if (!bucket) {
        bucket = [];
        grouped.set(key, bucket);
      }
      bucket.push(a);
    }

    // Étape 3 : choisir la variante par article
    const out: ResolvedCard[] = [];
    for (const [, variants] of grouped) {
      if (!variants.length) continue;
      let chosen: PosArticle | undefined;
      let label: string;

      if (activeCategorie === "tous") {
        // Mode « Tous » : priorité lavage > repassage > laver-repasser > …
        for (const cat of CATEGORIE_PRIORITY) {
          chosen = variants.find((v) => v.categorie === cat);
          if (chosen) break;
        }
        if (!chosen) chosen = variants[0];
        label = SERVICE_LABEL[chosen.categorie] ?? chosen.service_nom;
      } else {
        // Mode service spécifique : cherche la variante correspondante
        chosen = variants.find((v) => v.categorie === activeCategorie);
        label = SERVICE_LABEL[activeCategorie] ?? "Service";
      }

      if (chosen) {
        out.push({
          article: chosen,
          hasPrice: activeCategorie === "tous" || !!chosen,
          serviceLabel: label,
        });
      }
      // Si `chosen` est undefined (service spécifique sans variante),
      // on n'affiche pas la carte — l'utilisateur ne peut pas commander
      // un service qui n'existe pas pour cet article.
    }
    return out;
  }, [articles, q, activeCategorie, activeCatalogueCategorie]);

  if (!cards.length) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-8 text-center text-[var(--pos-text-muted)]">
        <SearchX className="h-8 w-8" />
        <p className="text-sm">Aucun article trouvé</p>
        <p className="text-xs">
          Modifiez la recherche ou la catégorie, ou configurez des services
          dans <strong>Tarifs par article</strong>.
        </p>
      </div>
    );
  }

  return (
    <div className="pos-scroll grid flex-1 content-start grid-cols-[repeat(auto-fill,minmax(108px,1fr))] gap-2 overflow-y-auto p-2">
      {cards.map((c) => (
        <ProductCard
          key={c.article.catalogue_article_id}
          article={c.article}
          hasPrice={c.hasPrice}
          serviceLabel={c.serviceLabel}
          quantiteDansPanier={
            quantiteParArticle[c.article.id] ?? 0
          }
          flash={flashId === c.article.id}
          onAdd={() => onAdd(c.article)}
        />
      ))}
    </div>
  );
}

export const ProductGrid = memo(ProductGridImpl);
