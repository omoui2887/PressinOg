/**
 * <OrderTable /> — Tableau de commande (en-tête bleu + lignes + état vide).
 * Affiche le nombre total d'étiquettes QR à imprimer sous le tableau.
 */
"use client";
import { memo } from "react";
import { QrCode, ShoppingCart } from "lucide-react";
import type { PosCartLine } from "@/lib/pos/types";
import { computeTotalEtiquettes } from "@/lib/pos/calc";
import { OrderRow } from "./order-row";

interface OrderTableProps {
  lines: PosCartLine[];
  flashId: string | null;
  onInc: (id: string) => void;
  onDec: (id: string) => void;
  onRemove: (id: string) => void;
  onQty: (id: string, qty: number) => void;
  onToggleExpress: (id: string) => void;
  onNote: (id: string, note: string) => void;
}

function OrderTableImpl({
  lines,
  flashId,
  onInc,
  onDec,
  onRemove,
  onQty,
  onToggleExpress,
  onNote,
}: OrderTableProps) {
  const etiquettes = computeTotalEtiquettes(lines);
  return (
    <div className="pos-panel overflow-hidden">
      <table className="w-full border-collapse">
        <thead>
          <tr className="pos-table-head">
            <th className="w-[84px] px-1 py-1.5 text-center text-[10px] font-semibold uppercase tracking-wide">
              Action
            </th>
            <th className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide">
              Désignation
            </th>
            <th className="w-[70px] px-2 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wide">
              P.U
            </th>
            <th className="w-[52px] px-2 py-1.5 text-center text-[10px] font-semibold uppercase tracking-wide">
              Qté
            </th>
            <th className="w-[80px] px-2 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wide">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {lines.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-2 py-6">
                <div className="flex flex-col items-center justify-center gap-1.5 text-center text-[var(--pos-text-muted)]">
                  <ShoppingCart className="h-7 w-7" />
                  <p className="text-[13px] font-medium text-[var(--pos-text)]">
                    Aucun article dans la commande
                  </p>
                  <p className="text-[11px]">
                    Sélectionnez un article à gauche pour commencer.
                  </p>
                </div>
              </td>
            </tr>
          ) : (
            lines.map((line) => (
              <OrderRow
                key={line.id}
                line={line}
                onInc={() => onInc(line.id)}
                onDec={() => onDec(line.id)}
                onRemove={() => onRemove(line.id)}
                onQty={(q) => onQty(line.id, q)}
                onToggleExpress={() => onToggleExpress(line.id)}
                onNote={(n) => onNote(line.id, n)}
              />
            ))
          )}
        </tbody>
      </table>
      {lines.length > 0 && (
        <div className="flex items-center justify-end gap-1.5 border-t border-[var(--pos-border-light)] bg-[var(--pos-primary-50)] px-2 py-1 text-[10px] text-[var(--pos-text-muted)]">
          <QrCode className="h-3 w-3" />
          <span className="pos-mono font-semibold">{etiquettes}</span>
          <span>étiquette{etiquettes > 1 ? "s" : ""} à imprimer</span>
        </div>
      )}
      {/* garder flashId référencé pour cohérence (effet visuel géré sur la carte) */}
      <span className="sr-only">{flashId}</span>
    </div>
  );
}

export const OrderTable = memo(OrderTableImpl);
