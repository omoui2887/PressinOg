/**
 * Barrel file — sections de landing page OgPressing (P4-F / AUDIT-C-03).
 * ------------------------------------------------------------------
 * Centralise les exports des sections de landing "Luxe Éditorial" (Phase 3-b).
 *
 * Catalogue des exports (chaque export pointe vers un fichier existant) :
 *   - HeroSection              → hero "Plan d'Ouverture" (Phase 3-b).
 *   - ProblemSolutionSection   → section problème/solution (Phase 3-b).
 *   - FeaturesSection          → 3 artefacts fonctionnels (Phase 3-b).
 *   - PricingSection           → 3 plans STARTER / PRO / BUSINESS (Phase 3-b).
 *   - TestimonialsSection      → témoignages clients (utilisée sur /).
 *   - InscriptionSection       → wrapper placeholder inscription (Phase 3-b).
 *
 * Note : la landing publique active (`/`) utilise principalement les composants
 * de `@/components/landing/*` (LOT 17). Ce barrel expose les sections "Luxe
 * Éditorial" Phase 3-b — `TestimonialsSection` est la seule actuellement
 * consommée via barrel par `src/app/(public)/page.tsx`. Les autres sections
 * restent disponibles comme API publique pour usages futurs.
 */
export { HeroSection } from "./hero";
export { ProblemSolutionSection } from "./problem-solution";
export { FeaturesSection } from "./features";
export { PricingSection } from "./pricing";
export { TestimonialsSection } from "./testimonials";
export { InscriptionSection } from "./inscription-placeholder";
