/**
 * OgPressing — Section Inscription (placeholder)
 * ----------------------------------------------
 * Emplacement réservé au formulaire d'inscription détaillé (à venir dans
 * le prompt suivant). Pour l'instant : titre "Demandez votre accès",
 * ancre #inscription, et affichage du plan présélectionné (le cas échéant)
 * pour démontrer le branchement avec la section Tarifs.
 *
 * Client component : lit le store Zustand (plan sélectionné).
 */
"use client";

import Link from "next/link";
import { ArrowRight, Mail, MessageCircle, Sparkles, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Reveal } from "@/components/ogpressing/reveal";
import { useInscriptionStore, PLAN_LABELS } from "@/lib/stores/inscription-store";

const WHATSAPP_URL = "https://wa.me/2250576103277";
const CONTACT_EMAIL = "ogouromain@gmail.com";

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
            Le formulaire détaillé arrive très prochainement. En attendant,
            contactez-nous directement — nous vous accompagnons pas à pas.
          </p>
        </Reveal>

        <Reveal delay={120}>
          <Card className="mt-10">
            <CardContent className="p-6 sm:p-8">
              {/* Plan présélectionné */}
              {selectedPlan && (
                <div className="mb-6 flex items-center gap-3 rounded-xl border border-secondary/30 bg-secondary/5 p-4">
                  <CheckCircle2 className="size-5 shrink-0 text-secondary" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-foreground">
                      Plan présélectionné : {PLAN_LABELS[selectedPlan]}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Ce choix sera repris automatiquement dans le formulaire
                      d&apos;inscription à venir.
                    </p>
                  </div>
                </div>
              )}

              {/* Emplacement réservé au formulaire */}
              <div className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border bg-muted/30 px-6 py-12 text-center">
                <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Mail className="size-6" />
                </span>
                <p className="text-sm font-medium text-foreground">
                  Formulaire d&apos;inscription en préparation
                </p>
                <p className="max-w-md text-xs text-muted-foreground">
                  Le formulaire détaillé (nom du gérant, pressing, téléphone,
                  ville, plan choisi) sera intégré ici à la prochaine étape.
                </p>
              </div>

              {/* Contact direct en attendant */}
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <Button asChild variant="default" className="w-full">
                  <a
                    href={WHATSAPP_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <MessageCircle className="size-4" /> WhatsApp{" "}
                    <ArrowRight className="size-4" />
                  </a>
                </Button>
                <Button asChild variant="outline" className="w-full">
                  <a href={`mailto:${CONTACT_EMAIL}`}>
                    <Mail className="size-4" /> {CONTACT_EMAIL}
                  </a>
                </Button>
              </div>

              <p className="mt-4 text-center text-xs text-muted-foreground">
                Aucun règlement ne se fait en ligne. Règlement physique (espèces
                ou mobile money) hors application.
              </p>
            </CardContent>
          </Card>
        </Reveal>
      </div>
    </section>
  );
}
