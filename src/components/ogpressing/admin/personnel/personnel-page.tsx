/**
 * e-pressing — PersonnelPage (client orchestrator)
 * -------------------------------------------------
 * Page /admin/personnel : gestion de l'équipe du pressing connecté.
 *
 * Fonctionnalités :
 *   - Compteur "X / Y employés" selon la limite du plan (starter=3, pro=8,
 *     business=illimité). Alerte rouge si limite atteinte.
 *   - Bouton "+ Ajouter un employé" (désactivé si limite atteinte).
 *   - Recherche par nom/téléphone (debounce 300ms).
 *   - Filtres par rôle + par statut de compte.
 *   - Liste en tableau (desktop) / cards (mobile) avec menu d'actions.
 *   - Pagination (20/page).
 *
 * Données via GET /api/admin/personnel qui renvoie en plus du `data` :
 *   plan, limit, count (sièges occupés), limitAtteinte.
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import { UserCog, AlertTriangle, Users, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ViewToggle, EmptyState } from "@/components/shared";
import { useViewMode } from "@/hooks/use-view-mode";
import {
  PersonnelFilters,
  type RoleFilter,
  type StatutFilter,
} from "./personnel-filters";
import { PersonnelList, type Employe } from "./personnel-list";
import { PersonnelPagination } from "./personnel-pagination";
import { AddEmployeeButton } from "./add-employee-button";
import { RapportExportButton } from "../rapports/rapport-export-button";

const PAGE_SIZE = 20;

interface PersonnelApiResponse {
  success: boolean;
  data: Employe[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  plan: string;
  limit: number | null;
  count: number;
  limitAtteinte: boolean;
  error?: string;
}

export function PersonnelPage() {
  const { viewMode, setViewMode } = useViewMode("personnel");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [role, setRole] = useState<RoleFilter>("all");
  const [statut, setStatut] = useState<StatutFilter>("all");
  const [page, setPage] = useState(1);

  const [employes, setEmployes] = useState<Employe[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);

  // Infos de limite de plan (récupérées à chaque fetch)
  const [plan, setPlan] = useState<string>("starter");
  const [limit, setLimit] = useState<number | null>(3);
  const [seatCount, setSeatCount] = useState(0);
  const [limitAtteinte, setLimitAtteinte] = useState(false);

  // Debounce recherche 300ms + reset pagination
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQuery(query);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  // Reset pagination quand un filtre change
  useEffect(() => {
    setPage(1);
  }, [role, statut]);

  const fetchPersonnel = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
        role,
        statut,
      });
      if (debouncedQuery) params.set("q", debouncedQuery);

      const res = await fetch(`/api/admin/personnel?${params.toString()}`, {
        cache: "no-store",
      });
      const data: PersonnelApiResponse = await res.json();
      if (data.success) {
        setEmployes(data.data);
        setTotal(data.total);
        setTotalPages(data.totalPages);
        setPlan(data.plan);
        setLimit(data.limit);
        setSeatCount(data.count);
        setLimitAtteinte(data.limitAtteinte);
      } else {
        console.error("[personnel] Erreur API:", data.error);
        setEmployes([]);
      }
    } catch (err) {
      console.error("[personnel] Erreur fetch:", err);
      setEmployes([]);
    } finally {
      setLoading(false);
    }
  }, [debouncedQuery, role, statut, page]);

  useEffect(() => {
    fetchPersonnel();
  }, [fetchPersonnel]);

  // Libellé de la limite ("3", "8", "Illimité")
  const limitLabel = limit === null ? "Illimité" : String(limit);
  const planLabel =
    plan === "business"
      ? "Business"
      : plan === "pro"
      ? "Pro"
      : "Starter";

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
            <UserCog className="size-6 text-primary" />
            Personnel
          </h1>
          <p className="text-sm text-muted-foreground">
            Gérez l'équipe de votre pressing — {total} employé
            {total > 1 ? "s" : ""}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <ViewToggle value={viewMode} onChange={setViewMode} />
          <RapportExportButton
            type="personnel"
            size="sm"
            label="Exporter le personnel"
          />
          <AddEmployeeButton
            limitAtteinte={limitAtteinte}
            limit={limit}
            onCreated={fetchPersonnel}
          />
        </div>
      </div>

      {/* Compteur de sièges + alerte limite */}
      <Card className="p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {/* Compteur */}
          <div className="flex items-center gap-3">
            <span
              className={`flex size-11 items-center justify-center rounded-lg ${
                limitAtteinte
                  ? "bg-danger/10 text-danger"
                  : "bg-primary/10 text-primary"
              }`}
            >
              <Users className="size-5" />
            </span>
            <div>
              <p className="text-sm text-muted-foreground">
                Employés actifs / limite du plan
              </p>
              <p className="text-lg font-bold text-foreground">
                {seatCount}{" "}
                <span className="text-muted-foreground">/ {limitLabel}</span>
                <span className="ml-2 rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  Plan {planLabel}
                </span>
              </p>
            </div>
          </div>

          {/* Barre de progression (si limite finie) */}
          {limit !== null && (
            <div className="w-full sm:max-w-xs">
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full transition-all ${
                    limitAtteinte
                      ? "bg-danger"
                      : seatCount / limit > 0.75
                      ? "bg-warning"
                      : "bg-secondary"
                  }`}
                  style={{
                    width: `${Math.min(100, (seatCount / limit) * 100)}%`,
                  }}
                />
              </div>
              <p className="mt-1 text-right text-xs text-muted-foreground">
                {limit - seatCount > 0
                  ? `${limit - seatCount} place${limit - seatCount > 1 ? "s" : ""} restante${limit - seatCount > 1 ? "s" : ""}`
                  : "Aucune place restante"}
              </p>
            </div>
          )}
        </div>

        {/* Alerte limite atteinte */}
        {limitAtteinte && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" />
            <p className="text-foreground">
              <span className="font-semibold text-danger">
                Limite atteinte pour votre plan.
              </span>{" "}
              Passez au plan supérieur pour ajouter plus d'employés.{" "}
              <span className="text-muted-foreground">
                Contactez le Super Admin au +225 05 76 10 32 77.
              </span>
            </p>
          </div>
        )}
      </Card>

      {/* Filtres */}
      <PersonnelFilters
        query={query}
        onQueryChange={setQuery}
        role={role}
        onRoleChange={setRole}
        statut={statut}
        onStatutChange={setStatut}
      />

      {/* Liste */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      ) : employes.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title="Aucun employé trouvé"
          description="Modifiez vos filtres ou ajoutez un nouvel employé."
        />
      ) : (
        <PersonnelList
          employes={employes}
          viewMode={viewMode}
          onUpdated={fetchPersonnel}
        />
      )}

      {/* Pagination */}
      {!loading && employes.length > 0 && (
        <PersonnelPagination
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
