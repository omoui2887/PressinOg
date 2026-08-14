/**
 * e-pressing — Tarification (LOT 17 — Section F)
 * ----------------------------------------------
 * Grille tarifaire 3 tiers avec les VRAIS plans e-pressing :
 *   - STARTER — 9 900 FCFA/mois
 *   - PRO — 24 900 FCFA/mois (badge "Populaire", carte mise en avant,
 *     fond landing-primary, CTA Or, anneau Or)
 *   - BUSINESS — 49 900 FCFA/mois
 *
 * Montants formatés via formatFCFA ( @/lib/utils/format ).
 * Bouton "Choisir ce plan" → useInscriptionStore.getState().selectPlan(planId)
 * qui mémorise le plan ET scroll vers #inscription. AUCUN paiement en ligne.
 *
 * Animation GSAP fade-up au scroll (stagger 0.15). Sur mobile, pas de GSAP.
 */
"use client";

import { useEffect, useRef } from "react";
import { usePrefersReducedMotion } from "@/lib/motion/hooks";
import { formatFCFA } from "@/lib/utils/format";
import {
  useInscriptionStore,
  type PlanId,
} from "@/lib/stores/inscription-store";
import { cn } from "@/lib/utils";
import { gsap } from "@/lib/gsap/client";

type Plan = {
  id: PlanId;
  name: string;
  price: number;
  features: string[];
  popular?: boolean;
};

const PLANS: Plan[] = [
  {
    id: "starter",
    name: "Starter",
    price: 9900,
    features: [
      "Jusqu'à 3 utilisateurs",
      "Suivi par article détaillé",
      "3 modes de paiement enregistrés",
      "CRM basique",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: 24900,
    popular: true,
    features: [
      "Jusqu'à 8 utilisateurs",
      "CRM complet",
      "Export .xlsx",
      "Scan QR Code",
    ],
  },
  {
    id: "business",
    name: "Business",
    price: 49900,
    features: [
      "Utilisateurs illimités",
      "CRM complet + abonnements",
      "Export programmé",
      "Étiquettes personnalisées",
    ],
  },
];

function PlanCard({ plan }: { plan: Plan }) {
  const selectPlan = useInscriptionStore((s) => s.selectPlan);
  const isPopular = plan.popular;

  return (
    <article
      data-pricing-card
      className={cn(
        "relative flex h-full flex-col rounded-[2rem] p-6 transition-transform duration-500 sm:p-8",
        isPopular
          ? "landing-card-dark ring-2 ring-landing-accent md:-translate-y-4 md:scale-[1.02]"
          : "landing-card"
      )}
      style={{
        transitionTimingFunction: "cubic-bezier(0.25, 0.46, 0.45, 0.94)",
      }}
    >
      {isPopular && (
        <span className="absolute -top-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-landing-accent px-3 py-1 font-plex-mono text-[10px] uppercase tracking-wider text-landing-primary shadow-lg">
          <span className="ogp-pulse-dot inline-block size-1.5 rounded-full bg-landing-primary" />
          Populaire
        </span>
      )}

      {/* Nom du plan */}
      <div className="mb-5 flex items-center justify-between">
        <h3
          className={cn(
            "font-jakarta text-lg font-bold tracking-tight sm:text-xl",
            isPopular ? "text-white" : "text-landing-ink"
          )}
        >
          {plan.name}
        </h3>
        <span
          className={cn(
            "font-plex-mono text-[10px] uppercase tracking-wider",
            isPopular ? "text-landing-accent-soft" : "text-landing-ink/40"
          )}
        >
          {plan.id}
        </span>
      </div>

      {/* Prix */}
      <div className="mb-6">
        <p
          className={cn(
            "font-jakarta text-3xl font-extrabold tracking-tight sm:text-4xl",
            isPopular ? "text-white" : "text-landing-ink"
          )}
        >
          {formatFCFA(plan.price)}
        </p>
        <p
          className={cn(
            "mt-1 font-plex-mono text-xs",
            isPopular ? "text-white/60" : "text-landing-ink/40"
          )}
        >
          par mois · HT
        </p>
      </div>

      {/* Séparateur */}
      <div
        className={cn(
          "mb-6 h-px w-full",
          isPopular ? "bg-white/10" : "bg-landing-ink/8"
        )}
        aria-hidden
      />

      {/* Features */}
      <ul className="mb-8 flex-1 space-y-3">
        {plan.features.map((feature) => (
          <li
            key={feature}
            className={cn(
              "flex items-start gap-2.5 text-sm",
              isPopular ? "text-white/80" : "text-landing-ink/70"
            )}
          >
            <span
              className={cn(
                "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full",
                isPopular
                  ? "bg-landing-accent text-landing-primary"
                  : "bg-landing-accent/15 text-landing-accent-deep"
              )}
              aria-hidden
            >
              <svg
                viewBox="0 0 12 12"
                className="size-2.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M2 6.5l2.5 2.5L10 3" />
              </svg>
            </span>
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      {/* CTA */}
      <button
        type="button"
        onClick={() => selectPlan(plan.id)}
        className={cn(
          "landing-cta w-full text-sm sm:text-base",
          isPopular ? "landing-cta-on-dark" : "landing-cta-outline"
        )}
        aria-label={`Choisir le plan ${plan.name}`}
      >
        <span className="landing-cta-bg" />
        <span className="landing-cta-label">Choisir ce plan</span>
      </button>
    </article>
  );
}

export function Pricing() {
  const rootRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (prefersReducedMotion) return;
    if (typeof window === "undefined") return;
    if (window.innerWidth < 768) return;
    if (!rootRef.current) return;

    const ctx = gsap.context(() => {
      gsap.from("[data-pricing-card]", {
        y: 60,
        opacity: 0,
        duration: 0.9,
        ease: "power3.out",
        stagger: 0.15,
        scrollTrigger: {
          trigger: rootRef.current,
          start: "top 75%",
          once: true,
        },
      });
    }, rootRef);

    return () => {
      ctx.revert();
    };
  }, [prefersReducedMotion]);

  return (
    <section
      id="tarifs"
      ref={rootRef}
      className="landing-section relative scroll-mt-24 bg-landing-bg"
      aria-label="Tarifs e-pressing"
    >
      <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-8">
        {/* En-tête */}
        <div className="mx-auto mb-12 max-w-3xl text-center sm:mb-16">
          <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-landing-accent/30 bg-landing-accent/5 px-3 py-1 font-plex-mono text-[11px] uppercase tracking-[0.18em] text-landing-accent-deep">
            <span className="ogp-pulse-dot inline-block size-1.5 rounded-full bg-landing-accent" />
            Tarification
          </p>
          <h2 className="font-jakarta text-3xl font-bold tracking-tight text-landing-ink sm:text-4xl md:text-5xl">
            Trois formules.{" "}
            <span className="font-fraunces italic text-landing-accent-deep">
              Aucun engagement.
            </span>
          </h2>
          <p className="mt-4 text-sm text-landing-ink/60 sm:text-base">
            Paiement en FCFA, Mobile Money ou espèces. Aucun règlement ne se
            fait en ligne : notre équipe vous contacte pour l&apos;activation.
          </p>
        </div>

        {/* Grille des 3 plans */}
        <div className="grid items-stretch gap-5 md:grid-cols-3 sm:gap-6">
          {PLANS.map((plan) => (
            <PlanCard key={plan.id} plan={plan} />
          ))}
        </div>

        {/* Note légale */}
        <p className="mt-10 text-center font-plex-mono text-[11px] uppercase tracking-wider text-landing-ink/40">
          Tous les plans incluent : suivi par article · CRM · gestion d&apos;équipe
        </p>
      </div>
    </section>
  );
}

export default Pricing;
