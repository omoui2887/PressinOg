/**
 * OgPressing — StockFilters (LOT 10.1)
 * -------------------------------------
 * Barre de recherche (debounce 300ms) + lien vers l'historique des mouvements.
 */
"use client";

import { Search, History } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import Link from "next/link";

interface StockFiltersProps {
  query: string;
  onQueryChange: (q: string) => void;
  /** Base des URLs internes (défaut "/admin"). Le lien "Historique des
   *  mouvements" pointe vers `${basePath}/stock/mouvements`. */
  basePath?: string;
}

export function StockFilters({
  query,
  onQueryChange,
  basePath = "/admin",
}: StockFiltersProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Rechercher un produit par nom…"
          className="h-11 pl-10"
          aria-label="Rechercher un produit"
        />
      </div>
      <Button variant="outline" size="sm" asChild className="h-11">
        <Link href={`${basePath}/stock/mouvements`}>
          <History className="mr-2 size-4" />
          Historique des mouvements
        </Link>
      </Button>
    </div>
  );
}
