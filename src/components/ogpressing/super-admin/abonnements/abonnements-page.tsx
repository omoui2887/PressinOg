/**
 * OgPressing — AbonnementsPage (client orchestrator)
 * ----------------------------------------------------
 * Page /super-admin/abonnements : gestion de tous les abonnements SaaS de la
 * plateforme OgPressing.
 *
 * Fonctionnalités (LOT 5.4) :
 *   - 3 StatCards en haut : nombre d'abonnements ACTIFS par plan
 *     (Starter / Pro / Business)
 *   - Bannière d'alerte : abonnements à renouveler bientôt (< 3 jours) /
 *     expirés
 *   - Filtres : recherche par nom de pressing + filtre statut + filtre plan
 *   - Liste tableau (desktop) / cards (mobile) avec actions par ligne :
 *     Renouveler / Changer de plan / Suspendre
 *   - Pagination (20/page)
 *
 * Données via GET /api/super-admin/abonnements qui renvoie en plus :
 *   stats: { starter, pro, business }, alertes: { expireBientot, expires }
 *
 * ⚠️ Le paiement enregistré via cette page est purement DÉCLARATIF — aucune
 *    transaction bancaire réelle n'est initiée (voir renouvellement-dialog.tsx
 *    et l'API /api/super-admin/abonnements/[id]/renouveler).
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CreditCard,
  Rocket,
  Crown,
  Building2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { StatCard } from "@/components/ogpressing/stat-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatFCFA } from "@/lib/utils/format";
import {
  AbonnementsFilters,
  type StatutFilter,
  type PlanFilter,
} from "./abonnements-filters";
import { AbonnementsTable } from "./abonnements-table";
import { AlertesAbonnements } from "./alertes-abonnements";
import {
  type AbonnementsApiResponse,
  type Abonnement,
  PLAN_LABELS,
  PLAN_MONTANTS,
} from "./abonnements-helpers";

const PAGE_SIZE = 20;

/* ---------------------------------------------------------------- */
/*  Pagination inline (réutilisée sur l'admin, mais simple ici)     */
/* ---------------------------------------------------------------- */

interface AbonnementsPaginationProps {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

function AbonnementsPagination({
  page,
  totalPages,
  total,
  pageSize,
  onPageChange,
}: AbonnementsPaginationProps) {
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
        abonnement{total > 1 ? "s" : ""}
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

/* ---------------------------------------------------------------- */
/*  AbonnementsPage                                                 */
/* ---------------------------------------------------------------- */

export function AbonnementsPage() {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [statut, setStatut] = useState<StatutFilter>("all");
  const [plan, setPlan] = useState<PlanFilter>("all");
  const [page, setPage] = useState(1);

  const [abonnements, setAbonnements] = useState<Abonnement[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [stats, setStats] = useState({ starter: 0, pro: 0, business: 0 });
  const [alertes, setAlertes] = useState({ expireBientot: 0, expires: 0 });
  const [loading, setLoading] = useState(true);

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
  }, [statut, plan]);

  const fetchAbonnements = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
        statut,
        plan,
      });
      if (debouncedQuery) params.set("q", debouncedQuery);

      const res = await fetch(
        `/api/super-admin/abonnements?${params.toString()}`,
        { cache: "no-store" }
      );
      const data: AbonnementsApiResponse = await res.json();
      if (data.success) {
        setAbonnements(data.data);
        setTotal(data.total);
        setTotalPages(data.totalPages);
        setStats(data.stats);
        setAlertes(data.alertes);
      } else {
        console.error("[abonnements] Erreur API:", data.error);
        setAbonnements([]);
      }
    } catch (err) {
      console.error("[abonnements] Erreur fetch:", err);
      setAbonnements([]);
    } finally {
      setLoading(false);
    }
  }, [debouncedQuery, statut, plan, page]);

  useEffect(() => {
    fetchAbonnements();
  }, [fetchAbonnements]);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          <CreditCard className="size-6 text-primary sm:size-7" />
          Abonnements
        </h1>
        <p className="text-sm text-muted-foreground sm:text-base">
          Gérez les abonnements SaaS de tous les pressings — {total}{" "}
          abonnement{total > 1 ? "s" : ""} au total
        </p>
      </div>

      {/* StatCards : abonnements actifs par plan */}
      <div className="grid gap-4 sm:grid-cols-3">
        {loading ? (
          <>
            <Skeleton className="h-28 w-full rounded-xl" />
            <Skeleton className="h-28 w-full rounded-xl" />
            <Skeleton className="h-28 w-full rounded-xl" />
          </>
        ) : (
          <>
            <StatCard
              label="Plan Starter (actifs)"
              value={stats.starter}
              icon={Rocket}
              accent="neutral"
              description={`${formatFCFA(PLAN_MONTANTS.starter)} / mois`}
            />
            <StatCard
              label="Plan Pro (actifs)"
              value={stats.pro}
              icon={CreditCard}
              accent="primary"
              description={`${formatFCFA(PLAN_MONTANTS.pro)} / mois`}
            />
            <StatCard
              label="Plan Business (actifs)"
              value={stats.business}
              icon={Crown}
              accent="secondary"
              description={`${formatFCFA(PLAN_MONTANTS.business)} / mois`}
            />
          </>
        )}
      </div>

      {/* Bannière d'alerte (expirations) */}
      <AlertesAbonnements
        expireBientot={alertes.expireBientot}
        expires={alertes.expires}
      />

      {/* Filtres */}
      <AbonnementsFilters
        query={query}
        onQueryChange={setQuery}
        statut={statut}
        onStatutChange={setStatut}
        plan={plan}
        onPlanChange={setPlan}
      />

      {/* Liste (tableau desktop / cards mobile) */}
      <AbonnementsTable
        abonnements={abonnements}
        loading={loading}
        onUpdated={fetchAbonnements}
      />

      {/* Pagination */}
      {!loading && abonnements.length > 0 && (
        <AbonnementsPagination
          page={page}
          totalPages={totalPages}
          total={total}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
        />
      )}

      {/* Légende des plans (rappel visuel des tarifs) */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1 font-medium text-foreground">
          <Building2 className="size-3.5" />
          Tarifs mensuels :
        </span>
        {(Object.keys(PLAN_LABELS) as Array<keyof typeof PLAN_LABELS>).map(
          (p) => (
            <span key={p} className="flex items-center gap-1">
              <span className="font-medium text-foreground">
                {PLAN_LABELS[p]}
              </span>
              {formatFCFA(PLAN_MONTANTS[p])}
            </span>
          )
        )}
        <span className="ml-auto">
          ⚠️ Paiements déclaratifs — aucune transaction bancaire réelle
        </span>
      </div>
    </div>
  );
}
