/**
 * OgPressing — DemandesPage (client orchestrator)
 * ------------------------------------------------
 * Page /super-admin/demandes : gestion des demandes d'inscription.
 *
 * Fonctionnalités :
 *   - Filtres : statut (Tous/En attente/Contactée/Validée/Refusée) + recherche
 *     texte libre (nom_gerant, nom_pressing, telephone) debouncée 300ms
 *   - Liste en tableau (desktop) / cards (mobile)
 *   - Sheet de détails avec toutes les actions (contacter, valider+code,
 *     refuser, notes internes auto-save)
 *   - Pagination (20/page)
 *
 * Données via GET /api/super-admin/demandes. Pas de navigation URL pour les
 * filtres (évite les soucis de navigation RSC en cross-origin iframe —
 * cf. worklog Tasks 17/23).
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import { Inbox, ChevronLeft, ChevronRight } from "lucide-react";
import { DemandesFilters, type StatutFilter } from "./demandes-filters";
import { DemandesTable } from "./demandes-table";
import { DemandeDetailsSheet } from "./demande-details-sheet";
import { EmptyState, ViewToggle } from "@/components/shared";
import { useViewMode } from "@/hooks/use-view-mode";
import { Button } from "@/components/ui/button";
import type { DemandeInscription, DemandesApiResponse } from "./types";

const PAGE_SIZE = 20;

export function DemandesPage() {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [statut, setStatut] = useState<StatutFilter>("all");
  const [page, setPage] = useState(1);

  const [demandes, setDemandes] = useState<DemandeInscription[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);

  // Sheet state
  const [selectedDemande, setSelectedDemande] = useState<DemandeInscription | null>(
    null
  );
  const [sheetOpen, setSheetOpen] = useState(false);

  // Persistance du mode d'affichage (liste vs grille) — clé localStorage
  // `ogp:view-mode:demandes`. Voir hooks/use-view-mode.ts.
  const { viewMode, setViewMode } = useViewMode("demandes");

  // Debounce recherche 300ms + reset pagination
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQuery(query);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  // Reset pagination quand le filtre statut change
  useEffect(() => {
    setPage(1);
  }, [statut]);

  const fetchDemandes = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
        statut,
      });
      if (debouncedQuery) params.set("q", debouncedQuery);

      const res = await fetch(
        `/api/super-admin/demandes?${params.toString()}`,
        { cache: "no-store" }
      );
      const data: DemandesApiResponse = await res.json();
      if (data.success) {
        setDemandes(data.data);
        setTotal(data.total);
        setTotalPages(data.totalPages);
      } else {
        console.error("[demandes] Erreur API:", data.error);
        setDemandes([]);
      }
    } catch (err) {
      console.error("[demandes] Erreur fetch:", err);
      setDemandes([]);
    } finally {
      setLoading(false);
    }
  }, [debouncedQuery, statut, page]);

  useEffect(() => {
    fetchDemandes();
  }, [fetchDemandes]);

  function handleVoirDetails(d: DemandeInscription) {
    setSelectedDemande(d);
    setSheetOpen(true);
  }

  /** Callback quand une demande a été mise à jour (mutation côté sheet). */
  function handleUpdated(updated: DemandeInscription) {
    setSelectedDemande(updated);
    setDemandes((prev) =>
      prev.map((d) => (d.id === updated.id ? updated : d))
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      {/* Header */}
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
          <Inbox className="size-6 text-primary" />
          Demandes d&apos;inscription
        </h1>
        <p className="text-sm text-muted-foreground">
          Gérez les prospects ayant rempli le formulaire d&apos;inscription —{" "}
          {total} demande{total > 1 ? "s" : ""}
        </p>
      </div>

      {/* Filtres */}
      <DemandesFilters
        query={query}
        onQueryChange={setQuery}
        statut={statut}
        onStatutChange={setStatut}
      />

      {/* Barre d'actions liste : toggle Liste/Grille */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <ViewToggle value={viewMode} onChange={setViewMode} />
      </div>

      {/* Liste / empty state */}
      {loading ? (
        <DemandesTable
          demandes={[]}
          loading
          onVoirDetails={handleVoirDetails}
          viewMode={viewMode}
        />
      ) : demandes.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title={
            debouncedQuery || statut !== "all"
              ? "Aucune demande ne correspond à vos filtres"
              : "Aucune demande pour le moment"
          }
          description={
            debouncedQuery || statut !== "all"
              ? "Modifiez vos filtres pour élargir la recherche."
              : "Les nouvelles demandes déposées sur la landing page apparaîtront ici automatiquement."
          }
        />
      ) : (
        <DemandesTable
          demandes={demandes}
          onVoirDetails={handleVoirDetails}
          viewMode={viewMode}
        />
      )}

      {/* Pagination */}
      {!loading && demandes.length > 0 && (
        <DemandesPagination
          page={page}
          totalPages={totalPages}
          total={total}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
        />
      )}

      {/* Sheet détails */}
      <DemandeDetailsSheet
        demande={selectedDemande}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onUpdated={handleUpdated}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Pagination (inline — identique au pattern personnel-pagination)    */
/* ------------------------------------------------------------------ */

interface DemandesPaginationProps {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

function DemandesPagination({
  page,
  totalPages,
  total,
  pageSize,
  onPageChange,
}: DemandesPaginationProps) {
  if (total === 0) return null;

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
      <p className="text-sm text-muted-foreground">
        Affichage de{" "}
        <span className="font-medium text-foreground">
          {start}–{end}
        </span>{" "}
        sur <span className="font-medium text-foreground">{total}</span>{" "}
        demande{total > 1 ? "s" : ""}
      </p>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page - 1)}
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
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
        >
          Suivant
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
