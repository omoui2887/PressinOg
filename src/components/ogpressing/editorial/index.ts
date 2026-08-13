/**
 * Barrel file — Composants décoratifs "Luxe Éditorial" e-pressing.
 *
 * Implémentent les utilitaires CSS définis dans `src/app/globals.css` :
 * - `.aurora-bg`        → <AuroraBackground />
 * - `.ornate*`          → <OrnateCorner /> (alternative multi-coins SVG)
 * - `.gold-separator*`  → <GoldSeparator />
 * - `.decorative-heading` → <DecorativeHeading /> (trait explicite, pas ::after)
 *
 * Tous ces composants sont des Server Components (pas de "use client") — les
 * effets visuels sont purement CSS, respectent `motion-reduce`, et sont
 * accessibles (aria-hidden / role="presentation" sur les décorations).
 *
 * Usage :
 * ```tsx
 * import {
 *   AuroraBackground,
 *   OrnateCorner,
 *   GoldSeparator,
 *   DecorativeHeading,
 * } from "@/components/ogpressing/editorial";
 * ```
 */
export { AuroraBackground, type AuroraBackgroundProps, type AuroraIntensity } from "./aurora-background";
export {
  OrnateCorner,
  type OrnateCornerProps,
  type OrnateCornerName,
} from "./ornate-corner";
export {
  GoldSeparator,
  type GoldSeparatorProps,
  type GoldSeparatorVariant,
} from "./gold-separator";
export {
  DecorativeHeading,
  type DecorativeHeadingProps,
  type DecorativeHeadingLevel,
  type DecorativeHeadingAlign,
  type DecorativeHeadingFont,
} from "./decorative-heading";
