/**
 * Barrel file pour les composants métier OgPressing.
 *
 * Permet les imports :
 *   import { PublicHeader, PublicFooter, DashboardPlaceholder } from "@/components/ogpressing";
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
