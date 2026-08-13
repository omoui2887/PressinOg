/**
 * e-pressing — DemandesFilters
 * -----------------------------
 * Barre de filtres pour la page /super-admin/demandes :
 *   - Recherche texte libre (nom, nom du pressing, téléphone) — debounce 300ms
 *     géré par le parent (mise à jour du state local).
 *   - Filtre par statut (Tous / En attente / Contactée / Validée / Refusée).
 *
 * Mobile-first : la recherche prend toute la largeur, le select statut
 * s'affiche en dessous (max-w-xs).
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
import { STATUT_LABELS, type StatutDemande } from "./types";

export type StatutFilter = "all" | StatutDemande;

export const STATUT_FILTER_LABELS: Record<StatutFilter, string> = {
  all: "Tous les statuts",
  en_attente: STATUT_LABELS.en_attente,
  contactee: STATUT_LABELS.contactee,
  validee: STATUT_LABELS.validee,
  refusee: STATUT_LABELS.refusee,
};

interface DemandesFiltersProps {
  query: string;
  onQueryChange: (value: string) => void;
  statut: StatutFilter;
  onStatutChange: (value: StatutFilter) => void;
  className?: string;
}

export function DemandesFilters({
  query,
  onQueryChange,
  statut,
  onStatutChange,
  className,
}: DemandesFiltersProps) {
  return (
    <div className={cn("space-y-3", className)}>
      {/* Recherche */}
      <div className="relative w-full sm:max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Rechercher par nom, pressing ou téléphone…"
          className="h-10 pl-9 pr-9"
          aria-label="Rechercher une demande"
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

      {/* Filtre par statut */}
      <div className="w-full sm:max-w-xs">
        <label
          htmlFor="filter-statut"
          className="mb-1 flex items-center gap-1 text-xs font-medium text-muted-foreground"
        >
          <Filter className="size-3" />
          Statut
        </label>
        <Select
          value={statut}
          onValueChange={(v) => onStatutChange(v as StatutFilter)}
        >
          <SelectTrigger id="filter-statut" className="h-10 w-full">
            <SelectValue placeholder="Tous les statuts" />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(STATUT_FILTER_LABELS) as StatutFilter[]).map((s) => (
              <SelectItem key={s} value={s}>
                {STATUT_FILTER_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
