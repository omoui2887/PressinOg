/**
 * OgPressing — Hero "Le Plan d'Ouverture" (LOT 17 — Section B)
 * ------------------------------------------------------------
 * Hero plein écran (100dvh) avec image de fond (intérieur de pressing
 * moderne / vapeur de fer à repasser) + overlay dégradé Bleu Nuit.
 *
 * Contenu (poussé vers le tiers inférieur gauche) :
 *   - Titre 2 lignes (pattern MANDATORY) :
 *       L1 (Plus Jakarta Sans 700, texte clair) : "La gestion de votre pressing,"
 *       L2 (Fraunces italic, 3-4× plus grande, "réinventée." avec "réinventée"
 *           en Or Textile)
 *   - Sous-titre : "Point de Vente, suivi par article, CRM et gestion
 *     d'équipe — pensé pour la Côte d'Ivoire, en FCFA."
 *   - CTA "Essayer gratuitement 7 jours" → scroll vers #inscription
 *   - Trust badges : 🇨🇮 Conçu pour la Côte d'Ivoire · FCFA & Mobile Money ·
 *     Essai 7 jours gratuit
 *
 * Animation GSAP fade-up (y: 40 → 0, opacity 0 → 1) avec stagger 0.08 sur
 * titre L1, L2, sous-titre, CTA, badges. Dynamic import + usePrefersReducedMotion.
 */
"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { usePrefersReducedMotion } from "@/lib/motion/hooks";

const HERO_IMAGE_URL =
  "https://images.unsplash.com/photo-1582735689369-4fe89db7114c?auto=format&fit=crop&w=2000&q=80";

const TRUST_BADGES = [
  { label: "🇨🇮 Conçu pour la Côte d'Ivoire" },
  { label: "FCFA & Mobile Money" },
  { label: "Essai 7 jours gratuit" },
];

export function Hero() {
  const rootRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (prefersReducedMotion) return;
    if (typeof window === "undefined") return;
    // Pas d'animation GSAP sur mobile (< 768px) : on garde la simplicité.
    if (window.innerWidth < 768) return;

    let ctx: { revert: () => void } | undefined;
    let cancelled = false;

    (async () => {
      const gsap = (await import("gsap")).default;
      if (cancelled || !rootRef.current) return;
      ctx = gsap.context(() => {
        gsap.from("[data-hero-anim]", {
          y: 40,
          opacity: 0,
          duration: 1,
          ease: "power3.out",
          stagger: 0.08,
          delay: 0.15,
        });
      }, rootRef);
    })();

    return () => {
      cancelled = true;
      ctx?.revert();
    };
  }, [prefersReducedMotion]);

  return (
    <section
      ref={rootRef}
      className="relative flex min-h-[100dvh] w-full flex-col justify-end overflow-hidden bg-landing-primary"
      aria-label="OgPressing — Le Plan d'Ouverture"
    >
      {/* Image de fond */}
      <Image
        src={HERO_IMAGE_URL}
        alt="Intérieur d'un pressing professionnel moderne avec chemises repassées sur cintres"
        fill
        priority
        sizes="100vw"
        className="object-cover"
      />

      {/* Overlay dégradé Bleu Nuit — sombre en bas */}
      <div
        className="absolute inset-0 bg-gradient-to-t from-landing-primary-deep via-landing-primary/80 to-landing-primary/40"
        aria-hidden
      />
      <div
        className="absolute inset-0 bg-landing-primary/20"
        aria-hidden
      />

      {/* Contenu — tiers inférieur gauche */}
      <div className="relative z-10 mx-auto w-full max-w-7xl px-5 pb-16 pt-32 sm:px-6 sm:pb-20 lg:px-8 lg:pb-28">
        <div className="max-w-3xl">
          <p
            data-hero-anim
            className="mb-5 inline-flex items-center gap-2 rounded-full border border-landing-accent/30 bg-landing-accent/10 px-3 py-1 font-plex-mono text-[11px] uppercase tracking-[0.18em] text-landing-accent-soft sm:text-xs"
          >
            <span className="ogp-pulse-dot inline-block size-1.5 rounded-full bg-landing-accent" />
            Le Plan d&apos;Ouverture
          </p>

          <h1 className="font-jakarta font-bold tracking-tight text-white">
            <span
              data-hero-anim
              className="block text-xl font-semibold text-white/90 sm:text-2xl md:text-3xl lg:text-4xl"
            >
              La gestion de votre pressing,
            </span>
            <span
              data-hero-anim
              className="mt-1 block font-fraunces text-5xl italic leading-[1.05] sm:text-6xl md:text-7xl lg:text-8xl"
            >
              <span className="text-landing-accent">réinventée.</span>
            </span>
          </h1>

          <p
            data-hero-anim
            className="mt-6 max-w-xl text-sm text-white/80 sm:text-base md:text-lg"
          >
            Point de Vente, suivi par article, CRM et gestion d&apos;équipe —
            pensé pour la Côte d&apos;Ivoire, en FCFA.
          </p>

          <div data-hero-anim className="mt-8 flex flex-wrap items-center gap-3">
            <a
              href="#inscription"
              className="landing-cta landing-cta-on-dark text-sm sm:text-base"
            >
              <span className="landing-cta-bg" />
              <span className="landing-cta-label">Essayer gratuitement 7 jours</span>
            </a>
            <a
              href="#fonctionnalites"
              className="landing-link landing-link-underline text-sm font-medium text-white/70 hover:text-white sm:text-base"
            >
              Découvrir les fonctionnalités
            </a>
          </div>

          {/* Trust badges */}
          <ul
            data-hero-anim
            className="mt-8 flex flex-wrap gap-2 sm:gap-3"
            aria-label="Points de confiance"
          >
            {TRUST_BADGES.map((badge) => (
              <li
                key={badge.label}
                className="rounded-full border border-white/15 bg-white/5 px-3 py-1 font-plex-mono text-[10px] uppercase tracking-wider text-white/70 backdrop-blur-sm sm:text-[11px]"
              >
                {badge.label}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Indicateur de scroll en bas */}
      <div
        className="absolute bottom-4 left-1/2 z-10 hidden -translate-x-1/2 flex-col items-center gap-1 text-white/40 md:flex"
        aria-hidden
      >
        <span className="font-plex-mono text-[10px] uppercase tracking-[0.2em]">
          Défilez
        </span>
        <span className="h-8 w-px bg-gradient-to-b from-white/40 to-transparent" />
      </div>
    </section>
  );
}

export default Hero;
