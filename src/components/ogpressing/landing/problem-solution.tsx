/**
 * OgPressing — Section Problème / Solution (Stitch design)
 * --------------------------------------------------------
 * Deux cartes côte-à-côte :
 *   - "Avant : Le chaos manuel"  (carte blanche, icône rouge X, image grisée)
 *   - "Après : Digital & Rapide" (carte bleue solide, icône bleue check, image bleue)
 *
 * Chaque carte a : icône + titre + description + zone d'illustration
 * (dégradé + icône lucide centrée, en attendant de vraies photos).
 */
import { X, Check, BookText, Smartphone } from "lucide-react";
import { Reveal } from "@/components/ogpressing/reveal";

export function ProblemSolutionSection() {
  return (
    <section id="probleme-solution" className="scroll-mt-20 py-16 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-6 md:grid-cols-2 md:gap-8">
          {/* ---------- Avant ---------- */}
          <Reveal delay={80}>
            <article className="flex h-full flex-col overflow-hidden rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-full bg-danger/15 text-danger">
                  <X className="size-5" aria-hidden />
                </span>
                <h3 className="text-xl font-bold text-foreground">
                  Avant : Le chaos manuel
                </h3>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                Tickets papier perdus, erreurs de caisse, clients mécontents
                et difficulté à suivre les stocks de lessive.
              </p>

              {/* Zone d'illustration (dégradé gris + icône BookText grisée) */}
              <div className="mt-6 flex flex-1 items-center justify-center rounded-xl bg-gradient-to-br from-muted to-muted/30 p-8">
                <BookText
                  className="size-20 text-muted-foreground/40 grayscale"
                  strokeWidth={1.25}
                  aria-hidden
                />
              </div>
            </article>
          </Reveal>

          {/* ---------- Après (carte bleue solide) ---------- */}
          <Reveal delay={160}>
            <article className="flex h-full flex-col overflow-hidden rounded-2xl border border-primary bg-primary p-6 text-primary-foreground shadow-lg sm:p-8">
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-full bg-primary-foreground/20 text-primary-foreground">
                  <Check className="size-5" aria-hidden />
                </span>
                <h3 className="text-xl font-bold text-primary-foreground">
                  Après : Digital &amp; Rapide
                </h3>
              </div>
              <p className="mt-3 text-sm text-primary-foreground/80">
                Encaissement en 3 clics, suivi temps réel, notifications
                WhatsApp et QR codes pour chaque vêtement.
              </p>

              {/* Zone d'illustration (dégradé bleu clair + icône Smartphone) */}
              <div className="mt-6 flex flex-1 items-center justify-center rounded-xl bg-gradient-to-br from-primary-foreground/20 to-primary-foreground/5 p-8">
                <Smartphone
                  className="size-20 text-primary-foreground/80"
                  strokeWidth={1.25}
                  aria-hidden
                />
              </div>
            </article>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
