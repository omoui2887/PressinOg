/**
 * <OrderRow /> — Ligne groupée du panier (un linge par ligne).
 * ============================================================
 * Affiche UN linge par ligne, avec ses traitements (Lavage, Repassage,
 * Nettoyage à sec, etc.) listés en dessous du nom du linge.
 *
 *   Désignation          | P.U        | Qté  | Total
 *   ---------------------|------------|------|----------
 *   Chemise              | 1 500 Fcfa |  2   | 3 000 Fcfa
 *     • Lavage           |            |      |
 *     • Repassage        |            |      |
 *
 * Le prix unitaire = somme des prix des traitements sélectionnés.
 * La quantité s'applique au linge entier (tous les traitements partagés).
 * Le total = P.U × Qté (avec majoration Express si activée).
 *
 * Colonne Action : UNIQUEMENT la corbeille (supprimer le linge).
 */
"use client";
import { memo, useState } from "react";
import { Trash2, Zap, Pencil, Check } from "lucide-react";
import type { PosCartGroup } from "@/lib/pos/calc";
import {
  groupPrixUnitaire,
  groupTotal,
  groupQuantite,
  groupIsExpress,
  groupNote,
} from "@/lib/pos/calc";
import { formatFcfa } from "@/lib/pos/format";

interface OrderRowProps {
  group: PosCartGroup;
  onRemove: () => void;
  onQty: (qty: number) => void;
  onToggleExpress: () => void;
  onNote: (note: string) => void;
}

function OrderRowImpl({
  group,
  onRemove,
  onQty,
  onToggleExpress,
  onNote,
}: OrderRowProps) {
  const [editingNote, setEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState(groupNote(group) ?? "");

  const isExpress = groupIsExpress(group);
  const quantite = groupQuantite(group);
  const prixUnitaire = groupPrixUnitaire(group);
  const total = groupTotal(group);

  const saveNote = () => {
    onNote(noteDraft.trim());
    setEditingNote(false);
  };

  return (
    <tr
      className="pos-table-row pos-express-line-when-active"
      data-express={isExpress}
      style={isExpress ? { boxShadow: "inset 3px 0 0 0 var(--pos-gold)" } : undefined}
    >
      {/* Action — UNIQUEMENT la corbeille */}
      <td className="px-1 py-1.5 text-center align-middle">
        <button
          type="button"
          onClick={onRemove}
          className="pos-action-btn"
          data-variant="delete"
          aria-label="Supprimer le linge"
          title="Supprimer ce linge et tous ses traitements"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </td>

      {/* Désignation : nom du linge (principal) + liste des traitements (secondaire) */}
      <td className="px-2 py-1.5 align-middle">
        <div className="flex flex-col gap-0.5">
          {/* Nom du linge (ligne principale) */}
          <div className="flex items-center gap-1">
            <span className="line-clamp-2 text-[12px] font-semibold leading-tight text-[var(--pos-text)]">
              {group.catalogue_nom}
              {group.is_custom && (
                <span className="ml-1 text-[9px] font-normal uppercase text-[var(--pos-text-muted)]">
                  (perso)
                </span>
              )}
            </span>
          </div>

          {/* Liste des traitements en dessous du linge */}
          {group.lines.length > 0 && (
            <ul className="flex flex-col gap-0 pl-1">
              {group.lines.map((line, idx) => (
                <li
                  key={line.id}
                  className="flex items-center gap-1 text-[10px] leading-tight text-[var(--pos-text-muted)]"
                >
                  <span className="text-[var(--pos-primary)]">•</span>
                  <span>{line.article.service_nom}</span>
                  {line.article.tarifConfigure === false && (
                    <span className="text-[8px] italic text-[var(--pos-danger)]">
                      non configuré
                    </span>
                  )}
                  {/* Prix individuel du traitement (si plusieurs traitements, aider la lisibilité) */}
                  {group.lines.length > 1 && (
                    <span className="pos-mono ml-auto text-[9px] text-[var(--pos-text-muted)]">
                      {formatFcfa(line.article.prix)}
                    </span>
                  )}
                  {idx < group.lines.length - 1 && null}
                </li>
              ))}
            </ul>
          )}

          {/* Express toggle + note (niveau groupe) */}
          <div className="flex items-center gap-1.5 pt-0.5">
            <button
              type="button"
              onClick={onToggleExpress}
              className={`flex items-center gap-0.5 rounded px-1 py-0.5 text-[9px] font-semibold transition ${
                isExpress
                  ? "bg-[#FBF3DD] text-[var(--pos-gold)] ring-1 ring-[var(--pos-gold)]"
                  : "bg-[var(--pos-primary-50)] text-[var(--pos-text-muted)] hover:text-[var(--pos-gold)]"
              }`}
              title="Linge Express (majoration +25 %, retrait raccourci)"
              aria-pressed={isExpress}
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
                      setNoteDraft(groupNote(group) ?? "");
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
                  setNoteDraft(groupNote(group) ?? "");
                  setEditingNote(true);
                }}
                className="flex items-center gap-0.5 text-[9px] text-[var(--pos-text-muted)] hover:text-[var(--pos-primary)]"
                title="Ajouter une note"
              >
                <Pencil className="h-2.5 w-2.5" />
                {groupNote(group) ? (
                  <span className="italic">{groupNote(group)}</span>
                ) : (
                  "note"
                )}
              </button>
            )}
          </div>
        </div>
      </td>

      {/* P.U — somme des prix des traitements */}
      <td className="pos-mono px-2 py-1.5 text-right text-[12px] align-middle">
        <span className="font-medium">{formatFcfa(prixUnitaire)}</span>
        {group.lines.length > 1 && (
          <div className="text-[9px] text-[var(--pos-text-muted)]">
            {group.lines.length} traitements
          </div>
        )}
      </td>

      {/* Qté — quantité du linge (appliquée à tous les traitements) */}
      <td className="px-1 py-1.5 text-center align-middle">
        <input
          type="number"
          min={1}
          value={quantite}
          onChange={(e) => onQty(parseInt(e.target.value, 10) || 0)}
          className="pos-mono h-6 w-10 rounded border border-[var(--pos-border)] text-center text-[12px] outline-none focus:border-[var(--pos-primary)]"
          aria-label="Quantité"
        />
      </td>

      {/* Total — P.U × Qté (avec majoration Express si activée) */}
      <td className="pos-mono px-2 py-1.5 text-right text-[12px] font-semibold align-middle">
        {formatFcfa(total)}
      </td>
    </tr>
  );
}

export const OrderRow = memo(OrderRowImpl);
