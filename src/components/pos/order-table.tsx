/**
 * <OrderTable /> — Tableau de commande groupé par linge.
 * ======================================================
 * Regroupe les lignes du panier par linge (catalogue_article) : un même
 * linge avec plusieurs traitements (Lavage + Repassage + ...) s'affiche
 * sur UNE SEULE ligne, avec les traitements listés en dessous du nom.
 *
 * En-tête : Action | Désignation | P.U | Qté | Total
 * Affiche le nombre total d'étiquettes QR à imprimer sous le tableau.
 *
 * Le regroupement est purement visuel — le store garde une PosCartLine par
 * traitement (pour le payload API), c'est l'UI qui agrège pour l'affichage.
 */
"use client";
import { memo, useMemo } from "react";
import { QrCode, ShoppingCart } from "lucide-react";
import type { PosCartLine } from "@/lib/pos/types";
import { computeTotalEtiquettes, groupCartLines } from "@/lib/pos/calc";
import { OrderRow } from "./order-row";

interface OrderTableProps {
  lines: PosCartLine[];
  flashId: string | null;
  /** Supprime toutes les lignes d'un groupe (corbeille). */
  onRemoveGroup: (lineIds: string[]) => void;
  /** Définit la quantité sur toutes les lignes d'un groupe. */
  onGroupQty: (lineIds: string[], qty: number) => void;
  /** Bascule Express sur toutes les lignes d'un groupe. */
  onToggleGroupExpress: (lineIds: string[]) => void;
  /** Définit la note sur toutes les lignes d'un groupe. */
  onGroupNote: (lineIds: string[], note: string) => void;
}

function OrderTableImpl({
  lines,
  flashId,
  onRemoveGroup,
  onGroupQty,
  onToggleGroupExpress,
  onGroupNote,
}: OrderTableProps) {
  const etiquettes = computeTotalEtiquettes(lines);
  // Regroupe les lignes par linge (catalogue_article) pour l'affichage.
  const groups = useMemo(() => groupCartLines(lines), [lines]);

  return (
    <div className="pos-panel overflow-hidden">
      <table className="w-full border-collapse">
        <thead>
          <tr className="pos-table-head">
            <th className="w-[52px] px-1 py-1.5 text-center text-[10px] font-semibold uppercase tracking-wide">
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
            groups.map((group) => {
              const lineIds = group.lines.map((l) => l.id);
              return (
                <OrderRow
                  key={group.key}
                  group={group}
                  onRemove={() => onRemoveGroup(lineIds)}
                  onQty={(q) => onGroupQty(lineIds, q)}
                  onToggleExpress={() => onToggleGroupExpress(lineIds)}
                  onNote={(n) => onGroupNote(lineIds, n)}
                />
              );
            })
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
