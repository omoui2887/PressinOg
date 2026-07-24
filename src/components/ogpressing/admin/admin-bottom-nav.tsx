/**
 * OgPressing — AdminBottomNav
 * ----------------------------
 * Barre de navigation mobile pour l'espace Admin pressing. 5 items
 * principaux + 1 bouton "Plus" (menu à 3 points) ouvrant une Sheet avec
 * les 4 items secondaires.
 *
 * Layout : 6 slots flex-1 (5 items + Plus). Le slot central
 * ("Nouvelle commande") est élevé visuellement (bouton flottant circulaire
 * plus grand, couleur primary, légèrement décalé vers le haut).
 *
 * Client component : usePathname pour l'état actif, Sheet pour le menu Plus.
 */
"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  PlusCircle,
  List,
  Users,
  BarChart3,
  MoreHorizontal,
  UserCog,
  Package,
  Tag,
  Settings,
  type LucideIcon,
  X,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
  SheetClose,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

interface BottomNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

// 5 items principaux (ordre demandé : Tb, Cmd, Nouv central, Clients, Rapports)
const MAIN_ITEMS: BottomNavItem[] = [
  { href: "/admin/dashboard", label: "Accueil", icon: Home },
  { href: "/admin/commandes", label: "Commandes", icon: List },
  // slot central (index 2) — surélevé
  { href: "/admin/commandes/nouvelle", label: "Nouvelle", icon: PlusCircle },
  { href: "/admin/clients", label: "Clients", icon: Users },
  { href: "/admin/rapports", label: "Rapports", icon: BarChart3 },
];

// Items secondaires (menu "Plus")
const MORE_ITEMS: BottomNavItem[] = [
  { href: "/admin/personnel", label: "Personnel", icon: UserCog },
  { href: "/admin/stock", label: "Stock", icon: Package },
  { href: "/admin/services", label: "Services", icon: Tag },
  { href: "/admin/pressing", label: "Mon pressing", icon: Settings },
];

// L'index du slot central surélevé (bouton "Nouvelle commande").
const ELEVATED_INDEX = 2;

export function AdminBottomNav() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  function isActive(href: string) {
    if (href === pathname) return true;
    // Cas particulier : /admin/commandes est actif sur /admin/commandes/nouvelle
    // MAIS on veut que /admin/commandes/nouvelle soit actif sur sa propre page.
    // Donc on n'active /admin/commandes que si pathname commence par /admin/commandes
    // ET n'est pas /admin/commandes/nouvelle.
    if (href === "/admin/commandes") {
      return (
        pathname.startsWith("/admin/commandes") &&
        !pathname.startsWith("/admin/commandes/nouvelle")
      );
    }
    return pathname.startsWith(href + "/");
  }

  return (
    <nav
      aria-label="Navigation mobile"
      className="relative flex items-end justify-around border-t border-border bg-card/95 px-1 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] backdrop-blur-md"
      style={{ minHeight: "4.5rem" }}
    >
      {MAIN_ITEMS.map((item, index) => {
        const active = isActive(item.href);
        const elevated = index === ELEVATED_INDEX;

        if (elevated) {
          // Bouton flottant central, surélevé, plus grand, couleur primary
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.label}
              aria-current={active ? "page" : undefined}
              className="flex flex-1 flex-col items-center justify-end"
            >
              <span
                className={cn(
                  "-mt-6 flex size-14 items-center justify-center rounded-full border-4 border-card bg-primary text-primary-foreground shadow-lg transition-transform",
                  "hover:-translate-y-1 hover:scale-105 active:scale-95",
                  active && "ring-2 ring-primary/40 ring-offset-2 ring-offset-card"
                )}
              >
                <item.icon className="size-7" />
              </span>
              <span
                className={cn(
                  "mt-1 text-[10px] font-semibold leading-none",
                  active ? "text-primary" : "text-muted-foreground"
                )}
              >
                {item.label}
              </span>
            </Link>
          );
        }

        // Slots normaux (icône + label, height aligné sur le bas)
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-label={item.label}
            aria-current={active ? "page" : undefined}
            className="flex flex-1 flex-col items-center justify-end gap-1 pb-1 pt-2"
          >
            <item.icon
              className={cn(
                "size-5 transition-colors",
                active ? "text-primary" : "text-muted-foreground"
              )}
            />
            <span
              className={cn(
                "text-[10px] font-medium leading-none transition-colors",
                active ? "text-primary" : "text-muted-foreground"
              )}
            >
              {item.label}
            </span>
          </Link>
        );
      })}

      {/* Bouton "Plus" — ouvre la Sheet des items secondaires */}
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetTrigger asChild>
          <button
            type="button"
            aria-label="Plus d'options"
            className="flex flex-1 flex-col items-center justify-end gap-1 pb-1 pt-2"
          >
            <MoreHorizontal className="size-5 text-muted-foreground" />
            <span className="text-[10px] font-medium leading-none text-muted-foreground">
              Plus
            </span>
          </button>
        </SheetTrigger>
        <SheetContent side="bottom" className="rounded-t-2xl p-0">
          <SheetTitle className="sr-only">Plus d&apos;options</SheetTitle>
          <div className="relative px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold text-foreground">
                Plus d&apos;options
              </h2>
              <SheetClose asChild>
                <button
                  type="button"
                  aria-label="Fermer"
                  className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
                >
                  <X className="size-4" />
                </button>
              </SheetClose>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {MORE_ITEMS.map((item) => {
                const active = isActive(item.href);
                return (
                  <SheetClose asChild key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex flex-col items-start gap-2 rounded-xl border p-3 transition-colors",
                        active
                          ? "border-primary bg-primary/5 text-primary"
                          : "border-border bg-card text-foreground hover:bg-accent"
                      )}
                    >
                      <item.icon className="size-5" />
                      <span className="text-sm font-medium">{item.label}</span>
                    </Link>
                  </SheetClose>
                );
              })}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </nav>
  );
}
