/**
 * OgPressing — Section Hero (landing page)
 * ----------------------------------------
 * Layout deux colonnes (Stitch design) :
 *   - Gauche : badges, H1, sous-titre, CTA orange "Essayer gratuitement"
 *   - Droite : carte décorative (icône Shirt + label "PRESSING MANAGER")
 *
 * Mobile : les colonnes s'empilent (texte d'abord, visuel ensuite).
 */
import Link from "next/link";
import { ArrowRight, CheckCircle2, Shirt, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/ogpressing/reveal";

export function HeroSection() {
  return (
    <section className="relative overflow-hidden">
      {/* Décor gradient + halo */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-gradient-to-b from-primary/5 via-background to-background"
      />
      <div
        aria-hidden
        className="absolute -top-32 left-1/2 -z-10 size-[620px] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl"
      />
      <div
        aria-hidden
        className="absolute right-0 top-40 -z-10 size-72 rounded-full bg-secondary/10 blur-3xl"
      />

      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-28">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          {/* ---------- Colonne gauche : texte ---------- */}
          <div className="text-left">
            {/* Badges row */}
            <Reveal>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary/15 px-3 py-1 text-xs font-semibold text-secondary sm:text-sm">
                  <Target className="size-3.5" aria-hidden />
                  Conçu pour la Côte d&apos;Ivoire
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary sm:text-sm">
                  FCFA &amp; Mobile Money
                </span>
              </div>
            </Reveal>

            {/* H1 (left-aligned) */}
            <Reveal delay={80}>
              <h1 className="mt-6 text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
                La gestion de votre pressing,
                <br />
                <span className="text-primary">simplifiée</span>
              </h1>
            </Reveal>

            {/* Subtitle */}
            <Reveal delay={160}>
              <p className="mt-6 max-w-xl text-base text-muted-foreground sm:text-lg">
                La solution tout-en-un pour digitaliser votre activité en Côte
                d&apos;Ivoire. Suivez vos commandes, gérez vos clients et
                boostez votre rentabilité.
              </p>
            </Reveal>

            {/* CTA row */}
            <Reveal delay={240}>
              <div className="mt-8 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
                <Button
                  size="lg"
                  variant="warning"
                  asChild
                  className="w-full sm:w-auto"
                >
                  <Link href="#inscription">
                    Essayer gratuitement <ArrowRight className="size-4" />
                  </Link>
                </Button>
                <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                  <CheckCircle2 className="size-4 text-secondary" aria-hidden />
                  Essai 7 jours gratuit
                </span>
              </div>
            </Reveal>
          </div>

          {/* ---------- Colonne droite : visuel ---------- */}
          <Reveal delay={200} className="order-last lg:order-none">
            <HeroVisual />
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Visuel décoratif (carte grise avec icône Shirt + label blanc)      */
/* ------------------------------------------------------------------ */

function HeroVisual() {
  return (
    <div className="relative mx-auto w-full max-w-md">
      {/* Carte sombre pour garantir le contraste du texte blanc
          (le token `muted` est clair en light mode → texte blanc invisible).
          On utilise `from-foreground to-foreground/70` comme gradient gris foncé. */}
      <div className="relative aspect-square overflow-hidden rounded-3xl bg-gradient-to-br from-foreground to-foreground/70 shadow-2xl ring-1 ring-black/5">
        {/* Halo décoratif derrière l'icône */}
        <div
          aria-hidden
          className="absolute left-1/2 top-1/2 size-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/20 blur-3xl"
        />

        {/* Contenu centré */}
        <div className="relative flex h-full flex-col items-center justify-center gap-6 p-8 text-center">
          {/* Cercle portant l'icône */}
          <span className="flex size-24 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ring-4 ring-white/10">
            <Shirt className="size-12" strokeWidth={1.75} aria-hidden />
          </span>

          <div className="space-y-1.5">
            <p className="text-lg font-bold uppercase tracking-[0.25em] text-white sm:text-xl">
              OgPressing
            </p>
            <p className="text-xs uppercase tracking-[0.2em] text-white/50 sm:text-sm">
              Ivory Coast
            </p>
          </div>

          {/* Petits points décoratifs en bas */}
          <div
            aria-hidden
            className="absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-1.5"
          >
            <span className="size-1.5 rounded-full bg-primary" />
            <span className="size-1.5 rounded-full bg-secondary" />
            <span className="size-1.5 rounded-full bg-warning" />
          </div>
        </div>
      </div>
    </div>
  );
}
