/**
 * <CategoryButton /> — Bouton de catégorie de service (barre du bas).
 * Icône + nom + état actif (contour bleu, fond bleuté).
 */
"use client";
import { memo } from "react";
import {
  Droplets,
  WashingMachine,
  Shirt,
  Sparkles,
  Wind,
  SprayCan,
  type LucideIcon,
} from "lucide-react";
import type { PosCategorie } from "@/lib/pos/types";

const ICONS: Record<PosCategorie["icon"], LucideIcon> = {
  droplets: Droplets,
  iron: Wind,
  shirt: Shirt,
  sparkles: Sparkles,
  spray: SprayCan,
  "washing-machine": WashingMachine,
};

interface CategoryButtonProps {
  categorie: PosCategorie;
  active: boolean;
  onClick: () => void;
}

function CategoryButtonImpl({
  categorie,
  active,
  onClick,
}: CategoryButtonProps) {
  const Icon = ICONS[categorie.icon] ?? Shirt;
  return (
    <button
      type="button"
      onClick={onClick}
      data-active={active}
      className="pos-cat-btn flex min-w-[64px] flex-col items-center gap-1 rounded-md px-2 py-1.5"
      aria-pressed={active}
    >
      <Icon className="h-5 w-5" aria-hidden />
      <span className="text-[10px] font-medium leading-tight">
        {categorie.label}
      </span>
    </button>
  );
}

export const CategoryButton = memo(CategoryButtonImpl);
