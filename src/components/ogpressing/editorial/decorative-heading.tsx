/**
 * DecorativeHeading — Titre serif éditorial avec trait doré décoratif.
 *
 * Rend un heading (h1/h2/h3/h4) en police Playfair Display (par défaut) ou
 * Plus Jakarta Sans, suivi d'un trait doré (12px de hauteur, 48px de large,
 * gradient `from-editorial-gold to-editorial-gold-soft`) explicite — pas un
 * `::after` — pour faciliter l'alignement (left / center / right) sans CSS
 * custom property.
 *
 * Le trait est purement décoratif (`aria-hidden`) : la hiérarchie sémantique
 * est portée par le heading lui-même.
 *
 * Usage :
 * ```tsx
 * <DecorativeHeading as="h2">Catalogue</DecorativeHeading>
 * <DecorativeHeading as="h1" align="center" fontFamily="jakarta">
 *   Tableau de bord
 * </DecorativeHeading>
 * ```
 *
 * Server component (pas de "use client").
 */
import * as React from "react";

import { cn } from "@/lib/utils";

export type DecorativeHeadingLevel = "h1" | "h2" | "h3" | "h4";
export type DecorativeHeadingAlign = "left" | "center" | "right";
export type DecorativeHeadingFont = "playfair" | "jakarta";

export interface DecorativeHeadingProps {
  /** Niveau sémantique du heading. Défaut : "h2". */
  as?: DecorativeHeadingLevel;
  /** Contenu du titre. */
  children: React.ReactNode;
  /** Alignement du trait décoratif. Défaut : "left". */
  align?: DecorativeHeadingAlign;
  /** Famille de police. Défaut : "playfair". */
  fontFamily?: DecorativeHeadingFont;
  /** Classes additionnelles sur le heading. */
  className?: string;
  /** Classes additionnelles sur le trait décoratif (permet personnalisation couleur). */
  accentClassName?: string;
}

export function DecorativeHeading({
  as = "h2",
  children,
  align = "left",
  fontFamily = "playfair",
  className,
  accentClassName,
}: DecorativeHeadingProps) {
  const Tag = as as React.ElementType;

  return (
    <Tag
      className={cn(
        fontFamily === "playfair" && "font-playfair",
        fontFamily === "jakarta" && "font-jakarta",
        className,
      )}
    >
      {children}
      <span
        aria-hidden
        className={cn(
          "mt-2 block h-0.5 w-12 rounded-full bg-gradient-to-r from-editorial-gold to-editorial-gold-soft",
          align === "center" && "mx-auto",
          align === "right" && "ml-auto",
          accentClassName,
        )}
      />
    </Tag>
  );
}
