/**
 * OgPressing — CasiersGrid (CASIER-FIX-V1)
 * ----------------------------------------
 * Composant partagé affichant une grille visuelle des casiers de stockage
 * (lockers) du pressing. Permet au manager (et autres rôles) de voir en un
 * coup d'œil quels casiers sont occupés et lesquels sont libres.
 *
 * Fonctionnalités :
 *   - 4 StatCards (occupés, libres, taux d'occupation, plan total).
 *   - Bannière d'avertissement si la migration 015 n'est pas appliquée.
 *   - Recherche par code de casier ou nom de client.
 *   - Filtre par statut : Tous / Occupés / Libres.
 *   - Grille groupée par rangée (A, B, C, D) + section "Hors plan" pour
 *     les casiers personnalisés occupés.
 *   - Tuile cliquable avec popover affichant les détails de l'article rangé
 *     (numéro de commande, client, téléphone, description, date de rangement,
 *     personnel rangeur) + lien "Voir la commande".
 *
 * Utilisé par :
 *   - /personnel/manager/casiers
 *   - /personnel/repassage/casiers
 *
 * 🔒 SÉCURITÉ : l'API /api/admin/casiers est accessible à n'importe quel
 *    personnel actif. La RLS isole par pressing_id automatiquement.
 */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Archive,
  ArchiveRestore,
  ArrowRight,
  Clock,
  LayoutGrid,
  MapPin,
  Percent,
  Phone,
  RefreshCw,
  Search,
  User,
  X,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { StatCard } from "@/components/ogpressing/stat-card";
import { StatusBadge } from "@/components/shared";
import { cn } from "@/lib/utils";
import { formatDateOnly, formatRelative } from "@/lib/utils/format";
import { STATUT_ARTICLE_LABELS } from "@/lib/workflow/commande-statut";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/** Casier occupé (shape renvoyée par l'API /api/admin/casiers). */
export interface CasierOccupe {
  zone_stockage: string;
  article_id: string;
  article_description: string;
  commande_id: string;
  commande_numero: string;
  client_nom: string | null;
  client_telephone: string | null;
  date_rangeement: string | null;
  range_par_nom: string | null;
  statut_article: string;
}

/** Shape de la réponse de l'API. */
interface CasiersApiResponse {
  success: boolean;
  data?: {
    occupees: CasierOccupe[];
    libres: string[];
    total_occupees: number;
    total_libres: number;
    migration_appliquee: boolean;
    plan_defaut: string[];
  };
  error?: string;
}

type FiltreStatut = "tous" | "occupes" | "libres";

interface CasiersGridProps {
  /** Base pour les liens vers le détail commande (ex: "/personnel/manager"). */
  basePath: string;
  /** Libellé du rôle affiché dans le sous-titre (ex: "Manager"). */
  roleLabel?: string;
  className?: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Renvoie la lettre de rangée d'un code casier (ex: "A1" → "A"). */
function rowOf(code: string): string {
  const m = code.match(/^([A-Za-z]+)/);
  return m ? m[1].toUpperCase() : "?";
}

/** Renvoie le numéro de colonne d'un code casier (ex: "A1" → 1). */
function colOf(code: string): number {
  const m = code.match(/(\d+)$/);
  return m ? parseInt(m[1], 10) : 0;
}

/** Compare deux codes casiers par (rangée, numéro). */
function compareCasier(a: string, b: string): number {
  const ra = rowOf(a);
  const rb = rowOf(b);
  if (ra !== rb) return ra.localeCompare(rb);
  return colOf(a) - colOf(b);
}

/** Sépare le plan par défaut en sections par rangée. */
function groupPlanByRow(plan: string[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const code of plan) {
    const r = rowOf(code);
    if (!out[r]) out[r] = [];
    out[r].push(code);
  }
  for (const r of Object.keys(out)) {
    out[r].sort(compareCasier);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  Composant                                                          */
/* ------------------------------------------------------------------ */

export function CasiersGrid({
  basePath,
  roleLabel,
  className,
}: CasiersGridProps) {
  const [data, setData] = useState<CasiersApiResponse["data"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filtres
  const [search, setSearch] = useState("");
  const [filtreStatut, setFiltreStatut] = useState<FiltreStatut>("tous");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/casiers`, { cache: "no-store" });
      if (!res.ok) {
        throw new Error(
          `Erreur HTTP ${res.status} lors de la récupération des casiers.`
        );
      }
      const json: CasiersApiResponse = await res.json();
      if (!json.success || !json.data) {
        throw new Error(
          json.error ||
            "Une erreur est survenue lors de la récupération des casiers."
        );
      }
      setData(json.data);
    } catch (err) {
      console.error("[casiers-grid] Erreur fetch:", err);
      if (err instanceof TypeError && err.message.includes("fetch")) {
        setError(
          "Erreur réseau. Vérifiez votre connexion internet puis rechargez la page."
        );
      } else if (err instanceof Error && err.message) {
        setError(err.message);
      } else {
        setError(
          "Une erreur est survenue lors du chargement des casiers. Veuillez réessayer."
        );
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /* ------------------- Calculs dérivés (memo) ------------------- */

  /** Map code casier occupé → détails. */
  const occupeMap = useMemo(() => {
    const m = new Map<string, CasierOccupe>();
    if (data?.occupees) {
      for (const o of data.occupees) {
        m.set(o.zone_stockage.toUpperCase(), o);
      }
    }
    return m;
  }, [data]);

  /** Casiers personnalisés occupés (hors plan par défaut). */
  const casiersHorsPlan = useMemo(() => {
    if (!data) return [];
    const planSet = new Set(
      (data.plan_defaut ?? []).map((c) => c.toUpperCase())
    );
    return data.occupees
      .filter((o) => !planSet.has(o.zone_stockage.toUpperCase()))
      .map((o) => o.zone_stockage)
      .sort(compareCasier);
  }, [data]);

  /** Plan groupé par rangée. */
  const planParRangée = useMemo(() => {
    if (!data?.plan_defaut) return {};
    return groupPlanByRow(data.plan_defaut);
  }, [data]);

  /** Liste plate filtrée (tous codes visibles après recherche + filtre). */
  const codesFiltres = useMemo(() => {
    if (!data) return new Set<string>();
    const allCodes = Array.from(
      new Set<string>([
        ...(data.plan_defaut ?? []).map((c) => c.toUpperCase()),
        ...Array.from(occupeMap.keys()),
      ])
    );

    const q = search.trim().toLowerCase();
    const occ = (code: string) => occupeMap.has(code);

    return new Set(
      allCodes.filter((code) => {
        // Filtre statut
        if (filtreStatut === "occupes" && !occ(code)) return false;
        if (filtreStatut === "libres" && occ(code)) return false;

        // Recherche : code OU nom du client (si occupé)
        if (q) {
          if (code.toLowerCase().includes(q)) return true;
          const o = occupeMap.get(code);
          if (o) {
            const nom = (o.client_nom ?? "").toLowerCase();
            const numCmd = (o.commande_numero ?? "").toLowerCase();
            if (nom.includes(q) || numCmd.includes(q)) return true;
          }
          return false;
        }
        return true;
      })
    );
  }, [data, occupeMap, search, filtreStatut]);

  /** Statistiques affichées (toujours basées sur les données brutes, pas filtrées). */
  const totalOccupees = data?.total_occupees ?? 0;
  const totalLibres = data?.total_libres ?? 0;
  const totalPlan = totalOccupees + totalLibres;
  const tauxOccupation =
    totalPlan > 0 ? Math.round((totalOccupees / totalPlan) * 100) : 0;

  /* ------------------- Sous-composant : Tuile casier ------------------- */

  function renderCasierTile(code: string) {
    const occ = occupeMap.get(code);
    const isFilteredOut = !codesFiltres.has(code);
    if (isFilteredOut) return null;

    // Casier libre — tuile statique en pointillés gris
    if (!occ) {
      return (
        <div
          key={code}
          className={cn(
            "flex aspect-square min-h-[72px] flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/30 bg-muted/30 p-1 text-center",
            "select-none"
          )}
          aria-label={`Casier ${code} — libre`}
          title={`Casier ${code} — libre`}
        >
          <span className="font-mono text-base font-bold text-muted-foreground/70">
            {code}
          </span>
          <ArchiveRestore
            className="size-3.5 text-muted-foreground/40"
            aria-hidden
          />
        </div>
      );
    }

    // Casier occupé — popover avec détails (occ est maintenant narrowé)
    return (
      <Popover key={code}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "group relative flex aspect-square min-h-[72px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-secondary/50 bg-secondary/10 p-1 text-center",
              "transition-all hover:border-secondary hover:bg-secondary/20 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2"
            )}
            aria-label={`Casier ${code} — occupé par ${occ.client_nom ?? "client"}`}
            title={`Casier ${code} — cliquer pour voir les détails`}
          >
            <span className="font-mono text-base font-bold text-secondary">
              {code}
            </span>
            <Archive
              className="size-3.5 text-secondary/80"
              aria-hidden
            />
            <span
              className="absolute right-1 top-1 size-2 rounded-full bg-secondary"
              aria-hidden
            />
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="w-72 p-0"
          align="center"
          sideOffset={6}
        >
          <div className="border-b p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="flex size-8 items-center justify-center rounded-lg bg-secondary/15 text-secondary">
                  <Archive className="size-4" />
                </span>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    Casier
                  </p>
                  <p className="font-mono text-base font-bold leading-none text-foreground">
                    {code}
                  </p>
                </div>
              </div>
              <StatusBadge
                status={occ.statut_article}
                label={
                  STATUT_ARTICLE_LABELS[occ.statut_article] ??
                  occ.statut_article
                }
                variant="success"
              />
            </div>
          </div>

          <div className="space-y-3 p-3 text-sm">
            {/* Commande */}
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Commande
              </p>
              <p className="font-mono text-sm font-semibold text-foreground">
                {occ.commande_numero}
              </p>
            </div>

            {/* Client */}
            <div className="space-y-1">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <User className="size-3" /> Client
              </p>
              <p className="font-medium text-foreground">
                {occ.client_nom ?? "—"}
              </p>
              {occ.client_telephone && (
                <a
                  href={`tel:${occ.client_telephone}`}
                  className="flex items-center gap-1.5 text-xs text-primary hover:underline"
                >
                  <Phone className="size-3" />
                  {occ.client_telephone}
                </a>
              )}
            </div>

            {/* Article */}
            <div className="space-y-1">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <Archive className="size-3" /> Article
              </p>
              <p className="text-sm text-foreground">
                {occ.article_description}
              </p>
            </div>

            {/* Date + rangeur */}
            <div className="grid grid-cols-2 gap-3 border-t pt-2 text-xs">
              <div className="space-y-0.5">
                <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <Clock className="size-3" /> Rangé le
                </p>
                <p className="text-foreground">
                  {occ.date_rangeement
                    ? formatDateOnly(occ.date_rangeement)
                    : "—"}
                </p>
                {occ.date_rangeement && (
                  <p className="text-muted-foreground">
                    {formatRelative(occ.date_rangeement)}
                  </p>
                )}
              </div>
              <div className="space-y-0.5">
                <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <User className="size-3" /> Rangeur
                </p>
                <p className="text-foreground">
                  {occ.range_par_nom ?? "—"}
                </p>
              </div>
            </div>

            {/* Lien commande */}
            <Button
              asChild
              size="sm"
              className="w-full"
              variant="default"
            >
              <Link href={`${basePath}/commandes/${occ.commande_id}`}>
                Voir la commande
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    );
  }

  /* ------------------- Sous-composant : Stats ------------------- */

  function renderStatCards() {
    if (loading) {
      return (
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-xl" />
          ))}
        </div>
      );
    }
    if (error || !data) return null;

    return (
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Casiers occupés"
          value={totalOccupees}
          icon={Archive}
          accent="secondary"
          description="Linges rangés"
          delay={0}
        />
        <StatCard
          label="Casiers libres"
          value={totalLibres}
          icon={ArchiveRestore}
          accent="primary"
          description="Disponibles"
          delay={60}
        />
        <StatCard
          label="Taux d'occupation"
          value={`${tauxOccupation}%`}
          icon={Percent}
          accent="warning"
          description="Du plan par défaut"
          delay={120}
        />
        <StatCard
          label="Plan total"
          value={totalPlan}
          icon={LayoutGrid}
          accent="primary"
          description="Casiers du plan"
          delay={180}
        />
      </div>
    );
  }

  /* ------------------- Sous-composant : Bannière migration ------------------- */

  function renderMigrationBanner() {
    if (loading || error || !data) return null;
    if (data.migration_appliquee) return null;
    return (
      <div
        role="alert"
        className="flex flex-col gap-3 rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm sm:flex-row sm:items-start"
      >
        <AlertCircle
          className="size-5 shrink-0 text-warning"
          aria-hidden
        />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-semibold text-warning">
            Migration base de données requise
          </p>
          <p className="text-muted-foreground">
            La fonctionnalité de casiers nécessite la migration{" "}
            <code className="rounded bg-warning/20 px-1.5 py-0.5 font-mono text-xs font-semibold text-warning">
              015_casiers_stockage.sql
            </code>
            . Appliquez-la via le Dashboard Supabase (SQL Editor) pour activer
            le suivi des casiers. La grille s'affiche ci-dessous avec tous les
            casiers libres.
          </p>
        </div>
      </div>
    );
  }

  /* ------------------- Sous-composant : Filtres ------------------- */

  function renderFilters() {
    return (
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Rechercher par code casier, client ou n° commande..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 pr-9"
            aria-label="Rechercher un casier"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label="Effacer la recherche"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
        <Select
          value={filtreStatut}
          onValueChange={(v) => setFiltreStatut(v as FiltreStatut)}
        >
          <SelectTrigger className="w-full sm:w-44" aria-label="Filtrer par statut">
            <SelectValue placeholder="Statut" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="tous">Tous</SelectItem>
            <SelectItem value="occupes">Occupés</SelectItem>
            <SelectItem value="libres">Libres</SelectItem>
          </SelectContent>
        </Select>
      </div>
    );
  }

  /* ------------------- Sous-composant : Grille ------------------- */

  function renderRow(label: string, codes: string[]) {
    if (codes.length === 0) return null;
    const visibleCodes = codes.filter((c) => codesFiltres.has(c));
    // On n'affiche la rangée que si elle a au moins 1 casier visible
    if (visibleCodes.length === 0) return null;

    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-md bg-muted font-mono text-sm font-bold text-muted-foreground">
            {label}
          </span>
          <span className="text-xs text-muted-foreground">
            {visibleCodes.length} casier{visibleCodes.length > 1 ? "s" : ""}
          </span>
        </div>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-5 md:grid-cols-10">
          {codes.map((code) => renderCasierTile(code))}
        </div>
      </div>
    );
  }

  function renderGrille() {
    if (loading) {
      return (
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48 rounded" />
            <Skeleton className="mt-1 h-4 w-72 rounded" />
          </CardHeader>
          <CardContent className="space-y-4">
            {["A", "B", "C", "D"].map((r) => (
              <div key={r} className="space-y-2">
                <Skeleton className="h-7 w-16 rounded" />
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-5 md:grid-cols-10">
                  {Array.from({ length: 20 }).map((_, i) => (
                    <Skeleton key={i} className="aspect-square w-full rounded-lg" />
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      );
    }

    if (error || !data) return null;

    const rangées = Object.keys(planParRangée).sort();
    const totalVisible =
      (data.plan_defaut ?? []).filter((c) => codesFiltres.has(c)).length +
      casiersHorsPlan.filter((c) => codesFiltres.has(c)).length;

    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <MapPin className="size-5 text-primary" />
              Plan des casiers
            </CardTitle>
            <CardDescription>
              Cliquez sur un casier occupé (vert) pour voir les détails de la
              commande rangée.
            </CardDescription>
          </div>
          <span className="hidden shrink-0 rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground sm:inline">
            {totalVisible} affiché{totalVisible > 1 ? "s" : ""}
          </span>
        </CardHeader>
        <CardContent className="space-y-5">
          {totalVisible === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-muted/20 py-10 text-center">
              <Search className="size-8 text-muted-foreground/50" />
              <p className="text-sm font-medium text-foreground">
                Aucun casier ne correspond à votre recherche
              </p>
              <p className="max-w-xs text-xs text-muted-foreground">
                Modifiez votre recherche ou votre filtre pour afficher plus de
                casiers.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-1"
                onClick={() => {
                  setSearch("");
                  setFiltreStatut("tous");
                }}
              >
                Réinitialiser les filtres
              </Button>
            </div>
          ) : (
            <>
              {rangées.map((r) => renderRow(r, planParRangée[r]))}

              {/* Casiers hors plan (occupés uniquement) */}
              {casiersHorsPlan.length > 0 &&
                casiersHorsPlan.some((c) => codesFiltres.has(c)) && (
                  <div className="space-y-2 border-t pt-4">
                    <div className="flex items-center gap-2">
                      <span className="flex size-7 items-center justify-center rounded-md bg-warning/15 font-mono text-sm font-bold text-warning">
                        +
                      </span>
                      <span className="text-xs font-medium text-muted-foreground">
                        Hors plan (casiers personnalisés)
                      </span>
                    </div>
                    <div className="grid grid-cols-4 gap-2 sm:grid-cols-5 md:grid-cols-10">
                      {casiersHorsPlan.map((code) => renderCasierTile(code))}
                    </div>
                  </div>
                )}
            </>
          )}
        </CardContent>
      </Card>
    );
  }

  /* ------------------- Rendu principal ------------------- */

  return (
    <div className={cn("mx-auto max-w-7xl space-y-6", className)}>
      {/* 1. Header */}
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Casiers de stockage
        </h1>
        <p className="text-muted-foreground">
          Lingets propres rangés en attente de retrait/livraison
          {roleLabel ? ` · ${roleLabel}` : ""}
        </p>
      </div>

      {/* 2. Erreur globale (si présente) */}
      {error && !loading && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-lg border border-danger/30 bg-danger/5 p-4 text-sm text-foreground"
        >
          <AlertCircle className="size-5 shrink-0 text-danger" aria-hidden />
          <div className="min-w-0 flex-1 space-y-1">
            <p className="font-semibold">Impossible de charger les casiers</p>
            <p className="text-muted-foreground">{error}</p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fetchData()}
          >
            <RefreshCw className="size-4" />
            Réessayer
          </Button>
        </div>
      )}

      {/* 3. Bannière migration non appliquée */}
      {renderMigrationBanner()}

      {/* 4. StatCards (4) */}
      {renderStatCards()}

      {/* 5. Filtres (recherche + select statut) */}
      {!(error && !loading) && (
        <div className="space-y-3">
          {renderFilters()}
        </div>
      )}

      {/* 6. Grille des casiers */}
      {renderGrille()}
    </div>
  );
}

export default CasiersGrid;
