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
 *
 * 🚀 PERF : Les sections below-the-fold sont wrappées dans des divs avec
 * `content-visibility:auto` (classe `.cv-auto`) pour que le navigateur
 * skippe leur rendu/layout jusqu'à ce qu'elles approchent du viewport.
 * Cela accélère drastiquement le First Paint sur mobile.
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
      {/* 1. HERO — au-dessus de la ligne de flottaison, rendu immédiat */}
      <HeroSection />

      {/* 2. PROBLÈME / SOLUTION */}
      <div className="cv-auto">
        <ProblemSolutionSection />
      </div>

      {/* 3. FONCTIONNALITÉS */}
      <div className="cv-auto">
        <FeaturesSection />
      </div>

      {/* 4. PLANS TARIFAIRES */}
      <div className="cv-auto">
        <PricingSection />
      </div>

      {/* 5. TÉMOIGNAGES */}
      <div className="cv-auto">
        <TestimonialsSection />
      </div>

      {/* 6. FORMULAIRE D'INSCRIPTION */}
      <div className="cv-auto">
        <InscriptionSection />
      </div>
    </>
  );
}
