/**
 * OgPressing — AdminShell
 * ------------------------
 * Wrapper CLIENT pour l'espace Admin pressing. Détient la définition des
 * éléments de navigation latérale desktop (icônes lucide-react) et rend le
 * `DashboardLayout` générique + la `AdminBottomNav` mobile.
 *
 * Pourquoi un wrapper client séparé ? Le layout de route `(admin)` est un
 * Server Component : il ne peut pas passer d'objets non-sériables (comme
 * les composants icône) à un Client Component. Les icônes doivent donc
 * être définies DANS la frontière client. Ce wrapper reçoit uniquement
 * les objets sérialisables (user + brand) du layout serveur.
 *
 * Navigation latérale (desktop, 9 items) :
 *   1. Tableau de bord        → /admin/dashboard
 *   2. Nouvelle commande      → /admin/commandes/nouvelle
 *   3. Commandes              → /admin/commandes
 *   4. Clients                → /admin/clients
 *   5. Personnel              → /admin/personnel
 *   6. Stock                  → /admin/stock
 *   7. Services               → /admin/services
 *   8. Rapports               → /admin/rapports
 *   9. Mon pressing           → /admin/pressing
 *
 * Navigation mobile (bottomNav) : 5 items principaux + Plus (gérée dans
 * `AdminBottomNav`).
 */
"use client";

import {
  LayoutDashboard,
  PlusCircle,
  List,
  Users,
  UserCog,
  Package,
  Tag,
  BarChart3,
  Settings,
} from "lucide-react";
import {
  DashboardLayout,
  type DashboardNavItem,
} from "@/components/ogpressing/dashboard-layout";
import { AdminBottomNav } from "./admin-bottom-nav";

const NAV_ITEMS: DashboardNavItem[] = [
  { href: "/admin/dashboard", label: "Tableau de bord", icon: LayoutDashboard },
  {
    href: "/admin/commandes/nouvelle",
    label: "Nouvelle commande",
    icon: PlusCircle,
  },
  { href: "/admin/commandes", label: "Commandes", icon: List },
  { href: "/admin/clients", label: "Clients", icon: Users },
  { href: "/admin/personnel", label: "Personnel", icon: UserCog },
  { href: "/admin/stock", label: "Stock", icon: Package },
  { href: "/admin/services", label: "Services", icon: Tag },
  { href: "/admin/rapports", label: "Rapports", icon: BarChart3 },
  { href: "/admin/pressing", label: "Mon pressing", icon: Settings },
];

interface AdminShellProps {
  user: { email?: string | null; nom?: string | null };
  brand?: { name: string; logoUrl?: string | null };
  children: React.ReactNode;
}

export function AdminShell({ user, brand, children }: AdminShellProps) {
  return (
    <DashboardLayout
      navItems={NAV_ITEMS}
      roleLabel="Admin pressing"
      user={user}
      brand={brand}
      bottomNav={<AdminBottomNav />}
    >
      {children}
    </DashboardLayout>
  );
}
