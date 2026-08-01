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
 *
 * Navigation latérale (EMBELLISSEMENT §4 — sidebar regroupée par sections) :
 *
 *   ACTIVITÉ
 *     - Tableau de bord       → /super-admin/dashboard
 *     - Demandes              → /super-admin/demandes
 *
 *   CLIENTS
 *     - Pressings             → /super-admin/pressings
 *     - Abonnements           → /super-admin/abonnements
 *
 *   CONFIGURATION
 *     - Catalogue             → /super-admin/catalogue
 *
 * L'ancien item "Codes d'activation" (/super-admin/codes) a été retiré :
 * la génération de codes se fait directement depuis la page Demandes
 * (prompt 5.2 — bouton "Valider et générer un code d'activation"),
 * aucune page dédiée n'est prévue par le spec.
 *
 * L'item "Catalogue" reste accessible dans la sidebar : la route
 * /super-admin/catalogue est actuellement un redirect vers le dashboard
 * (le catalogue global est un référentiel en lecture seule seedé par la
 * migration 014). Le lien est conservé pour la discoverabilité et la
 * cohérence avec les autres espaces (admin, réceptionniste) qui
 * consomment le catalogue via `ArticleCatalogPicker`.
 */
"use client";

import {
  LayoutDashboard,
  Inbox,
  CreditCard,
  Building2,
  Shirt,
} from "lucide-react";
import {
  DashboardLayout,
  type DashboardNavGroup,
} from "@/components/ogpressing/dashboard-layout";

/** Groupes de navigation — version organisée par section (EMBELLISSEMENT §4). */
const NAV_GROUPS: DashboardNavGroup[] = [
  {
    label: "Activité",
    items: [
      {
        href: "/super-admin/dashboard",
        label: "Tableau de bord",
        icon: LayoutDashboard,
      },
      {
        href: "/super-admin/demandes",
        label: "Demandes",
        icon: Inbox,
      },
    ],
  },
  {
    label: "Clients",
    items: [
      {
        href: "/super-admin/pressings",
        label: "Pressings",
        icon: Building2,
      },
      {
        href: "/super-admin/abonnements",
        label: "Abonnements",
        icon: CreditCard,
      },
    ],
  },
  {
    label: "Configuration",
    items: [
      {
        href: "/super-admin/catalogue",
        label: "Catalogue",
        icon: Shirt,
      },
    ],
  },
];

interface SuperAdminShellProps {
  user: { email?: string | null; nom?: string | null };
  children: React.ReactNode;
}

export function SuperAdminShell({ user, children }: SuperAdminShellProps) {
  return (
    <DashboardLayout
      navGroups={NAV_GROUPS}
      roleLabel="Super Admin"
      user={user}
    >
      {children}
    </DashboardLayout>
  );
}
