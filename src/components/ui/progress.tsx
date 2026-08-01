"use client"

import * as React from "react"
import * as ProgressPrimitive from "@radix-ui/react-progress"

import { cn } from "@/lib/utils"

function Progress({
  className,
  value,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root>) {
  const isIndeterminate = value === undefined || value === null
  const isComplete = !isIndeterminate && value >= 100

  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      className={cn(
        "bg-primary/20 relative h-2 w-full overflow-hidden rounded-full",
        className
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className={cn(
          "h-full flex-1 transition-transform duration-slow ease-smooth motion-reduce:transition-none",
          isComplete ? "bg-secondary w-full" : "bg-primary w-full",
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
