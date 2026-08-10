/**
 * Barrel file — composants métier OgPressing.
 * ------------------------------------------------------------------
 * Centralise les exports des composants OgPressing racines pour un import
 * propre : `import { PublicHeader, Reveal, StatCard } from "@/components/ogpressing";`.
 *
 * Catalogue des exports (chaque export pointe vers un fichier existant) :
 *   - PublicHeader / PublicFooter    → chrome public (header + footer).
 *   - Reveal                          → animation d'apparition au scroll.
 *   - StatCard (+ type StatAccent)   → carte statistique générique.
 *   - DashboardLayout (+ type)       → layout admin générique (sidebar + bottom nav).
 *   - AdminShell / AdminBottomNav    → chrome admin (sidebar desktop + nav mobile).
 *   - SubscriptionBanner             → bannière d'état d'abonnement.
 *   - Editorial (voir `./editorial`) → composants décoratifs luxe (AuroraBackground, etc.).
 *
 * Note : DashboardPlaceholder et AdminPagePlaceholder étaient des composants
 * placeholder de développement, supprimés lors du nettoyage de code mort
 * (plus aucune page ne les consomme).
 */
export { PublicHeader } from "./public-header";
export { PublicFooter } from "./public-footer";
export { Reveal } from "./reveal";
export { StatCard, type StatAccent } from "./stat-card";
export {
  DashboardLayout,
  type DashboardNavItem,
} from "./dashboard-layout";
export { AdminShell } from "./admin/admin-shell";
export { AdminBottomNav } from "./admin/admin-bottom-nav";
export { SubscriptionBanner } from "./admin/subscription-banner";

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
