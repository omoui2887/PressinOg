/**
 * <DatePanel /> — Dates de dépôt et de retrait (carte repliable).
 * Dépôt prérempli (now) + éditable. Retrait calculé auto (J+48h, J+24h si
 * Express), modifiable. Raccourcis +24h/+48h/+72h sur la date de retrait.
 * Avertissement fermeture.
 *
 * Repliable via <CollapsibleSection/> : le résumé d'en-tête affiche la date
 * de retrait formatée (la plus importante pour le client).
 */
"use client";
import { memo } from "react";
import { Calendar, Clock, AlertTriangle } from "lucide-react";
import {
  toDateInputValue,
  toTimeInputValue,
  isoFromDateTime,
  formatDateFr,
} from "@/lib/pos/format";
import { CollapsibleSection } from "./collapsible-section";

interface DatePanelProps {
  dateDepot: string; // ISO
  dateRetrait: string; // ISO
  onDepotChange: (iso: string) => void;
  onRetraitChange: (iso: string) => void;
  onShift: (hours: number) => void;
}

/** Jours de fermeture (dimanche par défaut — config pressing future). */
const FERMETURE_JOURS = [0]; // 0 = dimanche

function jourFermeture(iso: string): boolean {
  const d = new Date(iso).getDay();
  return FERMETURE_JOURS.includes(d);
}

function DatePanelImpl({
  dateDepot,
  dateRetrait,
  onDepotChange,
  onRetraitChange,
  onShift,
}: DatePanelProps) {
  const fermeture = jourFermeture(dateRetrait);
  // Résumé : date de retrait formatée (la plus utile au comptoir).
  const summary = `Retrait ${formatDateFr(dateRetrait)} · ${toTimeInputValue(dateRetrait)}`;

  return (
    <CollapsibleSection
      title="Délais"
      icon={<Calendar className="h-4 w-4" />}
      summary={summary}
      defaultOpen={true}
    >
      <div className="space-y-2">
        {/* Ligne 1 : Dépôt */}
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
          <span className="w-[64px] shrink-0 text-[11px] text-[var(--pos-text-muted)]">
            Dépôt :
          </span>
          <input
            type="date"
            value={toDateInputValue(dateDepot)}
            onChange={(e) => {
              const t = toTimeInputValue(dateDepot);
              onDepotChange(isoFromDateTime(e.target.value, t));
            }}
            className="h-7 rounded border border-[var(--pos-border)] px-1.5 text-[11px] outline-none focus:border-[var(--pos-primary)]"
            aria-label="Date de dépôt"
          />
          <div className="relative">
            <Clock className="pointer-events-none absolute left-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-[var(--pos-text-muted)]" />
            <input
              type="time"
              value={toTimeInputValue(dateDepot)}
              onChange={(e) => {
                const d = toDateInputValue(dateDepot);
                onDepotChange(isoFromDateTime(d, e.target.value));
              }}
              className="pos-mono h-7 rounded border border-[var(--pos-border)] pl-6 pr-1.5 text-[11px] outline-none focus:border-[var(--pos-primary)]"
              aria-label="Heure de dépôt"
            />
          </div>
        </div>

        {/* Ligne 2 : Retrait */}
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
          <span className="w-[64px] shrink-0 text-[11px] text-[var(--pos-text-muted)]">
            Retrait :
          </span>
          <input
            type="date"
            value={toDateInputValue(dateRetrait)}
            onChange={(e) => {
              const t = toTimeInputValue(dateRetrait);
              onRetraitChange(isoFromDateTime(e.target.value, t));
            }}
            className="h-7 rounded border border-[var(--pos-border)] px-1.5 text-[11px] outline-none focus:border-[var(--pos-primary)]"
            aria-label="Date de retrait"
          />
          <div className="relative">
            <Clock className="pointer-events-none absolute left-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-[var(--pos-text-muted)]" />
            <input
              type="time"
              value={toTimeInputValue(dateRetrait)}
              onChange={(e) => {
                const d = toDateInputValue(dateRetrait);
                onRetraitChange(isoFromDateTime(d, e.target.value));
              }}
              className="pos-mono h-7 rounded border border-[var(--pos-border)] pl-6 pr-1.5 text-[11px] outline-none focus:border-[var(--pos-primary)]"
              aria-label="Heure de retrait"
            />
          </div>
        </div>

        {/* Raccourcis : ajoutent des heures à la date de retrait */}
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[10px] text-[var(--pos-text-muted)]">
            Retrait dans :
          </span>
          {[24, 48, 72].map((h) => (
            <button
              key={h}
              type="button"
              onClick={() => onShift(h)}
              className="rounded border border-[var(--pos-border)] bg-white px-2 py-0.5 text-[10px] font-medium text-[var(--pos-primary)] hover:border-[var(--pos-primary)] hover:bg-[var(--pos-primary-50)]"
              title={`Repousser le retrait de ${h} heures`}
            >
              +{h}h
            </button>
          ))}
        </div>

        {/* Avertissement fermeture */}
        {fermeture && (
          <div className="flex items-center gap-1 text-[10px] text-[var(--pos-orange)]">
            <AlertTriangle className="h-3 w-3" />
            Le retrait tombe un jour de fermeture du pressing.
          </div>
        )}
      </div>
    </CollapsibleSection>
  );
}

export const DatePanel = memo(DatePanelImpl);
