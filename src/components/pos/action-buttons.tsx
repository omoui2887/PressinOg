/**
 * <ActionButtons /> — Boutons du bas (pleine largeur, tactiles).
 * Gauche : Annuler (rouge, icône X). Droite : Valider (bleu, icône check).
 * Valider passe en loading + se désactive (anti double-validation).
 */
"use client";
import { memo } from "react";
import { X, Check, Loader2 } from "lucide-react";

interface ActionButtonsProps {
  submitting: boolean;
  canValidate: boolean;
  onAnnuler: () => void;
  onValider: () => void;
}

function ActionButtonsImpl({
  submitting,
  canValidate,
  onAnnuler,
  onValider,
}: ActionButtonsProps) {
  return (
    <div className="grid shrink-0 grid-cols-2 gap-2">
      <button
        type="button"
        onClick={onAnnuler}
        disabled={submitting}
        className="pos-btn-cancel flex h-11 items-center justify-center gap-2 rounded-md text-[14px] font-semibold disabled:opacity-50"
      >
        <X className="h-5 w-5" />
        Annuler
      </button>
      <button
        type="button"
        onClick={onValider}
        disabled={submitting || !canValidate}
        className="pos-btn-validate flex h-11 items-center justify-center gap-2 rounded-md text-[14px] font-semibold"
      >
        {submitting ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <Check className="h-5 w-5" />
        )}
        {submitting ? "Validation…" : "Valider"}
      </button>
    </div>
  );
}

export const ActionButtons = memo(ActionButtonsImpl);
