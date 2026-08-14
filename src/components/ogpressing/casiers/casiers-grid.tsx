/**
 * e-pressing — CasiersGrid (CASIERS-V2 — migration 039)
 * =====================================================
 * Composant partagé affichant une grille visuelle des casiers de stockage
 * du pressing. Travaille avec la nouvelle API /api/admin/casiers (migration
 * 039) qui renvoie une liste plate de casiers avec leur état (libre/occupé).
 *
 * Fonctionnalités :
 *   - 4 StatCards (occupés, libres, taux d'occupation, total casiers).
 *   - Bannière d'avertissement si la migration 039 n'est pas appliquée.
 *   - Recherche (code, client, n° commande, description) — debounced 300ms.
 *   - Filtre par statut : Tous / Libres / Occupés (segmented control).
 *   - Filtre par zone : Select dropdown alimenté par l'API.
 *   - Grille groupée par zone (A, B, C, D, ...) — tiles responsives.
 *   - Tile casier :
 *       · Occupé  → client, n° commande, article, date, "Libérer".
 *       · Libre   → label "Libre" + "Assigner".
 *       · Inactif → grisée avec badge "Désactivé".
 *   - Bouton "Historique" (icône) par casier → dialogue scrollable.
 *   - Dialogue d'assignation : saisie UUID article → POST /assign.
 *   - Bouton refresh manuel.
 *
 * Utilisé par :
 *   - /personnel/manager/casiers
 *   - /personnel/repassage/casiers
 *
 * 🔒 SÉCURITÉ :
 *   L'API /api/admin/casiers* est protégée côté serveur. La RLS isole par
 *   pressing_id. Le composant ne fait qu'appeler les endpoints REST.
 */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Archive,
  ArchiveRestore,
  ArrowRight,
  History,
  Info,
  LayoutGrid,
  Lock,
  MapPin,
  Percent,
  RefreshCw,
  Search,
  Shirt,
  Unlock,
  User,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/ogpressing/stat-card";
import { cn } from "@/lib/utils";
import { formatDate, formatDateOnly, formatRelative } from "@/lib/utils/format";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/** Casier renvoyé par l'API GET /api/admin/casiers. */
export interface CasierItem {
  id: string;
  code: string;
  zone: string | null;
  actif: boolean;
  occupe: boolean;
  article_id?: string;
  article_description?: string;
  commande_id?: string;
  commande_numero?: string;
  client_nom?: string | null;
  client_telephone?: string | null;
  date_rangeement?: string | null;
  range_par_nom?: string | null;
  statut_article?: string;
  affectation_id?: string;
}

/** Contenu de `data` dans la réponse GET /api/admin/casiers. */
interface CasiersData {
  casiers: CasierItem[];
  total: number;
  total_libres: number;
  total_occupes: number;
  taux_occupation: number;
  zones: string[];
  migration_appliquee: boolean;
}

interface CasiersApiResponse {
  success: boolean;
  data?: CasiersData;
  error?: string;
}

/** Affectation historique (GET /api/admin/casiers/[code]/historique). */
interface AffectationHistorique {
  id: string;
  statut: string;
  affecte_le: string;
  libere_le: string | null;
  motif: string | null;
  article_id: string;
  article_description: string | null;
  commande_numero: string | null;
  client_nom: string | null;
  affecte_par_nom: string | null;
  libere_par_nom: string | null;
}

interface HistoriqueData {
  casier: { id: string; code: string; zone: string | null; actif: boolean };
  affectations: AffectationHistorique[];
}

interface HistoriqueResponse {
  success: boolean;
  data?: HistoriqueData;
  error?: string;
}

/** Réponse POST/DELETE /api/admin/casiers/[code]/assign. */
interface AssignResponse {
  success: boolean;
  code?: string;
  error?: string;
  data?: unknown;
}

type FiltreStatut = "tous" | "libre" | "occupe";

interface CasiersGridProps {
  /** Base pour les liens vers le détail commande (ex: "/personnel/manager"). */
  basePath: string;
  /** Libellé du rôle affiché dans le sous-titre (ex: "Manager"). */
  roleLabel: string;
  className?: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Renvoie la lettre de zone d'un code casier (ex: "A1" → "A"). */
function zoneOf(code: string): string {
  const m = code.match(/^([A-Za-z]+)/);
  return m ? m[1].toUpperCase() : "?";
}

/** Renvoie le numéro d'ordre d'un code casier (ex: "A1" → 1). */
function numof(code: string): number {
  const m = code.match(/(\d+)$/);
  return m ? parseInt(m[1], 10) : 0;
}

/** Compare deux casiers (zone, puis numéro). */
function compareCasier(a: CasierItem, b: CasierItem): number {
  const za = (a.zone ?? zoneOf(a.code)).toUpperCase();
  const zb = (b.zone ?? zoneOf(b.code)).toUpperCase();
  if (za !== zb) return za.localeCompare(zb);
  return numof(a.code) - numof(b.code);
}

/* ------------------------------------------------------------------ */
/*  Composant                                                          */
/* ------------------------------------------------------------------ */

export function CasiersGrid({
  basePath,
  roleLabel,
  className,
}: CasiersGridProps) {
  const [data, setData] = useState<CasiersData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filtres UI
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState(""); // valeur debouncée
  const [filtreStatut, setFiltreStatut] = useState<FiltreStatut>("tous");
  const [zoneFilter, setZoneFilter] = useState<string>("toutes");

  // Dialogues
  const [assignCasier, setAssignCasier] = useState<CasierItem | null>(null);
  const [historyCasier, setHistoryCasier] = useState<CasierItem | null>(null);

  /* --------------------- Debounce recherche (300ms) --------------------- */

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearch(searchInput.trim());
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchInput]);

  /* ------------------------- Fetch données ------------------------- */

  const fetchData = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!opts?.silent) setLoading(true);
      else setRefreshing(true);
      if (!opts?.silent) setError(null);
      try {
        const params = new URLSearchParams();
        if (search) params.set("search", search);
        if (filtreStatut !== "tous") params.set("statut", filtreStatut);
        if (zoneFilter !== "toutes") params.set("zone", zoneFilter);

        const url = `/api/admin/casiers${params.toString() ? `?${params.toString()}` : ""}`;
        const res = await fetch(url, { cache: "no-store" });
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
        setRefreshing(false);
      }
    },
    [search, filtreStatut, zoneFilter]
  );

  // Refetch quand les filtres changent
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /* -------------------- Libérer un casier (DELETE) -------------------- */

  const handleLiberer = useCallback(
    async (casier: CasierItem) => {
      // Optimistic lock : éviter double-clic
      const tid = toast.loading(`Libération du casier ${casier.code}...`);
      try {
        const res = await fetch(
          `/api/admin/casiers/${encodeURIComponent(casier.code)}/assign`,
          { method: "DELETE", cache: "no-store" }
        );
        const json: AssignResponse = await res.json();
        if (!res.ok || !json.success) {
          throw new Error(
            json.error ||
              `Échec de la libération du casier ${casier.code} (HTTP ${res.status}).`
          );
        }
        toast.success(`Casier ${casier.code} libéré`, {
          id: tid,
          description: "Le casier est maintenant disponible.",
        });
        fetchData({ silent: true });
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message
            : "Une erreur inattendue est survenue.";
        toast.error("Libération impossible", { id: tid, description: msg });
      }
    },
    [fetchData]
  );

  /* -------------------- Re-fetch quand l'assign dialog ferme ---------- */
  // (Le refresh est fait dans le composant AssignDialog après succès.)

  /* ------------------- Calculs dérivés (memo) ------------------- */

  const casiersParZone = useMemo(() => {
    const out: Record<string, CasierItem[]> = {};
    if (!data) return out;
    for (const c of data.casiers) {
      const z = (c.zone ?? zoneOf(c.code)).toUpperCase();
      if (!out[z]) out[z] = [];
      out[z].push(c);
    }
    for (const z of Object.keys(out)) {
      out[z].sort(compareCasier);
    }
    return out;
  }, [data]);

  const zones = useMemo(
    () => Object.keys(casiersParZone).sort(),
    [casiersParZone]
  );

  const totalAffiches = data?.casiers.length ?? 0;

  /* ------------------------- Sous-composants ------------------------- */

  function renderStatCards() {
    if (loading) {
      return (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-xl" />
          ))}
        </div>
      );
    }
    if (error || !data) return null;

    return (
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Casiers occupés"
          value={data.total_occupes}
          icon={Archive}
          accent="warning"
          description="Linges rangés"
          delay={0}
        />
        <StatCard
          label="Casiers libres"
          value={data.total_libres}
          icon={ArchiveRestore}
          accent="secondary"
          description="Disponibles"
          delay={60}
        />
        <StatCard
          label="Taux d'occupation"
          value={`${data.taux_occupation}%`}
          icon={Percent}
          accent="danger"
          description="Du plan total"
          delay={120}
        />
        <StatCard
          label="Total casiers"
          value={data.total}
          icon={LayoutGrid}
          accent="neutral"
          description="Casiers du pressing"
          delay={180}
        />
      </div>
    );
  }

  function renderMigrationBanner() {
    if (loading || error || !data) return null;
    if (data.migration_appliquee) return null;
    return (
      <div
        role="alert"
        className="flex flex-col gap-3 rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm sm:flex-row sm:items-start"
      >
        <AlertCircle className="size-5 shrink-0 text-warning" aria-hidden />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-semibold text-warning">
            Migration base de données requise
          </p>
          <p className="text-muted-foreground">
            La fonctionnalité de casiers nécessite la migration{" "}
            <code className="rounded bg-warning/20 px-1.5 py-0.5 font-mono text-xs font-semibold text-warning">
              039_casiers_uniques.sql
            </code>
            . Appliquez-la via le Dashboard Supabase (SQL Editor) pour activer
            le suivi des casiers. La grille s&apos;affiche ci-dessous avec une
            liste vide.
          </p>
        </div>
      </div>
    );
  }

  function renderFilters() {
    return (
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        {/* Recherche */}
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Rechercher par code, client, n° commande, article..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9 pr-9"
            aria-label="Rechercher un casier"
          />
          {searchInput && (
            <button
              type="button"
              onClick={() => setSearchInput("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label="Effacer la recherche"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        {/* Segmented control — statut */}
        <div className="flex items-center gap-1 rounded-lg border bg-card p-1">
          {(
            [
              { v: "tous", l: "Tous" },
              { v: "libre", l: "Libres" },
              { v: "occupe", l: "Occupés" },
            ] as { v: FiltreStatut; l: string }[]
          ).map((opt) => (
            <Button
              key={opt.v}
              type="button"
              size="sm"
              variant={filtreStatut === opt.v ? "default" : "ghost"}
              className="h-7 px-3"
              onClick={() => setFiltreStatut(opt.v)}
              aria-pressed={filtreStatut === opt.v}
            >
              {opt.l}
            </Button>
          ))}
        </div>

        {/* Select zone */}
        <Select
          value={zoneFilter}
          onValueChange={(v) => setZoneFilter(v)}
        >
          <SelectTrigger
            className="w-full lg:w-44"
            aria-label="Filtrer par zone"
          >
            <MapPin className="size-4 text-muted-foreground" />
            <SelectValue placeholder="Zone" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="toutes">Toutes les zones</SelectItem>
            {(data?.zones ?? []).map((z) => (
              <SelectItem key={z} value={z}>
                Zone {z}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Refresh */}
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => fetchData({ silent: true })}
          loading={refreshing}
          aria-label="Rafraîchir la liste"
          title="Rafraîchir"
        >
          <RefreshCw className="size-4" />
        </Button>
      </div>
    );
  }

  function renderCasierTile(c: CasierItem) {
    const isInactive = !c.actif;
    const isOccupe = c.occupe;

    return (
      <div
        key={c.id}
        className={cn(
          "group relative flex min-h-[120px] flex-col gap-1.5 rounded-lg border p-2.5 text-left transition-all duration-fast ease-smooth",
          isInactive &&
            "border-border/60 bg-muted/20 opacity-70 hover:opacity-100",
          !isInactive &&
            isOccupe &&
            "border-warning/40 bg-warning/5 hover:border-warning hover:bg-warning/10 hover:shadow-md",
          !isInactive &&
            !isOccupe &&
            "border-secondary/40 bg-secondary/5 hover:border-secondary hover:bg-secondary/10 hover:shadow-md"
        )}
      >
        {/* En-tête : code + badge */}
        <div className="flex items-start justify-between gap-1">
          <span
            className={cn(
              "font-mono text-base font-bold leading-none",
              isInactive
                ? "text-muted-foreground"
                : isOccupe
                ? "text-warning"
                : "text-secondary"
            )}
          >
            {c.code}
          </span>
          {isInactive ? (
            <Badge variant="outline" className="border-border text-muted-foreground">
              Désactivé
            </Badge>
          ) : isOccupe ? (
            <Badge variant="warning" dot>
              Occupé
            </Badge>
          ) : (
            <Badge variant="success" dot>
              Libre
            </Badge>
          )}
        </div>

        {/* Corps */}
        <div className="min-h-[36px] flex-1 text-xs">
          {isInactive ? (
            <p className="text-muted-foreground">Casier désactivé</p>
          ) : isOccupe ? (
            <div className="space-y-0.5">
              {c.client_nom && (
                <p className="flex items-center gap-1 font-medium text-foreground">
                  <User className="size-3 shrink-0 text-muted-foreground" />
                  <span className="truncate">{c.client_nom}</span>
                </p>
              )}
              {c.commande_numero && (
                <Link
                  href={`${basePath}/commandes/${c.commande_id}`}
                  className="flex items-center gap-1 text-muted-foreground transition-colors hover:text-foreground hover:underline"
                  title={`Voir la commande ${c.commande_numero}`}
                >
                  <Shirt className="size-3 shrink-0" />
                  <span className="truncate font-mono">
                    {c.commande_numero}
                  </span>
                  <ArrowRight className="size-3 shrink-0 opacity-60" />
                </Link>
              )}
              {c.article_description && (
                <p className="line-clamp-2 text-muted-foreground">
                  {c.article_description}
                </p>
              )}
              {c.date_rangeement && (
                <p className="flex items-center gap-1 text-muted-foreground">
                  <span className="truncate" title={formatDate(c.date_rangeement)}>
                    {formatRelative(c.date_rangeement)}
                  </span>
                </p>
              )}
            </div>
          ) : (
            <p className="text-secondary">Casier disponible</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 pt-1">
          {!isInactive && isOccupe && (
            <Button
              type="button"
              size="sm"
              variant="warning"
              className="h-7 flex-1 px-2 text-xs"
              onClick={() => handleLiberer(c)}
            >
              <Unlock className="size-3.5" />
              Libérer
            </Button>
          )}
          {!isInactive && !isOccupe && (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-7 flex-1 px-2 text-xs"
              onClick={() => setAssignCasier(c)}
            >
              <Lock className="size-3.5" />
              Assigner
            </Button>
          )}

          {/* Bouton historique (icône) */}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            onClick={() => setHistoryCasier(c)}
            aria-label={`Historique du casier ${c.code}`}
            title="Historique"
          >
            <History className="size-3.5" />
          </Button>
        </div>
      </div>
    );
  }

  function renderZone(zone: string, items: CasierItem[]) {
    if (items.length === 0) return null;
    return (
      <div key={zone} className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-md bg-muted font-mono text-sm font-bold text-muted-foreground">
            {zone}
          </span>
          <span className="text-xs text-muted-foreground">
            {items.length} casier{items.length > 1 ? "s" : ""}
            {" · "}
            {items.filter((c) => c.occupe).length} occupé
            {items.filter((c) => c.occupe).length > 1 ? "s" : ""}
          </span>
        </div>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10">
          {items.map((c) => renderCasierTile(c))}
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
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10">
                  {Array.from({ length: 20 }).map((_, i) => (
                    <Skeleton
                      key={i}
                      className="min-h-[120px] w-full rounded-lg"
                    />
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      );
    }

    if (error || !data) return null;

    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <MapPin className="size-5 text-foreground" />
              Plan des casiers
            </CardTitle>
            <CardDescription>
              Cliquez sur «&nbsp;Libérer&nbsp;» pour vider un casier, ou sur
              «&nbsp;Assigner&nbsp;» pour y ranger un article. Le bouton
              horloge ouvre l&apos;historique.
            </CardDescription>
          </div>
          <span className="hidden shrink-0 rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground sm:inline">
            {totalAffiches} affiché{totalAffiches > 1 ? "s" : ""}
          </span>
        </CardHeader>
        <CardContent className="space-y-5">
          {totalAffiches === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-muted/20 py-10 text-center">
              <Search className="size-8 text-muted-foreground/50" />
              <p className="text-sm font-medium text-foreground">
                Aucun casier ne correspond à votre recherche
              </p>
              <p className="max-w-xs text-xs text-muted-foreground">
                Modifiez votre recherche ou vos filtres pour afficher plus de
                casiers.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-1"
                onClick={() => {
                  setSearchInput("");
                  setSearch("");
                  setFiltreStatut("tous");
                  setZoneFilter("toutes");
                }}
              >
                Réinitialiser les filtres
              </Button>
            </div>
          ) : (
            zones.map((z) => renderZone(z, casiersParZone[z]))
          )}
        </CardContent>
      </Card>
    );
  }

  /* ------------------------- Rendu principal ------------------------- */

  return (
    <div className={cn("mx-auto max-w-7xl space-y-6", className)}>
      {/* 1. Header */}
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Casiers de stockage
        </h1>
        <p className="text-muted-foreground">
          Linges propres rangés en attente de retrait/livraison · {roleLabel}
        </p>
      </div>

      {/* 2. Erreur globale */}
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

      {/* 5. Filtres */}
      {!(error && !loading) && (
        <div className="space-y-3">{renderFilters()}</div>
      )}

      {/* 6. Grille */}
      {renderGrille()}

      {/* 7. Dialogues */}
      <AssignCasierDialog
        casier={assignCasier}
        basePath={basePath}
        onOpenChange={(open) => {
          if (!open) setAssignCasier(null);
        }}
        onAssigned={() => fetchData({ silent: true })}
      />

      <HistoriqueDialog
        casier={historyCasier}
        onOpenChange={(open) => {
          if (!open) setHistoryCasier(null);
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Dialogue — Assigner un article à un casier                         */
/* ------------------------------------------------------------------ */

interface AssignCasierDialogProps {
  casier: CasierItem | null;
  basePath: string;
  onOpenChange: (open: boolean) => void;
  onAssigned: () => void;
}

function AssignCasierDialog({
  casier,
  basePath,
  onOpenChange,
  onAssigned,
}: AssignCasierDialogProps) {
  const [articleId, setArticleId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  // Reset quand on ouvre/ferme
  useEffect(() => {
    if (casier) {
      setArticleId("");
      setLocalError(null);
      setSubmitting(false);
    }
  }, [casier]);

  const open = !!casier;

  async function handleConfirm() {
    if (!casier) return;
    const trimmed = articleId.trim();
    if (!trimmed) {
      setLocalError("Veuillez saisir l'identifiant de l'article.");
      return;
    }
    setLocalError(null);
    setSubmitting(true);
    try {
      const res = await fetch(
        `/api/admin/casiers/${encodeURIComponent(casier.code)}/assign`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ article_id: trimmed }),
          cache: "no-store",
        }
      );
      const json: AssignResponse = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(
          json.error ||
            `Échec de l'assignation (HTTP ${res.status}).`
        );
      }
      toast.success(`Article assigné au casier ${casier.code}`, {
        description: "Le casier est maintenant occupé.",
      });
      onAssigned();
      onOpenChange(false);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "Une erreur inattendue est survenue.";
      setLocalError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="size-5 text-secondary" />
            Assigner un article au casier {casier?.code ?? ""}
          </DialogTitle>
          <DialogDescription>
            Collez l&apos;identifiant UUID de l&apos;article à ranger dans ce
            casier. L&apos;article doit être prêt à être rangé.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="article-id-input">Identifiant de l&apos;article</Label>
            <Input
              id="article-id-input"
              type="text"
              placeholder="ex: 550e8400-e29b-41d4-a716-446655440000"
              value={articleId}
              onChange={(e) => setArticleId(e.target.value)}
              autoFocus
              autoComplete="off"
              spellCheck={false}
              className="font-mono text-sm"
              disabled={submitting}
            />
            <p className="text-xs text-muted-foreground">
              💡 Vous trouverez cet identifiant dans le détail d&apos;une
              commande (bouton «&nbsp;Ranger en casier&nbsp;»).
            </p>
          </div>

          {localError && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger/5 p-2.5 text-xs text-danger"
            >
              <AlertCircle className="size-4 shrink-0" aria-hidden />
              <span className="flex-1">{localError}</span>
            </div>
          )}

          <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 p-2.5 text-xs text-muted-foreground">
            <Info className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span>
              Astuce : ouvrez{" "}
              <Link
                href={`${basePath}/commandes`}
                className="font-medium text-secondary hover:underline"
              >
                Mes commandes
              </Link>{" "}
              pour trouver un article à ranger.
            </span>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Annuler
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={handleConfirm}
            loading={submitting}
            disabled={!articleId.trim()}
          >
            <Lock className="size-4" />
            Confirmer l&apos;assignation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/*  Dialogue — Historique d'un casier                                  */
/* ------------------------------------------------------------------ */

interface HistoriqueDialogProps {
  casier: CasierItem | null;
  onOpenChange: (open: boolean) => void;
}

function HistoriqueDialog({ casier, onOpenChange }: HistoriqueDialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [affectations, setAffectations] = useState<AffectationHistorique[]>([]);

  useEffect(() => {
    if (!casier) {
      setAffectations([]);
      setError(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await fetch(
          `/api/admin/casiers/${encodeURIComponent(casier.code)}/historique`,
          { cache: "no-store" }
        );
        const json: HistoriqueResponse = await res.json();
        if (!res.ok || !json.success || !json.data) {
          throw new Error(
            json.error ||
              `Échec du chargement de l'historique (HTTP ${res.status}).`
          );
        }
        if (!cancelled) {
          setAffectations(json.data.affectations ?? []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Une erreur inattendue est survenue."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [casier]);

  const open = !!casier;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="size-5 text-foreground" />
            Historique du casier {casier?.code ?? ""}
          </DialogTitle>
          <DialogDescription>
            Liste chronologique des affectations de ce casier (max. 100).
          </DialogDescription>
        </DialogHeader>

        {/* Contenu scrollable */}
        <div className="max-h-96 overflow-y-auto pr-1">
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-full rounded-md" />
              ))}
            </div>
          ) : error ? (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger/5 p-3 text-sm text-danger"
            >
              <AlertCircle className="size-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : affectations.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed bg-muted/20 py-8 text-center">
              <Info className="size-6 text-muted-foreground/50" />
              <p className="text-sm font-medium text-foreground">
                Aucune affectation enregistrée
              </p>
              <p className="max-w-xs text-xs text-muted-foreground">
                Ce casier n&apos;a jamais été utilisé pour ranger un article.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {affectations.map((a) => {
                const isActif = a.statut === "actif";
                return (
                  <li
                    key={a.id}
                    className={cn(
                      "rounded-md border p-3 text-sm",
                      isActif
                        ? "border-secondary/40 bg-secondary/5"
                        : "border-border bg-card"
                    )}
                  >
                    {/* En-tête : date + statut */}
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-muted-foreground">
                        {formatDate(a.affecte_le)}
                      </p>
                      <Badge
                        variant={isActif ? "success" : "outline"}
                        dot
                      >
                        {isActif ? "Actif" : "Libéré"}
                      </Badge>
                    </div>

                    {/* Article + commande */}
                    <p className="mt-1.5 font-medium text-foreground">
                      {a.article_description ?? "Article sans description"}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      {a.commande_numero && (
                        <span className="flex items-center gap-1">
                          <Shirt className="size-3" />
                          <span className="font-mono">
                            {a.commande_numero}
                          </span>
                        </span>
                      )}
                      {a.client_nom && (
                        <span className="flex items-center gap-1">
                          <User className="size-3" />
                          {a.client_nom}
                        </span>
                      )}
                    </div>

                    {/* Libération */}
                    {!isActif && (
                      <div className="mt-2 space-y-0.5 border-t pt-1.5 text-xs text-muted-foreground">
                        {a.libere_le && (
                          <p>
                            Libéré le{" "}
                            <span className="text-foreground">
                              {formatDateOnly(a.libere_le)}
                            </span>
                          </p>
                        )}
                        {a.libere_par_nom && (
                          <p>
                            par{" "}
                            <span className="text-foreground">
                              {a.libere_par_nom}
                            </span>
                          </p>
                        )}
                        {a.motif && (
                          <p className="italic">Motif : {a.motif}</p>
                        )}
                      </div>
                    )}

                    {/* Affecté par */}
                    {a.affecte_par_nom && (
                      <p className="mt-1.5 text-[11px] text-muted-foreground">
                        Affecté par {a.affecte_par_nom}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Fermer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default CasiersGrid;
