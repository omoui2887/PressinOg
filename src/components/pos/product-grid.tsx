/**
 * <ProductGrid /> — Grille filtrée des articles du catalogue.
 * Filtre selon DEUX dimensions indépendantes + recherche textuelle :
 *   - `activeCategorie`         (type de service : lavage, repassage, …)
 *   - `activeCatalogueCategorie` (catégorie du catalogue : Vêtements, Linge, …)
 * La recherche (insensible aux accents/casse) s'applique sur le nom du
 * service, le nom de l'article et le slug du catalogue.
 */
"use client";
import { memo } from "react";
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
  const filtered = articles.filter((a) => {
    if (activeCategorie !== "tous" && a.categorie !== activeCategorie)
      return false;
    if (
      activeCatalogueCategorie !== "tous" &&
      a.catalogue_categorie !== activeCatalogueCategorie
    )
      return false;
    if (!q) return true;
    return (
      normalize(a.service_nom).includes(q) ||
      normalize(a.catalogue_nom).includes(q) ||
      normalize(a.catalogue_slug).includes(q)
    );
  });

  if (!filtered.length) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-8 text-center text-[var(--pos-text-muted)]">
        <SearchX className="h-8 w-8" />
        <p className="text-sm">Aucun article trouvé</p>
        <p className="text-xs">Modifiez la recherche ou la catégorie.</p>
      </div>
    );
  }

  return (
    <div className="pos-scroll grid flex-1 content-start grid-cols-[repeat(auto-fill,minmax(108px,1fr))] gap-2 overflow-y-auto p-2">
      {filtered.map((a) => (
        <ProductCard
          key={a.id}
          article={a}
          quantiteDansPanier={quantiteParArticle[a.id] ?? 0}
          flash={flashId === a.id}
          onAdd={() => onAdd(a)}
        />
      ))}
    </div>
  );
}

export const ProductGrid = memo(ProductGridImpl);
