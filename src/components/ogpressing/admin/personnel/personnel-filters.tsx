/**
 * e-pressing — PersonnelFilters
 * ------------------------------
 * Filtres pour la liste du personnel :
 *   - Recherche par nom ou téléphone (input contrôlé, debounce côté parent)
 *   - Filtre par rôle (Select : tous / manager / réceptionniste / caissier /
 *     laveur / repassage / livreur / comptable)
 *   - Filtre par statut de compte (Select : tous / actif / invitation en
 *     attente / désactivé)
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

export type RoleFilter =
  | "all"
  | "manager"
  | "receptionniste"
  | "caissier"
  | "laveur"
  | "repassage"
  | "livreur"
  | "comptable";

export type StatutFilter = "all" | "actif" | "invite_en_attente" | "desactive";

interface PersonnelFiltersProps {
  query: string;
  onQueryChange: (value: string) => void;
  role: RoleFilter;
  onRoleChange: (value: RoleFilter) => void;
  statut: StatutFilter;
  onStatutChange: (value: StatutFilter) => void;
  className?: string;
}

export const ROLE_LABELS: Record<RoleFilter, string> = {
  all: "Tous les rôles",
  manager: "Manager",
  receptionniste: "Réceptionniste",
  caissier: "Caissier",
  laveur: "Laveur",
  repassage: "Repassage",
  livreur: "Livreur",
  comptable: "Comptable",
};

export const STATUT_LABELS: Record<StatutFilter, string> = {
  all: "Tous les statuts",
  actif: "Actif",
  invite_en_attente: "Invitation en attente",
  desactive: "Désactivé",
};

export function PersonnelFilters({
  query,
  onQueryChange,
  role,
  onRoleChange,
  statut,
  onStatutChange,
  className,
}: PersonnelFiltersProps) {
  return (
    <div className={cn("space-y-3", className)}>
      {/* Recherche */}
      <div className="relative w-full sm:max-w-xs">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Rechercher par nom ou téléphone…"
          className="h-10 pl-9 pr-9"
          aria-label="Rechercher un employé"
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

      {/* Filtres par rôle + statut */}
      <div className="grid grid-cols-2 gap-2 sm:max-w-xl">
        <div className="space-y-1">
          <label
            htmlFor="filter-role"
            className="flex items-center gap-1 text-xs font-medium text-muted-foreground"
          >
            <Filter className="size-3" />
            Rôle
          </label>
          <Select
            value={role}
            onValueChange={(v) => onRoleChange(v as RoleFilter)}
          >
            <SelectTrigger id="filter-role" className="h-10 w-full">
              <SelectValue placeholder="Tous les rôles" />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(ROLE_LABELS) as RoleFilter[]).map((r) => (
                <SelectItem key={r} value={r}>
                  {ROLE_LABELS[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

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
              {(Object.keys(STATUT_LABELS) as StatutFilter[]).map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUT_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
