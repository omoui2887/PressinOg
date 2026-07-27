/**
 * OgPressing — Configuration navigation Personnel (LOT 13)
 * --------------------------------------------------------
 * Centralise la navigation (sidebar desktop + bottom nav mobile) pour les
 * 7 rôles du personnel. Chaque rôle a un périmètre strict (matrice de
 * permissions PRD §3.4) — la navigation ne doit exposer QUE les pages
 * autorisées.
 *
 * ⚠️ Le middleware (src/lib/supabase/middleware.ts) vérifie déjà que
 *    /personnel/{role}/* correspond au rôle de l'utilisateur connecté.
 *    La navigation ci-dessous est un guide UX — la sécurité est assurée
 *    par RLS (côté API) + middleware (côté routing).
 *
 * Rôles couverts :
 *   - receptionniste : tableau de bord, nouvelle commande, commandes, clients, scanner QR
 *   - caissier       : tableau de bord, encaisser, clients (lecture)
 *   - laveur         : tableau de bord, mes commandes
 *   - repassage      : tableau de bord, mes commandes
 *   - livreur        : tableau de bord, commandes à livrer
 *   - comptable      : tableau de bord, rapports, clients (lecture)
 *   - manager        : tableau de bord, nouvelle commande, commandes, clients, stock, rapports, scanner QR
 */
import {
  LayoutDashboard,
  PlusCircle,
  List,
  Users,
  QrCode,
  Wallet,
  BarChart3,
  Package,
  type LucideIcon,
} from "lucide-react";
import type { DashboardNavItem } from "@/components/ogpressing/dashboard-layout";

/** Les 7 rôles du personnel (miroir de l'enum PostgreSQL `role_personnel`). */
export type PersonnelRole =
  | "receptionniste"
  | "caissier"
  | "laveur"
  | "repassage"
  | "livreur"
  | "comptable"
  | "manager";

/** Item de navigation étendu : href + label + icône. */
export interface PersonnelNavItem extends DashboardNavItem {
  /** Si true, l'icône est rendue en bouton flottant central surélevé
   *  dans la bottom nav mobile (CTA principal : Nouvelle commande, Encaisser). */
  elevated?: boolean;
}

/** Configuration de navigation par rôle (sidebar desktop). */
export const NAV_ITEMS_BY_ROLE: Record<PersonnelRole, PersonnelNavItem[]> = {
  receptionniste: [
    {
      href: "/personnel/receptionniste/dashboard",
      label: "Tableau de bord",
      icon: LayoutDashboard,
    },
    {
      href: "/personnel/receptionniste/commandes/nouvelle",
      label: "Nouvelle commande",
      icon: PlusCircle,
    },
    {
      href: "/personnel/receptionniste/commandes",
      label: "Commandes",
      icon: List,
    },
    {
      href: "/personnel/receptionniste/clients",
      label: "Clients",
      icon: Users,
    },
    {
      href: "/personnel/receptionniste/scanner-qr",
      label: "Scanner QR",
      icon: QrCode,
    },
  ],
  caissier: [
    {
      href: "/personnel/caissier/dashboard",
      label: "Tableau de bord",
      icon: LayoutDashboard,
    },
    {
      href: "/personnel/caissier/encaisser",
      label: "Encaisser un paiement",
      icon: Wallet,
    },
    {
      href: "/personnel/caissier/clients",
      label: "Clients",
      icon: Users,
    },
  ],
  laveur: [
    {
      href: "/personnel/laveur/dashboard",
      label: "Tableau de bord",
      icon: LayoutDashboard,
    },
    {
      href: "/personnel/laveur/commandes",
      label: "Mes commandes assignées",
      icon: List,
    },
  ],
  repassage: [
    {
      href: "/personnel/repassage/dashboard",
      label: "Tableau de bord",
      icon: LayoutDashboard,
    },
    {
      href: "/personnel/repassage/commandes",
      label: "Mes commandes assignées",
      icon: List,
    },
  ],
  livreur: [
    {
      href: "/personnel/livreur/dashboard",
      label: "Tableau de bord",
      icon: LayoutDashboard,
    },
    {
      href: "/personnel/livreur/commandes",
      label: "Commandes à livrer",
      icon: Package,
    },
  ],
  comptable: [
    {
      href: "/personnel/comptable/dashboard",
      label: "Tableau de bord",
      icon: LayoutDashboard,
    },
    {
      href: "/personnel/comptable/rapports",
      label: "Rapports",
      icon: BarChart3,
    },
    {
      href: "/personnel/comptable/clients",
      label: "Clients",
      icon: Users,
    },
  ],
  manager: [
    {
      href: "/personnel/manager/dashboard",
      label: "Tableau de bord",
      icon: LayoutDashboard,
    },
    {
      href: "/personnel/manager/commandes/nouvelle",
      label: "Nouvelle commande",
      icon: PlusCircle,
    },
    {
      href: "/personnel/manager/commandes",
      label: "Commandes",
      icon: List,
    },
    {
      href: "/personnel/manager/clients",
      label: "Clients",
      icon: Users,
    },
    {
      href: "/personnel/manager/stock",
      label: "Stock",
      icon: Package,
    },
    {
      href: "/personnel/manager/rapports",
      label: "Rapports",
      icon: BarChart3,
    },
    {
      href: "/personnel/manager/scanner-qr",
      label: "Scanner QR",
      icon: QrCode,
    },
  ],
};

/** Items secondaires pour le menu "Plus" de la bottom nav (uniquement
 *  pour les rôles ayant > 5 items principaux — seul le Manager est dans
 *  ce cas). Les autres rôles ont ≤ 5 items et n'ont pas de menu Plus. */
export const MORE_ITEMS_BY_ROLE: Partial<
  Record<PersonnelRole, PersonnelNavItem[]>
> = {
  // Le Manager a 7 items → 5 principaux + 2 dans "Plus" (Stock, Scanner QR)
  manager: [
    {
      href: "/personnel/manager/stock",
      label: "Stock",
      icon: Package,
    },
    {
      href: "/personnel/manager/scanner-qr",
      label: "Scanner QR",
      icon: QrCode,
    },
  ],
};

/** Configuration de la bottom nav mobile par rôle (items principaux).
 *
 * Pour les rôles à ≤ 5 items : tous les items sont rendus en slots flex-1.
 * Pour les rôles à > 5 items (Manager) : 5 items principaux + bouton "Plus".
 *
 * L'item "central surélevé" (bouton flottant) est déterminé par `elevated: true`.
 */
export const BOTTOM_NAV_MAIN_BY_ROLE: Record<
  PersonnelRole,
  PersonnelNavItem[]
> = {
  receptionniste: [
    {
      href: "/personnel/receptionniste/dashboard",
      label: "Accueil",
      icon: LayoutDashboard,
    },
    {
      href: "/personnel/receptionniste/commandes",
      label: "Commandes",
      icon: List,
    },
    {
      href: "/personnel/receptionniste/commandes/nouvelle",
      label: "Nouvelle",
      icon: PlusCircle,
      elevated: true,
    },
    {
      href: "/personnel/receptionniste/clients",
      label: "Clients",
      icon: Users,
    },
    {
      href: "/personnel/receptionniste/scanner-qr",
      label: "Scanner",
      icon: QrCode,
    },
  ],
  caissier: [
    {
      href: "/personnel/caissier/dashboard",
      label: "Accueil",
      icon: LayoutDashboard,
    },
    {
      href: "/personnel/caissier/encaisser",
      label: "Encaisser",
      icon: Wallet,
      elevated: true,
    },
    {
      href: "/personnel/caissier/clients",
      label: "Clients",
      icon: Users,
    },
  ],
  laveur: [
    {
      href: "/personnel/laveur/dashboard",
      label: "Accueil",
      icon: LayoutDashboard,
    },
    {
      href: "/personnel/laveur/commandes",
      label: "Mes commandes",
      icon: List,
    },
  ],
  repassage: [
    {
      href: "/personnel/repassage/dashboard",
      label: "Accueil",
      icon: LayoutDashboard,
    },
    {
      href: "/personnel/repassage/commandes",
      label: "Mes commandes",
      icon: List,
    },
  ],
  livreur: [
    {
      href: "/personnel/livreur/dashboard",
      label: "Accueil",
      icon: LayoutDashboard,
    },
    {
      href: "/personnel/livreur/commandes",
      label: "À livrer",
      icon: Package,
    },
  ],
  comptable: [
    {
      href: "/personnel/comptable/dashboard",
      label: "Accueil",
      icon: LayoutDashboard,
    },
    {
      href: "/personnel/comptable/rapports",
      label: "Rapports",
      icon: BarChart3,
    },
    {
      href: "/personnel/comptable/clients",
      label: "Clients",
      icon: Users,
    },
  ],
  manager: [
    {
      href: "/personnel/manager/dashboard",
      label: "Accueil",
      icon: LayoutDashboard,
    },
    {
      href: "/personnel/manager/commandes",
      label: "Commandes",
      icon: List,
    },
    {
      href: "/personnel/manager/commandes/nouvelle",
      label: "Nouvelle",
      icon: PlusCircle,
      elevated: true,
    },
    {
      href: "/personnel/manager/clients",
      label: "Clients",
      icon: Users,
    },
    {
      href: "/personnel/manager/rapports",
      label: "Rapports",
      icon: BarChart3,
    },
  ],
};

/** Libellés FR courts pour le badge de rôle affiché dans la sidebar. */
export const ROLE_LABELS: Record<PersonnelRole, string> = {
  receptionniste: "Réceptionniste",
  caissier: "Caissier",
  laveur: "Laveur",
  repassage: "Repassage",
  livreur: "Livreur",
  comptable: "Comptable",
  manager: "Manager",
};

/** Vérifie qu'une valeur est un rôle personnel valide (type guard). */
export function isPersonnelRole(value: string): value is PersonnelRole {
  return value in NAV_ITEMS_BY_ROLE;
}

/** Retourne l'icône lucide pour un rôle (utilisée dans les dashboards). */
export const ROLE_ICONS: Record<PersonnelRole, LucideIcon> = {
  receptionniste: Users,
  caissier: Wallet,
  laveur: List,
  repassage: List,
  livreur: Package,
  comptable: BarChart3,
  manager: LayoutDashboard,
};
