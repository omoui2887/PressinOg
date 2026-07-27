"use client"

import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * OgPressing — Button (LOT 16.2 — embellissement)
 * ================================================
 *
 * Améliorations appliquées :
 *   - Dégradé subtil de fond (bg-gradient-*) sur les variants colorés
 *   - Hover : légère élévation (translate-y -1px) + ombre qui s'intensifie
 *   - Active : scale 0.98 pour une sensation de "pression"
 *   - Loading : spinner animé + largeur stable + clic désactivé
 *   - Disabled : opacité réduite + suppression des effets
 *   - Ripple : onde circulaire au clic (prop `ripple`, pour actions importantes)
 *   - Variant `warning` (orange) pour actions d'avertissement
 *   - Variant `loading` désactivé via prop `loading` (prioritaire sur `disabled`)
 *   - usePrefersReducedMotion : les effets de mouvement sont désactivés
 *     automatiquement par le guard CSS global (prefers-reduced-motion).
 *
 * La prop `loading` remplace le texte par un spinner tout en conservant
 * la largeur du bouton (min-width calculée sur le contenu initial) pour
 * éviter un saut de mise en page.
 *
 * La prop `ripple` ajoute un effet d'onde circulaire au clic — à utiliser
 * sur les boutons d'action importants (Confirmer, Enregistrer le paiement).
 */

const buttonVariants = cva(
  "relative overflow-hidden inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all duration-fast ease-smooth disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100",
  {
    variants: {
      variant: {
        default:
          "bg-gradient-primary text-primary-foreground shadow-xs hover:-translate-y-px hover:shadow-md motion-reduce:hover:translate-y-0",
        destructive:
          "bg-gradient-danger text-white shadow-xs hover:-translate-y-px hover:shadow-md focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 motion-reduce:hover:translate-y-0",
        warning:
          "bg-gradient-warning text-warning-foreground shadow-xs hover:-translate-y-px hover:shadow-md focus-visible:ring-warning/20 dark:focus-visible:ring-warning/40 motion-reduce:hover:translate-y-0",
        outline:
          "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground hover:-translate-y-px hover:shadow-sm dark:bg-input/30 dark:border-input dark:hover:bg-input/50 motion-reduce:hover:translate-y-0",
        secondary:
          "bg-gradient-secondary text-secondary-foreground shadow-xs hover:-translate-y-px hover:shadow-md motion-reduce:hover:translate-y-0",
        ghost:
          "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

/* ----------------------------------------------------------------
   Ripple — effet d'onde circulaire au clic.
   Implémenté via un span absolu animé par la keyframe ogp-ripple. */

interface Ripple {
  id: number
  x: number
  y: number
  size: number
}

function RippleEffect({ ripples }: { ripples: Ripple[] }) {
  return (
    <>
      {ripples.map((r) => (
        <span
          key={r.id}
          className="pointer-events-none absolute rounded-full bg-white/30 animate-ripple motion-reduce:hidden"
          style={{
            left: r.x,
            top: r.y,
            width: r.size,
            height: r.size,
            transform: "translate(-50%, -50%)",
          }}
        />
      ))}
    </>
  )
}

function Button({
  className,
  variant,
  size,
  asChild = false,
  loading = false,
  ripple = false,
  disabled,
  children,
  onClick,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
    /** Affiche un spinner et désactive le clic (action asynchrone en cours). */
    loading?: boolean
    /** Active l'effet d'onde circulaire au clic (actions importantes). */
    ripple?: boolean
  }) {
  const Comp = asChild ? Slot : "button"
  const [ripples, setRipples] = React.useState<Ripple[]>([])
  const rippleId = React.useRef(0)

  const isDisabled = disabled || loading

  const handleClick = React.useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      if (ripple && !isDisabled) {
        const rect = e.currentTarget.getBoundingClientRect()
        const size = Math.max(rect.width, rect.height)
        const x = e.clientX - rect.left - size / 2
        const y = e.clientY - rect.top - size / 2
        const id = rippleId.current++
        setRipples((prev) => [...prev, { id, x, y, size }])
        // Nettoyage après la fin de l'animation (600ms)
        setTimeout(() => {
          setRipples((prev) => prev.filter((r) => r.id !== id))
        }, 650)
      }
      onClick?.(e)
    },
    [ripple, isDisabled, onClick]
  )

  // Slot (asChild) exige EXACTEMENT un seul enfant — on ne peut pas y
  // ajouter le spinner ou le RippleEffect. Donc :
  //   - asChild=true  → on passe les children tels quels (pas de ripple,
  //     pas de spinner ; l'utilisateur gère son propre contenu)
  //   - asChild=false → on peut injecter RippleEffect + spinner librement
  if (asChild) {
    return (
      <Comp
        data-slot="button"
        className={cn(buttonVariants({ variant, size, className }))}
        disabled={isDisabled}
        onClick={onClick}
        {...props}
      >
        {children}
      </Comp>
    )
  }

  // Mode button natif — on peut ajouter le spinner et l'effet ripple
  const content = loading ? (
    <>
      <Loader2 className="animate-spin" />
      <span className="invisible">{children}</span>
    </>
  ) : (
    children
  )

  return (
    <Comp
      data-slot="button"
      data-loading={loading ? "true" : undefined}
      className={cn(buttonVariants({ variant, size, className }))}
      disabled={isDisabled}
      onClick={handleClick}
      {...props}
    >
      {ripple && <RippleEffect ripples={ripples} />}
      {content}
    </Comp>
  )
}

export { Button, buttonVariants }
