/**
 * Barrel file — composants partagés OgPressing (P4-F / AUDIT-C-03).
 * ------------------------------------------------------------------
 * Centralise les exports des composants réutilisables transverses pour un
 * import propre : `import { StatusBadge, EmptyState } from "@/components/shared";`.
 *
 * Catalogue des exports (chaque export pointe vers un fichier existant) :
 *   - StatusBadge (+ type StatusVariant)  → badge de statut générique (.Success, .Warning, .Danger, etc.).
 *   - QRScanner (+ type QRScannerProps)   → scanner de QR code (html5-qrcode, lazy-loaded par les consommateurs).
 *   - EmptyState (+ type EmptyStateProps) → état vide standardisé (icône + titre + description + CTA optionnel).
 *   - ViewToggle (+ type ViewToggleProps) → bascule liste / grille (segmented control).
 *   - BottomNav (+ types BottomNavItem, BottomNavProps) → barre de navigation mobile (générique standalone).
 *   - Sidebar (+ types SidebarItem, SidebarBrand, SidebarUser, SidebarProps) → sidebar desktop (générique standalone).
 *
 * Note : BottomNav et Sidebar sont des composants "standalone" (la majorité des
 * layouts OgPressing intègrent leur propre sidebar/nav). Ils sont maintenus
 * ici comme API publique pour les cas d'usage hors DashboardLayout.
 */
export { StatusBadge, type StatusVariant } from "./status-badge";
export {
  QRScanner,
  type QRScannerProps,
} from "./qr-scanner";
export { EmptyState, type EmptyStateProps } from "./empty-state";
export {
  ViewToggle,
  type ViewToggleProps,
} from "./view-toggle";
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
