/**
 * <CollapsibleSection /> — Carte repliable pour les panneaux POS.
 * ===============================================================
 * En-tête cliquable (icône + titre + badge + résumé + chevron) et corps
 * qui se replie/déplie. Utilisé par <CustomerPanel/>, <DatePanel/> et
 * <PaymentSummary/> afin de désencombrer la colonne commande.
 *
 * - Variante "default" (bordure grise) ou "blue" (bordure primaire).
 * - État interne non contrôlé (useState) avec `defaultOpen`.
 * - Accessible : button aria-expanded, contenu caché via CSS quand fermé.
 * - Le résumé (summary) est tronqué avec ellipsis pour ne pas déborder.
 */
"use client";
import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

interface CollapsibleSectionProps {
  /** Titre court affiché dans l'en-tête (ex : "Client", "Délais"). */
  title: string;
  /** Icône lucide (déjà dimensionnée h-4 w-4). */
  icon?: ReactNode;
  /** Badge optionnel à droite (ex : statut de paiement). */
  badge?: ReactNode;
  /** Texte de résumé optionnel (ex : nom du client, date de retrait). */
  summary?: ReactNode;
  /** État ouvert par défaut. Défaut : true. */
  defaultOpen?: boolean;
  /** Variante visuelle. Défaut : "default". */
  variant?: "default" | "blue";
  /** Classe additionnelle pour le conteneur. */
  className?: string;
  children: ReactNode;
}

export function CollapsibleSection({
  title,
  icon,
  badge,
  summary,
  defaultOpen = true,
  variant = "default",
  className = "",
  children,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const panelClass = variant === "blue" ? "pos-panel-blue" : "pos-panel";

  return (
    <div className={`${panelClass} overflow-hidden ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-2.5 py-2 text-left transition-colors hover:bg-[var(--pos-primary-50)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pos-primary)]"
        aria-expanded={open}
        aria-controls={`collapsible-${title.replace(/\s+/g, "-").toLowerCase()}`}
      >
        {icon && (
          <span className="shrink-0 text-[var(--pos-primary)]">{icon}</span>
        )}
        <span className="shrink-0 text-[12px] font-semibold uppercase tracking-wide text-[var(--pos-text)]">
          {title}
        </span>
        {summary && (
          <span className="min-w-0 flex-1 truncate text-right text-[11px] text-[var(--pos-text-muted)]">
            {summary}
          </span>
        )}
        {badge && <span className="shrink-0">{badge}</span>}
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-[var(--pos-text-muted)] transition-transform duration-200 ${
            open ? "" : "-rotate-90"
          }`}
          aria-hidden
        />
      </button>
      {open && (
        <div className="border-t border-[var(--pos-border-light)] px-2.5 pb-2.5 pt-2">
          {children}
        </div>
      )}
    </div>
  );
}
