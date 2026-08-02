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

  // Phase 4-b — Activer le logo brand doré (variante "editorial") quand un
  // brand est fourni par le layout serveur. Si brand est absent, le DashboardLayout
  // retombe sur le logo OgPressing par défaut (bg-primary text-primary-foreground).
  const brandedWithAccent = brand
    ? { ...brand, variant: "editorial" as const }
    : undefined;

  return (
    <DashboardLayout
      navItems={navItems}
      roleLabel={roleLabel}
      user={user}
      brand={brandedWithAccent}
      bottomNav={<PersonnelBottomNav role={role} />}
    >
      {children}
    </DashboardLayout>
  );
}
