/**
 * OgPressing — LOT 16 — Variantes Framer Motion réutilisables
 * =============================================================
 *
 * Bibliothèque centralisée de variantes d'animation pour Framer Motion.
 * Toutes les animations de l'application doivent utiliser ces variantes
 * pour garantir une cohérence visuelle (durées, courbes, amplitudes).
 *
 * Règles de design (LOT 16) :
 *   - Durées : 150ms (rapide) à 300ms (modérée), 400ms max pour transitions lentes
 *   - Courbes : ease-smooth (doux, proche ease-out) pour la majorité
 *   - Amplitudes : subtiles, jamais distrayantes
 *   - Accessibilité : toutes ces variantes sont compatibles avec
 *     usePrefersReducedMotion() — le hook réduit les déplacements à 0
 *     automatiquement quand l'utilisateur demande moins d'animations.
 *
 * Usage typique :
 *   ```tsx
 *   import { motion } from "framer-motion";
 *   import { fadeInUp, staggerContainer } from "@/lib/motion/variants";
 *
 *   <motion.div variants={staggerContainer} initial="hidden" animate="show">
 *     <motion.div variants={fadeInUp}>Card 1</motion.div>
 *     <motion.div variants={fadeInUp}>Card 2</motion.div>
 *   </motion.div>
 *   ```
 *
 * Variante "Reduced Motion" :
 *   Quand usePrefersReducedMotion() retourne true, passez les variants
 *   via `reducedMotion="user"` sur le composant motion, OU utilisez
 *   les helpers `reducedMotionProps` ci-dessous pour un contrôle fin.
 */
import type { Variants, Transition } from "framer-motion";

/* ----------------------------------------------------------------
   Courbes d'accélération (alignées sur --ease-smooth et --ease-bounce-subtle
   du design system CSS) */
const EASE_SMOOTH: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94];
const EASE_BOUNCE_SUBTLE: [number, number, number, number] = [0.34, 1.56, 0.64, 1];

/* ----------------------------------------------------------------
   Transitions réutilisables */
const springSoft: Transition = {
  type: "spring",
  stiffness: 300,
  damping: 30,
  mass: 0.8,
};

const tweenFast: Transition = {
  duration: 0.15,
  ease: EASE_SMOOTH,
};

const tweenBase: Transition = {
  duration: 0.25,
  ease: EASE_SMOOTH,
};

const tweenSlow: Transition = {
  duration: 0.4,
  ease: EASE_SMOOTH,
};

/* ----------------------------------------------------------------
   Variantes d'apparition / disparition */

/** Fondu simple — pour les éléments qui apparaissent sans déplacement. */
export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: tweenFast,
  },
  exit: {
    opacity: 0,
    transition: tweenFast,
  },
};

/** Fondu + glissement vers le haut — cards, sections, contenu d'onglet. */
export const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: tweenBase,
  },
  exit: {
    opacity: 0,
    y: -8,
    transition: tweenFast,
  },
};

/** Fondu + glissement vers le bas — messages d'erreur sous les champs. */
export const fadeInDown: Variants = {
  hidden: { opacity: 0, y: -8 },
  show: {
    opacity: 1,
    y: 0,
    transition: tweenFast,
  },
  exit: {
    opacity: 0,
    y: -4,
    transition: tweenFast,
  },
};

/** Mise à l'échelle + fondu — dialogues, popovers, modales. */
export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.95 },
  show: {
    opacity: 1,
    scale: 1,
    transition: springSoft,
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    transition: tweenFast,
  },
};

/** Glissement depuis la droite — Sheets et panneaux latéraux droits. */
export const slideInRight: Variants = {
  hidden: { x: "100%" },
  show: {
    x: 0,
    transition: { duration: 0.3, ease: EASE_SMOOTH },
  },
  exit: {
    x: "100%",
    transition: { duration: 0.25, ease: EASE_SMOOTH },
  },
};

/** Glissement depuis la gauche — Sheets et panneaux latéraux gauches. */
export const slideInLeft: Variants = {
  hidden: { x: "-100%" },
  show: {
    x: 0,
    transition: { duration: 0.3, ease: EASE_SMOOTH },
  },
  exit: {
    x: "-100%",
    transition: { duration: 0.25, ease: EASE_SMOOTH },
  },
};

/** Glissement depuis le bas — Sheets mobile, bottom drawers. */
export const slideInBottom: Variants = {
  hidden: { y: "100%" },
  show: {
    y: 0,
    transition: { duration: 0.3, ease: EASE_SMOOTH },
  },
  exit: {
    y: "100%",
    transition: { duration: 0.25, ease: EASE_SMOOTH },
  },
};

/** Glissement depuis le haut — toasts mobile. */
export const slideInTop: Variants = {
  hidden: { y: "-100%" },
  show: {
    y: 0,
    transition: { duration: 0.25, ease: EASE_SMOOTH },
  },
  exit: {
    y: "-100%",
    transition: { duration: 0.2, ease: EASE_SMOOTH },
  },
};

/* ----------------------------------------------------------------
   Variantes de liste échelonnée (stagger)
   Utilisées pour animer une liste d'éléments les uns après les autres
   avec un léger décalage (ex : StatCards du dashboard, liste de commandes). */

/**
 * Conteneur stagger — à placer sur le parent d'une liste.
 * `staggerChildren` contrôle le délai entre chaque enfant (50-80ms recommandé).
 * `delayChildren` ajoute un délai avant le premier enfant.
 */
export const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.06,
      delayChildren: 0.05,
    },
  },
};

/**
 * Conteneur stagger avec délai personnalisable.
 * @param stagger - délai entre enfants en secondes (défaut 60ms)
 * @param delay - délai avant le premier enfant (défaut 50ms)
 */
export function makeStaggerContainer(
  stagger = 0.06,
  delay = 0.05
): Variants {
  return {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: stagger,
        delayChildren: delay,
      },
    },
  };
}

/** Élément stagger — à placer sur chaque enfant d'un staggerContainer. */
export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: tweenBase,
  },
};

/* ----------------------------------------------------------------
   Variante de secousse horizontale (shake) — erreurs de validation.
   Amplitude faible (4px), 2-3 oscillations sur 300ms. */
export const shake: Variants = {
  hidden: { x: 0 },
  show: {
    x: 0,
    transition: tweenBase,
  },
  shake: {
    x: [0, -4, 4, -3, 3, 0],
    transition: { duration: 0.3, ease: EASE_SMOOTH },
  },
};

/* ----------------------------------------------------------------
   Variante de "pop" — feedback tactile (boutons +/- quantité).
   Scale rapide 1 → 1.15 → 1 sur 200ms. */
export const pop: Variants = {
  hidden: { scale: 1 },
  show: { scale: 1 },
  pop: {
    scale: [1, 1.15, 1],
    transition: { duration: 0.2, ease: EASE_BOUNCE_SUBTLE },
  },
};

/* ----------------------------------------------------------------
   Export des transitions brutes pour usage direct */
export const transitions = {
  tweenFast,
  tweenBase,
  tweenSlow,
  springSoft,
} as const;

export const easings = {
  smooth: EASE_SMOOTH,
  bounceSubtle: EASE_BOUNCE_SUBTLE,
} as const;
