import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-all duration-fast ease-smooth overflow-hidden",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground [a&]:hover:bg-primary/90",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90",
        success:
          "border-transparent bg-secondary/10 text-secondary [a&]:hover:bg-secondary/20",
        info:
          "border-transparent bg-primary/10 text-primary [a&]:hover:bg-primary/20",
        warning:
          "border-transparent bg-warning/10 text-warning-700 dark:text-warning [a&]:hover:bg-warning/20",
        destructive:
          "border-transparent bg-destructive text-white [a&]:hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
        danger:
          "border-transparent bg-danger/10 text-danger dark:text-danger [a&]:hover:bg-danger/20",
        outline:
          "text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant,
  asChild = false,
  dot = false,
  children,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & {
    asChild?: boolean
    /** Pastille de couleur avant le texte — double encodage (couleur + texte)
     *  pour l'accessibilité (section 25 du prompt d'embellissement). */
    dot?: boolean
  }) {
  const Comp = asChild ? Slot : "span"
  // La pastille n'est rendue que pour les badges non-Slot (asChild=false)
  // pour éviter de casser le pattern Slot à enfant unique.
  const pastille =
    dot && !asChild ? (
      <span
        aria-hidden="true"
        className="size-1.5 rounded-full bg-current shrink-0"
      />
    ) : null

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    >
      {pastille}
      {children}
    </Comp>
  )
}

export { Badge, badgeVariants }
