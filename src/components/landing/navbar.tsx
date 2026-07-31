/**
 * OgPressing — Navbar flottante "L'Île Flottante" (LOT 17 — Section A)
 * -------------------------------------------------------------------
 * Pilule flottante fixed en haut, centrée horizontalement.
 *
 * Contenu :
 *   - Logo "OgPressing"
 *   - Liens : Fonctionnalités, Tarifs, Témoignages
 *   - CTA "Essayer gratuitement" (Or Textile) → scroll vers #inscription
 *   - Lien discret "Se connecter" → /login
 *
 * Morphing scroll :
 *   - Au-dessus du Hero (scrollY < 24) : transparent, texte clair.
 *   - Au-delà : bg-landing-bg/60 backdrop-blur-xl, texte sombre, bordure subtile.
 *
 * Implémentation du scroll : useSyncExternalStore (pattern sans effet de
 * layout, SSR-safe) — même approche que PublicHeader.
 *
 * Mobile : version minimaliste (logo + CTA compact), les liens desktop
 * sont masqués sous md:.
 */
"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { href: "#fonctionnalites", label: "Fonctionnalités" },
  { href: "#tarifs", label: "Tarifs" },
  { href: "#temoignages", label: "Témoignages" },
];

function subscribeScroll(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("scroll", callback, { passive: true });
  return () => window.removeEventListener("scroll", callback);
}
function getScrollSnapshot() {
  if (typeof window === "undefined") return false;
  return window.scrollY > 24;
}
function getServerSnapshot() {
  return false;
}

export function Navbar() {
  const scrolled = useSyncExternalStore(
    subscribeScroll,
    getScrollSnapshot,
    getServerSnapshot
  );

  return (
    <header
      className="fixed inset-x-0 top-3 z-50 flex justify-center px-3 sm:top-4 sm:px-4"
      aria-label="Navigation principale"
    >
      <nav
        className={cn(
          "flex items-center gap-2 rounded-full border px-3 py-2 transition-all duration-500 sm:gap-4 sm:px-4",
          "duration-500",
          scrolled
            ? "border-landing-ink/10 bg-landing-bg/70 shadow-[0_8px_32px_-12px_rgba(20,21,26,0.18)] backdrop-blur-xl"
            : "border-white/10 bg-landing-primary/20 backdrop-blur-sm"
        )}
        style={{
          transitionTimingFunction: "cubic-bezier(0.25, 0.46, 0.45, 0.94)",
        }}
      >
        {/* Logo */}
        <a
          href="/"
          className={cn(
            "flex items-center gap-2 font-jakarta text-base font-extrabold tracking-tight transition-colors sm:text-lg",
            scrolled ? "text-landing-ink" : "text-white"
          )}
          aria-label="OgPressing — Accueil"
        >
          <span
            className={cn(
              "flex size-7 items-center justify-center rounded-lg text-xs font-bold transition-colors sm:size-8",
              scrolled
                ? "bg-landing-primary text-white"
                : "bg-landing-accent text-landing-primary"
            )}
          >
            Og
          </span>
          <span className="hidden xs:inline sm:inline">
            Og<span className={scrolled ? "text-landing-accent-deep" : "text-landing-accent"}>Pressing</span>
          </span>
        </a>

        {/* Liens desktop */}
        <div className="mx-1 hidden h-6 w-px bg-landing-ink/10 md:block" aria-hidden />
        <div className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "landing-link landing-link-underline rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                scrolled
                  ? "text-landing-ink/70 hover:text-landing-ink"
                  : "text-white/80 hover:text-white"
              )}
            >
              {link.label}
            </Link>
          ))}
        </div>

        <div className="flex-1" aria-hidden />

        {/* Se connecter (desktop only) */}
        <a
          href="/login"
          className={cn(
            "landing-link landing-link-underline hidden px-3 py-1.5 text-sm font-medium transition-colors md:inline-block",
            scrolled
              ? "text-landing-ink/70 hover:text-landing-ink"
              : "text-white/80 hover:text-white"
          )}
        >
          Se connecter
        </a>

        {/* CTA Essayer gratuitement */}
        <a
          href="#inscription"
          className="landing-cta landing-cta-on-dark !px-4 !py-2 text-xs font-semibold sm:!px-5 sm:text-sm"
        >
          <span className="landing-cta-bg" />
          <span className="landing-cta-label">Essayer gratuitement</span>
        </a>
      </nav>
    </header>
  );
}

export default Navbar;
