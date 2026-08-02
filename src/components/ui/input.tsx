import * as React from "react"

import { cn } from "@/lib/utils"

function Input({
  className,
  type,
  variant = "default",
  ...props
}: React.ComponentProps<"input"> & {
  variant?: "default" | "editorial"
}) {
  return (
    <input
      type={type}
      data-slot="input"
      data-editorial={variant === "editorial" ? "true" : undefined}
      className={cn(
        "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input flex h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-all duration-fast ease-smooth outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:glow-primary",
        "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive aria-invalid:animate-shake motion-reduce:aria-invalid:animate-none",
        "data-[success=true]:border-secondary data-[success=true]:ring-secondary/30 data-[success=true]:glow-secondary",
        // Variant editorial — applique .editorial-input (fond glass, bordure or au focus, inset glow).
        // Comportement opt-in : n'affecte pas l'apparence par défaut.
        variant === "editorial" &&
          "editorial-input text-[#F5F0E6] placeholder:text-[rgba(245,240,230,0.35)] focus-visible:ring-0 focus-visible:border-[#C5A03D] focus-visible:glow-gold motion-reduce:transition-none",
        className
      )}
      {...props}
    />
  )
}

export { Input }
