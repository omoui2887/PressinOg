/**
 * OgPressing — Landing page cinématographique (LOT 17)
 * ---------------------------------------------------
 * Composition des sections du LOT 17 + overlay de bruit + navbar
 * flottante + footer arrondi.
 *
 *   1. NoiseOverlay           — texture SVG globale (fixed, z-1)
 *   2. Navbar                 — pilule flottante fixed
 *   3. Hero                   — "Le Plan d'Ouverture" (100dvh, image + overlay)
 *   4. ProblemSolutionSection — Avant ❌ / Après ✅ (PRD §8)
 *   5. Features               — 3 artefacts fonctionnels interactifs
 *   6. Philosophy             — manifeste dark avec parallax
 *   7. Protocol               — sticky stack 3 cartes (parcours d'une commande)
 *   8. Pricing                — 3 plans STARTER / PRO / BUSINESS
 *   9. TestimonialsSection    — témoignages clients
 *  10. InscriptionSection     — wrapper du formulaire existant
 *  11. Footer                 — pied de page arrondi Bleu Nuit
 *
 * Les sections below-the-fold sont wrappées dans .cv-auto pour skipper
 * leur rendu/layout jusqu'à l'approche du viewport (perf First Paint).
 */
import { NoiseOverlay } from "@/components/landing/noise-overlay";
import {
  Navbar,
  Hero,
  Features,
  Philosophy,
  Protocol,
  Pricing,
  InscriptionSection,
  Footer,
} from "@/components/landing";
import {
  ProblemSolutionSection,
  TestimonialsSection,
} from "@/components/ogpressing/landing";

export default function PublicHomePage() {
  return (
    <>
      <NoiseOverlay />

      {/* Navbar flottante (fixed) — overlay au-dessus de tout */}
      <Navbar />

      {/* 1. HERO — au-dessus de la ligne de flottaison, rendu immédiat */}
      <Hero />

      {/* 2. PROBLÈME/SOLUTION — Avant ❌ / Après ✅ (PRD §8) */}
      <div className="cv-auto">
        <ProblemSolutionSection />
      </div>

      {/* 3. FONCTIONNALITÉS — 3 artefacts interactifs */}
      <div className="cv-auto">
        <Features />
      </div>

      {/* 4. PHILOSOPHIE — manifeste dark parallax */}
      <div className="cv-auto">
        <Philosophy />
      </div>

      {/* 5. PROTOCOLE — sticky stack 3 cartes */}
      <div className="cv-auto">
        <Protocol />
      </div>

      {/* 6. TARIFICATION — 3 plans */}
      <div className="cv-auto">
        <Pricing />
      </div>

      {/* 7. TÉMOIGNAGES — section existante conservée (ancre #temoignages) */}
      <div className="cv-auto">
        <TestimonialsSection />
      </div>

      {/* 8. INSCRIPTION — wrapper du formulaire existant */}
      <div className="cv-auto">
        <InscriptionSection />
      </div>

      {/* 9. FOOTER — arrondi Bleu Nuit */}
      <Footer />
    </>
  );
}
