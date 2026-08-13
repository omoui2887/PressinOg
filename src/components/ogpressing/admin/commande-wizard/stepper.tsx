/**
 * e-pressing — Stepper visuel réutilisable
 * -----------------------------------------
 * Affiche les étapes d'un wizard sous forme de cercles numérotés reliés
 * par des lignes. L'étape courante est mise en avant (primary), les
 * étapes validées en vert (secondary) avec une icône Check.
 *
 * Navigation : l'utilisateur peut cliquer sur n'importe quelle étape
 * déjà atteinte (≤ maxReachedStep) pour revenir en arrière. Les étapes
 * futures (> maxReachedStep) ne sont pas cliquables.
 *
 * Mobile-first : cercles size-9 sans libellés sur mobile, size-10 avec
 * libellés sur sm+. Les libellés sont courts (1 mot) pour tenir dans
 * l'espace restreint.
 */
"use client";

import { Fragment } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface StepperStep {
  number: number;
  label: string;
}

interface StepperProps {
  steps: StepperStep[];
  /** Étape courante (1-indexed). */
  currentStep: number;
  /** Étape la plus avancée atteinte (borne supérieure de navigation). */
  maxReachedStep: number;
  /** Callback appelé au clic sur une étape atteinte. */
  onStepClick?: (step: number) => void;
}

export function Stepper({
  steps,
  currentStep,
  maxReachedStep,
  onStepClick,
}: StepperProps) {
  return (
    <nav aria-label="Étapes de la commande">
      <ol className="flex items-start justify-between">
        {steps.map((step, index) => {
          const isCompleted = step.number < currentStep;
          const isCurrent = step.number === currentStep;
          const isFuture = step.number > currentStep;
          const isClickable =
            step.number <= maxReachedStep && Boolean(onStepClick);
          const isLast = index === steps.length - 1;

          return (
            <Fragment key={step.number}>
              <li className="flex flex-col items-center gap-1.5">
                <button
                  type="button"
                  disabled={!isClickable}
                  onClick={() => isClickable && onStepClick?.(step.number)}
                  className={cn(
                    "flex size-9 items-center justify-center rounded-full border-2 text-sm font-bold transition-all sm:size-10",
                    isClickable && "cursor-pointer hover:scale-105",
                    !isClickable && "cursor-default",
                    isCurrent &&
                      "border-primary bg-primary text-primary-foreground shadow-md scale-105",
                    isCompleted &&
                      "border-secondary bg-secondary text-secondary-foreground",
                    isFuture &&
                      "border-muted bg-background text-muted-foreground"
                  )}
                  aria-current={isCurrent ? "step" : undefined}
                  aria-label={`Étape ${step.number} : ${step.label}${
                    isCurrent
                      ? " (étape actuelle)"
                      : isCompleted
                      ? " (validée)"
                      : ""
                  }`}
                >
                  {isCompleted ? (
                    <Check className="size-4 sm:size-5" />
                  ) : (
                    step.number
                  )}
                </button>
                <span
                  className={cn(
                    "max-w-[5rem] text-center text-[10px] font-medium leading-tight sm:max-w-[7rem] sm:text-xs",
                    isCurrent
                      ? "text-primary"
                      : isCompleted
                      ? "text-secondary-foreground"
                      : "text-muted-foreground"
                  )}
                >
                  {step.label}
                </span>
              </li>

              {/* Connecteur entre les étapes */}
              {!isLast && (
                <li
                  aria-hidden
                  className={cn(
                    "mt-[1.125rem] h-0.5 flex-1 rounded-full transition-colors sm:mt-[1.375rem]",
                    index < currentStep - 1 ? "bg-secondary" : "bg-muted"
                  )}
                />
              )}
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
