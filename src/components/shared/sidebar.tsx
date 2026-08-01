/**
 * OgPressing — Sidebar (générique standalone)
 * --------------------------------------------
 * Menu latéral réutilisable, visible uniquement sur desktop (caché sur mobile
 * où la BottomNav prend le relais). Affiche :
 *   - Le logo / la marque en haut (brand)
 *   - La liste des liens de navigation (items)
 *   - Les infos de l'utilisateur connecté + bouton déconnexion en bas
 *
 * Composant CLIENT car il utilise usePathname pour mettre en évidence le lien
 * actif. Aucune logique métier : tout est passé en props pour rester générique.
 *
 * Usage :
 *   <Sidebar
 *     brand={{ name: "OgPressing", logoUrl: null }}
 *     items={[{ label: "Dashboard", icon: Home, href: "/admin/dashboard" }]}
 *     user={{ nom: "Awa Koné", email: "awa@pressing.ci", roleLabel: "Manager" }}
 *     onLogout={() => signOut()}
 *   />
 *
 * Note : Dans OgPressing, le DashboardLayout (`components/ogpressing/dashboard-layout.tsx`)
 * intègre directement sa propre sidebar. Ce composant standalone est fourni
 * pour les cas où l'on veut une sidebar SANS le DashboardLayout complet
 * (ex : page plein écran, iframe, etc.).
 */
"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { ShoppingBag, LogOut, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface SidebarItem {
  label: string;
  icon: LucideIcon;
  href: string;
  /** Si fourni, désactive le lien (ex : "Bientôt disponible"). */
  disabled?: boolean;
}

export interface SidebarBrand {
  name: string;
  logoUrl?: string | null;
}

export interface SidebarUser {
  nom: string;
  email?: string;
  roleLabel?: string;
}

export interface SidebarProps {
  brand?: SidebarBrand;
  items: SidebarItem[];
  user?: SidebarUser;
  /** Callback du bouton déconnexion. Si absent, le bouton n'est pas rendu. */
  onLogout?: () => void;
  className?: string;
}

export function Sidebar({
  brand,
  items,
  user,
  onLogout,
  className,
}: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside
      aria-label="Navigation latérale"
      className={cn(
        "hidden w-64 shrink-0 flex-col border-r bg-card md:flex",
        className
      )}
    >
      {/* Marque / logo */}
      {brand && (
        <div className="flex h-16 items-center gap-2 border-b px-6">
          {brand.logoUrl ? (
            <Image
              src={brand.logoUrl}
              alt={brand.name}
              width={32}
              height={32}
              className="size-8 rounded-lg object-contain"
            />
          ) : (
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <ShoppingBag className="size-4" />
            </span>
          )}
          <span className="truncate text-sm font-bold text-foreground">
            {brand.name}
          </span>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {items.map((item) => {
          const Icon = item.icon;
          const active =
            !item.disabled &&
            (pathname === item.href || pathname.startsWith(item.href + "/"));
          return (
            <Link
              key={item.href}
              href={item.disabled ? "#" : item.href}
              aria-disabled={item.disabled}
              aria-current={active ? "page" : undefined}
              tabIndex={item.disabled ? -1 : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
                item.disabled && "cursor-not-allowed opacity-50 hover:bg-transparent"
              )}
            >
              <Icon className="size-4 shrink-0" />
              <span className="truncate">{item.label}</span>
              {item.disabled && (
                <span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  Bientôt
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Utilisateur + déconnexion */}
      {user && (
        <div className="border-t p-3">
          <div className="flex items-center gap-3 rounded-lg px-2 py-2">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
              {user.nom.charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">
                {user.nom}
              </p>
              {user.roleLabel && (
                <p className="truncate text-xs text-muted-foreground">
                  {user.roleLabel}
                </p>
              )}
            </div>
          </div>
          {onLogout && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onLogout}
              className="mt-1 w-full justify-start gap-2 text-muted-foreground hover:text-danger"
            >
              <LogOut className="size-4" />
              Se déconnecter
            </Button>
          )}
        </div>
      )}
    </aside>
  );
}
