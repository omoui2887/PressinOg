/**
 * <DatePanel /> — Dates de dépôt et de retrait.
 * Dépôt prérempli (now) + éditable. Retrait calculé auto (J+48h, J+24h si
 * Express), modifiable. Raccourcis +24h/+48h/+72h. Avertissement fermeture.
 */
"use client";
import { memo } from "react";
import { Calendar, Clock, AlertTriangle } from "lucide-react";
import {
  toDateInputValue,
  toTimeInputValue,
  isoFromDateTime,
} from "@/lib/pos/format";

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
  const depotDate = new Date(dateDepot);
  const jourDepot = Number.isNaN(depotDate.getTime()) ? null : depotDate.getDate();
  return (
    <div className="pos-panel p-2.5">
      <div className="flex items-start gap-2.5">
        {/* Mini calendrier stylisé */}
        <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded border border-[var(--pos-border)] bg-[var(--pos-primary-50)]">
          <Calendar className="h-4 w-4 text-[var(--pos-primary)]" />
          <span className="pos-mono text-[10px] font-bold text-[var(--pos-primary-dark)]">
            {jourDepot ?? "—"}
          </span>
        </div>

        <div className="min-w-0 flex-1 space-y-1.5">
          {/* Ligne 1 : Dépôt */}
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
            <span className="text-[11px] text-[var(--pos-text-muted)]">
              Dépôt le :
            </span>
            <input
              type="date"
              value={toDateInputValue(dateDepot)}
              onChange={(e) => {
                const t = toTimeInputValue(dateDepot);
                onDepotChange(isoFromDateTime(e.target.value, t));
              }}
              className="h-6 rounded border border-[var(--pos-border)] px-1 text-[11px] outline-none focus:border-[var(--pos-primary)]"
              aria-label="Date de dépôt"
            />
            <span className="text-[11px] text-[var(--pos-text-muted)]">à :</span>
            <div className="relative">
              <Clock className="pointer-events-none absolute left-1 top-1/2 h-3 w-3 -translate-y-1/2 text-[var(--pos-text-muted)]" />
              <input
                type="time"
                value={toTimeInputValue(dateDepot)}
                onChange={(e) => {
                  const d = toDateInputValue(dateDepot);
                  onDepotChange(isoFromDateTime(d, e.target.value));
                }}
                className="pos-mono h-6 rounded border border-[var(--pos-border)] pl-5 pr-1 text-[11px] outline-none focus:border-[var(--pos-primary)]"
                aria-label="Heure de dépôt"
              />
            </div>
          </div>

          {/* Ligne 2 : Retrait */}
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
            <span className="text-[11px] text-[var(--pos-text-muted)]">
              À Retirer le :
            </span>
            <input
              type="date"
              value={toDateInputValue(dateRetrait)}
              onChange={(e) => {
                const t = toTimeInputValue(dateRetrait);
                onRetraitChange(isoFromDateTime(e.target.value, t));
              }}
              className="h-6 rounded border border-[var(--pos-border)] px-1 text-[11px] outline-none focus:border-[var(--pos-primary)]"
              aria-label="Date de retrait"
            />
            <span className="text-[11px] text-[var(--pos-text-muted)]">à :</span>
            <div className="relative">
              <Clock className="pointer-events-none absolute left-1 top-1/2 h-3 w-3 -translate-y-1/2 text-[var(--pos-text-muted)]" />
              <input
                type="time"
                value={toTimeInputValue(dateRetrait)}
                onChange={(e) => {
                  const d = toDateInputValue(dateRetrait);
                  onRetraitChange(isoFromDateTime(d, e.target.value));
                }}
                className="pos-mono h-6 rounded border border-[var(--pos-border)] pl-5 pr-1 text-[11px] outline-none focus:border-[var(--pos-primary)]"
                aria-label="Heure de retrait"
              />
            </div>
          </div>

          {/* Raccourcis tactiles */}
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-[var(--pos-text-muted)]">
              Raccourcis :
            </span>
            {[24, 48, 72].map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => onShift(h)}
                className="rounded border border-[var(--pos-border)] bg-white px-1.5 py-0.5 text-[10px] font-medium text-[var(--pos-primary)] hover:border-[var(--pos-primary)] hover:bg-[var(--pos-primary-50)]"
                title={`Retrait dans ${h} heures`}
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
      </div>
    </div>
  );
}

export const DatePanel = memo(DatePanelImpl);
