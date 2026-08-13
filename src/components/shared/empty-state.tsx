/**
 * e-pressing — EmptyState
 * ------------------------
 * Composant générique affiché quand une liste est vide (aucune commande,
 * aucun client, aucun employé, etc.).
 *
 * Props :
 *   - icon    : icône lucide-react (optionnel, default : Inbox)
 *   - title   : titre court (ex : "Aucun client trouvé")
 *   - description : texte d'aide (ex : "Modifiez votre recherche…")
 *   - action  : bouton/lien optionnel (ReactNode, ex : <Button>Ajouter</Button>)
 *   - variant : "default" (défaut, light theme) ou "editorial" (Phase 3-a,
 *               palette navy/or — bordure dashed dorée, fond doré léger,
 *               icône en cercle bg-editorial-gold/10, titre font-playfair,
 *               description en ivoire diminué).
 *
 * Composant de présentation (pas de "use client") → utilisable serveur + client.
 *
 * Usage :
 *   <EmptyState
 *     icon={Users}
 *     title="Aucun client"
 *     description="Ajoutez votre premier client pour commencer."
 *     action={<Button onClick={...}>Nouveau client</Button>}
 *   />
 *   <EmptyState variant="editorial" icon={Receipt} title="Aucun paiement" compact />
 */
import { Inbox, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  /** Icône lucide-react. Par défaut : Inbox. */
  icon?: LucideIcon;
  /** Titre affiché en gras. */
  title: string;
  /** Texte d'aide sous le titre. */
  description?: string;
  /** Action optionnelle (bouton, lien…). */
  action?: React.ReactNode;
  /** Compact = moins de padding (utile dans un panel réduit). */
  compact?: boolean;
  /** Variante visuelle (Phase 3-a). "default" = light theme (par défaut,
   *  inchangé). "editorial" = palette navy/or pour dashboards luxe. */
  variant?: "default" | "editorial";
  className?: string;
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  compact = false,
  variant = "default",
  className,
}: EmptyStateProps) {
  const isEditorial = variant === "editorial";
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border border-dashed text-center",
        compact ? "py-10" : "py-16",
        isEditorial
          ? "border-[rgba(197,160,61,0.2)] bg-[rgba(197,160,61,0.02)]"
          : "border-border",
        className
      )}
      role="status"
      aria-live="polite"
    >
      <span
        className={cn(
          "flex items-center justify-center rounded-full",
          compact ? "size-11" : "size-14",
          isEditorial
            ? "bg-editorial-gold/10 text-editorial-gold"
            : "bg-muted text-muted-foreground"
        )}
        aria-hidden
      >
        <Icon className={compact ? "size-5" : "size-7"} />
      </span>
      <p
        className={cn(
          "mt-3 font-medium",
          isEditorial
            ? "font-playfair text-editorial-ivory"
            : "text-foreground"
        )}
      >
        {title}
      </p>
      {description && (
        <p
          className={cn(
            "mt-1 max-w-sm text-sm",
            isEditorial
              ? "text-editorial-ivory-dim"
              : "text-muted-foreground"
          )}
        >
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
