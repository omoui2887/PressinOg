/**
 * Étape 4 — Confirmation avec QR Code et étiquettes (placeholder)
 * ----------------------------------------------------------------
 * Contenu détaillé à venir dans un prompt suivant.
 *
 * Affiche un écran de succès avec la référence commande (générée au
 * passage à l'étape 4) et un emplacement réservé pour le QR Code et
 * les étiquettes articles.
 */
"use client";

import { CheckCircle2, QrCode, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  computeTotal,
  type StepProps,
} from "./state";

export function StepConfirmation({ state }: StepProps) {
  const total = computeTotal(state);

  return (
    <div className="space-y-5">
      {/* En-tête succès */}
      <div className="flex flex-col items-center text-center">
        <span className="flex size-16 items-center justify-center rounded-full bg-secondary/10 text-secondary">
          <CheckCircle2 className="size-8" />
        </span>
        <h2 className="mt-3 text-xl font-bold text-foreground">
          Commande enregistrée
        </h2>
        {state.commandeId && (
          <p className="mt-1 text-sm text-muted-foreground">
            Référence :{" "}
            <span className="font-mono font-medium text-foreground">
              {state.commandeId}
            </span>
          </p>
        )}
      </div>

      {/* Récapitulatif compact */}
      <div className="space-y-2 rounded-lg border bg-card p-4 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Client</span>
          <span className="font-medium text-foreground">
            {state.client?.nom ?? "—"}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Articles</span>
          <span className="font-medium text-foreground">
            {state.articles.length}
          </span>
        </div>
        {state.acompte !== null && (
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Acompte</span>
            <span className="font-medium text-foreground">
              {state.acompte.toLocaleString("fr-FR")} FCFA
            </span>
          </div>
        )}
        <Separator />
        <div className="flex items-center justify-between font-bold">
          <span className="text-foreground">Total</span>
          <span className="text-foreground">
            {total.toLocaleString("fr-FR")} FCFA
          </span>
        </div>
      </div>

      {/* Emplacement QR Code + étiquettes */}
      <div className="rounded-lg border border-dashed p-8 text-center">
        <span className="mx-auto flex size-16 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <QrCode className="size-8" />
        </span>
        <p className="mt-3 text-sm font-medium text-foreground">
          QR Code & étiquettes
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Le ticket QR Code et les étiquettes articles seront affichés ici.
          Contenu détaillé à venir dans un prompt suivant.
        </p>
        <Button variant="outline" size="sm" className="mt-4" disabled>
          <Printer className="size-4" />
          Imprimer (à venir)
        </Button>
      </div>
    </div>
  );
}
