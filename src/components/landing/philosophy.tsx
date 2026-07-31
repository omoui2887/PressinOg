/**
 * OgPressing — Philosophie "Le Manifeste" (LOT 17 — Section D)
 * ------------------------------------------------------------
 * Section plein-cadre, fond Bleu Nuit Pressing (landing-primary).
 * Une texture organique (tissu / fibre de coton en gros plan) en
 * parallax à faible opacité derrière le texte.
 *
 * Deux déclarations contrastées :
 *   1. "La plupart des pressings se concentrent sur : les cahiers, les
 *      tickets papier et la mémoire." — texte clair neutre, taille modérée.
 *   2. "Nous nous concentrons sur : la traçabilité numérique et la
 *      confiance retrouvée." — massif, Fraunces italic, "confiance"
 *      en Or Textile.
 *
 * Animation GSAP reveal ligne-par-ligne déclenché par ScrollTrigger.
 * Sur mobile : pas de parallax (juste l'image fixe), pas de GSAP.
 */
"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { usePrefersReducedMotion } from "@/lib/motion/hooks";

const TEXTURE_IMAGE_URL =
  "https://images.unsplash.com/photo-1605000797499-95a51c5269ae?auto=format&fit=crop&w=1800&q=80";

export function Philosophy() {
  const rootRef = useRef<HTMLDivElement>(null);
  const textureRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (prefersReducedMotion) return;
    if (typeof window === "undefined") return;
    const isMobile = window.innerWidth < 768;

    let ctx: { revert: () => void } | undefined;
    let cancelled = false;

    (async () => {
      const gsap = (await import("gsap")).default;
      const { ScrollTrigger } = await import("gsap/ScrollTrigger");
      if (cancelled || !rootRef.current) return;
      gsap.registerPlugin(ScrollTrigger);

      ctx = gsap.context(() => {
        // Reveal ligne-par-ligne du manifeste
        gsap.from("[data-philosophy-line]", {
          y: 40,
          opacity: 0,
          duration: 1.1,
          ease: "power3.out",
          stagger: 0.18,
          scrollTrigger: {
            trigger: rootRef.current,
            start: "top 70%",
            once: true,
          },
        });

        // Parallax sur la texture (desktop seulement)
        if (!isMobile && textureRef.current) {
          gsap.to(textureRef.current, {
            yPercent: 18,
            ease: "none",
            scrollTrigger: {
              trigger: rootRef.current,
              start: "top bottom",
              end: "bottom top",
              scrub: true,
            },
          });
        }
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
      className="relative overflow-hidden bg-landing-primary py-24 sm:py-32 md:py-40"
      aria-label="Manifeste OgPressing"
    >
      {/* Texture organique en parallax */}
      <div
        ref={textureRef}
        className="absolute inset-0 z-0 will-change-transform"
        aria-hidden
      >
        <Image
          src={TEXTURE_IMAGE_URL}
          alt=""
          fill
          loading="lazy"
          sizes="100vw"
          className="object-cover opacity-20"
        />
      </div>

      {/* Voile Bleu Nuit pour renforcer le contraste */}
      <div
        className="absolute inset-0 z-0 bg-gradient-to-b from-landing-primary-deep/60 via-landing-primary/40 to-landing-primary-deep/60"
        aria-hidden
      />

      <div className="relative z-10 mx-auto max-w-5xl px-5 sm:px-6 lg:px-8">
        {/* Préambule */}
        <p
          data-philosophy-line
          className="mb-10 text-center font-plex-mono text-[11px] uppercase tracking-[0.3em] text-landing-accent-soft sm:mb-14 sm:text-xs"
        >
          Le Manifeste
        </p>

        {/* Déclaration 1 — ce que font les autres */}
        <p
          data-philosophy-line
          className="mx-auto mb-10 max-w-3xl text-center text-base text-white/60 sm:mb-14 sm:text-lg md:text-xl"
        >
          La plupart des pressings se concentrent sur :{" "}
          <span className="text-white/80">les cahiers, les tickets papier et la mémoire.</span>
        </p>

        {/* Séparateur Or */}
        <div
          data-philosophy-line
          className="mx-auto mb-10 flex items-center justify-center gap-3 sm:mb-14"
          aria-hidden
        >
          <span className="h-px w-12 bg-landing-accent/40" />
          <span className="font-plex-mono text-[10px] uppercase tracking-[0.3em] text-landing-accent">
            Notre approche
          </span>
          <span className="h-px w-12 bg-landing-accent/40" />
        </div>

        {/* Déclaration 2 — ce que nous faisons */}
        <p
          data-philosophy-line
          className="mx-auto max-w-4xl text-center font-fraunces text-3xl italic leading-[1.15] text-white sm:text-4xl md:text-5xl lg:text-6xl"
        >
          Nous nous concentrons sur : la traçabilité numérique et la{" "}
          <span className="text-landing-accent">confiance</span> retrouvée.
        </p>

        {/* Signature */}
        <p
          data-philosophy-line
          className="mt-12 text-center font-plex-mono text-[11px] uppercase tracking-[0.25em] text-white/40 sm:mt-16"
        >
          — OgPressing, conçu en Côte d&apos;Ivoire
        </p>
      </div>
    </section>
  );
}

export default Philosophy;
