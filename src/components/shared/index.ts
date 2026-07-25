/**
 * Barrel file pour les composants partagés OgPressing.
 *
 * Permet les imports :
 *   import { StatusBadge, EmptyState, BottomNav, Sidebar } from "@/components/shared";
 *
 * (Plutôt que d'importer chaque composant individuellement.)
 */
export { StatusBadge, type StatusVariant } from "./status-badge";
export {
  QRScanner,
  type QRScannerProps,
} from "./qr-scanner";
export { EmptyState, type EmptyStateProps } from "./empty-state";
export {
  BottomNav,
  type BottomNavItem,
  type BottomNavProps,
} from "./bottom-nav";
export {
  Sidebar,
  type SidebarItem,
  type SidebarBrand,
  type SidebarUser,
  type SidebarProps,
} from "./sidebar";
