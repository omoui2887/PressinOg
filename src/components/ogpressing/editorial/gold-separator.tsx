/**
 * GoldSeparator — Séparateur ornemental "luxe éditorial".
 *
 * Rend une fine ligne gradient avec un point doré central, basée sur la
 * classe utilitaire `.gold-separator` définie dans `src/app/globals.css` §5.
 *
 * Variants :
 * - `default` : ligne fine (1px) + point central
 * - `thick`   : ligne épaisse (2px) + point central
 * - `gold`    : ligne fine teintée or (gradient plus chaud) + point central
 *
 * Accessibilité : purement décoratif → `role="presentation"` + `aria-hidden`
 * par défaut. Passer `aria-hidden={false}` si le séparateur porte une
 * sémantique de rupture de contenu (rare — préférer un `<hr>` dans ce cas).
 *
 * Server component (pas de "use client").
 */
import * as React from "react";

import { cn } from "@/lib/utils";

export type GoldSeparatorVariant = "default" | "thick" | "gold";

export interface GoldSeparatorProps {
  /** Style du trait. Défaut : "default". */
  variant?: GoldSeparatorVariant;
  /** Affiche le point central. Défaut : true. */
  withDot?: boolean;
  /** Classes additionnelles (largeur, marges, etc.). */
  className?: string;
  /** Cacher aux lecteurs d'écran (décoratif). Défaut : true. */
  "aria-hidden"?: boolean;
}

export function GoldSeparator({
  variant = "default",
  withDot = true,
  className,
  "aria-hidden": ariaHidden = true,
}: GoldSeparatorProps) {
  return (
    <div
      role="presentation"
      aria-hidden={ariaHidden}
      className={cn(
        "gold-separator",
        variant === "thick" && "gold-separator-thick",
        variant === "gold" && "gold-separator-gold",
        !withDot && "after:hidden",
        className,
      )}
    />
  );
}
