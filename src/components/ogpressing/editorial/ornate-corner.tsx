/**
 * OrnateCorner — Losanges dorés décoratifs aux 4 coins d'un conteneur.
 *
 * Rend un wrapper div `absolute inset-0` contenant 1 à 4 SVG inline (un par
 * coin actif). Chaque SVG est un losange (`<rect>` tourné à 45°) bordé d'un
 * trait doré. Au survol du parent `group`, l'opacité passe de `opacity` à
 * `hoverOpacity` (transition 300ms, respecte `motion-reduce`).
 *
 * Usage :
 * ```tsx
 * <Card className="relative group">
 *   <OrnateCorner />
 *   ...contenu...
 * </Card>
 * ```
 *
 * Le parent DOIT :
 * 1. Être `position: relative` (ou équivalent) pour ancrer le wrapper absolute.
 * 2. Porter la classe `group` pour activer l'effet de survol (`group-hover`).
 *
 * Accessibilité : chaque SVG est `aria-hidden` (pure décoration, pas de label).
 *
 * Server component (pas de "use client") — l'effet de survol est pure CSS.
 */
import * as React from "react";

import { cn } from "@/lib/utils";

export type OrnateCornerName = "tl" | "tr" | "bl" | "br";

export interface OrnateCornerProps {
  /** Coins à décorer. Défaut : tous (tl + tr + bl + br). */
  corners?: OrnateCornerName[];
  /** Taille en px du SVG. Défaut : 8. */
  size?: number;
  /** Couleur hex du trait. Défaut : "#C5A03D" (editorial-gold). */
  color?: string;
  /** Opacité au repos. Défaut : 0.25. */
  opacity?: number;
  /** Opacité au survol du parent `group`. Défaut : 0.5. */
  hoverOpacity?: number;
  /** Classes additionnelles appliquées au wrapper. */
  className?: string;
}

const DEFAULT_CORNERS: OrnateCornerName[] = ["tl", "tr", "bl", "br"];

const CORNER_POSITION: Record<OrnateCornerName, string> = {
  tl: "top-3 left-3",
  tr: "top-3 right-3",
  bl: "bottom-3 left-3",
  br: "bottom-3 right-3",
};

export function OrnateCorner({
  corners = DEFAULT_CORNERS,
  size = 8,
  color = "#C5A03D",
  opacity = 0.25,
  hoverOpacity = 0.5,
  className,
}: OrnateCornerProps) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 motion-reduce:transition-none",
        className,
      )}
      aria-hidden
      style={
        {
          "--ornate-hover-opacity": hoverOpacity,
        } as React.CSSProperties
      }
    >
      {corners.map((corner) => (
        <svg
          key={corner}
          width={size}
          height={size}
          viewBox="0 0 8 8"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={cn(
            "absolute transition-opacity duration-300 motion-reduce:transition-none group-hover:opacity-[var(--ornate-hover-opacity)]",
            CORNER_POSITION[corner],
          )}
          style={{ opacity }}
          aria-hidden
          role="presentation"
        >
          <rect
            x="1"
            y="1"
            width="6"
            height="6"
            transform="rotate(45 4 4)"
            fill="none"
            stroke={color}
            strokeWidth="1"
          />
        </svg>
      ))}
    </div>
  );
}
