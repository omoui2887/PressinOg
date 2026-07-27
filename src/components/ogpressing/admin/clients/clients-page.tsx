/**
 * OgPressing — ClientsPage (client)
 * ----------------------------------
 * Page /admin/clients : liste des clients du pressing connecté avec
 * recherche, filtre impayés, pagination, bouton Nouveau client + Export.
 *
 * Client component car interactivité (recherche, filtre, pagination, dialog).
 * Récupère les données via fetch sur /api/admin/clients avec debounce 300ms
 * sur la recherche.
 *
 * Affichage mobile-first : cards empilées sur mobile, tableau sur desktop.
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Users } from "lucide-react";
import { ClientsFilters } from "./clients-filters";
import { ClientsList, type ClientEnrichi } from "./clients-list";
import { ClientsPagination } from "./clients-pagination";
import { NewClientDialog } from "./new-client-dialog";
import { RapportExportButton } from "../rapports/rapport-export-button";

const PAGE_SIZE = 20;

export function ClientsPage() {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [impayesOnly, setImpayesOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [clients, setClients] = useState<ClientEnrichi[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);

  // Debounce de la recherche 300ms
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQuery(query);
      setPage(1); // reset pagination quand la recherche change
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  // Reset pagination quand le filtre impayés change
  useEffect(() => {
    setPage(1);
  }, [impayesOnly]);

  const fetchClients = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      if (debouncedQuery) params.set("q", debouncedQuery);
      if (impayesOnly) params.set("impayes", "true");

      const res = await fetch(`/api/admin/clients?${params.toString()}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (data.success) {
        setClients(data.data);
        setTotal(data.total);
        setTotalPages(data.totalPages);
      } else {
        console.error("[clients] Erreur API:", data.error);
        setClients([]);
      }
    } catch (err) {
      console.error("[clients] Erreur fetch:", err);
      setClients([]);
    } finally {
      setLoading(false);
    }
  }, [debouncedQuery, impayesOnly, page]);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
            <Users className="size-6 text-primary" />
            Clients
          </h1>
          <p className="text-sm text-muted-foreground">
            Fichier clients de votre pressing — {total} client
            {total > 1 ? "s" : ""}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <RapportExportButton
            type="clients"
            size="sm"
            label="Exporter les clients"
          />
          <RapportExportButton
            type="impayes"
            size="sm"
            label="Exporter les impayés"
          />
          <NewClientDialog onCreate={fetchClients} />
        </div>
      </div>

      {/* Filtres */}
      <ClientsFilters
        query={query}
        onQueryChange={setQuery}
        impayesOnly={impayesOnly}
        onImpayesChange={setImpayesOnly}
      />

      {/* Liste */}
      <ClientsList clients={clients} loading={loading} />

      {/* Pagination */}
      {!loading && clients.length > 0 && (
        <ClientsPagination
          page={page}
          totalPages={totalPages}
          total={total}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}
