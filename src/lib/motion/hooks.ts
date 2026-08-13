/**
 * e-pressing — Hook usePrefersReducedMotion (LOT 17)
 * --------------------------------------------------
 * Détecte la préférence "prefers-reduced-motion" de l'utilisateur.
 *
 * Utilisé par les composants de la landing cinématographique pour
 * désactiver / simplifier les animations GSAP lorsque l'utilisateur a
 * activé "Réduire les animations" dans ses paramètres système.
 *
 * Implémentation : useSyncExternalStore (pattern React 18+ sans effet
 * de layout, SSR-safe). Côté serveur, retourne toujours false (par
 * défaut on suppose animations activées — le client corrigera après
 * hydratation si besoin).
 *
 * @returns true si l'utilisateur prefers-reduced-motion: reduce
 */
"use client";

import { useSyncExternalStore } from "react";

function subscribe(callback: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) {
    return () => {};
  }
  const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
  mql.addEventListener("change", callback);
  return () => mql.removeEventListener("change", callback);
}

function getClientSnapshot(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function getServerSnapshot(): boolean {
  return false;
}

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribe,
    getClientSnapshot,
    getServerSnapshot
  );
}
