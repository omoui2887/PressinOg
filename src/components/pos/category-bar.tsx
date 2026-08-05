/**
 * <CategoryBar /> — Barre des catégories (bas du panneau gauche).
 * Toujours visible. Inclut "Tous" + les catégories POS.
 */
"use client";
import { memo } from "react";
import { LayoutGrid } from "lucide-react";
import type { PosCategorie, PosCategorieId } from "@/lib/pos/types";
import { CategoryButton } from "./category-button";

interface CategoryBarProps {
  categories: PosCategorie[];
  active: PosCategorieId;
  onSelect: (id: PosCategorieId) => void;
}

function CategoryBarImpl({ categories, active, onSelect }: CategoryBarProps) {
  return (
    <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-t border-[var(--pos-border)] bg-[var(--pos-surface)] px-2 py-2 pos-scroll">
      {/* Toujours "Tous" en première position */}
      <button
        type="button"
        onClick={() => onSelect("tous")}
        data-active={active === "tous"}
        className="pos-cat-btn flex min-w-[64px] flex-col items-center gap-1 rounded-md px-2 py-1.5"
        aria-pressed={active === "tous"}
      >
        <LayoutGrid className="h-5 w-5" aria-hidden />
        <span className="text-[10px] font-medium leading-tight">Tous</span>
      </button>
      {categories.map((c) => (
        <CategoryButton
          key={c.id}
          categorie={c}
          active={active === c.id}
          onClick={() => onSelect(c.id)}
        />
      ))}
    </div>
  );
}

export const CategoryBar = memo(CategoryBarImpl);
