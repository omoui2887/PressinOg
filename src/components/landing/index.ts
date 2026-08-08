/**
 * OgPressing — Barrel des composants de la landing cinématographique (LOT 17).
 * --------------------------------------------------------------------------
 * Centralise les exports des 9 composants de la landing pour un import
 * propre depuis `src/app/(public)/page.tsx` :
 *   import { Navbar, Hero, Features, ..., Footer } from "@/components/landing";
 *
 * Catalogue des exports (chaque export pointe vers un fichier existant) :
 *   - Navbar              → pilule flottante (fixed) avec liens d'ancrage.
 *   - Hero                → section hero "Le Plan d'Ouverture" (100dvh).
 *   - Features            → 3 artefacts fonctionnels interactifs.
 *   - Philosophy          → manifeste dark avec parallax.
 *   - Protocol            → sticky stack 3 cartes (parcours commande).
 *   - Pricing             → 3 plans STARTER / PRO / BUSINESS.
 *   - InscriptionSection  → wrapper du formulaire d'inscription.
 *   - Footer              → pied de page arrondi Bleu Nuit.
 *   - NoiseOverlay        → texture SVG globale (fixed, z-1) — importée
 *                            directement par `(public)/page.tsx` pour clarté.
 */
export { Navbar } from "./navbar";
export { Hero } from "./hero";
export { Features } from "./features";
export { Philosophy } from "./philosophy";
export { Protocol } from "./protocol";
export { Pricing } from "./pricing";
export { InscriptionSection } from "./inscription-section";
export { Footer } from "./footer";
export { NoiseOverlay } from "./noise-overlay";
