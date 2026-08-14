/**
 * e-pressing — Protocole "Le Parcours d'une Commande" (LOT 17 — Section E)
 * ----------------------------------------------------------------------
 * Sticky Stack Archive : 3 cartes plein écran qui s'empilent au scroll.
 * Quand une nouvelle carte apparaît, celle du dessous passe en
 * scale(0.9) + blur(20px) + opacity(0.5).
 *
 * Contenu :
 *   Carte 01 — Dépôt & Enregistrement : motif QR code (rotation lente).
 *   Carte 02 — Traitement & Traçabilité : ligne de balayage laser.
 *   Carte 03 — Retrait ou Livraison : onde ECG pulsée.
 *
 * Chaque carte : n° étape en IBM Plex Mono, titre Plus Jakarta Sans,
 * description 2 lignes.
 *
 * ⚠️ MOBILE (< 768px) : pas de pin/stack (coûteux). On bascule sur un
 * scroll vertical simple avec fade-in par carte. Détection via
 * window.innerWidth dans l'effet.
 */
"use client";

import { useEffect, useRef } from "react";
import { usePrefersReducedMotion } from "@/lib/motion/hooks";
import { cn } from "@/lib/utils";
import { gsap, ScrollTrigger } from "@/lib/gsap/client";

/* ============================================================
   ANIMATION GRAPHIQUES — Une par carte
   ============================================================ */

/** Carte 01 — Motif QR code en formation (rotation lente) */
function QrPatternArt() {
  // Grille 7x7 de cellules dont certaines sont "allumées" (aléatoire déterministe)
  const cells = Array.from({ length: 49 }, (_, i) => {
    // Pseudo-déterministe : on alterne selon i pour un look QR
    const lit = (i * 7 + (i % 5)) % 3 === 0 || i % 11 === 0;
    return lit;
  });

  return (
    <div className="relative flex aspect-square w-full max-w-[260px] items-center justify-center">
      {/* Anneau extérieur en rotation lente */}
      <div
        className="absolute inset-0 rounded-full border border-dashed border-landing-accent/30"
        style={{
          animation: "ogp-slow-rotate 18s linear infinite",
        }}
        aria-hidden
      />
      <div
        className="absolute inset-[15%] rounded-full border border-landing-accent/20"
        style={{
          animation: "ogp-slow-rotate 12s linear infinite reverse",
        }}
        aria-hidden
      />

      {/* Grille QR */}
      <div className="relative grid w-[55%] grid-cols-7 gap-[2px]">
        {cells.map((lit, i) => (
          <span
            key={i}
            className={cn(
              "aspect-square rounded-[1px] transition-colors",
              lit ? "bg-landing-accent" : "bg-landing-ink/10"
            )}
          />
        ))}
      </div>

      {/* 3 coins "finder patterns" */}
      <span className="absolute left-[18%] top-[18%] size-3 rounded-sm border-2 border-landing-ink" aria-hidden />
      <span className="absolute right-[18%] top-[18%] size-3 rounded-sm border-2 border-landing-ink" aria-hidden />
      <span className="absolute left-[18%] bottom-[18%] size-3 rounded-sm border-2 border-landing-ink" aria-hidden />
    </div>
  );
}

/** Carte 02 — Ligne de balayage laser sur grille de points (barcode) */
function BarcodeScanArt() {
  return (
    <div className="relative flex aspect-square w-full max-w-[260px] items-center justify-center overflow-hidden rounded-2xl border border-landing-ink/8 bg-landing-bg">
      {/* Grille de points */}
      <div className="absolute inset-0 grid grid-cols-12 gap-1 p-4">
        {Array.from({ length: 144 }).map((_, i) => (
          <span
            key={i}
            className="rounded-full bg-landing-ink/15"
            style={{
              opacity: ((i * 7) % 5) / 5 + 0.2,
            }}
          />
        ))}
      </div>

      {/* Code-barres vertical central */}
      <div className="absolute inset-y-6 left-1/2 flex -translate-x-1/2 items-center gap-0.5">
        {Array.from({ length: 22 }).map((_, i) => (
          <span
            key={i}
            className="bg-landing-ink"
            style={{
              width: ((i * 5) % 3) + 1 + "px",
              height: "60%",
              opacity: ((i * 7) % 4) / 4 + 0.4,
            }}
          />
        ))}
      </div>

      {/* Ligne de balayage horizontale */}
      <div
        className="absolute inset-x-0 h-px bg-landing-accent"
        style={{
          animation: "ogp-scan-line 2.8s cubic-bezier(0.45, 0, 0.55, 1) infinite",
          boxShadow: "0 0 12px 2px rgba(217, 164, 65, 0.6)",
        }}
        aria-hidden
      />
    </div>
  );
}

/** Carte 03 — Onde ECG pulsée (suivi temps réel) */
function EcgWaveformArt() {
  // 3 cycles ECG tracés en SVG — le path est animé via stroke-dashoffset
  // (cf. keyframe ogp-ecg-dash).
  const path =
    "M0,40 L40,40 L48,40 L52,20 L56,60 L60,10 L64,70 L68,40 L100,40 L120,40 L128,40 L132,20 L136,60 L140,10 L144,70 L148,40 L180,40 L200,40";

  return (
    <div className="relative flex aspect-square w-full max-w-[260px] items-center justify-center overflow-hidden rounded-2xl border border-landing-ink/8 bg-landing-primary-deep">
      {/* Grille technique */}
      <div
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)",
          backgroundSize: "20px 20px",
        }}
        aria-hidden
      />

      <svg
        viewBox="0 0 200 80"
        className="relative h-2/3 w-3/4"
        preserveAspectRatio="none"
        aria-hidden
      >
        <path
          d={path}
          fill="none"
          stroke="rgba(255,255,255,0.1)"
          strokeWidth="1.5"
        />
        <path
          d={path}
          fill="none"
          stroke="var(--color-landing-accent)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="600"
          strokeDashoffset="600"
          style={{
            animation: "ogp-ecg-dash 2.4s cubic-bezier(0.45, 0, 0.55, 1) infinite",
            filter: "drop-shadow(0 0 4px rgba(217,164,65,0.5))",
          }}
        />
      </svg>

      {/* Étiquette LIVE */}
      <div className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-landing-alert/20 px-2 py-0.5">
        <span className="ogp-pulse-dot inline-block size-1.5 rounded-full bg-landing-alert" />
        <span className="font-plex-mono text-[9px] uppercase tracking-wider text-landing-alert">
          live
        </span>
      </div>
    </div>
  );
}

/* ============================================================
   STRUCTURE DE CARTE
   ============================================================ */

type ProtocolCardProps = {
  step: string;
  title: string;
  description: string;
  art: React.ReactNode;
  variant?: "light" | "dark";
};

function ProtocolCard({
  step,
  title,
  description,
  art,
  variant = "light",
}: ProtocolCardProps) {
  const isDark = variant === "dark";

  return (
    <article
      data-protocol-card
      className={cn(
        "relative mx-auto flex min-h-[78vh] w-full max-w-6xl flex-col items-center justify-center gap-8 rounded-[2.5rem] p-8 sm:p-12 md:flex-row md:gap-12 md:p-16",
        isDark
          ? "landing-card-dark"
          : "landing-card"
      )}
    >
      {/* Texte */}
      <div className="flex-1 text-center md:text-left">
        <span
          className={cn(
            "font-plex-mono text-xs uppercase tracking-[0.3em]",
            isDark ? "text-landing-accent" : "text-landing-accent-deep"
          )}
        >
          Étape {step}
        </span>
        <h3
          className={cn(
            "mt-4 font-jakarta text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl",
            isDark ? "text-white" : "text-landing-ink"
          )}
        >
          {title}
        </h3>
        <p
          className={cn(
            "mt-5 max-w-md text-sm leading-relaxed sm:text-base md:text-lg",
            isDark ? "text-white/70" : "text-landing-ink/60"
          )}
        >
          {description}
        </p>
      </div>

      {/* Art graphique */}
      <div className="flex-1">{art}</div>
    </article>
  );
}

/* ============================================================
   SECTION PRINCIPALE
   ============================================================ */

export function Protocol() {
  const rootRef = useRef<HTMLDivElement>(null);
  const cardsRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (prefersReducedMotion) return;
    if (typeof window === "undefined") return;
    const isMobile = window.innerWidth < 768;
    if (!cardsRef.current) return;

    const ctx = gsap.context(() => {
      const cards = gsap.utils.toArray<HTMLElement>("[data-protocol-card]");

      if (isMobile) {
        // Mobile : simple fade-in au scroll, pas de pin/stack
        cards.forEach((card) => {
          gsap.from(card, {
            y: 50,
            opacity: 0,
            duration: 0.8,
            ease: "power3.out",
            scrollTrigger: {
              trigger: card,
              start: "top 80%",
              once: true,
            },
          });
        });
        return;
      }

      // Desktop : effet sticky stack
      // Chaque carte est initialement positionnée en absolute à top:0
      // dans un conteneur dont la hauteur = nbCartes * 100vh.
      cards.forEach((card, idx) => {
        if (idx === 0) {
          gsap.set(card, { y: 0, opacity: 1, scale: 1, filter: "blur(0px)" });
        } else {
          gsap.set(card, {
            y: window.innerHeight * 0.5,
            opacity: 0,
            scale: 1,
            filter: "blur(0px)",
          });
        }
      });

      ScrollTrigger.create({
        trigger: cardsRef.current,
        start: "top top",
        end: `+=${cards.length * 100}%`,
        pin: cardsRef.current,
        pinSpacing: true,
        scrub: 1,
        onUpdate: (self) => {
          const progress = self.progress;
          const seg = 1 / cards.length;
          cards.forEach((card, idx) => {
            if (idx === 0) {
              // La première carte recule au fur et à mesure
              const recede = gsap.utils.clamp(
                0,
                1,
                progress / seg
              );
              gsap.set(card, {
                opacity: 1 - recede * 0.5,
                scale: 1 - recede * 0.1,
                filter: `blur(${recede * 20}px)`,
              });
            } else {
              // Les cartes suivantes montent et prennent la place
              const enter = gsap.utils.clamp(
                0,
                1,
                (progress - (idx - 1) * seg) / seg
              );
              const recede = gsap.utils.clamp(
                0,
                1,
                (progress - idx * seg) / seg
              );
              gsap.set(card, {
                y: (1 - enter) * window.innerHeight * 0.5,
                opacity: enter * (1 - recede * 0.5),
                scale: 1 - recede * 0.1,
                filter: `blur(${recede * 20}px)`,
              });
            }
          });
        },
      });
    }, rootRef);

    return () => {
      ctx.revert();
    };
  }, [prefersReducedMotion]);

  return (
    <section
      ref={rootRef}
      id="protocole"
      className="relative bg-landing-bg scroll-mt-24"
      aria-label="Parcours d'une commande e-pressing"
    >
      {/* En-tête */}
      <div className="mx-auto max-w-7xl px-5 pt-20 text-center sm:pt-28 lg:px-8">
        <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-landing-accent/30 bg-landing-accent/5 px-3 py-1 font-plex-mono text-[11px] uppercase tracking-[0.18em] text-landing-accent-deep">
          <span className="ogp-pulse-dot inline-block size-1.5 rounded-full bg-landing-accent" />
          Le Protocole
        </p>
        <h2 className="font-jakarta text-3xl font-bold tracking-tight text-landing-ink sm:text-4xl md:text-5xl">
          Le parcours d&apos;une{" "}
          <span className="font-fraunces italic text-landing-accent-deep">commande</span>
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-sm text-landing-ink/60 sm:text-base">
          Du dépôt du linge à la livraison, chaque étape est tracée — article
          par article. Voici le protocole que votre équipe suivra, chaque jour.
        </p>
      </div>

      {/* Conteneur des cartes empilées */}
      <div className="px-5 py-12 sm:px-6 sm:py-16 lg:px-8">
        <div ref={cardsRef} className="relative mx-auto max-w-7xl">
          <ProtocolCard
            step="01"
            title="Dépôt & Enregistrement"
            description="Chaque vêtement est enregistré individuellement : type, couleur, état, réserves. Un ticket QR Code et des étiquettes code-barres sont générés instantanément."
            art={<QrPatternArt />}
            variant="light"
          />

          <div className="h-6 sm:h-8" aria-hidden />

          <ProtocolCard
            step="02"
            title="Traitement & Traçabilité"
            description="Lavage, repassage, contrôle qualité : chaque étape est suivie en temps réel, article par article, jusqu'à ce que la commande soit prête."
            art={<BarcodeScanArt />}
            variant="light"
          />

          <div className="h-6 sm:h-8" aria-hidden />

          <ProtocolCard
            step="03"
            title="Retrait ou Livraison"
            description="Le client est notifié, le paiement est enregistré (espèces, mobile money, carte), et la commande est remise en toute confiance."
            art={<EcgWaveformArt />}
            variant="dark"
          />
        </div>
      </div>
    </section>
  );
}

export default Protocol;
