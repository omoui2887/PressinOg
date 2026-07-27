/**
 * OgPressing — Reveal (fade-in au scroll)
 * ---------------------------------------
 * Wrapper client qui révèle ses enfants avec une animation fade-in / slide-up
 * légère lorsqu'ils entrent dans le viewport (IntersectionObserver).
 *
 * Usage :
 *   <Reveal delay={100}><Card>...</Card></Reveal>
 *
 * L'animation ne se joue qu'une seule fois (utile pour les landing pages).
 * Respecte prefers-reduced-motion.
 *
 * 🚀 PERF : Utilise un IntersectionObserver SHARED (singleton) pour tous les
 * Reveal de la page, au lieu d'un observer par instance. Sur la landing page
 * (15+ Reveal), cela réduit de 15→1 le nombre d'observers actifs, ce qui
 * allège le garbage collector et améliore les performances de scroll.
 */
"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface RevealProps {
  children: ReactNode;
  /** Délai en ms avant l'animation (effet cascade possible). */
  delay?: number;
  /** Classe additionnelle sur le wrapper. */
  className?: string;
  /** Tag HTML rendu par le wrapper (div par défaut). */
  as?: "div" | "section" | "li" | "article";
}

/* ----------------------- Shared IntersectionObserver ----------------------- */

interface RevealEntry {
  node: Element;
  setVisible: (v: boolean) => void;
}

/** Registre global des éléments observés (1 observer pour toute la page). */
let observerInstance: IntersectionObserver | null = null;
const registry = new Map<Element, RevealEntry>();

function getSharedObserver(): IntersectionObserver {
  if (observerInstance) return observerInstance;

  observerInstance = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const reg = registry.get(entry.target);
          if (reg) {
            reg.setVisible(true);
            // Une fois révélé, on désenregistre l'élément (animation unique).
            registry.delete(entry.target);
            observerInstance?.unobserve(entry.target);
          }
        }
      });
    },
    { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
  );

  return observerInstance;
}

function registerReveal(node: Element, setVisible: (v: boolean) => void): () => void {
  const observer = getSharedObserver();
  registry.set(node, { node, setVisible });
  observer.observe(node);
  return () => {
    registry.delete(node);
    observer.unobserve(node);
  };
}

/* ----------------------- Prefers-reduced-motion store ----------------------- */
// Détecte prefers-reduced-motion une seule fois (pas de re-render au scroll).

function subscribeReducedMotion(callback: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", callback);
  return () => mq.removeEventListener("change", callback);
}
function getReducedMotionSnapshot(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/* ----------------------- Composant ----------------------- */

export function Reveal({
  children,
  delay = 0,
  className,
  as: Tag = "div",
}: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  // SSR-safe : false côté serveur, valeur réelle côté client.
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
    () => false
  );

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    // Si l'utilisateur préfère les animations réduites, on n'observe pas
    // (le rendu utilise `reducedMotion` pour afficher immédiatement).
    if (reducedMotion) {
      return;
    }

    return registerReveal(node, setVisible);
  }, [reducedMotion]);

  // État visuel effectif : visible OU reducedMotion (toujours visible sans anim).
  const isShown = visible || reducedMotion;

  return (
    <Tag
      ref={ref as never}
      style={{ transitionDelay: isShown && !reducedMotion ? `${delay}ms` : undefined }}
      className={cn(
        "transition-all duration-700 ease-out will-change-transform",
        !reducedMotion && "motion-reduce:transition-none",
        isShown
          ? "translate-y-0 opacity-100"
          : "translate-y-6 opacity-0",
        className
      )}
    >
      {children}
    </Tag>
  );
}
