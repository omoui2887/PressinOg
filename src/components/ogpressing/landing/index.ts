/**
 * Barrel file — sections de landing page e-pressing.
 * ------------------------------------------------------------------
 * Centralise les exports des sections de landing "Luxe Éditorial".
 *
 * Sections conservées (consommées par /page.tsx) :
 *   - ProblemSolutionSection   → section problème/solution.
 *   - TestimonialsSection      → témoignages clients.
 *
 * Note : les sections HeroSection / FeaturesSection / PricingSection /
 * InscriptionSection étaient des variantes "Luxe Éditorial" Phase 3-b
 * non consommées (la landing active utilise @/components/landing/*).
 * Elles ont été supprimées lors du nettoyage de code mort.
 */
export { ProblemSolutionSection } from "./problem-solution";
export { TestimonialsSection } from "./testimonials";
