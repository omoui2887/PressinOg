/**
 * OgPressing — AbonnementsFilters
 * --------------------------------
 * Barre de filtres pour la liste des abonnements :
 *   - Recherche par nom du pressing (input contrôlé, debounce 300ms côté parent)
 *   - Filtre par statut (Select : tous / essai / actif / suspendu / expiré)
 *   - Filtre par plan (Select : tous / Starter / Pro / Business)
 *
 * Mobile-first : la recherche prend toute la largeur, les 2 selects
 * s'affichent côte à côte en dessous (grid 2 colonnes).
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
  type PlanAbonnement,
  type StatutAbonnement,
  PLAN_LABELS,
  STATUT_LABELS,
} from "./abonnements-helpers";

export type StatutFilter = "all" | StatutAbonnement;
export type PlanFilter = "all" | PlanAbonnement;

export const STATUT_FILTER_LABELS: Record<StatutFilter, string> = {
  all: "Tous les statuts",
  essai: STATUT_LABELS.essai,
  actif: STATUT_LABELS.actif,
  suspendu: STATUT_LABELS.suspendu,
  expire: STATUT_LABELS.expire,
};

export const PLAN_FILTER_LABELS: Record<PlanFilter, string> = {
  all: "Tous les plans",
  starter: PLAN_LABELS.starter,
  pro: PLAN_LABELS.pro,
  business: PLAN_LABELS.business,
};

interface AbonnementsFiltersProps {
  query: string;
  onQueryChange: (value: string) => void;
  statut: StatutFilter;
  onStatutChange: (value: StatutFilter) => void;
  plan: PlanFilter;
  onPlanChange: (value: PlanFilter) => void;
  className?: string;
}

export function AbonnementsFilters({
  query,
  onQueryChange,
  statut,
  onStatutChange,
  plan,
  onPlanChange,
  className,
}: AbonnementsFiltersProps) {
  return (
    <div className={cn("space-y-3", className)}>
      {/* Recherche */}
      <div className="relative w-full sm:max-w-xs">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Rechercher par nom du pressing…"
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

      {/* Filtres par statut + plan */}
      <div className="grid grid-cols-2 gap-2 sm:max-w-xl">
        <div className="space-y-1">
          <label
            htmlFor="filter-statut"
            className="flex items-center gap-1 text-xs font-medium text-muted-foreground"
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
              {(Object.keys(STATUT_FILTER_LABELS) as StatutFilter[]).map(
                (s) => (
                  <SelectItem key={s} value={s}>
                    {STATUT_FILTER_LABELS[s]}
                  </SelectItem>
                )
              )}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <label
            htmlFor="filter-plan"
            className="flex items-center gap-1 text-xs font-medium text-muted-foreground"
          >
            <Filter className="size-3" />
            Plan
          </label>
          <Select
            value={plan}
            onValueChange={(v) => onPlanChange(v as PlanFilter)}
          >
            <SelectTrigger id="filter-plan" className="h-10 w-full">
              <SelectValue placeholder="Tous les plans" />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(PLAN_FILTER_LABELS) as PlanFilter[]).map((p) => (
                <SelectItem key={p} value={p}>
                  {PLAN_FILTER_LABELS[p]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
