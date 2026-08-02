/**
 * OgPressing — PressingsPage (client orchestrator)
 * -------------------------------------------------
 * Page /super-admin/pressings : liste des pressings clients (Super Admin).
 *
 * Fonctionnalités :
 *   - Recherche par nom de pressing ou ville (debounce 300ms)
 *   - Liste en tableau (desktop) / cards (mobile)
 *   - Pagination (20/page)
 *   - Sheet détails (ouverte via bouton "Voir détails" sur chaque ligne)
 *
 * Données via :
 *   - GET /api/super-admin/pressings?q=...&page=...  → liste paginée
 *   - GET /api/super-admin/pressings/[id]            → détails complets
 *   - PATCH /api/super-admin/pressings/[id]          → suspendre / réactiver
 *
 * ⚠️ Navigation cross-page : utilise des <a href> pour les liens vers d'autres
 *    pages (cf. worklog Task 23 — évite les "Failed to fetch" RSC en iframe).
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import { Building2, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ViewToggle } from "@/components/shared";
import { useViewMode } from "@/hooks/use-view-mode";
import { PressingsFilters } from "./pressings-filters";
import { PressingsTable } from "./pressings-table";
import { PressingDetailsSheet } from "./pressing-details-sheet";
import type { PressingListItem } from "./pressings-helpers";

const PAGE_SIZE = 20;

interface PressingsApiResponse {
  success: boolean;
  data: PressingListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  error?: string;
}

export function PressingsPage() {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pressings, setPressings] = useState<PressingListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);

  // Pressing sélectionné pour la Sheet détails (objet léger de la liste)
  const [selected, setSelected] = useState<PressingListItem | null>(null);
  // Sheet ouverte ?
  const [sheetOpen, setSheetOpen] = useState(false);

  // Persistance du mode d'affichage (liste vs grille) — clé localStorage
  // `ogp:view-mode:pressings`. Voir hooks/use-view-mode.ts.
  const { viewMode, setViewMode } = useViewMode("pressings");

  // Debounce recherche 300ms + reset pagination
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQuery(query);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  const fetchPressings = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      if (debouncedQuery) params.set("q", debouncedQuery);

      const res = await fetch(`/api/super-admin/pressings?${params.toString()}`, {
        cache: "no-store",
      });
      const data: PressingsApiResponse = await res.json();
      if (data.success) {
        setPressings(data.data);
        setTotal(data.total);
        setTotalPages(data.totalPages);
      } else {
        console.error("[pressings] Erreur API:", data.error);
        setPressings([]);
        setTotal(0);
        setTotalPages(0);
      }
    } catch (err) {
      console.error("[pressings] Erreur fetch:", err);
      setPressings([]);
    } finally {
      setLoading(false);
    }
  }, [debouncedQuery, page]);

  useEffect(() => {
    fetchPressings();
  }, [fetchPressings]);

  // Ouvre la Sheet détails pour un pressing
  function handleSelect(pressing: PressingListItem) {
    setSelected(pressing);
    setSheetOpen(true);
  }

  // Ferme la Sheet et refresh la liste (utile après suspend/reactivate)
  function handleSheetChange(open: boolean) {
    setSheetOpen(open);
    if (!open) {
      // Si on avait un pressing sélectionné, on refresh la liste pour
      // répercuter un éventuel changement de statut.
      if (selected) {
        fetchPressings();
      }
      setSelected(null);
    }
  }

  // Pagination : start-end affichés
  const start = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const end = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      {/* Header */}
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
          <Building2 className="size-6 text-primary" />
          Pressings clients
        </h1>
        <p className="text-sm text-muted-foreground">
          Gérez les pressings de la plateforme — {total} pressing
          {total > 1 ? "s" : ""}
        </p>
      </div>

      {/* Filtres */}
      <PressingsFilters query={query} onQueryChange={setQuery} />

      {/* Barre d'actions liste : toggle Liste/Grille */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <ViewToggle value={viewMode} onChange={setViewMode} />
      </div>

      {/* Liste */}
      <PressingsTable
        pressings={pressings}
        loading={loading}
        onSelect={handleSelect}
        viewMode={viewMode}
      />

      {/* Pagination */}
      {!loading && pressings.length > 0 && (
        <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
          <p className="text-sm text-muted-foreground">
            Affichage de{" "}
            <span className="font-medium text-foreground">
              {start}–{end}
            </span>{" "}
            sur{" "}
            <span className="font-medium text-foreground">{total}</span>{" "}
            pressing{total > 1 ? "s" : ""}
          </p>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
            >
              <ChevronLeft className="size-4" />
              Précédent
            </Button>
            <span className="text-sm text-muted-foreground">
              Page <span className="font-medium text-foreground">{page}</span> /{" "}
              {totalPages || 1}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= totalPages}
            >
              Suivant
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Sheet détails */}
      <PressingDetailsSheet
        pressing={selected}
        open={sheetOpen}
        onOpenChange={handleSheetChange}
      />
    </div>
  );
}
