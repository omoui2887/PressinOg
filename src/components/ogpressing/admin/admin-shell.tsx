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
 * Navigation latérale (EMBELLISSEMENT §4 — sidebar regroupée par sections) :
 *
 *   ACTIVITÉ
 *     - Tableau de bord       → /admin/dashboard
 *     - Nouvelle commande     → /admin/commandes/nouvelle
 *     - Commandes             → /admin/commandes
 *
 *   RELATION CLIENT
 *     - Clients               → /admin/clients
 *
 *   GESTION
 *     - Personnel             → /admin/personnel
 *     - Stock biodétergents   → /admin/stock
 *     - Services et tarifs    → /admin/services
 *
 *   FINANCES
 *     - Rapports              → /admin/rapports
 *
 *   PARAMÈTRES
 *     - Mon pressing          → /admin/pressing
 *
 * Navigation mobile (bottomNav) : 5 items principaux + Plus (gérée dans
 * `AdminBottomNav`).
 *
 * Phase 4-b — Accents « Luxe Éditorial » subtils :
 * Le dashboard RESTE en thème clair (light) pour la lisibilité des données
 * et les longues sessions de saisie. On ajoute simplement des touches dorées
 * via le DashboardLayout sous-jacent : bandeau de rôle `text-editorial-gold-deep`,
 * `<GoldSeparator />` sous le brand, et logo brand doré (`bg-editorial-gold
 * text-white`) activé en passant `variant: "editorial"` au brand transmis.
 * Le thème editorial complet (navy/or) reste disponible via `accent="editorial"`
 * sur DashboardLayout — non activé ici par défaut (usage quotidien).
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
  type DashboardNavGroup,
} from "@/components/ogpressing/dashboard-layout";
import { AdminBottomNav } from "./admin-bottom-nav";

/** Groupes de navigation — version organisée par section (EMBELLISSEMENT §4). */
const NAV_GROUPS: DashboardNavGroup[] = [
  {
    label: "Activité",
    items: [
      { href: "/admin/dashboard", label: "Tableau de bord", icon: LayoutDashboard },
      {
        href: "/admin/commandes/nouvelle",
        label: "Nouvelle commande",
        icon: PlusCircle,
      },
      { href: "/admin/commandes", label: "Commandes", icon: List },
    ],
  },
  {
    label: "Relation client",
    items: [
      { href: "/admin/clients", label: "Clients", icon: Users },
    ],
  },
  {
    label: "Gestion",
    items: [
      { href: "/admin/personnel", label: "Personnel", icon: UserCog },
      { href: "/admin/stock", label: "Stock biodétergents", icon: Package },
      { href: "/admin/services", label: "Services et tarifs", icon: Tag },
    ],
  },
  {
    label: "Finances",
    items: [
      { href: "/admin/rapports", label: "Rapports", icon: BarChart3 },
    ],
  },
  {
    label: "Paramètres",
    items: [
      { href: "/admin/pressing", label: "Mon pressing", icon: Settings },
    ],
  },
];

interface AdminShellProps {
  user: { email?: string | null; nom?: string | null };
  brand?: { name: string; logoUrl?: string | null };
  children: React.ReactNode;
}

export function AdminShell({ user, brand, children }: AdminShellProps) {
  // Phase 4-b — Activer le logo brand doré (variante "editorial") quand un
  // brand est fourni par le layout serveur. Si brand est absent, le DashboardLayout
  // retombe sur le logo OgPressing par défaut (bg-primary text-primary-foreground).
  const brandedWithAccent = brand
    ? { ...brand, variant: "editorial" as const }
    : undefined;

  return (
    <DashboardLayout
      navGroups={NAV_GROUPS}
      roleLabel="Admin pressing"
      user={user}
      brand={brandedWithAccent}
      bottomNav={<AdminBottomNav />}
    >
      {children}
    </DashboardLayout>
  );
}
