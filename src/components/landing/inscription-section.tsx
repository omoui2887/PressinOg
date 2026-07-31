/**
 * OgPressing — Section Inscription (LOT 17 — Section G)
 * -----------------------------------------------------
 * Wrapper qui réutilise le composant InscriptionForm existant
 * (react-hook-form + zod + 11 champs) en l'entourant d'un conteneur
 * au style cinématographique (landing-card-dark, accents Or).
 *
 * La logique interne du formulaire (validation, soumission, états
 * succès/erreur) n'est PAS modifiée — on ne touche qu'au wrapper.
 *
 * - Ancre id="inscription", scroll-mt-24 (la navbar flottante ne
 *   recouvre pas le formulaire quand on arrive dessus).
 * - Header de section : badge "Inscription" Or, titre "Demandez votre
 *   accès" Plus Jakarta Sans bold, sous-titre muted.
 * - Bannière de présélection plan (si useInscriptionStore.selectedPlan)
 *   restylée avec accents Or.
 * - Le formulaire lui-même (InscriptionForm) est chargé via dynamic
 *   import sans ssr pour différer son JS (~40% du JS de la landing).
 */
"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { usePrefersReducedMotion } from "@/lib/motion/hooks";
import { useInscriptionStore, PLAN_LABELS } from "@/lib/stores/inscription-store";

// Lazy-load du formulaire : on diffère son JS (react-hook-form + zod +
// tous les composants shadcn/ui) hors du First Paint de la landing.
const InscriptionForm = dynamic(
  () =>
    import("@/components/ogpressing/landing/inscription-form").then(
      (m) => m.InscriptionForm
    ),
  {
    ssr: false,
    loading: () => <InscriptionFormSkeleton />,
  }
);

function InscriptionFormSkeleton() {
  return (
    <div className="space-y-5" aria-hidden>
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <div className="h-3 w-20 animate-pulse rounded bg-landing-ink/10" />
            <div className="h-11 w-full animate-pulse rounded-md bg-landing-ink/5" />
          </div>
        ))}
      </div>
      <div className="space-y-2">
        <div className="h-3 w-32 animate-pulse rounded bg-landing-ink/10" />
        <div className="h-11 w-full animate-pulse rounded-md bg-landing-ink/5" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <div className="h-3 w-24 animate-pulse rounded bg-landing-ink/10" />
            <div className="h-11 w-full animate-pulse rounded-md bg-landing-ink/5" />
          </div>
        ))}
      </div>
      <div className="h-11 w-full animate-pulse rounded-md bg-landing-accent/30" />
    </div>
  );
}

export function InscriptionSection() {
  const rootRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = usePrefersReducedMotion();
  const selectedPlan = useInscriptionStore((s) => s.selectedPlan);
  const clearPlan = useInscriptionStore((s) => s.clearPlan);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (prefersReducedMotion) return;
    if (typeof window === "undefined") return;
    if (window.innerWidth < 768) return;

    let ctx: { revert: () => void } | undefined;
    let cancelled = false;

    (async () => {
      const gsap = (await import("gsap")).default;
      const { ScrollTrigger } = await import("gsap/ScrollTrigger");
      if (cancelled || !rootRef.current) return;
      gsap.registerPlugin(ScrollTrigger);

      ctx = gsap.context(() => {
        gsap.from("[data-inscription-anim]", {
          y: 40,
          opacity: 0,
          duration: 1,
          ease: "power3.out",
          stagger: 0.1,
          scrollTrigger: {
            trigger: rootRef.current,
            start: "top 75%",
            once: true,
          },
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
      id="inscription"
      ref={rootRef}
      className="landing-section relative scroll-mt-24 bg-landing-primary-deep"
      aria-label="Inscription OgPressing"
    >
      {/* Halo décoratif */}
      <div
        className="pointer-events-none absolute left-1/2 top-0 -z-0 h-px w-2/3 -translate-x-1/2 bg-gradient-to-r from-transparent via-landing-accent/40 to-transparent"
        aria-hidden
      />

      <div className="mx-auto max-w-3xl px-5 sm:px-6 lg:px-8">
        {/* En-tête */}
        <div className="mb-10 text-center sm:mb-14">
          <p
            data-inscription-anim
            className="mb-3 inline-flex items-center gap-2 rounded-full border border-landing-accent/30 bg-landing-accent/10 px-3 py-1 font-plex-mono text-[11px] uppercase tracking-[0.18em] text-landing-accent-soft"
          >
            <span className="ogp-pulse-dot inline-block size-1.5 rounded-full bg-landing-accent" />
            Inscription
          </p>
          <h2
            data-inscription-anim
            className="font-jakarta text-3xl font-bold tracking-tight text-white sm:text-4xl md:text-5xl"
          >
            Demandez votre{" "}
            <span className="font-fraunces italic text-landing-accent">accès</span>
          </h2>
          <p
            data-inscription-anim
            className="mx-auto mt-4 max-w-xl text-sm text-white/60 sm:text-base"
          >
            Remplissez ce formulaire. Notre équipe vous contactera par WhatsApp
            ou téléphone pour activer votre compte — aucun paiement en ligne.
          </p>
        </div>

        {/* Bannière de présélection plan */}
        {mounted && selectedPlan && (
          <div
            data-inscription-anim
            className="mb-6 flex items-center justify-between gap-3 rounded-2xl border border-landing-accent/40 bg-landing-accent/10 px-4 py-3"
            role="status"
          >
            <div className="flex items-center gap-2.5">
              <span className="ogp-pulse-dot inline-block size-2 rounded-full bg-landing-accent" />
              <span className="font-plex-mono text-xs text-landing-accent-soft">
                Plan présélectionné :
              </span>
              <span className="font-jakarta text-sm font-bold text-white">
                {PLAN_LABELS[selectedPlan]}
              </span>
            </div>
            <button
              type="button"
              onClick={clearPlan}
              className="landing-link landing-link-underline font-plex-mono text-[10px] uppercase tracking-wider text-white/50 hover:text-white"
            >
              Changer
            </button>
          </div>
        )}

        {/* Conteneur du formulaire — landing-card (clair) sur fond sombre
            pour que les champs (conçus pour un fond clair) restent lisibles. */}
        <div data-inscription-anim className="landing-card p-6 sm:p-8 md:p-10">
          {/* En-tête du formulaire */}
          <div className="mb-6 flex items-center justify-between border-b border-landing-ink/8 pb-4">
            <div>
              <h3 className="font-jakarta text-lg font-bold text-landing-ink sm:text-xl">
                Formulaire d&apos;inscription
              </h3>
              <p className="mt-0.5 font-plex-mono text-[10px] uppercase tracking-wider text-landing-ink/40">
                11 champs · ~2 min
              </p>
            </div>
            <span className="flex size-10 items-center justify-center rounded-full bg-landing-accent/15 text-landing-accent-deep">
              <svg
                viewBox="0 0 24 24"
                className="size-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="8.5" cy="7" r="4" />
                <path d="M20 8v6M23 11h-6" />
              </svg>
            </span>
          </div>

          {/* Le formulaire lui-même (lazy-loaded) */}
          <InscriptionForm />

          {/* Note de confiance */}
          <p className="mt-6 border-t border-landing-ink/8 pt-4 text-center font-plex-mono text-[10px] uppercase tracking-wider text-landing-ink/40">
            🔒 Données chiffrées · Aucun paiement en ligne · Réponse sous 48h
          </p>
        </div>
      </div>
    </section>
  );
}

export default InscriptionSection;
