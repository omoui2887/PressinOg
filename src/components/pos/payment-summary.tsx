/**
 * <PaymentSummary /> — Zone financière + paiement déclaratif.
 * Remise (FCFA ou %) · Payé · Net à payer · Reste.
 * Boutons de méthode (Espèces/Mobile Money/Carte bancaire) si Payé > 0.
 * Champ Référence si Mobile Money/Carte. Badge statut. Rappel "au comptoir".
 */
"use client";
import { memo } from "react";
import { Banknote, Smartphone, CreditCard, Info } from "lucide-react";
import type {
  PosMethodePaiement,
  PosRemiseType,
  PosStatutPaiement,
} from "@/lib/pos/types";
import { formatFcfa } from "@/lib/pos/format";
import { methodePaiementLabel, statutBadgeClass, statutLabel } from "@/lib/pos/calc";

interface PaymentSummaryProps {
  sousTotal: number;
  remiseType: PosRemiseType;
  remiseValeur: number;
  remiseMontant: number;
  netAPayer: number;
  paye: number;
  reste: number;
  statut: PosStatutPaiement;
  methode: PosMethodePaiement | null;
  reference: string;
  onRemiseType: (t: PosRemiseType) => void;
  onRemiseValeur: (v: number) => void;
  onPaye: (v: number) => void;
  onMethode: (m: PosMethodePaiement) => void;
  onReference: (r: string) => void;
}

const METHODES: Array<{
  id: PosMethodePaiement;
  icon: typeof Banknote;
}> = [
  { id: "especes", icon: Banknote },
  { id: "mobile_money", icon: Smartphone },
  { id: "carte_bancaire", icon: CreditCard },
];

function PaymentSummaryImpl({
  sousTotal,
  remiseType,
  remiseValeur,
  remiseMontant,
  netAPayer,
  paye,
  reste,
  statut,
  methode,
  reference,
  onRemiseType,
  onRemiseValeur,
  onPaye,
  onMethode,
  onReference,
}: PaymentSummaryProps) {
  return (
    <div className="pos-panel p-2.5">
      {/* Ligne 1 : Remise + Payé */}
      <div className="grid grid-cols-2 gap-2">
        {/* Remise */}
        <div>
          <label className="text-[10px] text-[var(--pos-text-muted)]">
            Remise :
          </label>
          <div className="flex items-center gap-1">
            <input
              type="number"
              min={0}
              value={remiseValeur || ""}
              onChange={(e) => onRemiseValeur(parseInt(e.target.value, 10) || 0)}
              disabled={remiseType === "aucune"}
              className="pos-mono h-6 w-full rounded border border-[var(--pos-border)] px-1 text-[11px] outline-none focus:border-[var(--pos-primary)] disabled:bg-[var(--pos-primary-50)] disabled:text-[var(--pos-text-muted)]"
              aria-label="Montant de la remise"
            />
            <select
              value={remiseType}
              onChange={(e) => onRemiseType(e.target.value as PosRemiseType)}
              className="h-6 rounded border border-[var(--pos-border)] bg-white px-1 text-[10px] outline-none focus:border-[var(--pos-primary)]"
              aria-label="Type de remise"
            >
              <option value="aucune">—</option>
              <option value="montant_fixe">Fcfa</option>
              <option value="pourcentage">%</option>
            </select>
          </div>
        </div>
        {/* Payé */}
        <div>
          <label className="text-[10px] text-[var(--pos-text-muted)]">
            Payé :
          </label>
          <input
            type="number"
            min={0}
            max={netAPayer}
            value={paye || ""}
            onChange={(e) => onPaye(parseInt(e.target.value, 10) || 0)}
            className="pos-mono h-6 w-full rounded border border-[var(--pos-border)] px-1 text-[11px] outline-none focus:border-[var(--pos-primary)]"
            aria-label="Montant payé"
          />
        </div>
      </div>

      {/* Ligne 2 : Net à payer + Reste */}
      <div className="mt-1.5 grid grid-cols-2 gap-2 border-t border-[var(--pos-border-light)] pt-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold text-[var(--pos-text)]">
            Net à payer :
          </span>
          <span className="pos-mono text-[12px] font-bold text-[var(--pos-primary)]">
            {formatFcfa(netAPayer)}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold text-[var(--pos-text)]">
            Reste :
          </span>
          <span
            className={`pos-mono text-[12px] font-bold ${
              reste > 0 ? "text-[var(--pos-danger)]" : "text-[var(--pos-green)]"
            }`}
          >
            {formatFcfa(reste)}
          </span>
        </div>
      </div>

      {/* Sous-total discret (info) */}
      <div className="mt-0.5 flex items-center justify-between text-[10px] text-[var(--pos-text-muted)]">
        <span>Sous-total : {formatFcfa(sousTotal)}</span>
        {remiseMontant > 0 && <span>Remise : -{formatFcfa(remiseMontant)}</span>}
      </div>

      {/* Badge statut */}
      <div className="mt-1.5 flex items-center justify-between">
        <span className="text-[10px] text-[var(--pos-text-muted)]">
          Statut paiement :
        </span>
        <span
          className={`${statutBadgeClass(statut)} rounded px-2 py-0.5 text-[10px]`}
        >
          {statutLabel(statut)}
        </span>
      </div>

      {/* Méthodes de paiement déclaratives (si Payé > 0) */}
      {paye > 0 && (
        <div className="mt-2 border-t border-[var(--pos-border-light)] pt-2">
          <p className="mb-1 text-[10px] font-medium text-[var(--pos-text-muted)]">
            Mode de paiement (obligatoire) :
          </p>
          <div className="grid grid-cols-3 gap-1.5">
            {METHODES.map(({ id, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => onMethode(id)}
                data-active={methode === id}
                className="pos-pay-btn flex flex-col items-center gap-0.5 rounded-md py-1.5"
                aria-pressed={methode === id}
              >
                <Icon className="h-4 w-4" />
                <span className="text-[10px] font-medium leading-tight">
                  {methodePaiementLabel(id)}
                </span>
              </button>
            ))}
          </div>

          {/* Référence facultative si Mobile Money / Carte */}
          {(methode === "mobile_money" || methode === "carte_bancaire") && (
            <input
              type="text"
              value={reference}
              onChange={(e) => onReference(e.target.value)}
              placeholder="Référence transaction (facultatif)"
              className="mt-1.5 h-6 w-full rounded border border-[var(--pos-border)] px-2 text-[10px] outline-none focus:border-[var(--pos-primary)]"
              aria-label="Référence de transaction"
            />
          )}

          {/* Rappel explicite */}
          <p className="mt-1.5 flex items-start gap-1 text-[9px] italic text-[var(--pos-text-muted)]">
            <Info className="mt-px h-2.5 w-2.5 shrink-0" />
            Le paiement est encaissé au comptoir. L'application enregistre
            seulement ce qui a été payé.
          </p>
        </div>
      )}
    </div>
  );
}

export const PaymentSummary = memo(PaymentSummaryImpl);
