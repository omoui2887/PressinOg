import { cn } from "@/lib/utils"

/**
 * Skeleton — LOT 16.7
 * Effet shimmer (dégradé qui se déplace en boucle) pour un rendu
 * plus premium qu'un simple pulse d'opacité. La classe .shimmer est
 * définie dans globals.css et utilise la keyframe ogp-shimmer.
 *
 * Le fallback animate-pulse reste disponible si .shimmer ne se charge
 * pas (CSS non chargé, etc.) — les deux sont cumulables sans conflit.
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "shimmer rounded-md motion-reduce:animate-pulse motion-reduce:[background:none]",
        className
      )}
      {...props}
    />
  )
}

export { Skeleton }
