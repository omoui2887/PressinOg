/**
 * OgPressing — Landing page publique (racine /)
 * ----------------------------------------------
 * Page marketing une-page avec ancres de navigation :
 *   1. Hero
 *   2. Problème / Solution
 *   3. Fonctionnalités (8 cards)
 *   4. Plans tarifaires (3 cards avec pré-sélection)
 *   5. Témoignages
 *   6. Formulaire d'inscription (placeholder — contenu détaillé à venir)
 *
 * Header sticky + footer gérés par le layout `(public)`.
 */
import {
  HeroSection,
  ProblemSolutionSection,
  FeaturesSection,
  PricingSection,
  TestimonialsSection,
  InscriptionSection,
} from "@/components/ogpressing/landing";

export default function PublicHomePage() {
  return (
    <>
      {/* 1. HERO */}
      <HeroSection />

      {/* 2. PROBLÈME / SOLUTION */}
      <ProblemSolutionSection />

      {/* 3. FONCTIONNALITÉS */}
      <FeaturesSection />

      {/* 4. PLANS TARIFAIRES */}
      <PricingSection />

      {/* 5. TÉMOIGNAGES */}
      <TestimonialsSection />

      {/* 6. FORMULAIRE D'INSCRIPTION (placeholder) */}
      <InscriptionSection />
    </>
  );
}
