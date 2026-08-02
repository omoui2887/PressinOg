/**
 * OgPressing — StatCard (EMBELLISSEMENT §6 + §17 + ÉDITORIAL LX §5/§6F)
 * ------------------------------------------------
 * Carte de statistique réutilisable pour les dashboards (Super Admin,
 * Admin pressing, Personnel). Affiche un libellé, une valeur principale,
 * une icône colorée, une description optionnelle, une tendance optionnelle
 * et une barre d'accent décorative à gauche.
 *
 * Composant de présentation (pas de "use client", pas de hooks) → utilisable
 * côté serveur comme client.
 *
 * Améliorations EMBELLISSEMENT :
 *   - Barre d'accent verticale à gauche (4px) colorée selon l'accent →
 *     scan visuel immédiat des KPIs sans lire le libellé
 *   - Halo subtil au survol (glow-{accent}) → feedback discret
 *   - Sortie de fond léger au survol (translate-y -1px + shadow-md)
 *   - Pastille décorative en haut à droite (alternative à l'icône brute)
 *
 * Améliorations ÉDITORIAL LX (Phase 3-a, opt-in) :
 *   - accent="editorial" → barre/icône/tendance couleur or cuivré #C5A03D
 *     (utilitaire Tailwind bg-editorial-gold / text-editorial-gold)
 *   - premium={true} → ajoute .editorial-card-premium (glass + bordure or)
 *     + .ornate .ornate-tl .ornate-tr (coins losanges dorés haut-gauche/haut-droite)
 *   - Non-cassant : comportement par défaut inchangé.
 *
 * Usage :
 *   <StatCard
 *     label="Pressings actifs"
 *     value={12}
 *     icon={Building2}
 *     accent="primary"
 *     description="Tous statuts confondus"
 *   />
 *   <StatCard label="CA mensuel" value="4,2M" icon={TrendingUp}
 *     accent="editorial" premium isMonetary />
 */
import { type LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type StatAccent =
  | "primary"
  | "secondary"
  | "warning"
  | "danger"
  | "neutral"
  | "editorial";

const accentIcon: Record<StatAccent, string> = {
  primary: "bg-primary/10 text-primary",
  secondary: "bg-secondary/10 text-secondary",
  warning: "bg-warning/15 text-warning",
  danger: "bg-danger/10 text-danger",
  neutral: "bg-muted text-muted-foreground",
  editorial: "bg-editorial-gold/10 text-editorial-gold",
};

/** Barre d'accent verticale à gauche (4px de large, pleine hauteur). */
const accentBar: Record<StatAccent, string> = {
  primary: "bg-primary",
  secondary: "bg-secondary",
  warning: "bg-warning",
  danger: "bg-danger",
  neutral: "bg-muted-foreground/60",
  editorial: "bg-editorial-gold",
};

const accentTrend: Record<StatAccent, string> = {
  primary: "text-primary",
  secondary: "text-secondary",
  warning: "text-warning",
  danger: "text-danger",
  neutral: "text-muted-foreground",
  editorial: "text-editorial-gold",
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
  /** Délai d'apparition échelonné en ms (LOT 16.7 — stagger).
   *  Passer 0, 60, 120, 180... pour un effet cascade sur les dashboards. */
  delay?: number;
  /** Si true, la valeur est un montant FCFA → applique la classe .fcfa
   *  (mono + tabular-nums) pour aligner les chiffres entre cartes. */
  isMonetary?: boolean;
  /** Mode premium éditorial (Phase 3-a) — opt-in, non-cassant :
   *  ajoute .editorial-card-premium (glass + bordure or) et les ornements
   *  .ornate .ornate-tl .ornate-tr (coins losanges dorés en haut). */
  premium?: boolean;
  className?: string;
}

export function StatCard({
  label,
  value,
  icon: Icon,
  accent = "primary",
  description,
  trend,
  delay = 0,
  isMonetary = false,
  premium = false,
  className,
}: StatCardProps) {
  return (
    <Card
      className={cn(
        "relative animate-in fade-in-0 slide-in-from-bottom-2 duration-300 fill-both motion-reduce:animate-none overflow-hidden",
        "hover:shadow-md hover:-translate-y-px motion-reduce:hover:translate-y-0",
        "transition-all duration-fast ease-smooth",
        premium && "editorial-card-premium ornate ornate-tl ornate-tr",
        className
      )}
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Barre d'accent verticale à gauche (4px) — repère visuel immédiat */}
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-0 left-0 w-1",
          accentBar[accent]
        )}
      />
      <CardContent className="p-5 pl-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-medium text-muted-foreground">{label}</p>
            <p
              className={cn(
                "truncate text-2xl font-bold tracking-tight text-foreground sm:text-3xl",
                isMonetary && "fcfa"
              )}
            >
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
