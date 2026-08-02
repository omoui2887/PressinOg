/**
 * OgPressing — ViewToggle
 * -----------------------
 * Interrupteur à 2 positions (Liste / Grille) pour les pages d'historique.
 * Utilise le primitive shadcn ToggleGroup (Radix) + icônes lucide List / LayoutGrid.
 *
 * Props :
 *   - value      : "list" | "grid" (mode actuel)
 *   - onChange   : callback appelé avec le nouveau mode
 *   - size       : "sm" | "default" (défaut "sm" — s'intègre dans les headers)
 *
 * Accessibilité :
 *   - ToggleGroup Radix = radiogroup ARIA, navigable au clavier (flèches).
 *   - Chaque bouton a un aria-label explicite.
 *   - L'état actif est signalé par data-state="on" (Radix) + style visuel.
 *
 * Design :
 *   - Fond muted, bordure input, arrondi-md.
 *   - Bouton actif : bg-background + shadow-sm (effet "enfoncé/sélectionné").
 *   - Icône + label court ("Liste" / "Grille") — label masqué sur très petit
 *     écran (sr-only) pour ne garder que l'icône.
 */
"use client";

import { List, LayoutGrid } from "lucide-react";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import type { ViewMode } from "@/hooks/use-view-mode";

interface ViewToggleProps {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
  size?: "sm" | "default";
  className?: string;
}

export function ViewToggle({
  value,
  onChange,
  size = "sm",
  className,
}: ViewToggleProps) {
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(v) => {
        // Radix appelle onValueChange avec "" si l'utilisateur clique sur
        // l'item déjà actif (désélection). On ignore ce cas pour garder
        // toujours un mode sélectionné.
        if (v === "list" || v === "grid") {
          onChange(v);
        }
      }}
      className={cn(
        "border-input bg-muted/60 rounded-md border",
        className
      )}
      aria-label="Mode d'affichage"
    >
      <ToggleGroupItem
        value="list"
        aria-label="Affichage en liste"
        className={cn(
          "gap-1.5",
          size === "sm" ? "h-8 px-2.5" : "h-9 px-3",
          value === "list" && "bg-background shadow-sm"
        )}
      >
        <List className="size-4" />
        <span className="hidden sm:inline">Liste</span>
      </ToggleGroupItem>
      <ToggleGroupItem
        value="grid"
        aria-label="Affichage en grille"
        className={cn(
          "gap-1.5",
          size === "sm" ? "h-8 px-2.5" : "h-9 px-3",
          value === "grid" && "bg-background shadow-sm"
        )}
      >
        <LayoutGrid className="size-4" />
        <span className="hidden sm:inline">Grille</span>
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
