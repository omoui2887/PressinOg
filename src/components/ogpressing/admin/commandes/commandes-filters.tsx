/**
 * OgPressing — CommandesFilters
 * ------------------------------
 * Barre de filtres pour la liste des commandes :
 *   - Recherche texte (numero_commande OU nom du client) avec bouton effacer
 *   - Select statut commande (Tous + 7 statuts)
 *   - Select statut paiement (Tous + 3 statuts)
 *
 * Client component : inputs contrôlés, debounce 300ms géré côté parent.
 */
"use client";

import { Search, X, Filter } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  STATUT_FILTER_OPTIONS,
  STATUT_PAIEMENT_FILTER_OPTIONS,
} from "./commandes-helpers";

interface CommandesFiltersProps {
  query: string;
  onQueryChange: (value: string) => void;
  statut: string;
  onStatutChange: (value: string) => void;
  statutPaiement: string;
  onStatutPaiementChange: (value: string) => void;
  className?: string;
}

export function CommandesFilters({
  query,
  onQueryChange,
  statut,
  onStatutChange,
  statutPaiement,
  onStatutPaiementChange,
  className,
}: CommandesFiltersProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between",
        className
      )}
    >
      {/* Recherche */}
      <div className="relative w-full lg:max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Rechercher par n° ticket ou client…"
          className="h-10 pl-9 pr-9"
          aria-label="Rechercher une commande"
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

      {/* Filtres Select */}
      <div className="flex items-center gap-2">
        <Filter className="hidden size-4 text-muted-foreground sm:block" />
        <Select
          value={statut}
          onValueChange={(v) => onStatutChange(v === "__all__" ? "" : v)}
        >
          <SelectTrigger className="h-10 w-[180px]" aria-label="Filtrer par statut">
            <SelectValue placeholder="Tous les statuts" />
          </SelectTrigger>
          <SelectContent>
            {STATUT_FILTER_OPTIONS.map((opt) => (
              <SelectItem
                key={opt.value || "__all__"}
                value={opt.value || "__all__"}
              >
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={statutPaiement}
          onValueChange={(v) =>
            onStatutPaiementChange(v === "__all__" ? "" : v)
          }
        >
          <SelectTrigger
            className="h-10 w-[170px]"
            aria-label="Filtrer par statut de paiement"
          >
            <SelectValue placeholder="Tous les paiements" />
          </SelectTrigger>
          <SelectContent>
            {STATUT_PAIEMENT_FILTER_OPTIONS.map((opt) => (
              <SelectItem
                key={opt.value || "__all__"}
                value={opt.value || "__all__"}
              >
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
