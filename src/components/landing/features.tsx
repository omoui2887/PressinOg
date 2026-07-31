/**
 * OgPressing — Fonctionnalités "Artefacts Fonctionnels Interactifs" (LOT 17 — Section C)
 * ----------------------------------------------------------------------------------------
 * 3 cartes qui ressemblent à des micro-interfaces fonctionnelles (pas des
 * cartes marketing statiques). Chacune implémente un pattern d'animation
 * spécifique décrit dans le brief :
 *
 *   CARTE 1 — "Suivi par Article" (Diagnostic Mixer)
 *     3 cartes empilées cyclant verticalement toutes les 3s.
 *     Transition elastic bounce cubic-bezier(0.34, 1.56, 0.64, 1).
 *     Statuts : Reçu (blue-500), Lavé (cyan-500), Prêt (emerald-500).
 *
 *   CARTE 2 — "CRM en Direct" (Telemetry Typewriter)
 *     Flux monospace (IBM Plex Mono) qui tape char-par-char en boucle.
 *     4 messages avec couleurs dédiées (success, alert, neutre).
 *     Curseur clignotant Or Textile (.ogp-cursor).
 *     Label "Flux en Direct" + point pulsant (.ogp-pulse-dot).
 *
 *   CARTE 3 — "Gestion d'Équipe" (Protocol Cursor Planner)
 *     Grille hebdo L M M J V S D. Curseur SVG animé qui se déplace sur
 *     une cellule, "clique" (scale 0.95), révèle un rôle (Awa — Caissière),
 *     active le jour (highlight Or), se déplace vers "Sauvegarder" puis
 *     disparaît, puis boucle.
 *
 * Toutes les cartes utilisent des effets React (state + setInterval /
 * setTimeout chain). Aucune dépendance à GSAP pour ces micro-animations
 * (qui doivent tourner en continu) — GSAP est utilisé uniquement pour
 * l'entrée des cartes au scroll (fade-up + stagger 0.15).
 *
 * Sur mobile : on simplifie (intervalles plus longs, pas d'animation GSAP
 * d'entrée, mais les micro-animations tournent toujours — elles sont
 * légères et au cœur de la proposition de valeur).
 */
"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import { usePrefersReducedMotion } from "@/lib/motion/hooks";
import { cn } from "@/lib/utils";

/* ============================================================
   CARTE 1 — Suivi par Article (Diagnostic Mixer)
   ============================================================ */

type ArticleStatus = {
  label: string;
  badgeColor: string; // Tailwind bg-* utility
  textColor: string;
  articleName: string;
  orderId: string;
};

const ARTICLE_STATUSES: ArticleStatus[] = [
  {
    label: "Reçu",
    badgeColor: "bg-blue-500",
    textColor: "text-blue-600",
    articleName: "Chemise blanche",
    orderId: "#PRS-4821",
  },
  {
    label: "Lavé",
    badgeColor: "bg-cyan-500",
    textColor: "text-cyan-600",
    articleName: "Pantalon noir",
    orderId: "#PRS-4822",
  },
  {
    label: "Prêt",
    badgeColor: "bg-emerald-500",
    textColor: "text-emerald-600",
    articleName: "Robe en soie",
    orderId: "#PRS-4823",
  },
];

function ArticleTrackingCard() {
  // On garde l'ordre initial ; on le fait "défiler" vers le haut en
  // décalant l'index de tête toutes les 3s.
  const [headIndex, setHeadIndex] = useState(0);
  const prefersReducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (prefersReducedMotion) return;
    const id = window.setInterval(() => {
      setHeadIndex((i) => (i + 1) % ARTICLE_STATUSES.length);
    }, 3000);
    return () => window.clearInterval(id);
  }, [prefersReducedMotion]);

  // Construit la pile visible : head en haut, puis les 2 suivants (avec wrap).
  const stack = [0, 1, 2].map(
    (offset) => ARTICLE_STATUSES[(headIndex + offset) % ARTICLE_STATUSES.length]
  );

  return (
    <div className="relative h-[200px] w-full overflow-hidden">
      {/* Pile de cartes — chacune translate en Y selon son offset */}
      <div className="absolute inset-x-0 top-0">
        {stack.map((status, idx) => {
          const isActive = idx === 0;
          return (
            <div
              key={`${status.orderId}-${idx}-${headIndex}`}
              className={cn(
                "absolute inset-x-0 rounded-2xl border p-4 transition-all",
                isActive
                  ? "border-landing-ink/10 bg-white shadow-[0_12px_32px_-12px_rgba(20,21,26,0.18)]"
                  : "border-landing-ink/5 bg-landing-bg/80"
              )}
              style={{
                transform: `translateY(${idx * 14}px) scale(${1 - idx * 0.04})`,
                opacity: idx === 0 ? 1 : idx === 1 ? 0.7 : 0.4,
                zIndex: 10 - idx,
                transitionTimingFunction: isActive
                  ? "cubic-bezier(0.34, 1.56, 0.64, 1)"
                  : "cubic-bezier(0.25, 0.46, 0.45, 0.94)",
                transitionDuration: isActive ? "700ms" : "500ms",
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-plex-mono text-[10px] uppercase tracking-wider text-landing-ink/40">
                    {status.orderId}
                  </p>
                  <p className="mt-1 truncate font-jakarta text-sm font-semibold text-landing-ink">
                    {status.articleName}
                  </p>
                </div>
                <span
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-semibold text-white",
                    status.badgeColor
                  )}
                >
                  <span className="size-1.5 rounded-full bg-white/80" />
                  {status.label}
                </span>
              </div>
              {isActive && (
                <div className="mt-3 flex items-center gap-2">
                  <div className="flex h-6 w-12 items-center justify-center rounded bg-landing-ink/5 font-plex-mono text-[9px] tracking-wider text-landing-ink/60">
                    QR
                  </div>
                  <div className="flex flex-1 items-center gap-0.5">
                    {Array.from({ length: 18 }).map((_, i) => (
                      <span
                        key={i}
                        className="h-3 w-px bg-landing-ink"
                        style={{
                          opacity: (i * 7) % 3 === 0 ? 1 : 0.3,
                          height: `${(i * 13) % 7 + 4}px`,
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ============================================================
   CARTE 2 — CRM en Direct (Telemetry Typewriter)
   ============================================================ */

type CrmMessage = {
  text: string;
  tone: "neutral" | "success" | "alert";
};

const CRM_MESSAGES: CrmMessage[] = [
  { text: "🧺 Commande #PRS-4821 enregistrée", tone: "neutral" },
  { text: "💳 Paiement reçu — 5 000 FCFA", tone: "success" },
  { text: "⭐ +5 points de fidélité crédités", tone: "success" },
  { text: "🔴 Solde impayé mis à jour", tone: "alert" },
];

function toneClass(tone: CrmMessage["tone"]): string {
  switch (tone) {
    case "success":
      return "text-landing-success";
    case "alert":
      return "text-landing-alert";
    default:
      return "text-landing-ink/80";
  }
}

function CrmLiveCard() {
  const [messageIndex, setMessageIndex] = useState(0);
  const [displayed, setDisplayed] = useState("");
  const [phase, setPhase] = useState<"typing" | "pausing" | "erasing">(
    "typing"
  );
  // Horloge : on rend une chaîne fixe côté serveur et au premier render
  // client, puis on la met à jour dans useEffect pour éviter une
  // hydration mismatch (l'heure change entre SSR et hydration).
  const [clock, setClock] = useState("--:--");
  const prefersReducedMotion = usePrefersReducedMotion();

  // Mise à jour de l'horloge côté client uniquement (évite la mismatch
  // d'hydration car l'heure serveur ≠ heure client à la minute près).
  useEffect(() => {
    const updateClock = () =>
      setClock(
        new Date().toLocaleTimeString("fr-FR", {
          hour: "2-digit",
          minute: "2-digit",
        })
      );
    updateClock();
    const id = window.setInterval(updateClock, 30_000);
    return () => window.clearInterval(id);
  }, []);

  // Reduced motion : on affiche le message complet du message courant et on
  // fait défiler les messages toutes les 2.5s via setInterval (le setState
  // est alors dans un callback — pas synchrone dans le corps de l'effet).
  useEffect(() => {
    if (!prefersReducedMotion) return;
    const id = window.setInterval(() => {
      setMessageIndex((i) => (i + 1) % CRM_MESSAGES.length);
    }, 2500);
    return () => window.clearInterval(id);
  }, [prefersReducedMotion]);

  useEffect(() => {
    if (prefersReducedMotion) return;
    const full = CRM_MESSAGES[messageIndex].text;
    let timeoutId: number;

    if (phase === "typing") {
      if (displayed.length < full.length) {
        timeoutId = window.setTimeout(() => {
          setDisplayed(full.slice(0, displayed.length + 1));
        }, 45);
      } else {
        timeoutId = window.setTimeout(() => setPhase("pausing"), 1500);
      }
    } else if (phase === "pausing") {
      timeoutId = window.setTimeout(() => setPhase("erasing"), 200);
    } else if (phase === "erasing") {
      if (displayed.length > 0) {
        timeoutId = window.setTimeout(() => {
          setDisplayed(displayed.slice(0, -1));
        }, 25);
      } else {
        // Transition vers le message suivant — on diffère les setState hors
        // du corps synchrone de l'effet via setTimeout(0) pour éviter les
        // cascading renders (rule react-hooks/set-state-in-effect).
        timeoutId = window.setTimeout(() => {
          setMessageIndex((i) => (i + 1) % CRM_MESSAGES.length);
          setPhase("typing");
        }, 0);
      }
    }

    return () => window.clearTimeout(timeoutId);
  }, [displayed, phase, messageIndex, prefersReducedMotion]);

  const currentMessage = CRM_MESSAGES[messageIndex];
  // En reduced motion, on affiche le texte complet sans animation.
  const displayedText = prefersReducedMotion ? currentMessage.text : displayed;

  return (
    <div className="w-full">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="ogp-pulse-dot inline-block size-2 rounded-full bg-landing-accent" />
          <span className="font-plex-mono text-[10px] uppercase tracking-[0.18em] text-landing-ink/60">
            Flux en Direct
          </span>
        </div>
        <span className="font-plex-mono text-[9px] uppercase tracking-wider text-landing-ink/30">
          live
        </span>
      </div>

      <div className="rounded-xl border border-landing-ink/5 bg-landing-primary-deep/95 p-4 font-plex-mono text-xs leading-relaxed">
        <div className="mb-2 flex items-center gap-1.5 text-landing-accent-soft/60">
          <span className="size-2 rounded-full bg-landing-alert/70" />
          <span className="size-2 rounded-full bg-landing-accent/70" />
          <span className="size-2 rounded-full bg-landing-success/70" />
          <span className="ml-2 text-[9px] uppercase tracking-wider opacity-60">
            ogpressing — crm
          </span>
        </div>
        <p className="flex min-h-[1.5em] flex-wrap items-center">
          <span className={toneClass(currentMessage.tone)}>
            {displayedText || "\u00A0"}
          </span>
          <span className="ogp-cursor" aria-hidden />
        </p>
        <p className="mt-3 text-[9px] uppercase tracking-wider text-white/30">
          {clock} · temps réel
        </p>
      </div>
    </div>
  );
}

/* ============================================================
   CARTE 3 — Gestion d'Équipe (Protocol Cursor Planner)
   ============================================================ */

const TEAM_DAYS = ["L", "M", "M", "J", "V", "S", "D"] as const;
const TEAM_ROLES = [
  "Awa — Caissière",
  "Mamadou — Laveur",
  "Konan — Livreur",
  "Fatou — Caissière",
  "Ibrahim — Repasseur",
  "Awa — Caissière",
  "Repos",
] as const;

type TeamPhase =
  | { kind: "idle" }
  | { kind: "moving"; day: number }
  | { kind: "pressing"; day: number }
  | { kind: "revealed"; day: number }
  | { kind: "moving-to-save" }
  | { kind: "saving" }
  | { kind: "done" };

type TeamAction =
  | { type: "MOVE"; day: number }
  | { type: "PRESS"; day: number }
  | { type: "REVEAL"; day: number }
  | { type: "MOVE_TO_SAVE" }
  | { type: "SAVE" }
  | { type: "DONE" }
  | { type: "RESET" };

function teamReducer(state: TeamPhase, action: TeamAction): TeamPhase {
  switch (action.type) {
    case "MOVE":
      return { kind: "moving", day: action.day };
    case "PRESS":
      return { kind: "pressing", day: action.day };
    case "REVEAL":
      return { kind: "revealed", day: action.day };
    case "MOVE_TO_SAVE":
      return { kind: "moving-to-save" };
    case "SAVE":
      return { kind: "saving" };
    case "DONE":
      return { kind: "done" };
    case "RESET":
      return { kind: "idle" };
    default:
      return state;
  }
}

function TeamPlannerCard() {
  const prefersReducedMotion = usePrefersReducedMotion();
  const [phase, dispatch] = useReducer(teamReducer, { kind: "idle" });
  const [activeDaysState, setActiveDays] = useState<Set<number>>(new Set());
  const [revealedDayState, setRevealedDay] = useState<number | null>(null);

  // En reduced motion, on dérive les valeurs affichées directement sans
  // setState dans l'effet (tous les jours actifs, premier révélé). On évite
  // ainsi la cascading render warning (rule react-hooks/set-state-in-effect).
  const activeDays = prefersReducedMotion
    ? new Set([0, 1, 2, 3, 4, 5, 6])
    : activeDaysState;
  const revealedDay = prefersReducedMotion ? 0 : revealedDayState;

  useEffect(() => {
    if (prefersReducedMotion) return;

    let cancelled = false;
    const timeouts: number[] = [];

    const schedule = (delay: number, fn: () => void) => {
      const id = window.setTimeout(() => {
        if (!cancelled) fn();
      }, delay);
      timeouts.push(id);
    };

    const runCycle = () => {
      // Sélectionner 3 jours à activer dans le cycle.
      const targetDays = [1, 3, 5];
      let elapsed = 0;

      targetDays.forEach((day, i) => {
        // Déplacement vers le jour
        schedule(elapsed, () => dispatch({ type: "MOVE", day }));
        elapsed += 600;
        // Press
        schedule(elapsed, () => dispatch({ type: "PRESS", day }));
        elapsed += 200;
        // Reveal
        schedule(elapsed, () => {
          dispatch({ type: "REVEAL", day });
          setRevealedDay(day);
        });
        elapsed += 800;
        // Active le jour
        schedule(elapsed, () => {
          setActiveDays((prev) => new Set([...prev, day]));
        });
        elapsed += 400;
        // Désactive le reveal avant de passer au suivant
        if (i < targetDays.length - 1) {
          schedule(elapsed, () => setRevealedDay(null));
          elapsed += 200;
        }
      });

      // Déplacement vers Sauvegarder
      schedule(elapsed, () => {
        setRevealedDay(null);
        dispatch({ type: "MOVE_TO_SAVE" });
      });
      elapsed += 700;
      // Press Sauvegarder
      schedule(elapsed, () => dispatch({ type: "SAVE" }));
      elapsed += 300;
      // Done → reset
      schedule(elapsed, () => dispatch({ type: "DONE" }));
      elapsed += 800;
      schedule(elapsed, () => {
        setActiveDays(new Set());
        dispatch({ type: "RESET" });
      });
      elapsed += 600;
      // Loop
      schedule(elapsed, runCycle);
    };

    runCycle();

    return () => {
      cancelled = true;
      timeouts.forEach((id) => window.clearTimeout(id));
    };
  }, [prefersReducedMotion]);

  // Calcul de la position du curseur en pourcentage selon la phase.
  const cursorPos = (() => {
    if (phase.kind === "moving" || phase.kind === "pressing" || phase.kind === "revealed") {
      const cellWidth = 100 / TEAM_DAYS.length;
      return { x: phase.day * cellWidth + cellWidth / 2, y: 50, target: "grid" as const };
    }
    if (phase.kind === "moving-to-save" || phase.kind === "saving" || phase.kind === "done") {
      return { x: 50, y: 100, target: "save" as const };
    }
    return { x: -20, y: -20, target: "none" as const };
  })();

  return (
    <div className="w-full">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="ogp-pulse-dot inline-block size-2 rounded-full bg-landing-accent" />
          <span className="font-plex-mono text-[10px] uppercase tracking-[0.18em] text-landing-ink/60">
            Planning Hebdo
          </span>
        </div>
        <span className="font-plex-mono text-[9px] uppercase tracking-wider text-landing-ink/30">
          équipe
        </span>
      </div>

      <div className="rounded-xl border border-landing-ink/5 bg-landing-bg p-3">
        {/* Grille hebdo */}
        <div className="relative">
          <div className="grid grid-cols-7 gap-1">
            {TEAM_DAYS.map((day, idx) => {
              const isActive = activeDays.has(idx);
              const isRevealed = revealedDay === idx;
              const isPressed =
                (phase.kind === "pressing" || phase.kind === "revealed") &&
                phase.day === idx;

              return (
                <div
                  key={`${day}-${idx}`}
                  className={cn(
                    "relative flex aspect-square flex-col items-center justify-center rounded-lg border p-1 transition-all duration-300",
                    isActive
                      ? "border-landing-accent bg-landing-accent/15"
                      : "border-landing-ink/8 bg-white",
                    isPressed && "scale-95"
                  )}
                  style={{
                    transitionTimingFunction:
                      "cubic-bezier(0.34, 1.56, 0.64, 1)",
                  }}
                >
                  <span
                    className={cn(
                      "font-plex-mono text-[10px] uppercase",
                      isActive ? "text-landing-accent-deep" : "text-landing-ink/40"
                    )}
                  >
                    {day}
                  </span>
                  {isRevealed && (
                    <span className="mt-0.5 text-center font-jakarta text-[7px] font-semibold leading-tight text-landing-ink">
                      {TEAM_ROLES[idx].split(" — ")[0]}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Curseur SVG animé */}
          {cursorPos.target !== "none" && (
            <div
              className="pointer-events-none absolute z-20 transition-all duration-500"
              style={{
                left: `${cursorPos.x}%`,
                top: `${cursorPos.y}%`,
                transform: `translate(-50%, -50%) scale(${
                  phase.kind === "pressing" || phase.kind === "saving" ? 0.85 : 1
                })`,
                transitionTimingFunction: "cubic-bezier(0.34, 1.56, 0.64, 1)",
                opacity: phase.kind === "done" ? 0 : 1,
              }}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                className="drop-shadow-[0_2px_4px_rgba(20,21,26,0.25)]"
              >
                <path
                  d="M5 3l14 9-6 1.5L10 19 5 3z"
                  fill="var(--color-landing-accent)"
                  stroke="var(--color-landing-primary)"
                  strokeWidth="1"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          )}
        </div>

        {/* Bouton Sauvegarder */}
        <div className="mt-3 flex justify-center">
          <button
            type="button"
            tabIndex={-1}
            className={cn(
              "rounded-full px-4 py-1.5 font-plex-mono text-[10px] uppercase tracking-wider transition-all duration-300",
              phase.kind === "saving"
                ? "scale-95 bg-landing-accent text-landing-primary"
                : phase.kind === "moving-to-save" || phase.kind === "done"
                  ? "bg-landing-accent/30 text-landing-primary"
                  : "bg-landing-ink/5 text-landing-ink/40"
            )}
            style={{
              transitionTimingFunction: "cubic-bezier(0.34, 1.56, 0.64, 1)",
            }}
          >
            Sauvegarder
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   COMPOSANT PRINCIPAL — Section Fonctionnalités
   ============================================================ */

type FeatureCardProps = {
  index: string;
  title: string;
  descriptor: string;
  children: React.ReactNode;
};

function FeatureCard({ index, title, descriptor, children }: FeatureCardProps) {
  return (
    <article className="landing-card flex flex-col p-6 sm:p-7">
      <div className="mb-4 flex items-center justify-between">
        <span className="font-plex-mono text-[10px] uppercase tracking-[0.2em] text-landing-accent-deep">
          {index}
        </span>
        <span className="h-1 w-8 rounded-full bg-landing-accent/40" />
      </div>
      <h3 className="font-jakarta text-xl font-bold tracking-tight text-landing-ink sm:text-2xl">
        {title}
      </h3>
      <div className="mt-5 flex-1">{children}</div>
      <p className="mt-5 border-t border-landing-ink/5 pt-4 text-sm leading-relaxed text-landing-ink/60">
        {descriptor}
      </p>
    </article>
  );
}

export function Features() {
  const rootRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = usePrefersReducedMotion();

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
        gsap.from("[data-feature-card]", {
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
    })();

    return () => {
      cancelled = true;
      ctx?.revert();
    };
  }, [prefersReducedMotion]);

  return (
    <section
      id="fonctionnalites"
      ref={rootRef}
      className="landing-section relative bg-landing-bg scroll-mt-24"
      aria-label="Fonctionnalités OgPressing"
    >
      <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-8">
        {/* En-tête */}
        <div className="mx-auto mb-12 max-w-3xl text-center sm:mb-16">
          <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-landing-accent/30 bg-landing-accent/5 px-3 py-1 font-plex-mono text-[11px] uppercase tracking-[0.18em] text-landing-accent-deep">
            <span className="ogp-pulse-dot inline-block size-1.5 rounded-full bg-landing-accent" />
            Fonctionnalités
          </p>
          <h2 className="font-jakarta text-3xl font-bold tracking-tight text-landing-ink sm:text-4xl md:text-5xl">
            Trois instruments.{" "}
            <span className="font-fraunces italic text-landing-accent-deep">
              Un seul métier.
            </span>
          </h2>
          <p className="mt-4 text-sm text-landing-ink/60 sm:text-base">
            Chaque module est pensé comme un instrument de contrôle — pas une
            fiche marketing. Voici ce que votre équipe manipulera chaque jour.
          </p>
        </div>

        {/* Grille de 3 cartes */}
        <div className="grid gap-5 md:grid-cols-3 sm:gap-6">
          <div data-feature-card>
            <FeatureCard
              index="01"
              title="Suivi par Article"
              descriptor="Chaque vêtement est suivi individuellement, du dépôt au retrait, avec ticket QR Code et étiquette code-barres."
            >
              <ArticleTrackingCard />
            </FeatureCard>
          </div>

          <div data-feature-card>
            <FeatureCard
              index="02"
              title="CRM en Direct"
              descriptor="Historique client, préférences de lavage, soldes impayés et fidélité, suivis automatiquement."
            >
              <CrmLiveCard />
            </FeatureCard>
          </div>

          <div data-feature-card>
            <FeatureCard
              index="03"
              title="Gestion d&apos;Équipe"
              descriptor="Caissiers, laveurs, livreurs : chaque rôle a un accès sécurisé et des permissions adaptées."
            >
              <TeamPlannerCard />
            </FeatureCard>
          </div>
        </div>
      </div>
    </section>
  );
}

export default Features;
