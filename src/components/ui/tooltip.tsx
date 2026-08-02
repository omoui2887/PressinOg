"use client"

import * as React from "react"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"

import { cn } from "@/lib/utils"

/**
 * OgPressing — Tooltip (LOT 16 + Phase 2-a éditorial)
 * ===================================================
 *
 * Prop Phase 2-a `variant?: "default" | "editorial"` sur `TooltipContent` :
 *   - `default`  (défaut) → fond primary, texte primary-foreground, flèche
 *                              primary (comportement existant inchangé).
 *   - `editorial`          → fond navy profond #0C1326 + bordure or 30% +
 *                              texte ivory #F5F0E6 + shadow doré. Flèche
 *                              assortie. Pour tooltips sur pages "luxe
 *                              éditorial" (auth, landing premium, KPI cards).
 *
 * La prop est opt-in — sans `variant` (ou `variant="default"`), le rendu
 * est strictement identique au comportement pré-Phase-2-a (backward-compatible).
 *
 * `delayDuration` reste à 300ms (fix flicker UX, LOT 16) et `skipDelayDuration`
 * à 100ms. `sideOffset` par défaut : 6px.
 */

function TooltipProvider({
  delayDuration = 300,
  skipDelayDuration = 100,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delayDuration={delayDuration}
      skipDelayDuration={skipDelayDuration}
      {...props}
    />
  )
}

function Tooltip({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  return (
    <TooltipProvider>
      <TooltipPrimitive.Root data-slot="tooltip" {...props} />
    </TooltipProvider>
  )
}

function TooltipTrigger({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />
}

type TooltipVariant = "default" | "editorial"

function TooltipContent({
  className,
  sideOffset = 6,
  variant = "default",
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content> & {
  /** Variante visuelle — `editorial` active le rendu "luxe éditorial"
   *  (navy + bordure or + texte ivory + shadow doré). */
  variant?: TooltipVariant
}) {
  const isEditorial = variant === "editorial"

  // Classes spécifiques à la variante — appliquées APRÈS les classes par
  // défaut pour garantir la surcharge (cn() gère la fusion Tailwind/Tailwind
  // en dernier-write-wins pour les propriétés conflictuelles).
  const variantClasses = isEditorial
    ? "bg-[#0C1326] text-[#F5F0E6] border border-[rgba(197,160,61,0.3)] shadow-[0_8px_24px_-4px_rgba(197,160,61,0.25),0_0_0_1px_rgba(197,160,61,0.1)]"
    : ""

  const arrowClasses = isEditorial
    ? "bg-[#0C1326] fill-[#0C1326]"
    : "bg-primary fill-primary"

  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        data-variant={variant}
        sideOffset={sideOffset}
        className={cn(
          "bg-primary text-primary-foreground animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 w-fit origin-(--radix-tooltip-content-transform-origin) rounded-md px-3 py-1.5 text-xs text-balance shadow-md motion-reduce:animate-none motion-reduce:duration-0",
          variantClasses,
          className
        )}
        {...props}
      >
        {children}
        <TooltipPrimitive.Arrow
          className={cn(
            "z-50 size-2.5 translate-y-[calc(-50%_-_2px)] rotate-45 rounded-[2px]",
            arrowClasses
          )}
        />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  )
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
