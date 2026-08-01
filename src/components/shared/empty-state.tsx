/**
 * OgPressing — EmptyState
 * ------------------------
 * Composant générique affiché quand une liste est vide (aucune commande,
 * aucun client, aucun employé, etc.).
 *
 * Props :
 *   - icon    : icône lucide-react (optionnel, default : Inbox)
 *   - title   : titre court (ex : "Aucun client trouvé")
 *   - description : texte d'aide (ex : "Modifiez votre recherche…")
 *   - action  : bouton/lien optionnel (ReactNode, ex : <Button>Ajouter</Button>)
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
  className?: string;
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  compact = false,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border border-dashed text-center",
        compact ? "py-10" : "py-16",
        className
      )}
      role="status"
      aria-live="polite"
    >
      <span
        className={cn(
          "flex items-center justify-center rounded-full bg-muted text-muted-foreground",
          compact ? "size-11" : "size-14"
        )}
        aria-hidden
      >
        <Icon className={compact ? "size-5" : "size-7"} />
      </span>
      <p className="mt-3 font-medium text-foreground">{title}</p>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
