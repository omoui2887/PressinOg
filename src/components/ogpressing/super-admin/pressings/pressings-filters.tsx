/**
 * OgPressing — PressingsFilters
 * --------------------------------
 * Barre de recherche pour la liste des pressings (Super Admin).
 *
 * Recherche par nom de pressing OU ville (debounce 300ms géré côté parent).
 *
 * Client component : input contrôlé, le parent est responsable du debounce
 * et du fetch API.
 */
"use client";

import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface PressingsFiltersProps {
  query: string;
  onQueryChange: (value: string) => void;
  className?: string;
}

export function PressingsFilters({
  query,
  onQueryChange,
  className,
}: PressingsFiltersProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",
        className
      )}
    >
      <div className="relative w-full sm:max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Rechercher par nom de pressing ou ville…"
          className="h-10 pl-9 pr-9"
          aria-label="Rechercher un pressing"
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
    </div>
  );
}
