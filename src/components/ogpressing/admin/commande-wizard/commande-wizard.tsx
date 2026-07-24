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
 * ⚠️ Pour l'instant, seuls les SQUELETTES des étapes sont implémentés
 * (placeholders avec mock interactions). Le contenu détaillé de chaque
 * étape arrivera dans les prompts suivants.
 */
"use client";

import { useReducer } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  initialState,
  isStepValid,
  wizardReducer,
  WIZARD_STEPS,
  type WizardStep,
} from "./state";
import { Stepper } from "./stepper";
import { StepClient } from "./step-client";
import { StepArticles } from "./step-articles";
import { StepRecap } from "./step-recap";
import { StepConfirmation } from "./step-confirmation";

export function CommandeWizard() {
  const [state, dispatch] = useReducer(wizardReducer, initialState);

  const currentStepDef = WIZARD_STEPS[state.step - 1];
  const isStep1 = state.step === 1;
  const isLastStep = state.step === 4;
  const stepValid = isStepValid(state, state.step);

  return (
    <div className="flex min-h-[calc(100dvh-12rem)] flex-col gap-4 md:min-h-[calc(100dvh-7rem)] sm:gap-6">
      {/* Header : titre + retour commandes */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild aria-label="Retour aux commandes">
          <Link href="/admin/commandes">
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
          {state.step === 1 && <StepClient state={state} dispatch={dispatch} />}
          {state.step === 2 && (
            <StepArticles state={state} dispatch={dispatch} />
          )}
          {state.step === 3 && <StepRecap state={state} dispatch={dispatch} />}
          {state.step === 4 && (
            <StepConfirmation state={state} dispatch={dispatch} />
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
