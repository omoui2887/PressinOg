/**
 * e-pressing — NoiseOverlay (LOT 17)
 * ----------------------------------
 * Overlay de bruit SVG global pour la landing page cinématographique.
 *
 * Implémente un filtre <feTurbulence> inline à 0.05 d'opacité, fixe
 * plein écran, pointer-events:none, z-index bas. Évite tout rendu de
 * dégradé plat et digital — donne une texture organique subtile à
 * toutes les sections de la landing.
 *
 * Composant pur (pas d'état, pas d'effet). Rendu côté serveur (SSR-safe
 * : pas de window/document). Le SVG est inline pour ne pas nécessiter
 * de requête réseau supplémentaire.
 */
import { cn } from "@/lib/utils";

export function NoiseOverlay({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none fixed inset-0 z-[1] opacity-[0.05] mix-blend-overlay",
        className
      )}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="100%"
        height="100%"
        style={{ filter: "url(#ogp-noise-filter)" }}
      >
        <defs>
          <filter id="ogp-noise-filter">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.85"
              numOctaves="2"
              stitchTiles="stitch"
            />
            <feColorMatrix type="saturate" values="0" />
          </filter>
        </defs>
        <rect width="100%" height="100%" filter="url(#ogp-noise-filter)" />
      </svg>
    </div>
  );
}

export default NoiseOverlay;
