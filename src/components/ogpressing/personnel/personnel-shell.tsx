/**
 * OgPressing — PersonnelShell (LOT 13)
 * ------------------------------------
 * Wrapper CLIENT pour l'espace Personnel. Miroir de `AdminShell` mais
 * adapté aux 7 rôles du personnel. Recoit le `role` du layout serveur
 * (qui fetch le personnel connecté) et sélectionne la navigation
 * correspondante dans `NAV_ITEMS_BY_ROLE`.
 *
 * Pourquoi un wrapper client séparé ? Le layout de route `(personnel)` est
 * un Server Component : il ne peut pas passer d'objets non-sériables (icônes)
 * à un Client Component. Les icônes lucide-react sont définies DANS la
 * frontière client (via `personnel-nav-config.ts` qui importe les icônes).
 *
 * Ce wrapper reçoit uniquement les objets sérialisables (user + brand + role)
 * du layout serveur.
 */
"use client";

import {
  DashboardLayout,
  type DashboardNavItem,
} from "@/components/ogpressing/dashboard-layout";
import { PersonnelBottomNav } from "./personnel-bottom-nav";
import {
  NAV_ITEMS_BY_ROLE,
  ROLE_LABELS,
  type PersonnelRole,
} from "./personnel-nav-config";

interface PersonnelShellProps {
  role: PersonnelRole;
  user: { email?: string | null; nom?: string | null };
  brand?: { name: string; logoUrl?: string | null };
  children: React.ReactNode;
}

export function PersonnelShell({
  role,
  user,
  brand,
  children,
}: PersonnelShellProps) {
  const navItems: DashboardNavItem[] = NAV_ITEMS_BY_ROLE[role] ?? [];
  const roleLabel = ROLE_LABELS[role] ?? "Personnel";

  return (
    <DashboardLayout
      navItems={navItems}
      roleLabel={roleLabel}
      user={user}
      brand={brand}
      bottomNav={<PersonnelBottomNav role={role} />}
    >
      {children}
    </DashboardLayout>
  );
}
