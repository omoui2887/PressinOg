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
 *
 * 🚀 PERF : Le formulaire (InscriptionForm) est lazy-loadé via next/dynamic
 * avec ssr:false. C'est un composant client lourd (react-hook-form + zod +
 * 11 FormField + Select Radix). Il représente ~40% du JS client de la landing
 * page mais n'est utile que si l'utilisateur scrolle jusqu'à #inscription.
 *
 * En attendant le chargement, on affiche un placeholder squelette de mêmes
 * dimensions (évite le layout shift / CLS).
 */
"use client";

import dynamic from "next/dynamic";
import { Sparkles, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Reveal } from "@/components/ogpressing/reveal";
import { useInscriptionStore, PLAN_LABELS } from "@/lib/stores/inscription-store";

// 🚀 Lazy-load du formulaire lourd (react-hook-form + zod + 11 FormField).
// ssr:false car le formulaire est 100% client (pas de HTML utile en SSR).
const InscriptionForm = dynamic(
  () => import("./inscription-form").then((m) => m.InscriptionForm),
  {
    ssr: false,
    loading: () => <InscriptionFormSkeleton />,
  }
);

/** Placeholder squelette mêmes dimensions que le formulaire (évite CLS). */
function InscriptionFormSkeleton() {
  return (
    <div className="space-y-5" aria-hidden>
      {/* Ligne 1 : Nom + Prénom */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <div className="h-4 w-20 rounded bg-muted animate-pulse" />
          <div className="h-11 w-full rounded-md border bg-muted/50 animate-pulse" />
        </div>
        <div className="space-y-2">
          <div className="h-4 w-20 rounded bg-muted animate-pulse" />
          <div className="h-11 w-full rounded-md border bg-muted/50 animate-pulse" />
        </div>
      </div>
      {/* Ligne 2 */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <div className="h-4 w-20 rounded bg-muted animate-pulse" />
          <div className="h-11 w-full rounded-md border bg-muted/50 animate-pulse" />
        </div>
        <div className="space-y-2">
          <div className="h-4 w-20 rounded bg-muted animate-pulse" />
          <div className="h-11 w-full rounded-md border bg-muted/50 animate-pulse" />
        </div>
      </div>
      {/* Nom pressing */}
      <div className="space-y-2">
        <div className="h-4 w-32 rounded bg-muted animate-pulse" />
        <div className="h-11 w-full rounded-md border bg-muted/50 animate-pulse" />
      </div>
      {/* Ligne 3 */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <div className="h-4 w-20 rounded bg-muted animate-pulse" />
          <div className="h-11 w-full rounded-md border bg-muted/50 animate-pulse" />
        </div>
        <div className="space-y-2">
          <div className="h-4 w-20 rounded bg-muted animate-pulse" />
          <div className="h-11 w-full rounded-md border bg-muted/50 animate-pulse" />
        </div>
      </div>
      {/* Ligne 4 */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <div className="h-4 w-32 rounded bg-muted animate-pulse" />
          <div className="h-11 w-full rounded-md border bg-muted/50 animate-pulse" />
        </div>
        <div className="space-y-2">
          <div className="h-4 w-32 rounded bg-muted animate-pulse" />
          <div className="h-11 w-full rounded-md border bg-muted/50 animate-pulse" />
        </div>
      </div>
      {/* Plan */}
      <div className="space-y-2">
        <div className="h-4 w-28 rounded bg-muted animate-pulse" />
        <div className="h-11 w-full rounded-md border bg-muted/50 animate-pulse" />
      </div>
      {/* Message */}
      <div className="space-y-2">
        <div className="h-4 w-24 rounded bg-muted animate-pulse" />
        <div className="h-20 w-full rounded-md border bg-muted/50 animate-pulse" />
      </div>
      {/* Bouton */}
      <div className="h-11 w-full rounded-md bg-primary/20 animate-pulse" />
    </div>
  );
}

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

              {/* Vrai formulaire d'inscription (11 champs spec LOT 4) — lazy-loadé */}
              <InscriptionForm />
            </CardContent>
          </Card>
        </Reveal>
      </div>
    </section>
  );
}
