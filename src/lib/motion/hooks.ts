/**
 * OgPressing — LOT 16 — Hooks d'accessibilité pour les animations
 * =================================================================
 *
 * usePrefersReducedMotion() — détecte la préférence système
 * "prefers-reduced-motion" de l'utilisateur.
 *
 * Toutes les animations développées dans le LOT 16 doivent respecter
 * cette préférence : quand l'utilisateur active "Réduire les animations"
 * dans ses paramètres système (OS ou navigateur), les effets de mouvement
 * (translate, scale, rotate) doivent être désactivés ou réduits à des
 * changements de couleur/opacité instantanés.
 *
 * Le guard CSS global dans globals.css (@media prefers-reduced-motion: reduce)
 * tue déjà les animations et transitions CSS. Ce hook JS est nécessaire pour
 * les animations Framer Motion qui ne sont pas affectées par le guard CSS.
 *
 * Usage :
 *   ```tsx
 *   const prefersReduced = usePrefersReducedMotion();
 *
 *   <motion.div
 *     animate={{ opacity: 1, y: prefersReduced ? 0 : 12 }}
 *     transition={{ duration: prefersReduced ? 0 : 0.25 }}
 *   />
 *   ```
 *
 * Ou plus simplement, utiliser la prop `reducedMotion` de Framer Motion :
 *   ```tsx
 *   <motion.div reducedMotion="user" animate={...} />
 *   ```
 *   → Framer Motion désactive automatiquement les transformations
 *   (x, y, scale, rotate) quand l'utilisateur préfère reduced-motion,
 *   mais garde les changements d'opacité.
 *
 * Ce hook reste utile pour :
 *   - Désactiver des animations CSS personnalisées (via classes conditionnelles)
 *   - Désactiver des effets de "glow"/"pulse" en boucle
 *   - Ajuster des durées de transition dynamiquement
 */
"use client";

import { useSyncExternalStore } from "react";

/* ----------------------------------------------------------------
   Singleton : on ne crée qu'un seul MediaQueryList partagé entre
   tous les composants qui utilisent le hook (évite les fuites de
   listeners et les re-rendus en cascade). */

const MEDIA_QUERY = "(prefers-reduced-motion: reduce)";

let mql: MediaQueryList | null = null;
const listeners = new Set<() => void>();
let currentValue: boolean | null = null;

function getSnapshot(): boolean {
  return currentValue ?? false;
}

function getServerSnapshot(): boolean {
  // SSR : on suppose "pas de reduced motion" par défaut.
  // Le guard CSS global s'applique côté client de toute façon.
  return false;
}

function subscribe(callback: () => void): () => void {
  // Initialisation paresseuse du MediaQueryList (côté client uniquement)
  if (typeof window !== "undefined" && !mql) {
    mql = window.matchMedia(MEDIA_QUERY);
    currentValue = mql.matches;

    mql.addEventListener("change", handleChange);
  }

  listeners.add(callback);
  return () => {
    listeners.delete(callback);
    // Note : on ne retire pas le listener du mql ni on met mql à null
    // car d'autres composants peuvent encore l'utiliser. Le singleton
    // vit pour toute la durée de vie de la page.
  };
}

function handleChange(event: MediaQueryListEvent) {
  currentValue = event.matches;
  listeners.forEach((cb) => cb());
}

/* ----------------------------------------------------------------
   Hook public */

/**
 * Détecte si l'utilisateur a activé "Réduire les animations" dans ses
 * paramètres système. Retourne `true` si l'utilisateur préfère moins
 * d'animations, `false` sinon.
 *
 * Utilise useSyncExternalStore pour un rendu concurrent-safe et
 * sans re-rendus superflus (un seul MediaQueryList partagé).
 *
 * @returns boolean — true si reduced-motion est préféré
 */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/* ----------------------------------------------------------------
   Helper : props motion pour reduced-motion automatique
   À spread sur un composant <motion.*> pour désactiver les
   transformations quand reduced-motion est actif. */

/**
 * Retourne un objet de props à spread sur un composant <motion.*> pour
 * respecter automatiquement la préférence reduced-motion.
 *
 * @example
 *   const motionProps = useReducedMotionProps();
 *   <motion.div {...motionProps} animate={{ y: 12, opacity: 1 }} />
 *   // → si reduced-motion : y sera ignoré, opacity conservée
 */
export function useReducedMotionProps() {
  const prefersReduced = usePrefersReducedMotion();
  return {
    reducedMotion: prefersReduced ? ("user" as const) : ("never" as const),
  };
}
