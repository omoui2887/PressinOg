/**
 * <ActionButtons /> — Boutons du bas (pleine largeur, tactiles).
 * =============================================================================
 *
 * Gauche : Annuler (rouge, icône X).
 * Droite : Valider — libellé et couleur DYNAMIQUES selon le statut de paiement :
 *            - IMPAYÉ  → bouton rouge  « Créer — IMPAYÉ »
 *            - ACOMPTE → bouton orange « Créer — ACOMPTE »
 *            - PAYÉ    → bouton vert   « Créer — PAYÉ »
 *
 * Le bouton passe en loading + se désactive pendant la validation
 * (anti double-validation). Lorsque le panier est vide ou que la validation
 * est impossible (client manquant…), le libellé revient à « Valider »
 * pour ne pas induire l'opérateur en erreur.
 */
"use client";
import { memo } from "react";
import { X, Check, Loader2, Ban, AlertTriangle, CheckCircle2 } from "lucide-react";
import type { PosStatutPaiement } from "@/lib/pos/types";

interface ActionButtonsProps {
  submitting: boolean;
  canValidate: boolean;
  /** Statut dérivé du paiement (paye vs net à payer). */
  statut: PosStatutPaiement;
  /** Vrai si le panier contient au moins un article (sinon « Valider » générique). */
  hasArticles: boolean;
  onAnnuler: () => void;
  onValider: () => void;
}

function ActionButtonsImpl({
  submitting,
  canValidate,
  statut,
  hasArticles,
  onAnnuler,
  onValider,
}: ActionButtonsProps) {
  // Détermine le libellé + icône + classe CSS du bouton de validation.
  const validateConfig = (() => {
    if (!hasArticles || !canValidate) {
      return {
        label: "Valider",
        Icon: Check,
        className: "pos-btn-validate",
      };
    }
    switch (statut) {
      case "paye":
        return {
          label: "Créer la commande — PAYÉ",
          Icon: CheckCircle2,
          className: "pos-btn-validate-paid",
        };
      case "acompte":
        return {
          label: "Créer la commande — ACOMPTE",
          Icon: AlertTriangle,
          className: "pos-btn-validate-acompte",
        };
      case "impaye":
        return {
          label: "Créer la commande — IMPAYÉ",
          Icon: Ban,
          className: "pos-btn-validate-unpaid",
        };
    }
  })();

  const { label, Icon, className } = validateConfig;

  return (
    <div className="grid shrink-0 grid-cols-[auto_1fr] gap-2">
      <button
        type="button"
        onClick={onAnnuler}
        disabled={submitting}
        className="pos-btn-cancel flex h-11 items-center justify-center gap-2 rounded-md px-4 text-[13px] font-semibold disabled:opacity-50"
        aria-label="Annuler la commande"
      >
        <X className="h-5 w-5" />
        <span className="hidden sm:inline">Annuler</span>
      </button>
      <button
        type="button"
        onClick={onValider}
        disabled={submitting || !canValidate}
        className={`${className} flex h-11 items-center justify-center gap-2 rounded-md text-[13px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50`}
        aria-label={label}
      >
        {submitting ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <Icon className="h-5 w-5" />
        )}
        {submitting ? "Validation…" : label}
      </button>
    </div>
  );
}

export const ActionButtons = memo(ActionButtonsImpl);
