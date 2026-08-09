/**
 * OgPressing — MouvementsPage (client orchestrator) — LOT 10.2
 * -------------------------------------------------------------
 * Page /admin/stock/mouvements : historique des mouvements de stock.
 *
 * Fonctionnalités :
 *   - Filtres : par produit, par type, par plage de dates
 *   - Liste triée par date décroissante
 *   - Pagination (20/page)
 *   - Bouton Export .xlsx — rapport Stock mouvements (PRD §14 + §15)
 *
 * Données via GET /api/admin/stock/mouvements + GET /api/admin/stock (pour
 * la liste des produits du filtre).
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import { History, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ViewToggle } from "@/components/shared";
import { useViewMode } from "@/hooks/use-view-mode";
import {
  MouvementsFilters,
  type TypeMouvementFilter,
} from "./mouvements-filters";
import { MouvementsList } from "./mouvements-list";
import type { MouvementStock } from "./stock-helpers";

const PAGE_SIZE = 20;

export function MouvementsPage() {
  const { viewMode, setViewMode } = useViewMode("mouvements");
  const [produitId, setProduitId] = useState<string>("all");
  const [type, setType] = useState<TypeMouvementFilter>("all");
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [page, setPage] = useState(1);

  const [mouvements, setMouvements] = useState<MouvementStock[]>([]);
  const [produits, setProduits] = useState<{ id: string; nom: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  // Reset pagination quand un filtre change
  useEffect(() => {
    setPage(1);
  }, [produitId, type, dateStart, dateEnd]);

  // Charge la liste des produits pour le filtre (une seule fois)
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/stock", { cache: "no-store" });
        const data = await res.json();
        if (data.success) {
          setProduits(
            (data.data as { id: string; nom: string }[]).map((p) => ({
              id: p.id,
              nom: p.nom,
            }))
          );
        }
      } catch {
        /* ignore */
      }
    })();
  }, []);

  const fetchMouvements = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      if (produitId !== "all") params.set("produit_id", produitId);
      if (type !== "all") params.set("type", type);
      if (dateStart) params.set("date_start", dateStart);
      if (dateEnd) params.set("date_end", dateEnd);

      const res = await fetch(`/api/admin/stock/mouvements?${params}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (data.success) {
        setMouvements(data.data);
        setTotal(data.total);
        setTotalPages(data.totalPages);
      } else {
        setMouvements([]);
        setTotal(0);
        setTotalPages(0);
      }
    } catch {
      setMouvements([]);
    } finally {
      setLoading(false);
    }
  }, [page, produitId, type, dateStart, dateEnd]);

  useEffect(() => {
    fetchMouvements();
  }, [fetchMouvements]);

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <History className="size-6 text-primary" />
            Historique des mouvements
          </h1>
          <p className="text-sm text-muted-foreground">
            Toutes les entrées et sorties de stock enregistrées.
          </p>
        </div>
        <ViewToggle value={viewMode} onChange={setViewMode} />
      </div>

      {/* Filtres */}
      <Card className="p-4">
        <MouvementsFilters
          produitId={produitId}
          onProduitChange={setProduitId}
          type={type}
          onTypeChange={setType}
          dateStart={dateStart}
          onDateStartChange={setDateStart}
          dateEnd={dateEnd}
          onDateEndChange={setDateEnd}
          produits={produits}
        />
      </Card>

      {/* Liste */}
      <MouvementsList
        mouvements={mouvements}
        loading={loading}
        viewMode={viewMode}
      />

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {total} mouvement{total > 1 ? "s" : ""} — Page {page} / {totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
            >
              <ChevronLeft className="mr-1 size-4" />
              Précédent
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
            >
              Suivant
              <ChevronRight className="ml-1 size-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
