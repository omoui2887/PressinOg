/**
 * Étape 1 — Sélection du client (placeholder)
 * -------------------------------------------
 * Contenu détaillé à venir dans un prompt suivant.
 *
 * Pour rendre le wizard navigable dès maintenant, un bouton mock permet
 * de sélectionner un client factice → débloque le bouton "Suivant".
 */
"use client";

import { UserPlus, UserCheck, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { StepProps } from "./state";

const MOCK_CLIENT = {
  id: "mock-client-1",
  nom: "Awa Koné",
  telephone: "+225 07 00 00 00 01",
  email: "awa.kone@example.ci",
};

export function StepClient({ state, dispatch }: StepProps) {
  const hasClient = state.client !== null;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">
          Sélection du client
        </h2>
        <p className="text-sm text-muted-foreground">
          Choisissez le client pour cette commande. Le contenu détaillé de
          cette étape (recherche, nouveau client, fidélité) arrive dans un
          prompt suivant.
        </p>
      </div>

      {hasClient ? (
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                <UserCheck className="size-5" />
              </span>
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground">
                  {state.client!.nom}
                </p>
                <p className="truncate text-sm text-muted-foreground">
                  {state.client!.telephone}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => dispatch({ type: "CLEAR_CLIENT" })}
            >
              Changer
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <UserX className="size-6" />
          </span>
          <p className="mt-3 text-sm font-medium text-foreground">
            Aucun client sélectionné
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Le bouton &quot;Suivant&quot; sera désactivé tant qu&apos;aucun
            client n&apos;est choisi.
          </p>
          <Button
            className="mt-4"
            onClick={() =>
              dispatch({ type: "SET_CLIENT", client: MOCK_CLIENT })
            }
          >
            <UserPlus className="size-4" />
            Sélectionner un client (mock)
          </Button>
        </div>
      )}
    </div>
  );
}
