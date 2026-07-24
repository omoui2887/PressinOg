/**
 * OgPressing — ClientsFilters
 * ----------------------------
 * Barre de recherche + toggle "impayés uniquement" pour la liste des clients.
 *
 * Client component : gère l'état local de la recherche (input contrôlé) +
 * debounce 300ms côté parent via onChange. Le toggle impayés est immédiat.
 */
"use client";

import { Search, AlertCircle, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface ClientsFiltersProps {
  query: string;
  onQueryChange: (value: string) => void;
  impayesOnly: boolean;
  onImpayesChange: (value: boolean) => void;
  className?: string;
}

export function ClientsFilters({
  query,
  onQueryChange,
  impayesOnly,
  onImpayesChange,
  className,
}: ClientsFiltersProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",
        className
      )}
    >
      {/* Recherche */}
      <div className="relative w-full sm:max-w-xs">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Rechercher par nom ou téléphone…"
          className="h-10 pl-9 pr-9"
          aria-label="Rechercher un client"
        />
        {query && (
          <button
            type="button"
            onClick={() => onQueryChange("")}
            aria-label="Effacer la recherche"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      {/* Toggle impayés */}
      <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 sm:py-1.5">
        <AlertCircle
          className={cn(
            "size-4 transition-colors",
            impayesOnly ? "text-danger" : "text-muted-foreground"
          )}
        />
        <Label
          htmlFor="impayes-toggle"
          className="cursor-pointer text-sm font-medium text-foreground"
        >
          Impayés uniquement
        </Label>
        <Switch
          id="impayes-toggle"
          checked={impayesOnly}
          onCheckedChange={onImpayesChange}
          aria-label="Afficher uniquement les clients avec impayés"
        />
      </div>
    </div>
  );
}
