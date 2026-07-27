/**
 * OgPressing — RapportsCharts (LOT 12.1)
 * ---------------------------------------
 * 3 composants graphiques Recharts pour la page /admin/rapports :
 *
 *   1. <ChartCaParJour />      — BarChart : CA par jour sur la période
 *   2. <ChartCaParMode />      — PieChart : répartition du CA par mode
 *                                 de paiement (espèces / mobile money / carte)
 *   3. <ChartCaParTypeService /> — BarChart : répartition du CA par type
 *                                 de service (lavage, repassage, ...)
 *
 * Design :
 *   - ResponsiveContainer width="100%" height={260} (mobile-first)
 *   - Custom Tooltips en français (montants formatés via formatFCFA)
 *   - Couleurs oklch concrètes (CHART_COLORS, COULEURS_MODE_PAIEMENT,
 *     COULEURS_TYPE_SERVICE) — Recharts n'accepte pas les variables CSS
 *   - Empty state : carte en pointillés avec icône + message (mirror
 *     ChartNouveauxPressings)
 */
"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { BarChart3, CreditCard, Layers } from "lucide-react";
import { formatFCFA, formatFCFACompact } from "@/lib/utils/format";
import {
  CHART_COLORS,
  type PointCaParJour,
  type PointCaParMode,
  type PointCaParTypeService,
} from "./rapports-helpers";

/* ========================================================================== */
/*  1. CA PAR JOUR — BarChart                                                  */
/* ========================================================================== */

function TooltipCaParJour({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number; name: string }>;
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-sm shadow-md">
      <p className="font-medium text-foreground">{label}</p>
      <p className="mt-0.5 text-primary">
        <span className="font-bold">{formatFCFA(payload[0].value)}</span>
      </p>
    </div>
  );
}

interface ChartCaParJourProps {
  data: PointCaParJour[];
}

export function ChartCaParJour({ data }: ChartCaParJourProps) {
  const total = data.reduce((sum, d) => sum + d.ca, 0);
  const isEmpty = total === 0;

  return (
    <div className="w-full">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <BarChart3 className="size-4 text-primary" />
          <span>Total période :</span>
          <span className="font-bold text-foreground">
            {formatFCFACompact(total)}
          </span>
        </div>
      </div>

      {isEmpty ? (
        <div className="flex h-[260px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-muted/20 text-center">
          <BarChart3 className="size-8 text-muted-foreground/50" />
          <p className="text-sm font-medium text-foreground">
            Aucune commande sur cette période
          </p>
          <p className="max-w-xs text-xs text-muted-foreground">
            Le chiffre d&apos;affaires par jour apparaîtra ici dès qu&apos;une
            commande sera enregistrée.
          </p>
        </div>
      ) : (
        <div className="h-[260px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              margin={{ top: 8, right: 12, bottom: 0, left: 8 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke={CHART_COLORS.muted}
                vertical={false}
              />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: CHART_COLORS.textMuted }}
                tickLine={false}
                axisLine={{ stroke: CHART_COLORS.muted }}
                interval="preserveStartEnd"
                minTickGap={8}
              />
              <YAxis
                tick={{ fontSize: 11, fill: CHART_COLORS.textMuted }}
                tickLine={false}
                axisLine={false}
                width={56}
                tickFormatter={(v: number) => formatFCFACompact(v)}
              />
              <Tooltip
                content={<TooltipCaParJour />}
                cursor={{
                  fill: CHART_COLORS.primary,
                  fillOpacity: 0.08,
                }}
              />
              <Bar
                dataKey="ca"
                name="CA"
                fill={CHART_COLORS.primary}
                radius={[4, 4, 0, 0]}
                maxBarSize={48}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

/* ========================================================================== */
/*  2. CA PAR MODE DE PAIEMENT — PieChart                                       */
/* ========================================================================== */

function TooltipCaParMode({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{
    name: string;
    value: number;
    payload: PointCaParMode;
  }>;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const entry = payload[0];
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-sm shadow-md">
      <p className="font-medium text-foreground">{entry.name}</p>
      <p className="mt-0.5 text-primary">
        <span className="font-bold">{formatFCFA(entry.value)}</span>
      </p>
    </div>
  );
}

interface ChartCaParModeProps {
  data: PointCaParMode[];
}

export function ChartCaParMode({ data }: ChartCaParModeProps) {
  const isEmpty = data.length === 0;

  return (
    <div className="w-full">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <CreditCard className="size-4 text-primary" />
          <span>
            {isEmpty
              ? "Aucun paiement enregistré"
              : `${data.length} mode${data.length > 1 ? "s" : ""} de paiement`}
          </span>
        </div>
      </div>

      {isEmpty ? (
        <div className="flex h-[260px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-muted/20 text-center">
          <CreditCard className="size-8 text-muted-foreground/50" />
          <p className="text-sm font-medium text-foreground">
            Aucun paiement sur cette période
          </p>
          <p className="max-w-xs text-xs text-muted-foreground">
            La répartition par mode de paiement (espèces, mobile money, carte)
            s&apos;affichera ici.
          </p>
        </div>
      ) : (
        <div className="h-[260px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="montant"
                nameKey="mode"
                cx="50%"
                cy="50%"
                outerRadius={80}
                innerRadius={42}
                paddingAngle={2}
                stroke="oklch(1 0 0)"
                strokeWidth={2}
              >
                {data.map((entry, idx) => (
                  <Cell
                    key={`cell-mode-${idx}`}
                    fill={entry.couleur}
                  />
                ))}
              </Pie>
              <Tooltip content={<TooltipCaParMode />} />
            </PieChart>
          </ResponsiveContainer>
          {/* Légende custom (mobile-friendly, évite le débordement Recharts) */}
          <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
            {data.map((entry, idx) => (
              <div
                key={`legend-mode-${idx}`}
                className="flex items-center gap-1.5 text-xs"
              >
                <span
                  className="size-3 rounded-sm"
                  style={{ backgroundColor: entry.couleur }}
                  aria-hidden
                />
                <span className="font-medium text-foreground">
                  {entry.mode}
                </span>
                <span className="text-muted-foreground">
                  {formatFCFACompact(entry.montant)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ========================================================================== */
/*  3. CA PAR TYPE DE SERVICE — BarChart                                        */
/* ========================================================================== */

function TooltipCaParTypeService({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number; name: string }>;
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-sm shadow-md">
      <p className="font-medium text-foreground">{label}</p>
      <p className="mt-0.5 text-primary">
        <span className="font-bold">{formatFCFA(payload[0].value)}</span>
      </p>
    </div>
  );
}

interface ChartCaParTypeServiceProps {
  data: PointCaParTypeService[];
}

export function ChartCaParTypeService({ data }: ChartCaParTypeServiceProps) {
  const isEmpty = data.length === 0;
  const total = data.reduce((sum, d) => sum + d.montant, 0);

  return (
    <div className="w-full">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Layers className="size-4 text-primary" />
          <span>
            {isEmpty
              ? "Aucun service vendu"
              : `Total : ${formatFCFACompact(total)}`}
          </span>
        </div>
      </div>

      {isEmpty ? (
        <div className="flex h-[260px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-muted/20 text-center">
          <Layers className="size-8 text-muted-foreground/50" />
          <p className="text-sm font-medium text-foreground">
            Aucune commande sur cette période
          </p>
          <p className="max-w-xs text-xs text-muted-foreground">
            La répartition du CA par type de service (lavage, repassage,
            nettoyage à sec, détachage, blanchisserie) s&apos;affichera ici.
          </p>
        </div>
      ) : (
        <div className="h-[260px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              layout="vertical"
              margin={{ top: 8, right: 16, bottom: 0, left: 8 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke={CHART_COLORS.muted}
                horizontal={false}
              />
              <XAxis
                type="number"
                tick={{ fontSize: 11, fill: CHART_COLORS.textMuted }}
                tickLine={false}
                axisLine={{ stroke: CHART_COLORS.muted }}
                tickFormatter={(v: number) => formatFCFACompact(v)}
              />
              <YAxis
                type="category"
                dataKey="type"
                tick={{ fontSize: 11, fill: CHART_COLORS.textMuted }}
                tickLine={false}
                axisLine={false}
                width={110}
              />
              <Tooltip
                content={<TooltipCaParTypeService />}
                cursor={{
                  fill: CHART_COLORS.primary,
                  fillOpacity: 0.08,
                }}
              />
              <Bar
                dataKey="montant"
                name="CA"
                radius={[0, 4, 4, 0]}
                maxBarSize={32}
              >
                {data.map((entry, idx) => (
                  <Cell
                    key={`cell-type-${idx}`}
                    fill={entry.couleur}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
