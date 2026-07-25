/**
 * OgPressing — SuperAdminShell
 * ----------------------------
 * Wrapper CLIENT pour l'espace Super Admin. Détient la définition des
 * éléments de navigation latérale (avec icônes lucide-react) et rend le
 * `DashboardLayout` générique.
 *
 * Pourquoi un wrapper client séparé ? Le layout de route `(super-admin)`
 * est un Server Component : il ne peut pas passer d'objets non-sériables
 * (comme les composants icône) à un Client Component. Les icônes doivent
 * donc être définies DANS la frontière client. Ce wrapper reçoit uniquement
 * l'objet `user` (sérialisable) du layout serveur.
 */
"use client";

import {
  LayoutDashboard,
  Inbox,
  KeyRound,
  CreditCard,
  Building2,
} from "lucide-react";
import {
  DashboardLayout,
  type DashboardNavItem,
} from "@/components/ogpressing/dashboard-layout";

const NAV_ITEMS: DashboardNavItem[] = [
  {
    href: "/super-admin/dashboard",
    label: "Tableau de bord",
    icon: LayoutDashboard,
  },
  {
    href: "/super-admin/demandes",
    label: "Demandes d'inscription",
    icon: Inbox,
    badge: "Bientôt",
    disabled: true,
  },
  {
    href: "/super-admin/codes",
    label: "Codes d'activation",
    icon: KeyRound,
    badge: "Bientôt",
    disabled: true,
  },
  {
    href: "/super-admin/abonnements",
    label: "Abonnements",
    icon: CreditCard,
    badge: "Bientôt",
    disabled: true,
  },
  {
    href: "/super-admin/pressings",
    label: "Pressings",
    icon: Building2,
    badge: "Bientôt",
    disabled: true,
  },
];

interface SuperAdminShellProps {
  user: { email?: string | null; nom?: string | null };
  children: React.ReactNode;
}

export function SuperAdminShell({ user, children }: SuperAdminShellProps) {
  return (
    <DashboardLayout
      navItems={NAV_ITEMS}
      roleLabel="Super Admin"
      user={user}
    >
      {children}
    </DashboardLayout>
  );
}
