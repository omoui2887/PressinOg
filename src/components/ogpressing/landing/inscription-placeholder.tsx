/**
 * OgPressing — Section Inscription (LOT 4 — landing page #inscription)
 * -------------------------------------------------------------------
 * Section avec ancre #inscription contenant :
 *   - Titre "Demandez votre accès"
 *   - Encart plan présélectionné (si l'utilisateur a cliqué sur "Choisir
 *     ce plan" dans la section Tarifs)
 *   - Le vrai formulaire d'inscription (11 champs spec LOT 4 prompt 4.2)
 *
 * Client component car le formulaire utilise react-hook-form + Zustand store.
 */
"use client";

import { Sparkles, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Reveal } from "@/components/ogpressing/reveal";
import { useInscriptionStore, PLAN_LABELS } from "@/lib/stores/inscription-store";
import { InscriptionForm } from "./inscription-form";

export function InscriptionSection() {
  const selectedPlan = useInscriptionStore((s) => s.selectedPlan);

  return (
    <section id="inscription" className="scroll-mt-16 py-16 sm:py-24">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <Reveal className="text-center">
          <Badge variant="secondary" className="mb-4 gap-1.5">
            <Sparkles className="size-3.5" /> Inscription
          </Badge>
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Demandez votre accès
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Remplissez ce formulaire, notre équipe vous contacte très bientôt
            par WhatsApp ou téléphone pour vous proposer une démonstration et
            un code d&apos;activation.
          </p>
        </Reveal>

        <Reveal delay={120}>
          <Card className="mt-10">
            <CardContent className="p-6 sm:p-8">
              {/* Plan présélectionné (depuis la section Tarifs) */}
              {selectedPlan && (
                <div className="mb-6 flex items-center gap-3 rounded-xl border border-secondary/30 bg-secondary/5 p-4">
                  <CheckCircle2 className="size-5 shrink-0 text-secondary" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-foreground">
                      Plan présélectionné : {PLAN_LABELS[selectedPlan]}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Ce choix est pré-rempli dans le formulaire ci-dessous.
                      Vous pouvez le modifier si besoin.
                    </p>
                  </div>
                </div>
              )}

              {/* Vrai formulaire d'inscription (11 champs spec LOT 4) */}
              <InscriptionForm />
            </CardContent>
          </Card>
        </Reveal>
      </div>
    </section>
  );
}
