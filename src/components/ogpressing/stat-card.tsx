/**
 * OgPressing — StatCard
 * ---------------------
 * Carte de statistique réutilisable pour les dashboards (Super Admin,
 * Admin pressing, Personnel). Affiche un libellé, une valeur principale,
 * une icône colorée, une description optionnelle et une tendance optionnelle.
 *
 * Composant de présentation (pas de "use client", pas de hooks) → utilisable
 * côté serveur comme client.
 *
 * Usage :
 *   <StatCard
 *     label="Pressings actifs"
 *     value={12}
 *     icon={Building2}
 *     accent="primary"
 *     description="Tous statuts confondus"
 *   />
 */
import { type LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type StatAccent = "primary" | "secondary" | "warning" | "danger";

const accentIcon: Record<StatAccent, string> = {
  primary: "bg-primary/10 text-primary",
  secondary: "bg-secondary/10 text-secondary",
  warning: "bg-warning/15 text-warning",
  danger: "bg-danger/10 text-danger",
};

const accentTrend: Record<StatAccent, string> = {
  primary: "text-primary",
  secondary: "text-secondary",
  warning: "text-warning",
  danger: "text-danger",
};

interface StatCardProps {
  /** Libellé court (ex : "Pressings actifs"). */
  label: string;
  /** Valeur principale affichée en grand (nombre ou chaîne déjà formatée). */
  value: string | number;
  /** Icône lucide-react. */
  icon: LucideIcon;
  /** Couleur d'accent sémantique. */
  accent?: StatAccent;
  /** Texte d'aide sous la valeur. */
  description?: string;
  /** Tendance optionnelle (ex : "+12% vs mois dernier"). */
  trend?: {
    value: string;
    /** true = positif (vert), false = négatif (rouge), undefined = neutre. */
    positive?: boolean;
  };
  className?: string;
}

export function StatCard({
  label,
  value,
  icon: Icon,
  accent = "primary",
  description,
  trend,
  className,
}: StatCardProps) {
  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-medium text-muted-foreground">{label}</p>
            <p className="truncate text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              {value}
            </p>
          </div>
          <span
            className={cn(
              "flex size-11 shrink-0 items-center justify-center rounded-xl",
              accentIcon[accent]
            )}
            aria-hidden
          >
            <Icon className="size-5" />
          </span>
        </div>

        {(description || trend) && (
          <div className="mt-3 flex items-center gap-2 text-xs">
            {trend && (
              <span
                className={cn(
                  "font-semibold",
                  trend.positive === true
                    ? "text-secondary"
                    : trend.positive === false
                    ? "text-danger"
                    : accentTrend[accent]
                )}
              >
                {trend.value}
              </span>
            )}
            {description && (
              <span className="text-muted-foreground">{description}</span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
