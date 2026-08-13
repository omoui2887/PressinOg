/**
 * e-pressing — Composant StatusBadge (EMBELLISSEMENT §14)
 * -------------------------------------------------------
 * Badge de statut générique réutilisable dans toute l'app.
 *
 * ⭐ SOURCE UNIQUE DE VÉRITÉ : la variante visuelle d'un statut provient
 *    de `getStatutBadgeVariant()` (lib/workflow/commande-statut.ts) qui
 *    consulte 4 tables canoniques :
 *      - STATUT_COMMANDE_BADGE_VARIANTS  (recu, en_traitement, lave, ...)
 *      - STATUT_PAIEMENT_BADGE_VARIANTS  (paye, acompte, impaye)
 *      - STATUT_ARTICLE_BADGE_VARIANTS   (recu, en_traitement, lave, ...)
 *      - STATUT_BADGES_AUTRES            (express, en_retard, actif, ...)
 *
 *    On n'utilise PLUS `guessVariant()` par mots-clés — cela provoquait
 *    des incohérences (un statut "pret" pouvait apparaître en "success"
 *    sur un dashboard et en "info" ailleurs).
 *
 * Variantes disponibles (alignées sur le prompt §14) :
 *   - neutral       → gris muted (retiré, inactif)
 *   - slate         → gris ardoise (REÇU)
 *   - info          → bleu primary (EN TRAITEMENT, EN LIVRAISON, nouveau client)
 *   - cyan          → cyan (LAVÉ — eau, lavage)
 *   - violet        → violet doux (REPASSÉ — vapeur)
 *   - success       → vert secondary (PRÊT, PAYÉ, ACTIF)
 *   - successSolid  → vert foncé plein (LIVRÉ)
 *   - warning       → ambre (ACOMPTE, ESSAI, stock bas)
 *   - danger        → rouge (IMPAYÉ, ANNULÉ, EN RETARD, RUPTURE)
 *   - accent        → Or Textile (EXPRESS, premium)
 *   - editorialGold → Or cuivré #C5A03D sur fond glass doré (Phase 3-a, opt-in)
 *   - editorialIvory→ Ivoire chaud #F5F0E6 sur fond glass neutre (Phase 3-a, opt-in)
 *
 * Usage :
 *   <StatusBadge status="pret" />                              // ← auto-canonical
 *   <StatusBadge status="pret" label="Prêt" />                 // ← label FR explicite
 *   <StatusBadge status={c.statut} label={STATUT_COMMANDE_LABELS[c.statut]} />
 *   <StatusBadge status="express" label="Express" />           // ← Or Textile
 *
 * Pour forcer une variante (usage exceptionnel) :
 *   <StatusBadge status="custom" label="..." variant="info" />
 */
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getStatutBadgeVariant, type StatutBadgeVariant } from "@/lib/workflow/commande-statut";

/** Variante étendue — expose toutes les variantes canoniques. */
export type StatusVariant = StatutBadgeVariant;

const variantClasses: Record<StatutBadgeVariant, string> = {
  // Gris muted — neutre / archivé
  neutral:
    "bg-muted text-muted-foreground hover:bg-muted border-transparent",
  // Gris ardoise — REÇU (légèrement plus froid que muted)
  slate:
    "bg-slate-100 text-slate-700 hover:bg-slate-200 border-transparent dark:bg-slate-900/50 dark:text-slate-300",
  // Bleu primary — EN TRAITEMENT, EN LIVRAISON
  info: "bg-primary/10 text-primary hover:bg-primary/20 border-primary/20",
  // Cyan — LAVÉ (eau)
  cyan: "bg-cyan-100 text-cyan-700 hover:bg-cyan-200 border-cyan-200 dark:bg-cyan-950/50 dark:text-cyan-300",
  // Violet doux — REPASSÉ (vapeur)
  violet:
    "bg-violet-100 text-violet-700 hover:bg-violet-200 border-violet-200 dark:bg-violet-950/50 dark:text-violet-300",
  // Vert secondary — PRÊT, PAYÉ, ACTIF
  success:
    "bg-secondary/10 text-secondary hover:bg-secondary/20 border-secondary/20",
  // Vert foncé plein — LIVRÉ (terminé)
  successSolid:
    "bg-secondary text-secondary-foreground hover:bg-secondary/90 border-transparent shadow-sm",
  // Ambre — ACOMPTE, ESSAI, stock bas
  warning:
    "bg-warning/10 text-warning-700 dark:text-warning hover:bg-warning/20 border-warning/20",
  // Rouge — IMPAYÉ, ANNULÉ, EN RETARD
  danger:
    "bg-danger/10 text-danger hover:bg-danger/20 border-danger/20",
  // Or Textile — EXPRESS, premium
  accent:
    "bg-landing-accent/15 text-landing-accent-deep hover:bg-landing-accent/25 border-landing-accent/30 dark:text-landing-accent",
  // Or cuivré éditorial — Phase 3-a (opt-in, dashboards luxe navy)
  editorialGold:
    "bg-[rgba(197,160,61,0.1)] text-[#E8D6A0] hover:bg-[rgba(197,160,61,0.18)] border-[rgba(197,160,61,0.3)]",
  // Ivoire chaud éditorial — Phase 3-a (opt-in, dashboards luxe navy)
  editorialIvory:
    "bg-[rgba(245,240,230,0.05)] text-[#F5F0E6] hover:bg-[rgba(245,240,230,0.1)] border-[rgba(245,240,230,0.15)]",
};

interface StatusBadgeProps {
  /** Statut brut (ex : "pret", "en_traitement", "impaye", "express"). */
  status: string;
  /** Libellé affiché (ex : "Prêt", "En traitement"). Si absent, utilise `status`. */
  label?: string;
  /**
   * Variante visuelle FORCÉE.
   * ⚠️ À éviter : la variante canonique est déterminée automatiquement par
   * `getStatutBadgeVariant(status)`. Ne forcer la variante que pour des
   * cas exceptionnels (statut ad hoc non répertorié dans les tables).
   */
  variant?: StatutBadgeVariant;
  className?: string;
}

/**
 * Composant StatusBadge — variante canonique par défaut.
 *
 * La variante est déterminée par `getStatutBadgeVariant(status)` qui
 * consulte les 4 tables canoniques (commande, paiement, article, autres).
 * Si `variant` est passé en prop, il surcharge la variante canonique
 * (usage exceptionnel uniquement).
 */
export function StatusBadge({
  status,
  label,
  variant,
  className,
}: StatusBadgeProps) {
  const v = variant ?? getStatutBadgeVariant(status);
  return (
    <Badge
      variant="outline"
      className={cn(
        "font-medium border-transparent gap-1",
        variantClasses[v],
        className
      )}
    >
      {/* Pastille de couleur (rond plein à gauche du texte) — double
          encodage couleur + texte pour l'accessibilité (§25 : ne jamais
          utiliser la couleur comme seul moyen d'information). */}
      <span
        aria-hidden
        className={cn(
          "size-1.5 rounded-full",
          v === "neutral" && "bg-muted-foreground",
          v === "slate" && "bg-slate-500",
          v === "info" && "bg-primary",
          v === "cyan" && "bg-cyan-500",
          v === "violet" && "bg-violet-500",
          v === "success" && "bg-secondary",
          v === "successSolid" && "bg-secondary-foreground/40",
          v === "warning" && "bg-warning",
          v === "danger" && "bg-danger",
          v === "accent" && "bg-landing-accent",
          v === "editorialGold" && "bg-editorial-gold",
          v === "editorialIvory" && "bg-editorial-ivory"
        )}
      />
      {label ?? status}
    </Badge>
  );
}
