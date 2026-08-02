"use client"

import * as React from "react"
import * as ProgressPrimitive from "@radix-ui/react-progress"

import { cn } from "@/lib/utils"

/**
 * OgPressing — Progress (LOT 16 + Phase 2-a éditorial)
 * =====================================================
 *
 * Prop Phase 2-a `accent?: "default" | "editorial"` :
 *   - `default` (défaut) → track bg-primary/20, barre bg-primary,
 *                           success@100% bg-secondary (comportement LOT 16
 *                           inchangé).
 *   - `editorial`        → track bg-[rgba(197,160,61,0.15)], barre
 *                           gold-gradient (3 stops #C5A03D→#D4AF37→#A8862B),
 *                           success@100% bg-[#E8D6A0] (gold-pale, plus
 *                           lumineux pour signaler l'achèvement). Conserve
 *                           l'état indeterminate (barre 40% animée).
 *
 * La prop est opt-in — sans `accent` (ou `accent="default"`), le rendu
 * est strictement identique au comportement pré-Phase-2-a.
 */
function Progress({
  className,
  value,
  accent = "default",
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root> & {
  /** Variante visuelle — `editorial` active la barre dorée (gold-gradient)
   *  au lieu de bg-primary. Conserve les comportements indeterminate et
   *  success@100%. */
  accent?: "default" | "editorial"
}) {
  const isIndeterminate = value === undefined || value === null
  const isComplete = !isIndeterminate && value >= 100
  const isEditorial = accent === "editorial"

  // Track : bg-primary/20 par défaut, ou or 15% pour éditorial (fond
  // translucide doré sur fond navy/ivoire).
  const trackClass = isEditorial
    ? "bg-[rgba(197,160,61,0.15)]"
    : "bg-primary/20"

  // Indicator normal : bg-primary par défaut, ou gold-gradient pour éditorial.
  const indicatorNormalClass = isEditorial ? "gold-gradient" : "bg-primary"

  // Indicator success@100% : bg-secondary par défaut, ou gold-pale pour
  // éditorial (plus lumineux que le gradient pour signaler l'achèvement).
  const indicatorSuccessClass = isEditorial ? "bg-[#E8D6A0]" : "bg-secondary"

  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      data-accent={accent}
      className={cn(
        "relative h-2 w-full overflow-hidden rounded-full",
        trackClass,
        className
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className={cn(
          "h-full flex-1 transition-transform duration-slow ease-smooth motion-reduce:transition-none",
          isComplete
            ? `${indicatorSuccessClass} w-full`
            : `${indicatorNormalClass} w-full`,
          isIndeterminate &&
            "w-2/5 animate-progress-indeterminate motion-reduce:animate-none"
        )}
        style={
          isIndeterminate ? undefined : { transform: `translateX(-${100 - (value || 0)}%)` }
        }
      />
    </ProgressPrimitive.Root>
  )
}

export { Progress }
