"use client"

import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * e-pressing — Button (LOT 16.2 — embellissement + Phase 2-a éditorial)
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
 * Phase 2-a — Variants "Luxe Éditorial" (opt-in, backward-compatible) :
 *   - `editorial`           → CTA doré 3 stops (.gold-gradient), texte ivory,
 *                             hover brightness 1.15 + translateY -2px, focus glow-gold.
 *   - `editorialSecondary`  → glass + bordure or subtile (.editorial-btn-secondary),
 *                             texte gold-pale, hover bg gold/8.
 *   - `editorialGhost`      → texte gold-pale, underline doré animé au hover
 *                             (background-size 0→100%).
 *   - Loading éditorial : pour ces 3 variants, l'état `loading` remplace le
 *     spinner Loader2 par 3 points dorés pulsants (.loading-dots) + un mini
 *     spinner border-top gold, conservant l'esthétique "luxe" pendant les
 *     actions asynchrones.
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
        // `success` = vert (alias sémantique de la palette secondary).
        // À utiliser pour les actions positives : Encaisser, Activer, Réactiver,
        // Renouveler, Marquer livré, Valider, Confirmer. Permet à l'utilisateur
        // d'identifier instantanément les actions "qui font avancer / valident".
        success:
          "bg-gradient-success text-success-foreground shadow-xs hover:-translate-y-px hover:shadow-md focus-visible:ring-success/20 dark:focus-visible:ring-success/40 motion-reduce:hover:translate-y-0",
        outline:
          "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground hover:-translate-y-px hover:shadow-sm dark:bg-input/30 dark:border-input dark:hover:bg-input/50 motion-reduce:hover:translate-y-0",
        secondary:
          "bg-gradient-secondary text-secondary-foreground shadow-xs hover:-translate-y-px hover:shadow-md motion-reduce:hover:translate-y-0",
        ghost:
          "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        link: "text-primary underline-offset-4 hover:underline",
        // ---- Phase 2-a — Variants "Luxe Éditorial" (opt-in, non-cassant) ----
        // CTA doré premium — utilise .gold-gradient défini dans globals.css
        // (fond 3 stops #C5A03D → #D4AF37 → #A8862B, texte ivory #F5F0E6,
        // hover brightness 1.15 + translateY -2px, disabled gris-bleu).
        // focus-visible:glow-gold remplace le ring par défaut pour cohérence.
        editorial:
          "gold-gradient border-transparent focus-visible:ring-0 focus-visible:glow-gold motion-reduce:transition-none motion-reduce:hover:translate-y-0",
        // Bouton glass secondaire — utilise .editorial-btn-secondary (fond
        // rgba(255,255,255,0.03), bordure or subtile, texte gold-pale #E8D6A0,
        // hover bg gold/8 + bordure or renforcée).
        editorialSecondary:
          "editorial-btn-secondary border-transparent focus-visible:ring-0 focus-visible:glow-gold motion-reduce:transition-none",
        // Lien fantôme éditorial — texte gold-pale, underline doré animé au
        // hover via background-size 0% → 100% (technique Tailwind v4 sans JS).
        editorialGhost:
          "border-transparent bg-transparent text-[#E8D6A0] underline-offset-4 hover:text-[#F5F0E6] bg-[linear-gradient(#C5A03D,#C5A03D)] bg-[length:0%_1px] bg-no-repeat bg-[position:left_bottom] hover:bg-[length:100%_1px] transition-[background-size,color] duration-base ease-smooth focus-visible:ring-0 focus-visible:glow-gold motion-reduce:transition-none",
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
    /** Affiche un spinner et désactive le clic (action asynchrone en cours).
     *  Pour les variants `editorial*`, le spinner Loader2 est remplacé par
     *  3 points dorés pulsants (.loading-dots) + un mini spinner border-top
     *  gold, conservant l'esthétique "luxe éditorial". */
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

  // Mode button natif — on peut ajouter le spinner et l'effet ripple.
  // Pour les variants éditoriaux, l'état `loading` affiche 3 points dorés
  // pulsants (.loading-dots) + un mini spinner border-top gold, conservant
  // l'esthétique "luxe" pendant les actions asynchrones. Les autres variants
  // conservent leur comportement existant (Loader2 lucide).
  const isEditorialVariant =
    variant === "editorial" ||
    variant === "editorialSecondary" ||
    variant === "editorialGhost"

  const content = loading ? (
    isEditorialVariant ? (
      <>
        {/* 3 points dorés pulsants — .loading-dots utilise ::before, span
            enfant, ::after (3 dots au total, délai 0s/0s/0.4s par CSS). */}
        <span className="loading-dots" aria-hidden="true">
          <span />
        </span>
        {/* Mini spinner border-top gold — complément visuel pour signaler
            une action asynchrone en cours. */}
        <span
          aria-hidden="true"
          className="size-3.5 animate-spin rounded-full border-2 border-white/20 border-t-[#C5A03D] motion-reduce:animate-none"
        />
        {/* Children invisibles — préservent la largeur du bouton pour éviter
            un saut de mise en page pendant le chargement. */}
        <span className="invisible">{children}</span>
      </>
    ) : (
      <>
        <Loader2 className="animate-spin" />
        <span className="invisible">{children}</span>
      </>
    )
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
