/**
 * <PaymentSummary /> — Zone financière + paiement déclaratif (carte repliable).
 * =============================================================================
 *
 * Logique corrigée (vs. version précédente) :
 *   1. Le badge de statut (PAYÉ / ACOMPTE / IMPAYÉ) est affiché dans l'en-tête,
 *      à côté du « Net à payer » — plus sur une ligne séparée.
 *   2. La ligne « Sous-total » n'est affichée QUE si une remise est appliquée
 *      (sinon Sous-total = Net à payer, l'info est redondante).
 *   3. Le bloc « Mode de paiement » s'affiche dès que `paye > 0` (et donc dès
 *      qu'un acompte est saisi). Le label ne dit plus « (obligatoire) » pour
 *      éviter la contradiction avec un bloc parfois caché ; à la place, un
 *      message inline rappelle de choisir un mode si `paye > 0 && !methode`.
 *   4. La « Remise » est simplifiée : un seul couple [montant][type Fcfa/%]
 *      avec un label clair « Remise (facultatif) ».
 *   5. Le rappel « encaissé au comptoir » est raccourci et déplacé en note
 *      discrète sous le bloc mode de paiement.
 */
"use client";
import { memo } from "react";
import { Wallet, Banknote, Smartphone, CreditCard, Info, AlertTriangle } from "lucide-react";
import type {
  PosMethodePaiement,
  PosRemiseType,
  PosStatutPaiement,
} from "@/lib/pos/types";
import { formatFcfa } from "@/lib/pos/format";
import { methodePaiementLabel, statutBadgeClass, statutLabel } from "@/lib/pos/calc";
import { CollapsibleSection } from "./collapsible-section";

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
  // Résumé d'en-tête : Net à payer (ou "—" si panier vide).
  const summary = netAPayer > 0 ? formatFcfa(netAPayer) : "—";

  // Badge de statut dans l'en-tête.
  const badge = (
    <span className={`${statutBadgeClass(statut)} rounded px-2 py-0.5 text-[10px]`}>
      {statutLabel(statut)}
    </span>
  );

  // Raccourci : « Encaisser tout » pré-remplit paye = netAPayer.
  const encaisserTout = () => onPaye(netAPayer);

  // Afficher le sélecteur de mode de paiement dès qu'un montant est payé.
  const showModeBloc = paye > 0 && netAPayer > 0;
  const modeManquant = showModeBloc && !methode;

  return (
    <CollapsibleSection
      title="Paiement"
      icon={<Wallet className="h-4 w-4" />}
      summary={summary}
      badge={badge}
      defaultOpen={true}
    >
      <div className="space-y-2">
        {/* ── Net à payer (gros, lisible) + Reste ─────────────────────── */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded bg-[var(--pos-primary-50)] px-2 py-1.5">
            <div className="text-[9px] uppercase tracking-wide text-[var(--pos-text-muted)]">
              Net à payer
            </div>
            <div className="pos-mono text-[14px] font-bold text-[var(--pos-primary-dark)]">
              {formatFcfa(netAPayer)}
            </div>
          </div>
          <div className="rounded bg-[var(--pos-surface)] px-2 py-1.5 ring-1 ring-[var(--pos-border)]">
            <div className="text-[9px] uppercase tracking-wide text-[var(--pos-text-muted)]">
              Reste
            </div>
            <div
              className={`pos-mono text-[14px] font-bold ${
                reste > 0 ? "text-[var(--pos-danger)]" : "text-[var(--pos-green)]"
              }`}
            >
              {formatFcfa(reste)}
            </div>
          </div>
        </div>

        {/* ── Sous-total + Remise (uniquement si remise > 0) ─────────── */}
        {remiseMontant > 0 && (
          <div className="flex items-center justify-between text-[10px] text-[var(--pos-text-muted)]">
            <span>Sous-total : {formatFcfa(sousTotal)}</span>
            <span>Remise : −{formatFcfa(remiseMontant)}</span>
          </div>
        )}

        {/* ── Remise (facultatif) — une seule ligne claire ──────────── */}
        <div className="flex items-center gap-1.5">
          <span className="w-[58px] shrink-0 text-[10px] text-[var(--pos-text-muted)]">
            Remise :
          </span>
          <input
            type="number"
            min={0}
            value={remiseValeur || ""}
            onChange={(e) => onRemiseValeur(parseInt(e.target.value, 10) || 0)}
            disabled={remiseType === "aucune"}
            placeholder="0"
            className="pos-mono h-7 w-full min-w-0 rounded border border-[var(--pos-border)] px-2 text-[11px] outline-none focus:border-[var(--pos-primary)] disabled:bg-[var(--pos-primary-50)] disabled:text-[var(--pos-text-muted)]"
            aria-label="Montant de la remise"
          />
          <select
            value={remiseType}
            onChange={(e) => onRemiseType(e.target.value as PosRemiseType)}
            className="h-7 shrink-0 rounded border border-[var(--pos-border)] bg-white px-1.5 text-[10px] outline-none focus:border-[var(--pos-primary)]"
            aria-label="Type de remise"
          >
            <option value="aucune">—</option>
            <option value="montant_fixe">Fcfa</option>
            <option value="pourcentage">%</option>
          </select>
        </div>

        {/* ── Montant payé + bouton « Tout encaisser » ──────────────── */}
        <div className="flex items-center gap-1.5">
          <span className="w-[58px] shrink-0 text-[10px] text-[var(--pos-text-muted)]">
            Payé :
          </span>
          <input
            type="number"
            min={0}
            max={netAPayer}
            value={paye || ""}
            onChange={(e) => onPaye(parseInt(e.target.value, 10) || 0)}
            placeholder="0"
            className="pos-mono h-7 w-full min-w-0 rounded border border-[var(--pos-border)] px-2 text-[11px] outline-none focus:border-[var(--pos-primary)]"
            aria-label="Montant payé"
          />
          {paye < netAPayer && netAPayer > 0 && (
            <button
              type="button"
              onClick={encaisserTout}
              className="shrink-0 rounded bg-[var(--pos-green)] px-2 py-1 text-[10px] font-semibold text-white hover:brightness-110"
              title="Encaisser l'intégralité du net à payer"
            >
              Tout
            </button>
          )}
        </div>

        {/* ── Mode de paiement (dès qu'un montant est payé) ─────────── */}
        {showModeBloc && (
          <div className="border-t border-[var(--pos-border-light)] pt-2">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[10px] font-medium text-[var(--pos-text-muted)]">
                Mode de paiement
              </span>
              {modeManquant && (
                <span className="flex items-center gap-0.5 text-[9px] font-medium text-[var(--pos-orange)]">
                  <AlertTriangle className="h-2.5 w-2.5" />
                  Sélectionnez un mode
                </span>
              )}
            </div>
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
                className="mt-1.5 h-7 w-full rounded border border-[var(--pos-border)] px-2 text-[10px] outline-none focus:border-[var(--pos-primary)]"
                aria-label="Référence de transaction"
              />
            )}

            {/* Note discrète */}
            <p className="mt-1.5 flex items-start gap-1 text-[9px] italic text-[var(--pos-text-muted)]">
              <Info className="mt-px h-2.5 w-2.5 shrink-0" />
              Encaissement au comptoir — l'application enregistre le montant payé.
            </p>
          </div>
        )}
      </div>
    </CollapsibleSection>
  );
}

export const PaymentSummary = memo(PaymentSummaryImpl);
