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
 */
"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
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

export function Reveal({
  children,
  delay = 0,
  className,
  as: Tag = "div",
}: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    // Note : les utilisateurs avec "prefers-reduced-motion" sont gérés
    // automatiquement par les variantes `motion-reduce:*` du className
    // (opacity-100 + translate-y-0 + transition-none). L'observer reste
    // actif pour tous, mais l'animation est désactivée côté CSS si besoin.

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      ref={ref as never}
      style={{ transitionDelay: `${delay}ms` }}
      className={cn(
        "transition-all duration-700 ease-out will-change-transform motion-reduce:transition-none",
        visible
          ? "translate-y-0 opacity-100"
          : "translate-y-6 opacity-0 motion-reduce:translate-y-0 motion-reduce:opacity-100",
        className
      )}
    >
      {children}
    </Tag>
  );
}
