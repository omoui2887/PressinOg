/**
 * Layout racine des pages PUBLIQUES e-pressing (LOT 17 — Cinématographique)
 * --------------------------------------------------------------------------
 * Route group `(public)` → landing, login, activation.
 * Aucune authentification requise.
 *
 * POLICES (LOT 17) : 3 familles scoping la landing via des variables CSS :
 *   - --font-jakarta  : Plus Jakarta Sans (titres, sans-serif premium)
 *   - --font-fraunces : Fraunces (italique dramatique, évoque le tissu soigné)
 *   - --font-plex-mono: IBM Plex Mono (données, mono, traçabilité QR/barres)
 *
 * Les @font-face sont auto-hébergées via @fontsource (importés dans
 * src/app/layout.tsx) et les variables CSS sont définies dans :root de
 * globals.css. Les utilities Tailwind `font-jakarta`, `font-fraunces`,
 * `font-plex-mono` sont générées par @theme inline → var(--font-*).
 *
 * Ce layout n'a plus besoin de next/font/google (qui cassait sous
 * Turbopack 16.2.12). On applique simplement la classe font-jakarta
 * sur le wrapper pour cohérence visuelle.
 */
import { PublicChrome } from "@/components/landing/public-chrome";
import "./landing.css";

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-background font-jakarta">
      <PublicChrome>{children}</PublicChrome>
    </div>
  );
}
