"use client"

import * as React from "react"
import * as CheckboxPrimitive from "@radix-ui/react-checkbox"
import { CheckIcon } from "lucide-react"

import { cn } from "@/lib/utils"

function Checkbox({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root> & {
  variant?: "default" | "editorial"
}) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      data-editorial={variant === "editorial" ? "true" : undefined}
      className={cn(
        "peer border-input dark:bg-input/30 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground dark:data-[state=checked]:bg-primary data-[state=checked]:border-primary focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive size-4 shrink-0 rounded-[4px] border shadow-xs transition-all duration-fast ease-smooth outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50",
        // Variant editorial — bordure ivory → coché fond gold/15 + bordure or + coche blanche animée.
        // Le styling détaillé est porté par les règles CSS .editorial-checkbox dans globals.css.
        variant === "editorial" &&
          "editorial-checkbox bg-[rgba(255,255,255,0.02)] border-[rgba(255,255,255,0.3)] data-[state=checked]:bg-[rgba(197,160,61,0.15)] data-[state=checked]:border-[#C5A03D] data-[state=checked]:text-[#F5F0E6] motion-reduce:transition-none",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="flex items-center justify-center text-current transition-transform duration-fast ease-smooth data-[state=checked]:animate-pop motion-reduce:animate-none"
      >
        <CheckIcon className="size-3.5" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
