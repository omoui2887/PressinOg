/**
 * OgPressing — Section Témoignages
 * --------------------------------
 * 3 cartes de témoignages clients (fictifs mais réalistes pour la Côte d'Ivoire).
 */
import { Quote, Star } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Reveal } from "@/components/ogpressing/reveal";
import { cn } from "@/lib/utils";

interface Testimonial {
  quote: string;
  name: string;
  pressing: string;
  city: string;
  initials: string;
  accent: string;
}

const TESTIMONIALS: Testimonial[] = [
  {
    quote:
      "Depuis OgPressing, je ne perds plus de tickets. Mes clients reçoivent leur QR Code et je sais exactement où est chaque vêtement. Le soir, ma caisse tombe juste à 100 FCFA près.",
    name: "Awa Koné",
    pressing: "Pressing Excellence",
    city: "Cocody, Abidjan",
    initials: "AK",
    accent: "bg-primary/15 text-primary",
  },
  {
    quote:
      "Le suivi du stock de biodétergents m'a fait économiser de l'argent. Je suis alerté avant la rupture. Les rapports Excel m'aident à voir ce qui rapporte vraiment.",
    name: "Mamadou Traoré",
    pressing: "Laveries du Plate",
    city: "Plateau, Abidjan",
    initials: "MT",
    accent: "bg-secondary/15 text-secondary",
  },
  {
    quote:
      "Avec 6 employés, j'avais du mal à tout surveiller. Maintenant chaque rôle a son espace et je vois la production en temps réel. Mes clients sont mieux suivis.",
    name: "Fatou Bamba",
    pressing: "Blanchisserie Yopougon",
    city: "Yopougon, Abidjan",
    initials: "FB",
    accent: "bg-warning/15 text-warning",
  },
];

export function TestimonialsSection() {
  return (
    <section id="temoignages" className="scroll-mt-16 bg-muted/30 py-16 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Ils digitalisent leur pressing avec OgPressing
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Des gérants de pressings ivoiriens qui gagnent du temps au quotidien.
          </p>
        </Reveal>

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {TESTIMONIALS.map((t, i) => (
            <Reveal key={t.name} delay={i * 100}>
              <Card className="h-full">
                <CardContent className="flex h-full flex-col p-6">
                  <div className="flex items-center justify-between">
                    <Quote className="size-8 text-primary/30" />
                    <div className="flex gap-0.5" aria-label="5 étoiles sur 5">
                      {Array.from({ length: 5 }).map((_, s) => (
                        <Star
                          key={s}
                          className="size-4 fill-warning text-warning"
                        />
                      ))}
                    </div>
                  </div>

                  <blockquote className="mt-4 flex-1 text-sm leading-relaxed text-foreground/90">
                    « {t.quote} »
                  </blockquote>

                  <div className="mt-6 flex items-center gap-3 border-t pt-4">
                    <span
                      className={cn(
                        "flex size-10 items-center justify-center rounded-full text-sm font-bold",
                        t.accent
                      )}
                      aria-hidden
                    >
                      {t.initials}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        {t.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t.pressing} — {t.city}
                      </p>
                    </div>
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
