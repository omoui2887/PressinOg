/**
 * OgPressing — Wizard Nouvelle Commande (orchestrateur)
 * -----------------------------------------------------
 * Wizard 4 étapes pour la création d'une commande pressing :
 *   1. Sélection du client
 *   2. Enregistrement des articles
 *   3. Récapitulatif, remise et acompte
 *   4. Confirmation avec QR Code et étiquettes
 *
 * Architecture :
 *   - État partagé via useReducer (cf. state.ts)
 *   - Stepper visuel en haut (cliquable sur étapes atteintes)
 *   - Contenu de l'étape courante au centre
 *   - Boutons Précédent / Suivant en bas (Suivant désactivé si étape invalide)
 *
 * Mobile-first :
 *   - Sur mobile, une seule étape visible à la fois, navigation par boutons
 *     en bas (au-dessus de l'admin BottomNav)
 *   - Sur desktop, même logique avec plus d'espacement
 *
 * ⚠️ Pré-sélection client : si l'URL contient `?client_id=<id>` (ex : lien
 * « Nouvelle commande pour ce client » depuis la fiche client LOT 8.2),
 * le wizard fetch le détail du client au montage et dispatch SET_CLIENT
 * automatiquement. Utilise `window.location.search` (pas `useSearchParams`)
 * pour éviter l'exigence d'un <Suspense> boundary.
 */
"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  initialState,
  isStepValid,
  wizardReducer,
  WIZARD_STEPS,
  type ClientInfo,
  type PreferencesLavage,
  type WizardStep,
} from "./state";
import { Stepper } from "./stepper";
import { StepClient } from "./step-client";
import { StepArticles } from "./step-articles";
import { StepRecap } from "./step-recap";
import { StepConfirmation } from "./step-confirmation";

// ----------------------------------------------------------------
// Pré-sélection client depuis `?client_id=<id>` (LOT 8.2)
// ----------------------------------------------------------------

/** Shape du détail renvoyé par `GET /api/admin/clients/{id}`. */
interface ClientDetailResponse {
  id: string;
  nom_complet: string;
  telephone: string;
  email: string | null;
  points_fidelite: number;
  preferences_lavage: PreferencesLavage | null;
}

/**
 * Fetch le détail d'un client via `GET /api/admin/clients/{id}` et le mappe
 * en `ClientInfo` pour le reducer. Renvoie null si le fetch échoue.
 *
 * `solde_impaye` est mis à 0 car le GET détail ne renvoie pas cet agrégat
 * (il faudrait fetch les commandes pour le calculer — pas critique pour
 * le wizard ; l'info est surtout utile comme warning dans la step client).
 */
async function fetchClientForWizard(id: string): Promise<ClientInfo | null> {
  try {
    const res = await fetch(`/api/admin/clients/${id}`, { cache: "no-store" });
    if (!res.ok) return null;
    const json = await res.json();
    if (!json.success || !json.data) return null;
    const d: ClientDetailResponse = json.data;
    return {
      id: d.id,
      nom: d.nom_complet,
      telephone: d.telephone,
      email: d.email,
      solde_impaye: 0,
      preferences_lavage: d.preferences_lavage ?? null,
      points_fidelite: d.points_fidelite ?? 0,
    };
  } catch {
    return null;
  }
}

export function CommandeWizard({ basePath = "/admin" }: { basePath?: string } = {}) {
  const [state, dispatch] = useReducer(wizardReducer, initialState);
  // Pré-sélection client : true pendant le fetch du `?client_id=<id>`.
  const [preselecting, setPreselecting] = useState(false);

  // Référence au bloc d'en-tête du wizard (titre "Nouvelle commande").
  // Utilisé pour rescroller vers le haut à chaque changement d'étape afin
  // que le contenu de la nouvelle étape ne soit jamais masqué par le header
  // sticky du DashboardLayout (h-16, z-30). Sans cela, le bouton "Choisir
  // un article" de l'étape 2 pouvait se retrouver sous le header sticky et
  // intercepter les clics (bug "je n'arrive pas à choisir un article").
  const wizardTopRef = useRef<HTMLDivElement>(null);

  // À chaque changement d'étape, on rescrolle l'en-tête du wizard en haut
  // de la zone visible (sous le header sticky). `scroll-mt-24` (96px) sur
  // l'en-tête garantit une marge confortable sous le header de 64px (h-16).
  // `block: "start"` aligne le haut de l'élément avec le haut du scroll.
  useEffect(() => {
    wizardTopRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, [state.step]);

  /**
   * Lit `?client_id=<id>` dans l'URL au montage et pré-sélectionne le client
   * si présent. Utilise `window.location.search` (pas useSearchParams) pour
   * éviter l'exigence d'un <Suspense> boundary.
   *
   * Encapsulé dans un `useCallback` (async) pour éviter les setState
   * synchrones dans le corps de l'effect (lint `react-hooks/set-state-in-effect`).
   * La fonction async diffère l'exécution des setState au-delà du corps
   * synchrone de l'effect — pattern identique à `clients-page.tsx` /
   * `qr-scanner.tsx`.
   */
  const preselectClient = useCallback(async () => {
    // SSR guard + lecture du query param `client_id`.
    if (typeof window === "undefined") return;
    const clientId = new URLSearchParams(window.location.search).get(
      "client_id"
    );
    if (!clientId) return;

    setPreselecting(true);
    try {
      const client = await fetchClientForWizard(clientId);
      if (!client) {
        toast.error(
          "Impossible de pré-sélectionner ce client. Sélectionnez-le manuellement."
        );
        return;
      }
      dispatch({ type: "SET_CLIENT", client });
    } finally {
      setPreselecting(false);
    }
  }, []);

  useEffect(() => {
    preselectClient();
  }, [preselectClient]);

  const currentStepDef = WIZARD_STEPS[state.step - 1];
  const isStep1 = state.step === 1;
  const isLastStep = state.step === 4;
  const stepValid = isStepValid(state, state.step);

  return (
    <div className="flex min-h-[calc(100dvh-12rem)] flex-col gap-4 md:min-h-[calc(100dvh-7rem)] sm:gap-6">
      {/* Header : titre + retour commandes */}
      {/* scroll-mt-24 (96px) : marge de scroll pour dégager le header sticky
          du DashboardLayout (h-16 = 64px) lors du scrollIntoView. */}
      <div ref={wizardTopRef} className="flex items-center gap-3 scroll-mt-24">
        <Button variant="ghost" size="icon" asChild aria-label="Retour aux commandes">
          <Link href={`${basePath}/commandes`}>
            <ArrowLeft className="size-5" />
          </Link>
        </Button>
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold tracking-tight text-foreground">
            Nouvelle commande
          </h1>
          <p className="text-sm text-muted-foreground">
            Étape {state.step} sur {WIZARD_STEPS.length} —{" "}
            {currentStepDef.title}
          </p>
        </div>
      </div>

      {/* Stepper visuel */}
      <Card>
        <CardContent className="p-4 sm:p-6">
          <Stepper
            steps={WIZARD_STEPS.map((s) => ({ number: s.number, label: s.label }))}
            currentStep={state.step}
            maxReachedStep={state.maxReachedStep}
            onStepClick={(step) =>
              dispatch({ type: "GO_TO_STEP", step: step as WizardStep })
            }
          />
        </CardContent>
      </Card>

      {/* Contenu de l'étape courante */}
      <Card className="flex-1">
        <CardContent className="p-4 sm:p-6">
          {preselecting ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <Loader2 className="size-6 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">
                Pré-sélection du client…
              </p>
            </div>
          ) : (
            <>
              {state.step === 1 && <StepClient state={state} dispatch={dispatch} />}
              {state.step === 2 && (
                <StepArticles state={state} dispatch={dispatch} />
              )}
              {state.step === 3 && <StepRecap state={state} dispatch={dispatch} />}
              {state.step === 4 && (
                <StepConfirmation
                  state={state}
                  dispatch={dispatch}
                  basePath={basePath}
                />
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Barre de navigation bas : Précédent / Suivant */}
      <div className="mt-auto flex flex-col gap-2">
        {!stepValid && !isLastStep && (
          <p className="text-center text-xs text-muted-foreground">
            Complétez cette étape pour continuer.
          </p>
        )}
        <div className="flex items-center justify-between gap-3">
          <Button
            variant="outline"
            onClick={() => dispatch({ type: "PREV_STEP" })}
            disabled={isStep1}
          >
            <ArrowLeft className="size-4" />
            Précédent
          </Button>

          {isLastStep ? (
            <Button onClick={() => dispatch({ type: "RESET" })}>
              <RotateCcw className="size-4" />
              Nouvelle commande
            </Button>
          ) : (
            <Button
              onClick={() => dispatch({ type: "NEXT_STEP" })}
              disabled={!stepValid}
            >
              Suivant
              <ArrowRight className="size-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
