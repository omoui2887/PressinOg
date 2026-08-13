/**
 * e-pressing — AddEmployeeButton
 * -------------------------------
 * Bouton "+ Ajouter un employé" en haut de la page /admin/personnel.
 *
 * Comportement :
 *   - Désactivé (avec tooltip) si la limite du plan d'abonnement est atteinte.
 *     starter=3, pro=8, business=illimité.
 *   - Si limite atteinte, un clic affiche un toast d'avertissement invitant à
 *     passer au plan supérieur.
 *   - Sinon, ouvre le CreateEmployeeDialog (LOT 9.2) qui gère les 2 méthodes
 *     de création (création directe + lien d'invitation).
 *
 * Client component : gestion de l'état + toast + Dialog.
 */
"use client";

import { UserPlus, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CreateEmployeeDialog } from "./create-employee-dialog";

interface AddEmployeeButtonProps {
  /** true si la limite du plan est atteinte (count >= limit) */
  limitAtteinte: boolean;
  /** Limite du plan (3, 8, ou null si illimité). Pour le message. */
  limit: number | null;
  /** Callback pour rafraîchir la liste après création. */
  onCreated?: () => void;
}

export function AddEmployeeButton({
  limitAtteinte,
  limit,
  onCreated,
}: AddEmployeeButtonProps) {
  // Si limite atteinte, on affiche un bouton désactivé avec tooltip
  if (limitAtteinte) {
    return (
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button disabled className="gap-2">
              <Lock className="size-4" />
              <span className="hidden sm:inline">Ajouter un employé</span>
              <span className="sm:hidden">Ajouter</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Limite du plan atteinte</p>
            <p className="text-xs text-muted-foreground">
              {limit !== null
                ? `Votre plan autorise jusqu'à ${limit} employés. Passez au plan supérieur pour en ajouter plus.`
                : "Contactez le Super Admin."}
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Sinon, on ouvre le dialog de création
  return (
    <CreateEmployeeDialog
      limitAtteinte={limitAtteinte}
      onCreated={onCreated}
      trigger={
        <Button className="gap-2">
          <UserPlus className="size-4" />
          <span className="hidden sm:inline">Ajouter un employé</span>
          <span className="sm:hidden">Ajouter</span>
        </Button>
      }
    />
  );
}
