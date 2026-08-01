import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive aria-invalid:animate-shake motion-reduce:aria-invalid:animate-none dark:bg-input/30 flex field-sizing-content min-h-16 w-full rounded-md border bg-transparent px-3 py-2 text-base shadow-xs transition-all duration-fast ease-smooth outline-none focus-visible:ring-[3px] focus-visible:glow-primary disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "data-[success=true]:border-secondary data-[success=true]:ring-secondary/30 data-[success=true]:glow-secondary",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
