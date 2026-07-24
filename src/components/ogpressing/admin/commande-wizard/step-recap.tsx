/**
 * Étape 3 — Récapitulatif, remise et acompte (placeholder)
 * --------------------------------------------------------
 * Contenu détaillé à venir dans un prompt suivant.
 *
 * Pour rendre le wizard navigable dès maintenant, des boutons mock
 * permettent d'appliquer une remise et un acompte. L'étape est toujours
 * valide (remise/acompte optionnels) → le bouton "Suivant" passe à
 * l'étape 4 (confirmation) et génère l'ID de commande.
 */
"use client";

import { Tag, Wallet, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  computeMontantRemise,
  computeSousTotal,
  computeTotal,
  type StepProps,
} from "./state";

export function StepRecap({ state, dispatch }: StepProps) {
  const sousTotal = computeSousTotal(state);
  const montantRemise = computeMontantRemise(state);
  const total = computeTotal(state);
  const resteAcompte = state.acompte !== null ? total - state.acompte : total;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">
          Récapitulatif, remise et acompte
        </h2>
        <p className="text-sm text-muted-foreground">
          Vérifiez la commande, appliquez une remise et un acompte. Le contenu
          détaillé (champs remise/acompte, mode de paiement, notes) arrive dans
          un prompt suivant.
        </p>
      </div>

      {/* Récapitulatif */}
      <div className="space-y-3 rounded-lg border bg-card p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Client</span>
          <span className="font-medium text-foreground">
            {state.client?.nom ?? "—"}
          </span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Articles</span>
          <span className="font-medium text-foreground">
            {state.articles.length} article
            {state.articles.length > 1 ? "s" : ""}
          </span>
        </div>
        <Separator />
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Sous-total</span>
          <span className="text-foreground">
            {sousTotal.toLocaleString("fr-FR")} FCFA
          </span>
        </div>
        {montantRemise > 0 && (
          <div className="flex items-center justify-between text-sm text-secondary">
            <span>Remise</span>
            <span>−{montantRemise.toLocaleString("fr-FR")} FCFA</span>
          </div>
        )}
        <Separator />
        <div className="flex items-center justify-between font-bold">
          <span className="text-foreground">Total</span>
          <span className="text-foreground">
            {total.toLocaleString("fr-FR")} FCFA
          </span>
        </div>
        {state.acompte !== null && (
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Acompte versé</span>
            <span>{state.acompte.toLocaleString("fr-FR")} FCFA</span>
          </div>
        )}
        {state.acompte !== null && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Reste à payer</span>
            <span className="font-medium text-warning">
              {resteAcompte.toLocaleString("fr-FR")} FCFA
            </span>
          </div>
        )}
      </div>

      {/* Actions mock pour remise / acompte */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Remise (mock)
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant={state.remise ? "default" : "outline"}
              size="sm"
              onClick={() =>
                dispatch({
                  type: "SET_REMISE",
                  remise: { type: "pourcentage", valeur: 10 },
                })
              }
            >
              <Tag className="size-4" />
              10 %
            </Button>
            <Button
              variant={state.remise ? "default" : "outline"}
              size="sm"
              onClick={() =>
                dispatch({
                  type: "SET_REMISE",
                  remise: { type: "montant", valeur: 1000 },
                })
              }
            >
              <Tag className="size-4" />
              1 000 FCFA
            </Button>
            {state.remise && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => dispatch({ type: "SET_REMISE", remise: null })}
              >
                <RotateCcw className="size-4" />
                Retirer
              </Button>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Acompte (mock)
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant={state.acompte !== null ? "default" : "outline"}
              size="sm"
              onClick={() =>
                dispatch({ type: "SET_ACOMPTE", acompte: Math.round(total / 2) })
              }
            >
              <Wallet className="size-4" />
              50 %
            </Button>
            <Button
              variant={state.acompte !== null ? "default" : "outline"}
              size="sm"
              onClick={() =>
                dispatch({ type: "SET_ACOMPTE", acompte: total })
              }
            >
              <Wallet className="size-4" />
              Total
            </Button>
            {state.acompte !== null && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => dispatch({ type: "SET_ACOMPTE", acompte: null })}
              >
                <RotateCcw className="size-4" />
                Retirer
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
