/**
 * OgPressing — Section Témoignages (Stitch design)
 * ------------------------------------------------
 * 2 cartes de témoignages clients (Côte d'Ivoire).
 *
 * Chaque carte :
 *   - Quote icon (semi-transparent) en haut
 *   - 5 étoiles dorées (fill-warning text-warning)
 *   - Citation en italique avec guillemets français « ... »
 *   - Auteur (bold, text-primary) + localisation (gray, text-sm)
 *
 * Layout 2 colonnes sur md+, empilées sur mobile.
 */
import { Quote, Star } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Reveal } from "@/components/ogpressing/reveal";

interface Testimonial {
  quote: string;
  author: string;
  location: string;
}

const TESTIMONIALS: Testimonial[] = [
  {
    quote:
      "Depuis que nous utilisons OgPressing, nous avons réduit les pertes de vêtements de 100%. Nos clients adorent recevoir un SMS quand leur commande est prête.",
    author: "Pressing Excellence",
    location: "Abidjan, Cocody",
  },
  {
    quote:
      "La gestion des stocks de produits était un calvaire. Maintenant, je sais exactement quand racheter mon savon ou ma javel. Un gain de temps incroyable !",
    author: "Clean Riviera",
    location: "Abidjan, Riviera 3",
  },
];

export function TestimonialsSection() {
  return (
    <section id="temoignages" className="scroll-mt-20 bg-muted/30 py-16 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Ils digitalisent leur pressing avec OgPressing
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Des gérants de pressings ivoiriens qui gagnent du temps au quotidien.
          </p>
        </Reveal>

        <div className="mt-12 grid gap-6 md:grid-cols-2">
          {TESTIMONIALS.map((t, i) => (
            <Reveal key={t.author} delay={i * 100}>
              <Card className="h-full">
                <CardContent className="flex h-full flex-col p-6 sm:p-8">
                  {/* Quote icon + étoiles */}
                  <div className="flex items-center justify-between">
                    <Quote className="size-10 text-primary/30" aria-hidden />
                    <div
                      className="flex gap-0.5"
                      aria-label="5 étoiles sur 5"
                    >
                      {Array.from({ length: 5 }).map((_, s) => (
                        <Star
                          key={s}
                          className="size-5 fill-warning text-warning"
                          aria-hidden
                        />
                      ))}
                    </div>
                  </div>

                  {/* Citation */}
                  <blockquote className="mt-5 flex-1 text-base italic leading-relaxed text-foreground/90">
                    « {t.quote} »
                  </blockquote>

                  {/* Author */}
                  <div className="mt-6 border-t pt-4">
                    <p className="text-base font-bold text-primary">
                      {t.author}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {t.location}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
