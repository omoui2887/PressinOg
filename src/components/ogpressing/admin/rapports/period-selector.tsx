/**
 * e-pressing — PeriodSelector (LOT 12.1)
 * ---------------------------------------
 * Sélecteur de période pour la page /admin/rapports.
 *
 * 4 options : Aujourd'hui, Cette semaine, Ce mois-ci, Période personnalisée.
 * Les 3 premières sont des onglets rapides (un clic = période calculée
 * automatiquement côté serveur via computePeriode). La 4e révèle 2 inputs
 * date (Début / Fin) au format YYYY-MM-DD.
 *
 * Implémentation : shadcn Tabs utilisée comme contrôle segmenté. Les
 * TabsContent ne sont pas utilisés (les inputs date sont rendus
 * conditionnellement sous la TabsList pour garder un layout simple et
 * responsive).
 *
 * Mobile-first :
 *   - TabsList scrollable horizontalement sur mobile (4 libellés longs)
 *   - Inputs date empilés verticalement sur petit écran, côte à côte sur sm+
 *   - Zones tactiles ≥ 44px (h-11 sur inputs)
 */
"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  OPTIONS_PERIODE,
  type PeriodeRapport,
} from "./rapports-helpers";

interface PeriodSelectorProps {
  periode: PeriodeRapport;
  onPeriodeChange: (p: PeriodeRapport) => void;
  customStart: string;
  customEnd: string;
  onCustomStartChange: (s: string) => void;
  onCustomEndChange: (s: string) => void;
}

export function PeriodSelector({
  periode,
  onPeriodeChange,
  customStart,
  customEnd,
  onCustomStartChange,
  onCustomEndChange,
}: PeriodSelectorProps) {
  return (
    <div className="space-y-3">
      <Tabs
        value={periode}
        onValueChange={(v) => onPeriodeChange(v as PeriodeRapport)}
        className="w-full"
      >
        <TabsList className="flex h-auto w-full overflow-x-auto sm:w-auto">
          {OPTIONS_PERIODE.map((opt) => (
            <TabsTrigger
              key={opt.value}
              value={opt.value}
              className="min-w-max flex-1 px-3 py-2 text-xs sm:flex-none sm:text-sm"
            >
              {opt.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {periode === "perso" && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="rapport-date-start" className="text-sm font-medium">
              Début
            </Label>
            <Input
              id="rapport-date-start"
              type="date"
              value={customStart}
              onChange={(e) => onCustomStartChange(e.target.value)}
              className="h-11"
              aria-label="Date de début de la période personnalisée"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rapport-date-end" className="text-sm font-medium">
              Fin
            </Label>
            <Input
              id="rapport-date-end"
              type="date"
              value={customEnd}
              onChange={(e) => onCustomEndChange(e.target.value)}
              className="h-11"
              aria-label="Date de fin de la période personnalisée"
            />
          </div>
        </div>
      )}
    </div>
  );
}
