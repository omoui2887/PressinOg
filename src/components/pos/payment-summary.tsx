/**
 * <PaymentSummary /> — Section Paiement (workflow replié en carte).
 * =============================================================================
 *
 * Workflow logique (reconçu) :
 *
 *   1. NET À PAYER est le héros — grand, lisible, en haut.
 *      (Sous-total + Remise affichés en sous-titre si remise active.)
 *
 *   2. REMISE (facultative) — un seul couple [montant][type Fcfa/%].
 *      Placée AVANT le bloc encaissement car la remise influence le net.
 *
 *   3. MODE D'ENCAISSEMENT — 4 boutons clairs :
 *        [💵 Espèces] [📱 Mobile Money] [💳 Carte] [✗ Pas de paiement]
 *      « Pas de paiement » crée une commande IMPAYÉE (paiement ultérieur).
 *      Les 3 autres méthodes déclenchent la saisie du montant reçu.
 *
 *   4. MONTANT REÇU — apparaît uniquement après choix du mode.
 *      Boutons raccourcis : [Net exact] [Autre montant: ____]
 *      Pour les espèces, le montant reçu peut être > net (rend monnaie).
 *      Pour Mobile/Carte, le montant est plafonné au net.
 *
 *   5. CARTE RÉCAPITULATIVE — Reçu / Net / Monnaie à rendre / Reste.
 *      L'opérateur voit immédiatement combien rendre ou combien il reste.
 *
 *   6. RÉFÉRENCE TRANSACTION — facultative, pour Mobile Money / Carte.
 *
 * Le statut (PAYÉ / ACOMPTE / IMPAYÉ) est dérivé automatiquement du
 * montant reçu vs net à payer, et affiché en badge dans l'en-tête.
 */
"use client";
import { memo } from "react";
import {
  Wallet,
  Banknote,
  Smartphone,
  CreditCard,
  Ban,
  Coins,
  CheckCircle2,
  AlertTriangle,
  Info,
} from "lucide-react";
import type {
  PosMethodePaiement,
  PosRemiseType,
  PosStatutPaiement,
} from "@/lib/pos/types";
import { formatFcfa } from "@/lib/pos/format";
import {
  methodePaiementLabel,
  statutBadgeClass,
  statutLabel,
} from "@/lib/pos/calc";
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
  onMethode: (m: PosMethodePaiement | null) => void;
  onReference: (r: string) => void;
}

const METHODES: Array<{
  id: PosMethodePaiement;
  icon: typeof Banknote;
  shortLabel: string;
}> = [
  { id: "especes", icon: Banknote, shortLabel: "Espèces" },
  { id: "mobile_money", icon: Smartphone, shortLabel: "Mobile" },
  { id: "carte_bancaire", icon: CreditCard, shortLabel: "Carte" },
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
  // ── Résumé d'en-tête : Net à payer (ou "—" si panier vide) ────────────────
  const summary = netAPayer > 0 ? formatFcfa(netAPayer) : "—";

  // ── Badge de statut dans l'en-tête ────────────────────────────────────────
  const badge = (
    <span
      className={`${statutBadgeClass(statut)} rounded px-2 py-0.5 text-[10px] font-semibold`}
    >
      {statutLabel(statut)}
    </span>
  );

  // ── Montant reçu effectif (= paye stocké, avant clamp par computeFinance) ─
  // Pour l'UI, on affiche le « reçu » tel que saisi par l'opérateur. Pour les
  // espèces, ce montant peut être supérieur au net (le client donne un grand
  // billet). Pour Mobile/Carte, on plafonne au net (pas de monnaie à rendre).
  const montantRecu = paye;
  const monnaieARendre =
    methode === "especes" && montantRecu > netAPayer
      ? montantRecu - netAPayer
      : 0;

  // ── Drapeaux d'UI ─────────────────────────────────────────────────────────
  const panierVide = netAPayer <= 0;
  const pasDePaiement = methode === null && paye === 0;
  const modeChoisi = methode !== null;
  const modeManquant = false; // plus d'erreur « mode manquant » : soit mode choisi, soit « pas de paiement »

  // ── Handlers ─────────────────────────────────────────────────────────────
  const choisirMode = (m: PosMethodePaiement) => {
    if (panierVide) return;
    onMethode(m);
    // Default : encaisser l'intégralité (cas le plus fréquent).
    if (paye <= 0) onPaye(netAPayer);
  };

  const choisirPasDePaiement = () => {
    onPaye(0); // efface aussi methode via le store (paye=0 → methode=null)
  };

  const encaisserNetExact = () => onPaye(netAPayer);

  const saisirMontantRecu = (v: number) => {
    if (methode === "especes") {
      // Espèces : le client peut donner plus que le net (rend monnaie).
      onPaye(Math.max(0, v));
    } else {
      // Mobile / Carte : plafonné au net (pas de monnaie).
      onPaye(Math.max(0, Math.min(v, netAPayer)));
    }
  };

  return (
    <CollapsibleSection
      title="Paiement"
      icon={<Wallet className="h-4 w-4" />}
      summary={summary}
      badge={badge}
      defaultOpen={true}
    >
      <div className="space-y-3">
        {/* ── 1. NET À PAYER (héros) ─────────────────────────────────────── */}
        <div className="rounded-md bg-gradient-to-br from-[var(--pos-primary-50)] to-[var(--pos-primary-light)] px-3 py-2.5">
          <div className="flex items-baseline justify-between">
            <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--pos-text-muted)]">
              Net à payer
            </span>
            {remiseMontant > 0 && (
              <span className="text-[9px] text-[var(--pos-text-muted)]">
                Sous-total {formatFcfa(sousTotal)}
              </span>
            )}
          </div>
          <div className="pos-mono text-[20px] font-bold leading-tight text-[var(--pos-primary-dark)]">
            {panierVide ? "—" : formatFcfa(netAPayer)}
          </div>
          {remiseMontant > 0 && (
            <div className="mt-0.5 text-[10px] font-medium text-[var(--pos-green)]">
              Remise appliquée : −{formatFcfa(remiseMontant)}
            </div>
          )}
        </div>

        {/* ── 2. REMISE (facultative) ────────────────────────────────────── */}
        <div>
          <div className="mb-1 text-[10px] font-medium text-[var(--pos-text-muted)]">
            Remise (facultative)
          </div>
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              min={0}
              value={remiseValeur || ""}
              onChange={(e) =>
                onRemiseValeur(parseInt(e.target.value, 10) || 0)
              }
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
        </div>

        {/* ── 3. MODE D'ENCAISSEMENT ─────────────────────────────────────── */}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[10px] font-medium text-[var(--pos-text-muted)]">
              Mode d'encaissement
            </span>
            {panierVide && (
              <span className="text-[9px] italic text-[var(--pos-text-muted)]">
                Ajoutez d'abord un article
              </span>
            )}
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {METHODES.map(({ id, icon: Icon, shortLabel }) => (
              <button
                key={id}
                type="button"
                onClick={() => choisirMode(id)}
                disabled={panierVide}
                data-active={methode === id}
                className="pos-pay-btn flex flex-col items-center gap-0.5 rounded-md py-1.5 disabled:cursor-not-allowed disabled:opacity-40"
                aria-pressed={methode === id}
                aria-label={`Encaisser par ${methodePaiementLabel(id)}`}
              >
                <Icon className="h-4 w-4" />
                <span className="text-[10px] font-medium leading-tight">
                  {shortLabel}
                </span>
              </button>
            ))}
            <button
              type="button"
              onClick={choisirPasDePaiement}
              disabled={panierVide}
              data-active={pasDePaiement}
              className="pos-pay-btn-no flex flex-col items-center gap-0.5 rounded-md py-1.5 disabled:cursor-not-allowed disabled:opacity-40"
              aria-pressed={pasDePaiement}
              aria-label="Pas de paiement maintenant"
              title="Créer la commande sans encaisser (paiement ultérieur)"
            >
              <Ban className="h-4 w-4" />
              <span className="text-[10px] font-medium leading-tight">
                Aucun
              </span>
            </button>
          </div>
        </div>

        {/* ── 4. MONTANT REÇU (uniquement si un mode est choisi) ────────── */}
        {modeChoisi && !panierVide && (
          <div className="rounded-md border border-[var(--pos-border-light)] bg-[var(--pos-surface)] p-2">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[10px] font-medium text-[var(--pos-text-muted)]">
                Montant reçu{" "}
                <span className="text-[var(--pos-text-muted)]">
                  ({methodePaiementLabel(methode!)})
                </span>
              </span>
            </div>

            {/* Raccourcis : Net exact / Acompte partiel */}
            <div className="mb-1.5 flex gap-1.5">
              <button
                type="button"
                onClick={encaisserNetExact}
                data-active={paye === netAPayer}
                className="pos-quick-btn flex-1 rounded border border-[var(--pos-border)] bg-white px-2 py-1 text-[10px] font-medium hover:border-[var(--pos-green)] hover:text-[var(--pos-green)]"
                title="Le client paie exactement le net à payer"
              >
                Net exact
                <span className="pos-mono ml-1 font-bold">
                  {formatFcfa(netAPayer)}
                </span>
              </button>
              {methode === "especes" && (
                <>
                  {[500, 1000, 2000, 5000]
                    .filter((b) => b >= netAPayer)
                    .slice(0, 2)
                    .map((b) => (
                      <button
                        key={b}
                        type="button"
                        onClick={() => onPaye(b)}
                        className="pos-quick-btn rounded border border-[var(--pos-border)] bg-white px-2 py-1 text-[10px] font-medium hover:border-[var(--pos-primary)]"
                        title={`Billet de ${formatFcfa(b)}`}
                      >
                        {formatFcfa(b)}
                      </button>
                    ))}
                </>
              )}
            </div>

            {/* Saisie libre du montant reçu */}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-[var(--pos-text-muted)]">
                Reçu :
              </span>
              <input
                type="number"
                min={0}
                value={paye || ""}
                onChange={(e) =>
                  saisirMontantRecu(parseInt(e.target.value, 10) || 0)
                }
                placeholder="0"
                className="pos-mono h-7 w-full min-w-0 rounded border border-[var(--pos-border)] px-2 text-[11px] outline-none focus:border-[var(--pos-primary)]"
                aria-label="Montant reçu du client"
              />
            </div>

            {/* Référence transaction pour Mobile / Carte */}
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

            {/* ── 5. CARTE RÉCAPITULATIVE ───────────────────────────────── */}
            <div className="mt-2 rounded border border-[var(--pos-border-light)] bg-white p-2">
              <div className="space-y-1 text-[11px]">
                {/* Reçu */}
                <div className="flex items-center justify-between">
                  <span className="text-[var(--pos-text-muted)]">
                    Montant reçu
                  </span>
                  <span className="pos-mono font-semibold text-[var(--pos-text)]">
                    {formatFcfa(montantRecu)}
                  </span>
                </div>
                {/* Net */}
                <div className="flex items-center justify-between">
                  <span className="text-[var(--pos-text-muted)]">
                    Net à payer
                  </span>
                  <span className="pos-mono font-semibold text-[var(--pos-text)]">
                    {formatFcfa(netAPayer)}
                  </span>
                </div>
                {/* Séparateur */}
                <div className="border-t border-dashed border-[var(--pos-border-light)]" />

                {/* Monnaie à rendre (uniquement pour espèces) */}
                {methode === "especes" && (
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1 text-[var(--pos-text-muted)]">
                      <Coins className="h-3 w-3" />
                      Monnaie à rendre
                    </span>
                    <span
                      className={`pos-mono font-bold ${
                        monnaieARendre > 0
                          ? "text-[var(--pos-orange)]"
                          : "text-[var(--pos-green)]"
                      }`}
                    >
                      {formatFcfa(monnaieARendre)}
                      {monnaieARendre === 0 && (
                        <CheckCircle2 className="ml-1 inline h-3 w-3" />
                      )}
                    </span>
                  </div>
                )}

                {/* Reste à payer (acompte) */}
                <div className="flex items-center justify-between">
                  <span className="text-[var(--pos-text-muted)]">
                    Reste à payer
                  </span>
                  <span
                    className={`pos-mono font-bold ${
                      reste > 0
                        ? "text-[var(--pos-danger)]"
                        : "text-[var(--pos-green)]"
                    }`}
                  >
                    {formatFcfa(reste)}
                    {reste === 0 && (
                      <CheckCircle2 className="ml-1 inline h-3 w-3" />
                    )}
                  </span>
                </div>
              </div>

              {/* Note contextuelle selon le statut */}
              {statut === "impaye" && (
                <p className="mt-1.5 flex items-start gap-1 text-[9px] italic text-[var(--pos-text-muted)]">
                  <Info className="mt-px h-2.5 w-2.5 shrink-0" />
                  Commande IMPAYÉE — le client réglera ultérieurement.
                </p>
              )}
              {statut === "acompte" && (
                <p className="mt-1.5 flex items-start gap-1 text-[9px] italic text-[var(--pos-orange)]">
                  <AlertTriangle className="mt-px h-2.5 w-2.5 shrink-0" />
                  Acompte partiel — solde de {formatFcfa(reste)} à régler.
                </p>
              )}
              {statut === "paye" && (
                <p className="mt-1.5 flex items-start gap-1 text-[9px] italic text-[var(--pos-green)]">
                  <CheckCircle2 className="mt-px h-2.5 w-2.5 shrink-0" />
                  Paiement complet encaissé.
                </p>
              )}
            </div>
          </div>
        )}

        {/* ── 6. Message si « Pas de paiement » sélectionné ─────────────── */}
        {pasDePaiement && !panierVide && (
          <div className="rounded-md border border-dashed border-[var(--pos-border)] bg-[var(--pos-surface)] px-2.5 py-2 text-[10px] text-[var(--pos-text-muted)]">
            <p className="flex items-center gap-1.5 font-medium text-[var(--pos-text)]">
              <Ban className="h-3 w-3" />
              Pas de paiement maintenant
            </p>
            <p className="mt-0.5">
              La commande sera créée avec le statut{" "}
              <span className="font-semibold text-[var(--pos-danger)]">
                IMPAYÉ
              </span>
              . Le client réglera au retrait ou plus tard.
            </p>
          </div>
        )}

        {/* ── 7. Note légale discrète ───────────────────────────────────── */}
        {modeChoisi && (
          <p className="flex items-start gap-1 text-[9px] italic text-[var(--pos-text-muted)]">
            <Info className="mt-px h-2.5 w-2.5 shrink-0" />
            Encaissement enregistré au comptoir — le montant payé est tracé dans
            l'historique de la commande.
          </p>
        )}

        {/* Developer safety net — ne devrait jamais s'afficher */}
        {modeManquant && (
          <p className="text-[9px] text-[var(--pos-orange)]">
            Sélectionnez un mode de paiement.
          </p>
        )}
      </div>
    </CollapsibleSection>
  );
}

export const PaymentSummary = memo(PaymentSummaryImpl);
