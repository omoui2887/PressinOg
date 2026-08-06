/**
 * <ProductGrid /> — Grille filtrée des articles du catalogue (vue article-centric, sans prix).
 * =================================================================================
 *
 * AFFICHE UNE SEULE CARTE PAR ARTICLE DU CATALOGUE (33 max). Aucun prix n'est
 * affiché sur la carte : un clic ouvre la boîte de dialogue <ArticleActionsDialog />
 * qui liste les actions possibles (Lavage, Repassage, Laver-Repasser, Nettoyage
 * à sec, Détachage, etc.) avec leur prix — prix configurés par l'admin dans le
 * module « Tarifs par articles ».
 *
 * FILTRES (ET logique) :
 *   - `activeCatalogueCategorie` (catégorie du catalogue : Vêtements, Linge, …)
 *   - recherche textuelle (sur catalogue_nom + catalogue_slug + service_nom)
 *
 * SYNCHRONISATION AVEC LE MODULE « TARIFS PAR ARTICLE » :
 *   Les variantes (une par service disponible pour l'article) sont passées au
 *   parent via `onOpenActions(article, variants)`. Les prix de chaque variante
 *   proviennent déjà de /api/admin/tarifs-articles (avec fallback sur service.prix)
 *   côté data.ts. Lorsque l'admin modifie un tarif, le prochain rafraîchissement
 *   du POS (focus, bouton refresh, navigation) reflète automatiquement le changement.
 */
"use client";
import { memo, useMemo } from "react";
import { SearchX } from "lucide-react";
import type { PosArticle } from "@/lib/pos/types";
import { ProductCard } from "./product-card";

interface ProductGridProps {
  articles: PosArticle[];
  query: string;
  /** Filtre par catégorie du catalogue (Vêtements, Linge, …). */
  activeCatalogueCategorie: string | "tous";
  /** Quantité par article (toutes actions confondues) — pour le badge compteur. */
  quantiteParArticle: Record<string, number>;
  flashId: string | null;
  /** Appelé quand l'utilisateur clique sur une carte (ouvre le dialogue d'action). */
  onOpenActions: (article: PosArticle, variants: PosArticle[]) => void;
}

/** Normalise une chaîne (minuscules, sans accents). */
function normalize(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

interface ResolvedCard {
  /** Article représentatif (1ère variante) pour l'image et le nom. */
  article: PosArticle;
  /** Toutes les variantes (une par service disponible pour cet article). */
  variants: PosArticle[];
  /** Quantité totale au panier pour cet article (toutes actions confondues). */
  quantite: number;
}

function ProductGridImpl({
  articles,
  query,
  activeCatalogueCategorie,
  quantiteParArticle,
  flashId,
  onOpenActions,
}: ProductGridProps) {
  const q = normalize(query.trim());

  /**
   * Construit la liste des cartes à afficher : une par article unique
   * (dédoublonné par catalogue_article_id), avec toutes ses variantes.
   */
  const cards = useMemo<ResolvedCard[]>(() => {
    // Étape 1 : filtrer par catégorie + recherche textuelle
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

    // Étape 2 : grouper par catalogue_article_id → Map<id, PosArticle[]>
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

    // Étape 3 : pour chaque groupe, calculer la quantité totale au panier
    // (somme des quantités de toutes les variantes de cet article).
    const out: ResolvedCard[] = [];
    for (const [, variants] of grouped) {
      if (!variants.length) continue;
      const quantite = variants.reduce(
        (sum, v) => sum + (quantiteParArticle[v.id] ?? 0),
        0
      );
      out.push({
        article: variants[0],
        variants,
        quantite,
      });
    }
    return out;
  }, [articles, q, activeCatalogueCategorie, quantiteParArticle]);

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
          quantiteDansPanier={c.quantite}
          flash={flashId === c.article.id}
          onOpenActions={() => onOpenActions(c.article, c.variants)}
        />
      ))}
    </div>
  );
}

export const ProductGrid = memo(ProductGridImpl);
