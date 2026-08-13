/**
 * e-pressing — useViewMode
 * ------------------------
 * Hook de persistance du mode d'affichage (liste vs grille) pour les pages
 * d'historique. La préférence est stockée dans localStorage, clé par page
 * (pour que l'utilisateur puisse préférer "grille" sur les clients et
 * "liste" sur les commandes, par exemple).
 *
 * Usage :
 *   const { viewMode, setViewMode, toggle } = useViewMode("clients");
 *   // viewMode: "list" | "grid"
 *
 * Comportement :
 *   - Au premier rendu (SSR), retourne "list" par défaut (évite l'hydration
 *     mismatch — le serveur ne connaît pas localStorage).
 *   - Après mount, lit localStorage. Si absent, "list".
 *   - setViewMode persiste immédiatement.
 *   - Clé localStorage : `ogp:view-mode:${pageKey}`.
 */
"use client";

/* eslint-disable react-hooks/set-state-in-effect */
import { useCallback, useEffect, useState } from "react";

export type ViewMode = "list" | "grid";

const STORAGE_PREFIX = "ogp:view-mode:";
const DEFAULT_MODE: ViewMode = "list";

/**
 * @param pageKey Identifiant court de la page (ex: "clients", "commandes").
 *                Sert à isoler la préférence par page.
 */
export function useViewMode(pageKey: string) {
  const storageKey = `${STORAGE_PREFIX}${pageKey}`;
  const [viewMode, setViewModeState] = useState<ViewMode>(DEFAULT_MODE);
  const [hydrated, setHydrated] = useState(false);

  // Lecture différée (après mount) pour éviter l'hydration mismatch.
  // Pattern standard pour lire localStorage côté client après mount :
  // on ne peut pas lire localStorage pendant le render (SSR), donc on le
  // fait dans un effet. La règle react-hooks/set-state-in-effect signale
  // ce pattern mais il est légitime pour une source externe persistée.
  useEffect(() => {
    let stored: ViewMode | null = null;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw === "list" || raw === "grid") {
        stored = raw;
      }
    } catch {
      // localStorage indisponible (mode privé / SSR) — on garde le défaut
    }
    if (stored && stored !== viewMode) {
      setViewModeState(stored);
    }
    if (!hydrated) {
      setHydrated(true);
    }
  }, [storageKey]);

  const setViewMode = useCallback(
    (mode: ViewMode) => {
      setViewModeState(mode);
      try {
        window.localStorage.setItem(storageKey, mode);
      } catch {
        // ignore
      }
    },
    [storageKey]
  );

  const toggle = useCallback(() => {
    setViewMode(viewMode === "list" ? "grid" : "list");
  }, [viewMode, setViewMode]);

  return { viewMode, setViewMode, toggle, hydrated };
}
