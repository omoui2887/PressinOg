/**
 * OgPressing — Composant StatusBadge
 * ----------------------------------
 * Badge de statut générique réutilisable dans toute l'app.
 *
 * Mapping statut → couleur sémantique du design system :
 *   - succés / payé / prêt      → secondary (vert)
 *   - en cours / traitement     → primary (bleu)
 *   - alerte / impayé / stock   → warning (ambre)
 *   - erreur / annulé           → danger (rouge)
 *   - neutre / recu / retiré    → muted (gris)
 *
 * Usage :
 *   <StatusBadge status="pret" label="Prêt" variant="success" />
 *   <StatusBadge status={article.statut} />
 */
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type StatusVariant =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "danger";

const variantClasses: Record<StatusVariant, string> = {
  neutral: "bg-muted text-muted-foreground hover:bg-muted",
  info: "bg-primary/10 text-primary hover:bg-primary/20 border-primary/20",
  success:
    "bg-secondary/10 text-secondary hover:bg-secondary/20 border-secondary/20",
  warning:
    "bg-warning/10 text-warning hover:bg-warning/20 border-warning/20",
  danger:
    "bg-danger/10 text-danger hover:bg-danger/20 border-danger/20",
};

interface StatusBadgeProps {
  /** Statut brut (ex : "pret", "en_traitement") — pour la key React */
  status: string;
  /** Libellé affiché (ex : "Prêt", "En traitement"). Si absent, utilise `status`. */
  label?: string;
  /** Variante visuelle. Si non fournie, tente de deviner selon le statut. */
  variant?: StatusVariant;
  className?: string;
}

/**
 * Devine la variante visuelle à partir du statut brut.
 * Convention nommée : on matche des mots-clés dans le statut.
 */
function guessVariant(status: string): StatusVariant {
  const s = status.toLowerCase();
  if (
    ["pret", "paye", "livre", "retire", "actif", "valide", "ok", "termine"].some(
      (k) => s.includes(k)
    )
  )
    return "success";
  if (["en_traitement", "en_cours", "en_livraison", "attente"].some((k) => s.includes(k)))
    return "info";
  if (["impaye", "alerte", "bas", "partiel", "reserve"].some((k) => s.includes(k)))
    return "warning";
  if (["annule", "erreur", "desactive", "rejete", "dechire", "tache"].some((k) => s.includes(k)))
    return "danger";
  return "neutral";
}

export function StatusBadge({
  status,
  label,
  variant,
  className,
}: StatusBadgeProps) {
  const v = variant ?? guessVariant(status);
  return (
    <Badge
      variant="outline"
      className={cn(
        "font-medium border-transparent",
        variantClasses[v],
        className
      )}
    >
      {label ?? status}
    </Badge>
  );
}
