/**
 * OgPressing — Header public (landing, login, activation)
 * -------------------------------------------------------
 * Header sticky avec logo, navigation desktop, menu mobile (Sheet),
 * et 2 CTA (Se connecter / S'inscrire).
 *
 * Client component car le menu mobile est interactif.
 *
 * Note hydration : Le menu mobile (Radix Sheet/Dialog) utilise useId()
 * pour générer les attributs aria-controls. En SSR Next.js 16, l'arbre
 * React côté serveur et client peut différer subtilement (extensions
 * navigateur, RSC boundary), ce qui produit des IDs Radix différents
 * et déclenche une hydration mismatch sur aria-controls.
 *
 * Fix : on retarde le rendu du Sheet interactif jusqu'au montage client
 * (mounted gate). Avant le montage, on affiche un bouton statique
 * identique (même dimensions, même icône) pour éviter le layout shift.
 * Le serveur et le premier rendu client produisent ainsi le même HTML,
 * puis le Sheet interactif est monté après hydration.
 */
"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Menu, X, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetDescription, SheetClose } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { href: "#fonctionnalites", label: "Fonctionnalités" },
  { href: "#tarifs", label: "Tarifs" },
  { href: "#temoignages", label: "Témoignages" },
];

/* ----------------------- External stores (no setState-in-effect) ----------------------- */

/** Retourne true côté client après hydration, false côté serveur et lors du
 *  premier render client. Utilisé comme "mounted gate" pour les composants
 *  Radix interactifs (Sheet/Dialog) dont les useId() causent des hydration
 *  mismatches en SSR Next.js 16. */
function subscribeNoop() {
  return () => {};
}
function getClientSnapshot() {
  return true;
}
function getServerSnapshot() {
  return false;
}

/** Abonne au scroll de la fenêtre et retourne true si scrollY > 8. */
function subscribeScroll(callback: () => void) {
  window.addEventListener("scroll", callback, { passive: true });
  return () => window.removeEventListener("scroll", callback);
}
function getScrollSnapshot() {
  return window.scrollY > 8;
}

export function PublicHeader() {
  const scrolled = useSyncExternalStore(
    subscribeScroll,
    getScrollSnapshot,
    () => false // serveur : jamais scrolled
  );
  const [open, setOpen] = useState(false);
  const mounted = useSyncExternalStore(
    subscribeNoop,
    getClientSnapshot,
    getServerSnapshot
  );

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full border-b transition-all duration-200",
        scrolled
          ? "bg-background/85 backdrop-blur-md border-border shadow-sm"
          : "bg-transparent border-transparent"
      )}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Logo — <a> (hard nav) plutôt que <Link> pour éviter le fetch RSC
            bloqué en cross-origin dans le preview iframe (cf. Task 17/22). */}
        <a href="/" className="flex items-center gap-2 font-bold text-lg">
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
            <ShoppingBag className="size-5" />
          </span>
          <span className="text-foreground">
            Og<span className="text-primary">Pressing</span>
          </span>
        </a>

        {/* Nav desktop */}
        <nav className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground hover:bg-accent"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* CTA desktop */}
        <div className="hidden items-center gap-2 md:flex">
          <Button variant="ghost" size="sm" asChild>
            {/* <a> (hard nav) — évite le fetch RSC bloqué en cross-origin (Task 22). */}
            <a href="/login">Se connecter</a>
          </Button>
          <Button size="sm" asChild>
            <Link href="#inscription">S&apos;inscrire</Link>
          </Button>
        </div>

        {/* Menu mobile — mounted gate pour éviter la hydration mismatch
            sur aria-controls (Radix useId différent entre serveur et client). */}
        {mounted ? (
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                aria-label="Ouvrir le menu"
              >
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-full max-w-xs p-0">
              <SheetTitle className="sr-only">Menu de navigation</SheetTitle>
              <SheetDescription className="sr-only">
                Navigation principale et accès au compte OgPressing.
              </SheetDescription>
              <div className="flex h-full flex-col">
                <div className="flex items-center justify-between border-b px-4 py-4">
                  <span className="flex items-center gap-2 font-bold">
                    <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                      <ShoppingBag className="size-4" />
                    </span>
                    Og<span className="text-primary">Pressing</span>
                  </span>
                  <SheetClose asChild>
                    <Button variant="ghost" size="icon" aria-label="Fermer le menu">
                      <X className="size-5" />
                    </Button>
                  </SheetClose>
                </div>
                <nav className="flex flex-1 flex-col gap-1 p-4">
                  {NAV_LINKS.map((link) => (
                    <SheetClose asChild key={link.href}>
                      <Link
                        href={link.href}
                        className="rounded-md px-3 py-2.5 text-base font-medium text-foreground transition-colors hover:bg-accent"
                      >
                        {link.label}
                      </Link>
                    </SheetClose>
                  ))}
                </nav>
                <div className="flex flex-col gap-2 border-t p-4">
                  <SheetClose asChild>
                    <Button variant="outline" asChild>
                      {/* <a> (hard nav) — évite le fetch RSC bloqué en cross-origin (Task 22). */}
                      <a href="/login">Se connecter</a>
                    </Button>
                  </SheetClose>
                  <SheetClose asChild>
                    <Button asChild>
                      <Link href="#inscription">S&apos;inscrire</Link>
                    </Button>
                  </SheetClose>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        ) : (
          /* Bouton statique placeholder (mêmes dimensions que le bouton
             interactif) pour éviter le layout shift avant le montage.
             Pas d'attribut aria-controls → pas de mismatch. */
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label="Ouvrir le menu"
            disabled
          >
            <Menu className="size-5" />
          </Button>
        )}
      </div>
    </header>
  );
}
