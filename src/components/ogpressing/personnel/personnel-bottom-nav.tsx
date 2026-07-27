/**
 * OgPressing — PersonnelBottomNav (LOT 13)
 * ----------------------------------------
 * Barre de navigation mobile pour l'espace Personnel. Adapte dynamiquement
 * ses items selon le rôle connecté (receptionniste, caissier, laveur, etc.).
 *
 * Layout :
 *   - Rôles à ≤ 5 items : tous les items en slots flex-1.
 *   - Rôles à > 5 items (Manager) : 5 items principaux + bouton "Plus"
 *     (Sheet avec les items secondaires — pattern identique à AdminBottomNav).
 *
 * L'item `elevated: true` est rendu en bouton flottant central surélevé
 * (CTA principal : Nouvelle commande pour réceptionniste/manager, Encaisser
 * pour caissier).
 *
 * Client component : usePathname pour l'état actif, Sheet pour le menu Plus.
 */
"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MoreHorizontal, X } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
  SheetClose,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import {
  BOTTOM_NAV_MAIN_BY_ROLE,
  MORE_ITEMS_BY_ROLE,
  type PersonnelRole,
  type PersonnelNavItem,
} from "./personnel-nav-config";

interface PersonnelBottomNavProps {
  role: PersonnelRole;
}

export function PersonnelBottomNav({ role }: PersonnelBottomNavProps) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  const mainItems = BOTTOM_NAV_MAIN_BY_ROLE[role] ?? [];
  const moreItems = MORE_ITEMS_BY_ROLE[role] ?? [];
  const hasMore = moreItems.length > 0;

  /** Renvoie true si l'item correspond à la route courante.
   *  Gère le cas particulier : /personnel/{role}/commandes doit rester actif
   *  sur la liste même quand on est sur /nouvelle (sauf si /nouvelle a son
   *  propre item elevated). */
  function isActive(href: string): boolean {
    if (href === pathname) return true;
    // Correspondance préfixe (ex : /dashboard actif sur /dashboard/xxx)
    return pathname.startsWith(href + "/");
  }

  return (
    <nav
      aria-label="Navigation mobile"
      className="relative flex items-end justify-around border-t border-border bg-card/95 px-1 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] backdrop-blur-md"
      style={{ minHeight: "4.5rem" }}
    >
      {mainItems.map((item) => {
        const active = isActive(item.href);
        const elevated = item.elevated === true;

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

      {/* Bouton "Plus" — visible uniquement pour les rôles ayant des items secondaires */}
      {hasMore && (
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
                {moreItems.map((item: PersonnelNavItem) => {
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
      )}
    </nav>
  );
}
