/**
 * OgPressing — BottomNav (générique)
 * -----------------------------------
 * Barre de navigation fixée en bas de l'écran, visible UNIQUEMENT sur mobile
 * (cachée sur desktop via le breakpoint `md`). Conçue pour être réutilisée
 * par tous les rôles (Admin, Caissier, Repasseur, Livreur…) grâce à sa prop
 * `items`.
 *
 * Principes mobile-first (PRD §2.4 — 80% des users sur mobile) :
 *   - Zones tactiles ≥ 44px de hauteur
 *   - Icône + libellé court, état actif coloré
 *   - Safe area iOS (env(safe-area-inset-bottom))
 *   - Background opaque + border-top pour rester lisible au scroll
 *
 * Usage :
 *   <BottomNav
 *     items={[
 *       { label: "Accueil", icon: Home, href: "/admin/dashboard" },
 *       { label: "Commandes", icon: List, href: "/admin/commandes" },
 *     ]}
 *   />
 *
 * Pour un item "mis en avant" (FAB central, ex : "Nouvelle commande"),
 * passez `highlight: true` sur l'item concerné — il sera rendu plus grand
 * avec un fond primary et surélevé.
 */
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface BottomNavItem {
  /** Libellé court affiché sous l'icône. */
  label: string;
  /** Icône lucide-react. */
  icon: LucideIcon;
  /** URL de destination (relative, ex : "/admin/dashboard"). */
  href: string;
  /** Si true, l'item est mis en avant visuellement (FAB central surélevé). */
  highlight?: boolean;
}

interface BottomNavProps {
  items: BottomNavItem[];
  /** Classe additionnelle sur le conteneur. */
  className?: string;
}

export function BottomNav({ items, className }: BottomNavProps) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Navigation principale (mobile)"
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around border-t bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 md:hidden",
        // Safe area iOS : respecte l'encart en bas (home indicator)
        "pb-[max(0.25rem,env(safe-area-inset-bottom))]",
        className
      )}
    >
      {items.map((item) => {
        const Icon = item.icon;
        // Actif si le pathname commence par le href (gère les sous-routes)
        const active =
          pathname === item.href || pathname.startsWith(item.href + "/");

        if (item.highlight) {
          // Item mis en avant : FAB central surélevé
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.label}
              aria-current={active ? "page" : undefined}
              className="flex flex-1 flex-col items-center justify-end pb-1"
            >
              <span className="-mt-6 flex size-14 items-center justify-center rounded-full border-4 border-card bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 active:scale-95">
                <Icon className="size-6" />
              </span>
              <span className="mt-1 text-[10px] font-medium leading-none text-primary">
                {item.label}
              </span>
            </Link>
          );
        }

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-label={item.label}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 px-1 py-2 text-muted-foreground transition-colors",
              "hover:text-foreground active:bg-accent",
              active && "text-primary"
            )}
          >
            <Icon className="size-5" />
            <span className="text-[10px] font-medium leading-none">
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
