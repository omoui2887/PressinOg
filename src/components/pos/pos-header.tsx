/**
 * <PosHeader /> — En-tête POS pleine largeur.
 * Gauche : "Réf :" (gris) + référence bleu monospace + pressing/agent.
 * Droite : "Montant Total :" (gris) + montant rouge gras monospace.
 * Filet bleu sous l'en-tête.
 */
"use client";
import { memo } from "react";
import { formatFcfa } from "@/lib/pos/format";

interface PosHeaderProps {
  reference: string;
  montantTotal: number;
  pressingLabel: string;
  agentLabel: string;
}

function PosHeaderImpl({
  reference,
  montantTotal,
  pressingLabel,
  agentLabel,
}: PosHeaderProps) {
  return (
    <header className="pos-header flex shrink-0 items-center justify-between px-3 py-2">
      <div className="flex items-baseline gap-2">
        <span className="text-[12px] text-[var(--pos-text-muted)]">Réf :</span>
        <span className="pos-ref text-[13px] font-semibold">{reference}</span>
        {(pressingLabel || agentLabel) && (
          <span className="ml-2 hidden text-[10px] text-[var(--pos-text-muted)] sm:inline">
            {pressingLabel}
            {pressingLabel && agentLabel ? " · " : ""}
            {agentLabel}
          </span>
        )}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-[12px] text-[var(--pos-text-muted)]">
          Montant Total :
        </span>
        <span className="pos-total text-[15px]">{formatFcfa(montantTotal)}</span>
      </div>
    </header>
  );
}

export const PosHeader = memo(PosHeaderImpl);
