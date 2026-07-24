/**
 * OgPressing — AddEmployeeButton
 * -------------------------------
 * Bouton "+ Ajouter un employé" en haut de la page /admin/personnel.
 *
 * Comportement :
 *   - Désactivé (avec tooltip) si la limite du plan d'abonnement est atteinte.
 *     starter=3, pro=8, business=illimité.
 *   - Si limite atteinte, un clic affiche un toast d'avertissement invitant à
 *     passer au plan supérieur.
 *   - Sinon, affiche un toast "à venir" car le formulaire de création détaillé
 *     sera développé au prompt suivant.
 *
 * Client component : gestion de l'état + toast.
 */
"use client";

import { useState } from "react";
import { UserPlus, Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";

interface AddEmployeeButtonProps {
  /** true si la limite du plan est atteinte (count >= limit) */
  limitAtteinte: boolean;
  /** Limite du plan (3, 8, ou null si illimité). Pour le message. */
  limit: number | null;
}

export function AddEmployeeButton({
  limitAtteinte,
  limit,
}: AddEmployeeButtonProps) {
  const [loading, setLoading] = useState(false);

  function handleClick() {
    if (limitAtteinte) {
      toast.error("Limite atteinte pour votre plan", {
        description:
          limit !== null
            ? `Votre plan autorise jusqu'à ${limit} employé${limit > 1 ? "s" : ""}. Passez au plan supérieur pour en ajouter plus.`
            : undefined,
      });
      return;
    }

    // Formulaire détaillé au prochain prompt → placeholder
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      toast.info("Fonctionnalité à venir", {
        description:
          "Le formulaire de création d'un employé sera disponible au prochain lot.",
      });
    }, 300);
  }

  const button = (
    <Button
      onClick={handleClick}
      disabled={loading}
      className="gap-2"
    >
      {loading ? (
        <Loader2 className="size-4 animate-spin" />
      ) : limitAtteinte ? (
        <Lock className="size-4" />
      ) : (
        <UserPlus className="size-4" />
      )}
      <span className="hidden sm:inline">Ajouter un employé</span>
      <span className="sm:hidden">Ajouter</span>
    </Button>
  );

  // Si limite atteinte, on entoure le bouton d'un tooltip explicatif
  if (limitAtteinte) {
    return (
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent>
            <p>Limite du plan atteinte</p>
            <p className="text-xs text-muted-foreground">
              Passez au plan supérieur pour ajouter plus d'employés
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return button;
}
