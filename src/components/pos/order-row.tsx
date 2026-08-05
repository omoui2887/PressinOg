/**
 * <OrderRow /> — Ligne du panier.
 * Actions (−, corbeille, +) · Désignation · P.U · Qté · Total.
 * + Express (liseré or) + note courte par ligne.
 */
"use client";
import { memo, useState } from "react";
import { Minus, Plus, Trash2, Zap, Pencil, Check } from "lucide-react";
import type { PosCartLine } from "@/lib/pos/types";
import { formatFcfa } from "@/lib/pos/format";
import { totalLine } from "@/lib/pos/calc";

interface OrderRowProps {
  line: PosCartLine;
  onInc: () => void;
  onDec: () => void;
  onRemove: () => void;
  onQty: (qty: number) => void;
  onToggleExpress: () => void;
  onNote: (note: string) => void;
}

function OrderRowImpl({
  line,
  onInc,
  onDec,
  onRemove,
  onQty,
  onToggleExpress,
  onNote,
}: OrderRowProps) {
  const [editingNote, setEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState(line.note ?? "");

  const saveNote = () => {
    onNote(noteDraft.trim());
    setEditingNote(false);
  };

  return (
    <tr
      className="pos-table-row pos-express-line-when-active"
      data-express={line.express}
      style={line.express ? { boxShadow: "inset 3px 0 0 0 var(--pos-gold)" } : undefined}
    >
      {/* Action */}
      <td className="px-1 py-1.5 text-center align-middle">
        <div className="flex items-center justify-center gap-1">
          <button
            type="button"
            onClick={onDec}
            className="pos-action-btn"
            data-variant="minus"
            aria-label="Diminuer la quantité"
          >
            <Minus className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="pos-action-btn"
            data-variant="delete"
            aria-label="Supprimer la ligne"
          >
            <Trash2 className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={onInc}
            className="pos-action-btn"
            data-variant="plus"
            aria-label="Augmenter la quantité"
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>
      </td>

      {/* Désignation : nom de l'article (principal) + service (secondaire) */}
      <td className="px-2 py-1.5 align-middle">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-1">
            <span className="line-clamp-2 text-[12px] font-medium leading-tight text-[var(--pos-text)]">
              {line.article.catalogue_nom}
            </span>
          </div>
          {/* Service associé (secondaire, discret) */}
          <span className="text-[10px] leading-tight text-[var(--pos-text-muted)]">
            {line.article.service_nom}
          </span>
          {/* Express toggle + note */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onToggleExpress}
              className={`flex items-center gap-0.5 rounded px-1 py-0.5 text-[9px] font-semibold transition ${
                line.express
                  ? "bg-[#FBF3DD] text-[var(--pos-gold)] ring-1 ring-[var(--pos-gold)]"
                  : "bg-[var(--pos-primary-50)] text-[var(--pos-text-muted)] hover:text-[var(--pos-gold)]"
              }`}
              title="Article Express (majoration +25 %, retrait raccourci)"
              aria-pressed={line.express}
            >
              <Zap className="h-2.5 w-2.5" />
              EXPRESS
            </button>
            {editingNote ? (
              <span className="flex items-center gap-0.5">
                <input
                  autoFocus
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveNote();
                    if (e.key === "Escape") {
                      setNoteDraft(line.note ?? "");
                      setEditingNote(false);
                    }
                  }}
                  placeholder="note courte…"
                  className="h-5 w-24 rounded border border-[var(--pos-border)] px-1 text-[10px] outline-none focus:border-[var(--pos-primary)]"
                />
                <button
                  type="button"
                  onClick={saveNote}
                  className="text-[var(--pos-primary)]"
                  aria-label="Enregistrer la note"
                >
                  <Check className="h-3 w-3" />
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setNoteDraft(line.note ?? "");
                  setEditingNote(true);
                }}
                className="flex items-center gap-0.5 text-[9px] text-[var(--pos-text-muted)] hover:text-[var(--pos-primary)]"
                title="Ajouter une note"
              >
                <Pencil className="h-2.5 w-2.5" />
                {line.note ? <span className="italic">{line.note}</span> : "note"}
              </button>
            )}
          </div>
        </div>
      </td>

      {/* P.U */}
      <td className="pos-mono px-2 py-1.5 text-right text-[12px] align-middle">
        {formatFcfa(line.article.prix)}
      </td>

      {/* Qté */}
      <td className="px-1 py-1.5 text-center align-middle">
        <input
          type="number"
          min={1}
          value={line.quantite}
          onChange={(e) => onQty(parseInt(e.target.value, 10) || 0)}
          className="pos-mono h-6 w-10 rounded border border-[var(--pos-border)] text-center text-[12px] outline-none focus:border-[var(--pos-primary)]"
          aria-label="Quantité"
        />
      </td>

      {/* Total */}
      <td className="pos-mono px-2 py-1.5 text-right text-[12px] font-semibold align-middle">
        {formatFcfa(totalLine(line))}
      </td>
    </tr>
  );
}

export const OrderRow = memo(OrderRowImpl);
