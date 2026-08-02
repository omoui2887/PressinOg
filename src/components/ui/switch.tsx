"use client"

import * as React from "react"
import * as SwitchPrimitive from "@radix-ui/react-switch"

import { cn } from "@/lib/utils"

function Switch({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root> & {
  variant?: "default" | "editorial"
}) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-editorial={variant === "editorial" ? "true" : undefined}
      className={cn(
        "peer data-[state=checked]:bg-primary data-[state=unchecked]:bg-input focus-visible:border-ring focus-visible:ring-ring/50 dark:data-[state=unchecked]:bg-input/80 inline-flex h-[1.15rem] w-8 shrink-0 items-center rounded-full border border-transparent shadow-xs transition-all outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50",
        // Variant editorial — fond ivory/10 → actif dégradé or + pastille ivory + focus halo or.
        // Le styling détaillé est porté par les règles CSS .editorial-switch dans globals.css.
        variant === "editorial" &&
          "editorial-switch bg-[rgba(255,255,255,0.1)] border-[rgba(255,255,255,0.08)] data-[state=checked]:bg-none focus-visible:ring-0 motion-reduce:transition-none",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "bg-background dark:data-[state=unchecked]:bg-foreground dark:data-[state=checked]:bg-primary-foreground pointer-events-none block size-4 rounded-full ring-0 transition-transform duration-fast ease-smooth data-[state=checked]:translate-x-[calc(100%-2px)] data-[state=unchecked]:translate-x-0 data-[state=checked]:scale-110 motion-reduce:data-[state=checked]:scale-100",
          variant === "editorial" &&
            "editorial-switch-thumb bg-[#F5F0E6] motion-reduce:transition-none"
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
