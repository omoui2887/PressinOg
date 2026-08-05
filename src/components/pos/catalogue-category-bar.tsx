/**
 * <CatalogueCategoryBar /> — Barre de filtre par catégorie du catalogue.
 * ===================================================================
 * Affiche "Tous" + les 9 catégories du catalogue global (Vêtements traités,
 * Linge de maison, Cuir et fourrure, etc.). Horizontale et scrollable.
 *
 * Indépendante de la <CategoryBar /> (qui filtre par type de service) :
 * les deux barres co-existent comme deux dimensions de filtrage :
 *   - CatalogueCategoryBar → "Quel type de linge ?" (catégorie catalogue)
 *   - CategoryBar          → "Quel service appliquer ?" (lavage, repassage…)
 *
 * Style cohérent avec la CategoryBar existante (variables CSS --pos-* et
 * classe .pos-cat-btn définie dans globals.css).
 */
"use client";
import { memo } from "react";
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
  LayoutGrid,
  type LucideIcon,
} from "lucide-react";
import type { PosCatalogueCategorie } from "@/lib/pos/types";

const ICONS: Record<PosCatalogueCategorie["icon"], LucideIcon> = {
  shirt: Shirt,
  bed: BedDouble,
  sparkles: Sparkles,
  briefcase: Briefcase,
  trophy: Trophy,
  link: LinkIcon,
  utensils: UtensilsCrossed,
  sofa: Sofa,
  package: Package,
};

interface CatalogueCategoryBarProps {
  categories: PosCatalogueCategorie[];
  /** Catégorie active : "tous" ou un id de catégorie (le nom lui-même). */
  active: string | "tous";
  /** Sélectionne une catégorie ; re-cliquer sur l'active revient à "tous". */
  onSelect: (id: string | "tous") => void;
}

function CatalogueCategoryBarImpl({
  categories,
  active,
  onSelect,
}: CatalogueCategoryBarProps) {
  const handleSelect = (id: string | "tous") => {
    // Toggle : re-cliquer sur la catégorie active revient à "tous"
    // (parité avec le comportement de CategoryBar via le store).
    onSelect(active === id ? "tous" : id);
  };

  return (
    <div
      role="tablist"
      aria-label="Filtrer par catégorie de catalogue"
      className="pos-scroll flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-[var(--pos-border)] bg-[var(--pos-surface)] px-2 py-1.5"
    >
      <button
        type="button"
        role="tab"
        onClick={() => handleSelect("tous")}
        data-active={active === "tous"}
        aria-selected={active === "tous"}
        className="pos-cat-btn flex min-w-[64px] flex-col items-center gap-0.5 rounded-md px-2 py-1.5"
      >
        <LayoutGrid className="h-4 w-4" aria-hidden />
        <span className="text-[10px] font-medium leading-tight">Tous</span>
      </button>
      {categories.map((c) => {
        const Icon = ICONS[c.icon] ?? Package;
        const isActive = active === c.id;
        return (
          <button
            key={c.id}
            type="button"
            role="tab"
            onClick={() => handleSelect(c.id)}
            data-active={isActive}
            aria-selected={isActive}
            className="pos-cat-btn flex min-w-[64px] flex-col items-center gap-0.5 rounded-md px-2 py-1.5"
            title={c.label}
          >
            <Icon className="h-4 w-4" aria-hidden />
            <span className="line-clamp-1 max-w-[88px] text-[10px] font-medium leading-tight">
              {c.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export const CatalogueCategoryBar = memo(CatalogueCategoryBarImpl);
