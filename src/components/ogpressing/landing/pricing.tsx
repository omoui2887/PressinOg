/**
 * OgPressing — Section Tarifs (3 plans)
 * -------------------------------------
 * Trois cartes : Starter (9 900), Pro (24 900, "Populaire"),
 * Business (49 900). Bouton "Choisir ce plan" qui mémorise le plan
 * dans le store Zustand et scrolle vers #inscription.
 *
 * Client component car interactivité (sélection de plan).
 */
"use client";

import { Check, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Reveal } from "@/components/ogpressing/reveal";
import { cn } from "@/lib/utils";
import { useInscriptionStore, type PlanId } from "@/lib/stores/inscription-store";

interface Plan {
  id: PlanId;
  name: string;
  price: string;
  tagline: string;
  features: string[];
  highlight?: boolean;
  cta: string;
}

const PLANS: Plan[] = [
  {
    id: "starter",
    name: "Starter",
    price: "9 900",
    tagline: "Pour les petits pressings qui démarrent.",
    features: [
      "Point de vente complet",
      "CRM clients (jusqu'à 500)",
      "3 utilisateurs",
      "Tickets QR & code-barres",
      "Support par WhatsApp",
    ],
    cta: "Choisir Starter",
  },
  {
    id: "pro",
    name: "Pro",
    price: "24 900",
    tagline: "Le plus populaire, pour les pressings établis.",
    features: [
      "Tout Starter inclus",
      "Stock & biodétergents",
      "Rapports & exports Excel",
      "8 utilisateurs (tous rôles)",
      "Suivi des dépenses",
      "Support prioritaire",
    ],
    highlight: true,
    cta: "Choisir Pro",
  },
  {
    id: "business",
    name: "Business",
    price: "49 900",
    tagline: "Pour les chaînes multi-boutiques.",
    features: [
      "Tout Pro inclus",
      "Multi-points de vente",
      "Utilisateurs illimités",
      "Tableaux de bord avancés",
      "Support dédié 7j/7",
      "Formation personnalisée",
    ],
    cta: "Choisir Business",
  },
];

export function PricingSection() {
  const selectedPlan = useInscriptionStore((s) => s.selectedPlan);
  const selectPlan = useInscriptionStore((s) => s.selectPlan);

  return (
    <section id="tarifs" className="scroll-mt-16 py-16 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Des tarifs simples, en FCFA
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Choisissez votre formule. Règlement physique, hors application —
            aucun paiement en ligne.
          </p>
        </Reveal>

        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          {PLANS.map((plan, i) => {
            const isSelected = selectedPlan === plan.id;
            return (
              <Reveal key={plan.id} delay={i * 100}>
                <Card
                  className={cn(
                    "relative h-full transition-all duration-300",
                    plan.highlight
                      ? "border-primary shadow-lg ring-1 ring-primary/20 lg:scale-[1.03]"
                      : "",
                    isSelected && "ring-2 ring-secondary"
                  )}
                >
                  {plan.highlight && (
                    <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 gap-1 px-3">
                      <Star className="size-3 fill-current" /> Populaire
                    </Badge>
                  )}

                  <CardHeader>
                    <CardTitle className="text-2xl">{plan.name}</CardTitle>
                    <CardDescription>{plan.tagline}</CardDescription>
                    <div className="mt-4">
                      <span className="text-4xl font-bold text-foreground">
                        {plan.price}
                      </span>
                      <span className="text-lg text-muted-foreground">
                        {" "}
                        FCFA/mois
                      </span>
                    </div>
                  </CardHeader>

                  <CardContent>
                    <ul className="space-y-3">
                      {plan.features.map((feat) => (
                        <li key={feat} className="flex items-start gap-2 text-sm">
                          <Check className="mt-0.5 size-4 shrink-0 text-secondary" />
                          <span className="text-foreground">{feat}</span>
                        </li>
                      ))}
                    </ul>

                    <Button
                      className="mt-6 w-full"
                      variant={plan.highlight ? "default" : "outline"}
                      onClick={() => selectPlan(plan.id)}
                      aria-label={`${plan.cta} et aller au formulaire`}
                    >
                      {plan.cta}
                    </Button>
                    {isSelected && (
                      <p className="mt-2 text-center text-xs font-medium text-secondary">
                        Plan présélectionné ✓
                      </p>
                    )}
                  </CardContent>
                </Card>
              </Reveal>
            );
          })}
        </div>

        <Reveal className="mx-auto mt-10 max-w-2xl text-center">
          <p className="text-sm text-muted-foreground">
            Tous les plans incluent un{" "}
            <span className="font-medium text-foreground">essai de 7 jours</span>{" "}
            à l&apos;activation. Sans engagement. Sans carte bancaire.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
