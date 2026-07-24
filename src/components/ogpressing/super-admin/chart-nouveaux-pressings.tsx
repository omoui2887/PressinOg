/**
 * OgPressing — Graphique "Nouveaux pressings actifs par mois"
 * ----------------------------------------------------------
 * Line chart Recharts (client component) affichant l'évolution du nombre
 * de nouveaux pressings (statut 'actif') activés par mois sur les 6
 * derniers mois.
 *
 * Reçoit les données déjà agrégées depuis le Server Component parent
 * (pas d'appel Supabase ici → chargement rapide, pas de flash).
 */
"use client";

import {
  ResponsiveContainer,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Area,
  AreaChart,
} from "recharts";
import { TrendingUp } from "lucide-react";

export interface ChartPoint {
  /** Libellé du mois (ex : "janv."). */
  month: string;
  /** Nombre de pressings activés ce mois-là. */
  count: number;
}

interface ChartNouveauxPressingsProps {
  data: ChartPoint[];
}

/** Tooltip personnalisé pour respecter le design system. */
function ChartTooltip({
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
        <span className="font-bold">{payload[0].value}</span>{" "}
        {payload[0].value > 1 ? "nouveaux pressings" : "nouveau pressing"}
      </p>
    </div>
  );
}

export function ChartNouveauxPressings({ data }: ChartNouveauxPressingsProps) {
  const total = data.reduce((sum, d) => sum + d.count, 0);
  const isEmpty = total === 0;

  return (
    <div className="w-full">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <TrendingUp className="size-4 text-primary" />
          <span>Total 6 mois :</span>
          <span className="font-bold text-foreground">{total}</span>
          <span>pressings activés</span>
        </div>
      </div>

      {isEmpty ? (
        <div className="flex h-[260px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-muted/20 text-center">
          <TrendingUp className="size-8 text-muted-foreground/50" />
          <p className="text-sm font-medium text-foreground">
            Aucun pressing activé sur les 6 derniers mois
          </p>
          <p className="max-w-xs text-xs text-muted-foreground">
            Les nouveaux pressings apparaîtront ici dès qu&apos;un code
            d&apos;activation sera utilisé.
          </p>
        </div>
      ) : (
        <div className="h-[260px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={data}
              margin={{ top: 8, right: 12, bottom: 0, left: -16 }}
            >
              <defs>
                <linearGradient id="gradPressings" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor="oklch(0.546 0.215 262.88)"
                    stopOpacity={0.25}
                  />
                  <stop
                    offset="95%"
                    stopColor="oklch(0.546 0.215 262.88)"
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="oklch(0.922 0 0)"
                vertical={false}
              />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 12, fill: "oklch(0.556 0 0)" }}
                tickLine={false}
                axisLine={{ stroke: "oklch(0.922 0 0)" }}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 12, fill: "oklch(0.556 0 0)" }}
                tickLine={false}
                axisLine={false}
                width={32}
              />
              <Tooltip
                content={<ChartTooltip />}
                cursor={{ stroke: "oklch(0.546 0.215 262.88)", strokeWidth: 1, strokeDasharray: "3 3" }}
              />
              <Area
                type="monotone"
                dataKey="count"
                name="Nouveaux pressings"
                stroke="oklch(0.546 0.215 262.88)"
                strokeWidth={2.5}
                fill="url(#gradPressings)"
                dot={{ r: 4, fill: "oklch(0.546 0.215 262.88)", strokeWidth: 2, stroke: "#fff" }}
                activeDot={{ r: 6 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
