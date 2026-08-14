/**
 * e-pressing — /personnel/laveur/commandes (LAV-1)
 * --------------------------------------------------
 * Liste des commandes dont au moins un article est assigné au laveur
 * connecté. Le filtrage par `assigne_a = me.id` se fait SERVEUR-SIDE
 * via l'endpoint /api/personnel/taches — JAMAIS uniquement côté frontend.
 *
 * Fonctionnalités :
 *   - Header (titre "Mes commandes assignées" — réellement exact car
 *     filtré par assignation) + sous-titre "Laveur"
 *   - 3 StatCards : À traiter / En cours / Terminées (compteurs serveur)
 *   - Filtres : Select statut commande + recherche debouncée (300 ms)
 *   - Table desktop / cards mobile : N° ticket (lien cliquable vers le
 *     détail), Client, Date réception, Mes articles (count), Statut, Action
 *   - Action "Marquer lavé" : marque UNIQUEMENT les articles assignés au
 *     laveur (mes_articles.ids_a_traiter) — n'affecte pas les articles
 *     d'un autre laveur sur la même commande.
 *   - Pagination simple (Précédent / Suivant)
 *   - États loading (skeletons) + error (alerte + Réessayer) + empty
 *
 * 🔒 SÉCURITÉ :
 *   - Le layout (personnel)/layout.tsx vérifie déjà l'auth + le rôle.
 *   - L'endpoint /api/personnel/taches filtre par assigne_a = me.id côté
 *     serveur. Un laveur ne voit JAMAIS les tâches d'un autre laveur ni
 *     d'un autre pressing (RLS).
 *   - Le lien N° ticket pointe vers /personnel/laveur/commandes/[id].
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle,
  Loader2,
  Search,
  Shirt,
  X,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
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
import { toast } from "sonner";
import { StatCard } from "@/components/ogpressing/stat-card";
import { StatusBadge, EmptyState } from "@/components/shared";
import {
  STATUT_LABELS,
  statutVariant,
} from "@/components/ogpressing/admin/commandes/commandes-helpers";
import { formatDateOnly, formatFCFA } from "@/lib/utils/format";

const BASE_PATH = "/personnel/laveur";
const PAGE_SIZE = 10;

/** Statuts que le laveur peut filtrer / traiter. */
type LaveurStatut = "recu" | "en_traitement" | "lave" | "tous";

const STATUT_OPTIONS: { value: LaveurStatut; label: string }[] = [
  { value: "tous", label: "Toutes (recu + en_traitement + lave)" },
  { value: "recu", label: "Reçu" },
  { value: "en_traitement", label: "En traitement" },
  { value: "lave", label: "Lavé" },
];

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface MesArticlesBreakdown {
  total: number;
  a_traiter: number;
  en_cours: number;
  termines: number;
  by_statut: Record<string, number>;
  ids: string[];
  ids_a_traiter: string[];
}

interface CommandeItem {
  id: string;
  numero_commande: string;
  statut: string;
  statut_paiement: string;
  montant_total: number;
  montant_paye: number;
  date_reception: string | null;
  date_pret_prevue: string | null;
  priorite: string | null;
  created_at: string;
  client: { id: string; nom_complet: string; telephone: string | null } | null;
  mes_articles: MesArticlesBreakdown;
}

interface TachesApiResponse {
  success: boolean;
  data: CommandeItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  counters: {
    total_assignees: number;
    a_traiter: number;
    en_cours: number;
    termines: number;
  };
  error?: string;
}

interface PatchArticleApiResponse {
  success: boolean;
  data?: { id: string; statut: string };
  error?: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function buildListParams(opts: {
  statut: LaveurStatut;
  q: string;
  page: number;
}): URLSearchParams {
  const params = new URLSearchParams({
    page: String(opts.page),
    pageSize: String(PAGE_SIZE),
  });
  if (opts.statut !== "tous") {
    params.set("statut", opts.statut);
  }
  if (opts.q) {
    params.set("q", opts.q);
  }
  return params;
}

/**
 * Marque les articles assignés au laveur (mes_articles.ids_a_traiter) comme
 * "lave". N'affecte QUE les articles du laveur connecté — pas ceux d'un
 * autre laveur sur la même commande.
 */
async function markMesArticlesLaves(
  commandeId: string,
  articleIds: string[]
): Promise<number> {
  if (articleIds.length === 0) {
    throw new Error("Aucun article à marquer comme lavé.");
  }

  const results = await Promise.allSettled(
    articleIds.map((aid) =>
      fetch(`/api/admin/commandes/${commandeId}/articles/${aid}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statut: "lave" }),
      }).then((r) => r.json() as Promise<PatchArticleApiResponse>)
    )
  );

  const failed = results.filter(
    (r) => r.status !== "fulfilled" || !r.value.success
  );
  if (failed.length === results.length) {
    const firstFulfilled = results.find(
      (r): r is PromiseFulfilledResult<PatchArticleApiResponse> =>
        r.status === "fulfilled" && !r.value.success
    );
    throw new Error(
      firstFulfilled?.value.error ??
        "Échec de la mise à jour des articles. Veuillez réessayer."
    );
  }

  const successCount = results.length - failed.length;
  if (failed.length > 0) {
    toast.warning(`${successCount} article(s) marqué(s) lavé(s)`, {
      description: `${failed.length} article(s) n'ont pas pu être mis à jour.`,
    });
  }
  return successCount;
}

/* ------------------------------------------------------------------ */
/*  Composant                                                          */
/* ------------------------------------------------------------------ */

export default function LaveurCommandesPage() {
  // --- Filtres ---
  const [statutFilter, setStatutFilter] = useState<LaveurStatut>("tous");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  // --- Données liste ---
  const [commandes, setCommandes] = useState<CommandeItem[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // --- Compteurs (depuis l'API, serveur-side) ---
  const [counters, setCounters] = useState({
    total_assignees: 0,
    a_traiter: 0,
    en_cours: 0,
    termines: 0,
  });

  // --- Action state ---
  const [markingId, setMarkingId] = useState<string | null>(null);

  /* -------------------- Debounce recherche -------------------- */
  useEffect(() => {
    const handle = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(handle);
  }, [query]);

  /* -------------------- Reset page quand filtre change -------------------- */
  useEffect(() => {
    setPage(1);
  }, [statutFilter, debouncedQuery]);

  /* -------------------- Fetch liste (endpoint filtré serveur) -------------------- */
  const fetchCommandes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = buildListParams({
        statut: statutFilter,
        q: debouncedQuery,
        page,
      });
      const res = await fetch(
        `/api/personnel/taches?${params.toString()}`,
        { cache: "no-store" }
      );
      const json: TachesApiResponse = await res.json();
      if (!json.success) {
        throw new Error(
          json.error || "Erreur lors de la récupération des tâches"
        );
      }
      setCommandes(json.data ?? []);
      setTotal(json.total ?? 0);
      setTotalPages(json.totalPages ?? 0);
      setCounters(
        json.counters ?? {
          total_assignees: 0,
          a_traiter: 0,
          en_cours: 0,
          termines: 0,
        }
      );
    } catch (err) {
      console.error("[laveur/commandes] Erreur fetch:", err);
      if (err instanceof TypeError && err.message.includes("fetch")) {
        setError(
          "Erreur réseau. Vérifiez votre connexion internet puis rechargez."
        );
      } else if (err instanceof Error && err.message) {
        setError(err.message);
      } else {
        setError("Une erreur est survenue. Veuillez réessayer.");
      }
    } finally {
      setLoading(false);
    }
  }, [statutFilter, debouncedQuery, page]);

  useEffect(() => {
    fetchCommandes();
  }, [fetchCommandes]);

  /* -------------------- Action : Marquer lavé -------------------- */
  async function handleMarquerLave(cmd: CommandeItem) {
    if (markingId) return;
    const idsATraiter = cmd.mes_articles?.ids_a_traiter ?? [];
    if (idsATraiter.length === 0) {
      toast.error("Aucun article à traiter", {
        description: "Tous vos articles assignés sont déjà lavés ou plus avancés.",
      });
      return;
    }
    setMarkingId(cmd.id);
    try {
      const count = await markMesArticlesLaves(cmd.id, idsATraiter);
      toast.success("Articles marqués comme lavés", {
        description: `${count} article(s) mis à jour pour la commande ${cmd.numero_commande}.`,
      });
      await fetchCommandes();
    } catch (err) {
      const message =
        err instanceof Error && err.message
          ? err.message
          : "Échec de la mise à jour. Veuillez réessayer.";
      toast.error("Action impossible", { description: message });
    } finally {
      setMarkingId(null);
    }
  }

  /* -------------------- Indique si une commande est "marquable" -------------------- */
  const isMarkable = (cmd: CommandeItem) =>
    (cmd.mes_articles?.ids_a_traiter?.length ?? 0) > 0;

  /* -------------------- Sous-composant : 3 StatCards -------------------- */
  function renderStatCards() {
    if (loading && commandes.length === 0) {
      return (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      );
    }
    return (
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        <StatCard
          label="À traiter"
          value={counters.a_traiter}
          icon={Shirt}
          accent="warning"
          description="Articles reçus / en traitement"
          delay={0}
        />
        <StatCard
          label="En cours"
          value={counters.en_cours}
          icon={Loader2}
          accent="primary"
          description="Articles en cours de lavage"
          delay={60}
        />
        <StatCard
          label="Terminées"
          value={counters.termines}
          icon={CheckCircle}
          accent="secondary"
          description="Articles lavés et au-delà"
          delay={120}
        />
      </div>
    );
  }

  /* -------------------- Sous-composant : Filtres -------------------- */
  function renderFilters() {
    return (
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher par n° commande ou nom client…"
            className="h-11 pl-9 pr-9"
            aria-label="Rechercher une commande"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Effacer la recherche"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
        <Select
          value={statutFilter}
          onValueChange={(v) => setStatutFilter(v as LaveurStatut)}
        >
          <SelectTrigger
            className="h-11 w-full sm:w-72"
            aria-label="Filtrer par statut"
          >
            <SelectValue placeholder="Toutes" />
          </SelectTrigger>
          <SelectContent>
            {STATUT_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  /* -------------------- Sous-composant : Ligne desktop -------------------- */
  function renderDesktopRow(cmd: CommandeItem) {
    const markable = isMarkable(cmd);
    const isMarking = markingId === cmd.id;
    const myArticleCount = cmd.mes_articles?.total ?? 0;

    return (
      <tr key={cmd.id} className="group transition-colors hover:bg-accent/40">
        <td className="px-4 py-3">
          <Link
            href={`${BASE_PATH}/commandes/${cmd.id}`}
            className="font-mono text-xs font-medium text-foreground underline-offset-2 group-hover:text-primary group-hover:underline"
            title={`Ouvrir le détail de la commande ${cmd.numero_commande}`}
          >
            {cmd.numero_commande}
          </Link>
        </td>
        <td className="px-4 py-3">
          <div className="flex flex-col">
            <span className="font-medium text-foreground">
              {cmd.client?.nom_complet ?? "—"}
            </span>
            {cmd.client?.telephone && (
              <span className="text-xs text-muted-foreground">
                {cmd.client.telephone}
              </span>
            )}
          </div>
        </td>
        <td className="px-4 py-3 text-muted-foreground">
          {formatDateOnly(cmd.date_reception ?? cmd.created_at)}
        </td>
        <td className="px-4 py-3 text-sm text-foreground">
          {myArticleCount === 0 ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            <span className="inline-flex items-center gap-1">
              <Shirt className="size-3.5 text-muted-foreground" />
              {myArticleCount}
            </span>
          )}
        </td>
        <td className="px-4 py-3">
          <StatusBadge
            status={cmd.statut}
            label={STATUT_LABELS[cmd.statut] ?? cmd.statut}
            variant={statutVariant(cmd.statut)}
          />
        </td>
        <td className="px-4 py-3 text-right">
          {markable ? (
            <Button
              type="button"
              size="sm"
              onClick={() => handleMarquerLave(cmd)}
              disabled={!!markingId}
              aria-label={`Marquer les articles de la commande ${cmd.numero_commande} comme lavés`}
            >
              {isMarking ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Lavage…
                </>
              ) : (
                <>
                  <CheckCircle className="size-4" />
                  Marquer lavé
                </>
              )}
            </Button>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <CheckCircle className="size-3.5" />
              Déjà traitée
            </span>
          )}
        </td>
      </tr>
    );
  }

  /* -------------------- Sous-composant : Card mobile -------------------- */
  function renderMobileCard(cmd: CommandeItem) {
    const markable = isMarkable(cmd);
    const isMarking = markingId === cmd.id;
    const myArticleCount = cmd.mes_articles?.total ?? 0;

    return (
      <li key={cmd.id}>
        <Card className="bg-card">
          <CardContent className="space-y-3 p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <Link
                  href={`${BASE_PATH}/commandes/${cmd.id}`}
                  className="font-mono text-xs font-semibold text-foreground underline-offset-2 hover:text-primary hover:underline"
                >
                  {cmd.numero_commande}
                </Link>
                <p className="mt-0.5 truncate text-sm font-medium text-foreground">
                  {cmd.client?.nom_complet ?? "—"}
                </p>
                {cmd.client?.telephone && (
                  <p className="truncate text-xs text-muted-foreground">
                    {cmd.client.telephone}
                  </p>
                )}
              </div>
              <StatusBadge
                status={cmd.statut}
                label={STATUT_LABELS[cmd.statut] ?? cmd.statut}
                variant={statutVariant(cmd.statut)}
                className="shrink-0"
              />
            </div>

            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>
                Reçue le {formatDateOnly(cmd.date_reception ?? cmd.created_at)}
              </span>
              <span className="inline-flex items-center gap-1">
                <Shirt className="size-3.5" />
                {myArticleCount === 0
                  ? "—"
                  : `${myArticleCount} article${myArticleCount > 1 ? "s" : ""}`}
              </span>
              <span className="font-semibold text-foreground">
                {formatFCFA(cmd.montant_total)}
              </span>
            </div>

            <div className="pt-1">
              {markable ? (
                <Button
                  type="button"
                  size="sm"
                  className="w-full"
                  onClick={() => handleMarquerLave(cmd)}
                  disabled={!!markingId}
                >
                  {isMarking ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Lavage en cours…
                    </>
                  ) : (
                    <>
                      <CheckCircle className="size-4" />
                      Marquer lavé
                    </>
                  )}
                </Button>
              ) : (
                <div className="flex items-center justify-center gap-1 rounded-md bg-muted/40 py-2 text-xs text-muted-foreground">
                  <CheckCircle className="size-3.5" />
                  Déjà traitée
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </li>
    );
  }

  /* -------------------- Sous-composant : Liste (table/cards) -------------------- */
  function renderList() {
    if (loading) {
      return (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      );
    }
    if (error) {
      return (
        <div
          role="alert"
          className="flex flex-col items-center justify-center gap-2 rounded-lg border border-danger/30 bg-danger/5 p-8 text-center"
        >
          <AlertCircle className="size-8 text-danger" />
          <p className="text-sm font-medium text-foreground">{error}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchCommandes()}
          >
            Réessayer
          </Button>
        </div>
      );
    }
    if (commandes.length === 0) {
      return (
        <EmptyState
          icon={Shirt}
          title="Aucune commande assignée"
          description={
            debouncedQuery
              ? "Aucune commande ne correspond à votre recherche. Modifiez vos critères ou effacez la recherche."
              : statutFilter === "tous"
              ? "Aucune commande ne vous est assignée pour le moment. Les nouvelles tâches assignées par votre manager apparaîtront ici."
              : `Aucune commande avec le statut « ${STATUT_LABELS[statutFilter] ?? statutFilter} » ne vous est assignée.`
          }
        />
      );
    }
    return (
      <>
        {/* Desktop : tableau */}
        <div className="hidden overflow-x-auto rounded-lg border md:block">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50">
              <tr className="text-left">
                <th className="px-4 py-3 font-semibold text-foreground">
                  N° ticket
                </th>
                <th className="px-4 py-3 font-semibold text-foreground">
                  Client
                </th>
                <th className="px-4 py-3 font-semibold text-foreground">
                  Date réception
                </th>
                <th className="px-4 py-3 font-semibold text-foreground">
                  Mes articles
                </th>
                <th className="px-4 py-3 font-semibold text-foreground">
                  Statut
                </th>
                <th className="px-4 py-3 text-right font-semibold text-foreground">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {commandes.map(renderDesktopRow)}
            </tbody>
          </table>
        </div>

        {/* Mobile : cards */}
        <ul className="space-y-3 md:hidden">
          {commandes.map(renderMobileCard)}
        </ul>
      </>
    );
  }

  /* -------------------- Sous-composant : Pagination -------------------- */
  const start = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const end = Math.min(page * PAGE_SIZE, total);

  function renderPagination() {
    if (total === 0 || loading || error) return null;
    return (
      <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
        <p className="text-sm text-muted-foreground">
          Affichage de{" "}
          <span className="font-medium text-foreground">
            {start}–{end}
          </span>{" "}
          sur{" "}
          <span className="font-medium text-foreground">{total}</span>{" "}
          commande{total > 1 ? "s" : ""}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            Précédent
          </Button>
          <span className="text-sm text-muted-foreground">
            Page <span className="font-medium text-foreground">{page}</span> /{" "}
            {totalPages || 1}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
          >
            Suivant
            <ArrowRight className="size-4" />
          </Button>
        </div>
      </div>
    );
  }

  /* -------------------- Rendu principal -------------------- */
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* 1. Header */}
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Mes commandes assignées
        </h1>
        <p className="text-muted-foreground">Laveur</p>
      </div>

      {/* 2. StatCards (vue d'ensemble) */}
      {renderStatCards()}

      {/* 3. Filtres */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filtrer les commandes</CardTitle>
          <CardDescription>
            Recherchez par numéro de ticket ou par nom de client, et filtrez
            par statut de commande. Seules les commandes vous étant assignées
            apparaissent.
          </CardDescription>
        </CardHeader>
        <CardContent>{renderFilters()}</CardContent>
      </Card>

      {/* 4. Liste */}
      <section className="space-y-3" aria-label="Liste des commandes">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">
            {statutFilter === "tous"
              ? "Toutes mes commandes"
              : STATUT_LABELS[statutFilter] ?? "Commandes"}
          </h2>
          {markingId && (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              Mise à jour en cours…
            </span>
          )}
        </div>
        {renderList()}
      </section>

      {/* 5. Pagination */}
      {renderPagination()}
    </div>
  );
}
