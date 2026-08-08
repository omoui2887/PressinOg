/**
 * Barrel file — composants métier OgPressing (P4-F / AUDIT-C-03).
 * ------------------------------------------------------------------
 * Centralise les exports des composants OgPressing racines pour un import
 * propre : `import { PublicHeader, Reveal, StatCard } from "@/components/ogpressing";`.
 *
 * Catalogue des exports (chaque export pointe vers un fichier existant) :
 *   - PublicHeader / PublicFooter    → chrome public (header + footer).
 *   - DashboardPlaceholder           → placeholder pour pages en cours.
 *   - Reveal                          → animation d'apparition au scroll.
 *   - StatCard (+ type StatAccent)   → carte statistique générique.
 *   - DashboardLayout (+ type)       → layout admin générique (sidebar + bottom nav).
 *   - AdminShell / AdminBottomNav    → chrome admin (sidebar desktop + nav mobile).
 *   - SubscriptionBanner             → bannière d'état d'abonnement.
 *   - AdminPagePlaceholder           → placeholder pour pages admin en cours.
 *   - Editorial (voir `./editorial`) → composants décoratifs luxe (AuroraBackground, etc.).
 *
 * Note : la plupart de ces composants sont également importables directement
 * (ex : `@/components/ogpressing/stat-card`). Le barrel est l'API publique
 * documentée — les consommateurs peuvent utiliser l'un ou l'autre.
 */
export { PublicHeader } from "./public-header";
export { PublicFooter } from "./public-footer";
export { DashboardPlaceholder } from "./dashboard-placeholder";
export { Reveal } from "./reveal";
export { StatCard, type StatAccent } from "./stat-card";
export {
  DashboardLayout,
  type DashboardNavItem,
} from "./dashboard-layout";
export { AdminShell } from "./admin/admin-shell";
export { AdminBottomNav } from "./admin/admin-bottom-nav";
export { SubscriptionBanner } from "./admin/subscription-banner";
export { AdminPagePlaceholder } from "./admin/admin-page-placeholder";

// Composants décoratifs "Luxe Éditorial" (brief Phase 3-b).
// Ré-export du sous-dossier `editorial/` pour imports unifiés :
//   import { AuroraBackground, OrnateCorner } from "@/components/ogpressing";
export {
  AuroraBackground,
  type AuroraBackgroundProps,
  type AuroraIntensity,
  OrnateCorner,
  type OrnateCornerProps,
  type OrnateCornerName,
  GoldSeparator,
  type GoldSeparatorProps,
  type GoldSeparatorVariant,
  DecorativeHeading,
  type DecorativeHeadingProps,
  type DecorativeHeadingLevel,
  type DecorativeHeadingAlign,
  type DecorativeHeadingFont,
} from "./editorial";
