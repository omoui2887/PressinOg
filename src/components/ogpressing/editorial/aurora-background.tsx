/**
 * AuroraBackground — Décor de fond "luxe éditorial".
 *
 * Rend un div absolute positionné en `inset-0` contenant la couche `.aurora-bg`
 * (gradient conique animé défini dans `src/app/globals.css` §3).
 *
 * Le composant DOIT être placé dans un parent `position: relative` (ou tout
 * autre contexte de positionnement non statique) pour que la couche absolute
 * s'étende correctement.
 *
 * Accessibilité :
 * - `pointer-events-none` : la couche décorative ne capture aucun clic.
 * - `aria-hidden` implicite via le rôle purement décoratif (pas de label,
 *   pas d'information). Le contenu éventuel passé via `children` reste
 *   accessible (les enfants gardent leur propre sémantique).
 *
 * Server component (pas de "use client") — l'animation est pure CSS.
 */
import * as React from "react";

import { cn } from "@/lib/utils";

export type AuroraIntensity = "subtle" | "normal" | "strong";

export interface AuroraBackgroundProps {
  /** Classes additionnelles appliquées au wrapper absolute. */
  className?: string;
  /** Intensité (opacité) du dégradé. Défaut : "normal" (0.6). */
  intensity?: AuroraIntensity;
  /** Contenu optionnel superposé au-dessus de l'aurora (reste accessible). */
  children?: React.ReactNode;
}

const INTENSITY_OPACITY: Record<AuroraIntensity, number> = {
  subtle: 0.3,
  normal: 0.6,
  strong: 1,
};

export function AuroraBackground({
  className,
  intensity = "normal",
  children,
}: AuroraBackgroundProps) {
  return (
    <div
      className={cn(
        "absolute inset-0 overflow-hidden pointer-events-none motion-reduce:animate-none",
        className,
      )}
      aria-hidden={children ? undefined : true}
    >
      <div
        className="aurora-bg motion-reduce:animate-none"
        style={{ opacity: INTENSITY_OPACITY[intensity] }}
      />
      {children}
    </div>
  );
}
