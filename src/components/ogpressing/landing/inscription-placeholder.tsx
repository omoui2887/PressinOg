/**
 * OgPressing — Section Inscription (Stitch design)
 * ------------------------------------------------
 * Section à fond bleu dégradé (from-primary-700 via-primary to-primary-600)
 * avec deux colonnes :
 *   - Gauche : pitch marketing (texte blanc) + 2 blocs feature
 *   - Droite : carte blanche contenant le formulaire d'inscription
 *
 * Client component car le formulaire utilise react-hook-form + Zustand store
 * et la section réagit au plan présélectionné (depuis la section Tarifs).
 *
 * 🚀 PERF : Le formulaire (InscriptionForm) est lazy-loadé via next/dynamic
 * avec ssr:false. C'est un composant client lourd (react-hook-form + zod +
 * 11 FormField + Select Radix). En attendant le chargement, on affiche un
 * placeholder squelette de mêmes dimensions (évite le layout shift / CLS).
 */
"use client";

import dynamic from "next/dynamic";
import { MapPin, ShieldCheck, CheckCircle2 } from "lucide-react";
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
      <div className="h-11 w-full rounded-md bg-warning/30 animate-pulse" />
    </div>
  );
}

/* ----------------------- Bloc feature (colonne gauche) ----------------------- */

interface FeatureBlockProps {
  icon: typeof MapPin;
  title: string;
  description: string;
}

function FeatureBlock({ icon: Icon, title, description }: FeatureBlockProps) {
  return (
    <div className="flex items-start gap-4">
      <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-white/20 text-white">
        <Icon className="size-6" aria-hidden />
      </span>
      <div>
        <p className="font-semibold text-white">{title}</p>
        <p className="mt-1 text-sm text-white/80">{description}</p>
      </div>
    </div>
  );
}

/* ----------------------- Section ----------------------- */

export function InscriptionSection() {
  const selectedPlan = useInscriptionStore((s) => s.selectedPlan);

  return (
    <section
      id="inscription"
      className="scroll-mt-20 bg-gradient-to-br from-primary-700 via-primary to-primary-600 py-16 sm:py-24"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-12 md:grid-cols-2">
          {/* ---------- Colonne gauche : pitch marketing ---------- */}
          <Reveal>
            <div className="flex h-full flex-col justify-center">
              <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                Demandez votre accès
              </h2>
              <p className="mt-4 max-w-md text-base text-white/80 sm:text-lg">
                Remplissez le formulaire ci-dessous et notre équipe vous
                contactera sous 24h pour configurer votre essai gratuit.
              </p>

              <div className="mt-10 space-y-6">
                <FeatureBlock
                  icon={MapPin}
                  title="Accompagnement Local"
                  description="Support basé à Abidjan pour une réactivité maximale."
                />
                <FeatureBlock
                  icon={ShieldCheck}
                  title="Données Sécurisées"
                  description="Vos données sont chiffrées et sauvegardées quotidiennement."
                />
              </div>
            </div>
          </Reveal>

          {/* ---------- Colonne droite : carte formulaire ---------- */}
          <Reveal delay={120}>
            <div className="rounded-2xl bg-background p-6 text-foreground shadow-2xl sm:p-8">
              {/* Plan présélectionné (depuis la section Tarifs) */}
              {selectedPlan && (
                <div className="mb-6 flex items-center gap-3 rounded-xl border border-secondary/30 bg-secondary/5 p-4">
                  <CheckCircle2 className="size-5 shrink-0 text-secondary" aria-hidden />
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
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
