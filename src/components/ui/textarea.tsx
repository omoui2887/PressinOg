import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<"textarea"> & {
  variant?: "default" | "editorial"
}) {
  return (
    <textarea
      data-slot="textarea"
      data-editorial={variant === "editorial" ? "true" : undefined}
      className={cn(
        "border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive aria-invalid:animate-shake motion-reduce:aria-invalid:animate-none dark:bg-input/30 flex field-sizing-content min-h-16 w-full rounded-md border bg-transparent px-3 py-2 text-base shadow-xs transition-all duration-fast ease-smooth outline-none focus-visible:ring-[3px] focus-visible:glow-primary disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "data-[success=true]:border-secondary data-[success=true]:ring-secondary/30 data-[success=true]:glow-secondary",
        // Variant editorial — même logique que Input (fond glass + bordure or au focus).
        variant === "editorial" &&
          "editorial-input text-[#F5F0E6] placeholder:text-[rgba(245,240,230,0.35)] focus-visible:ring-0 focus-visible:border-[#C5A03D] focus-visible:glow-gold motion-reduce:transition-none",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
