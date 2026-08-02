/**
 * OgPressing — /personnel/repassage/commandes (REP-1)
 * ----------------------------------------------------
 * Liste des commandes à repasser (commandes ayant des articles au statut
 * "lave"). Filtres par statut (lave, repasse, pret) + recherche texte
 * debouncée. Action "Marquer repassé" par commande : fetch du détail, puis
 * PATCH de chaque article au statut "lave" vers "repasse".
 *
 * Affichage mobile-first : cards empilées sur mobile, tableau sur desktop.
 *
 * 🔒 SÉCURITÉ : le layout (personnel)/layout.tsx vérifie déjà l'auth + le
 *    rôle (repassage uniquement sur /personnel/repassage/*). Les endpoints
 *    /api/admin/commandes (et sous-routes) acceptent n'importe quel personnel
 *    actif. La RLS isole par pressing_id.
 *
 * 🔁 WORKFLOW : le trigger DB `trg_commandes_statut_apres_article_update`
 *    (migration 005) recalcule automatiquement `commandes.statut` après chaque
 *    PATCH d'article. Donc une fois tous les articles "lave" passés à
 *    "repasse", la commande disparaît du filtre "lave" au prochain reload.
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle,
  ClipboardList,
  Loader2,
  Search,
  Shirt,
  Wind,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState, StatusBadge } from "@/components/shared";
import { CommandesPagination } from "@/components/ogpressing/admin/commandes/commandes-pagination";
import {
  STATUT_LABELS,
  statutVariant,
  type CommandeListItem,
  type CommandesApiResponse,
} from "@/components/ogpressing/admin/commandes/commandes-helpers";
import { formatFCFA, formatDateOnly } from "@/lib/utils/format";

const PAGE_SIZE = 10;

/** Options du filtre statut — limitées aux 3 statuts pertinents pour le
 *  poste repassage (lave = à faire, repasse = fait, pret = validé). */
const STATUT_OPTIONS: { value: string; label: string }[] = [
  { value: "lave", label: "À repasser" },
  { value: "repasse", label: "Repassées" },
  { value: "pret", label: "Prêtes" },
];

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ArticleRow {
  id: string;
  statut: string;
}

interface CommandeDetailApiResponse {
  success: boolean;
  data?: {
    id: string;
    articles?: ArticleRow[];
  };
  error?: string;
}

interface ArticlePatchResponse {
  success: boolean;
  error?: string;
}

/** Cache : commandeId → { total, lave } articles. */
type ArticleCountMap = Record<
  string,
  { total: number; lave: number }
>;

/* ------------------------------------------------------------------ */
/*  Composant                                                          */
/* ------------------------------------------------------------------ */

export default function RepassageCommandesPage() {
  // Filtres
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [statut, setStatut] = useState("lave"); // défaut : à repasser
  const [page, setPage] = useState(1);

  // Données
  const [commandes, setCommandes] = useState<CommandeListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [articleCounts, setArticleCounts] = useState<ArticleCountMap>({});

  // États
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** commandeId en cours de traitement "Marquer repassé". */
  const [processingId, setProcessingId] = useState<string | null>(null);

  /* ----------- Debounce 300ms sur la recherche ----------- */
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQuery(query);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  /* ----------- Fetch de la liste paginée ----------- */
  const fetchCommandes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        statut,
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      if (debouncedQuery) params.set("q", debouncedQuery);

      const res = await fetch(`/api/admin/commandes?${params.toString()}`, {
        cache: "no-store",
      });
      const json: CommandesApiResponse = await res.json();

      if (!json.success) {
        throw new Error(
          json.error || "Erreur lors de la récupération des commandes"
        );
      }

      setCommandes(json.data);
      setTotal(json.total);
      setTotalPages(json.totalPages);

      // N+1 borné : fetch du détail de chaque commande pour compter les
      // articles (total + au statut "lave"). Promise.all → parallèle.
      const details: CommandeDetailApiResponse[] = await Promise.all(
        (json.data ?? []).map((c) =>
          fetch(`/api/admin/commandes/${c.id}`, { cache: "no-store" })
            .then((r) => r.json() as Promise<CommandeDetailApiResponse>)
            .catch(
              () => ({ success: false }) as CommandeDetailApiResponse
            )
        )
      );

      const counts: ArticleCountMap = {};
      (json.data ?? []).forEach((c, i) => {
        const d = details[i];
        const articles = d.success ? d.data?.articles ?? [] : [];
        counts[c.id] = {
          total: articles.length,
          lave: articles.filter((a) => a.statut === "lave").length,
        };
      });
      setArticleCounts(counts);
    } catch (err) {
      console.error("[repassage/commandes] Erreur fetch:", err);
      setCommandes([]);
      setTotal(0);
      setTotalPages(0);
      setArticleCounts({});
      if (err instanceof TypeError && err.message.includes("fetch")) {
        setError(
          "Erreur réseau. Vérifiez votre connexion internet puis rechargez la page."
        );
      } else if (err instanceof Error && err.message) {
        setError(err.message);
      } else {
        setError(
          "Une erreur est survenue lors du chargement des commandes. Veuillez réessayer."
        );
      }
    } finally {
      setLoading(false);
    }
  }, [statut, page, debouncedQuery]);

  useEffect(() => {
    fetchCommandes();
  }, [fetchCommandes]);

  /* ----------- Action "Marquer repassé" ----------- */
  const handleMarquerRepasser = useCallback(
    async (commande: CommandeListItem) => {
      setProcessingId(commande.id);
      try {
        // 1. Fetch du détail pour récupérer les articles
        const detailRes = await fetch(
          `/api/admin/commandes/${commande.id}`,
          { cache: "no-store" }
        );
        const detail: CommandeDetailApiResponse = await detailRes.json();
        if (!detail.success || !detail.data) {
          throw new Error(
            detail.error || "Impossible de charger le détail de la commande"
          );
        }

        const articlesLave = (detail.data.articles ?? []).filter(
          (a) => a.statut === "lave"
        );

        if (articlesLave.length === 0) {
          toast.info("Aucun article à repasser dans cette commande.", {
            description: "Tous les articles sont déjà repassés.",
          });
          // Recharge la liste : la commande a peut-être déjà été traitée
          await fetchCommandes();
          return;
        }

        // 2. PATCH parallèle de chaque article "lave" → "repasse"
        const patchResults: ArticlePatchResponse[] = await Promise.all(
          articlesLave.map((a) =>
            fetch(
              `/api/admin/commandes/${commande.id}/articles/${a.id}`,
              {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ statut: "repasse" }),
              }
            )
              .then((r) => r.json() as Promise<ArticlePatchResponse>)
              .catch(
                () =>
                  ({ success: false, error: "Erreur réseau" }) as ArticlePatchResponse
              )
          )
        );

        const failed = patchResults.filter((r) => !r.success);
        if (failed.length > 0) {
          throw new Error(
            `${failed.length} article(s) n'ont pas pu être mis à jour${
              failed[0].error ? ` : ${failed[0].error}` : ""
            }`
          );
        }

        toast.success("Articles marqués comme repassés", {
          description: `${articlesLave.length} article(s) de la commande ${commande.numero_commande} repassé(s).`,
        });

        // 3. Recharge la liste — la commande devrait avoir disparu du filtre
        //    "lave" grâce au trigger DB qui recalcule commandes.statut.
        await fetchCommandes();
      } catch (err) {
        console.error(
          `[repassage/commandes] Erreur marquer repassé pour ${commande.id}:`,
          err
        );
        const message =
          err instanceof Error && err.message
            ? err.message
            : "Une erreur est survenue lors du traitement.";
        toast.error("Échec du repassage", { description: message });
      } finally {
        setProcessingId(null);
      }
    },
    [fetchCommandes]
  );

  /* ----------- Sous-composant : Filtres ----------- */
  function renderFilters() {
    return (
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        {/* Recherche */}
        <div className="relative w-full lg:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher par n° ticket ou client…"
            className="h-10 pl-9 pr-9"
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

        {/* Select statut */}
        <div className="flex items-center gap-2">
          <Select
            value={statut}
            onValueChange={(v) => {
              setStatut(v);
              setPage(1);
            }}
          >
            <SelectTrigger
              className="h-10 w-[180px]"
              aria-label="Filtrer par statut"
            >
              <SelectValue placeholder="Statut" />
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
      </div>
    );
  }

  /* ----------- Sous-composant : Tableau desktop ----------- */
  function renderTable() {
    if (loading) {
      return (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      );
    }

    if (commandes.length === 0) {
      return (
        <EmptyState
          icon={Wind}
          title="Aucune commande à repasser"
          description={
            statut === "lave"
              ? "Toutes les commandes lavées ont été repassées. Bon travail !"
              : "Aucune commande ne correspond à ce filtre."
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
                  Numéro
                </th>
                <th className="px-4 py-3 font-semibold text-foreground">
                  Client
                </th>
                <th className="px-4 py-3 font-semibold text-foreground">
                  Date réception
                </th>
                <th className="px-4 py-3 text-center font-semibold text-foreground">
                  Articles
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
              {commandes.map((cmd) => {
                const counts = articleCounts[cmd.id];
                const totalArticles = counts?.total ?? 0;
                const laveArticles = counts?.lave ?? 0;
                const canRepasser = cmd.statut === "lave" && laveArticles > 0;
                const isProcessing = processingId === cmd.id;

                return (
                  <tr
                    key={cmd.id}
                    className="group transition-colors hover:bg-accent/50"
                  >
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs font-medium text-foreground">
                        {cmd.numero_commande}
                      </span>
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
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center gap-1 font-medium text-foreground">
                        <Shirt className="size-3.5 text-muted-foreground" />
                        {totalArticles}
                      </span>
                      {laveArticles > 0 && (
                        <span className="ml-1 text-xs text-warning">
                          ({laveArticles} lavé{laveArticles > 1 ? "s" : ""})
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
                      {canRepasser ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="default"
                          onClick={() => handleMarquerRepasser(cmd)}
                          disabled={isProcessing}
                          aria-label={`Marquer les articles de la commande ${cmd.numero_commande} comme repassés`}
                        >
                          {isProcessing ? (
                            <>
                              <Loader2 className="size-4 animate-spin" />
                              Traitement…
                            </>
                          ) : (
                            <>
                              <CheckCircle className="size-4" />
                              Marquer repassé
                            </>
                          )}
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          —
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile : cards */}
        <ul className="space-y-3 md:hidden">
          {commandes.map((cmd) => {
            const counts = articleCounts[cmd.id];
            const totalArticles = counts?.total ?? 0;
            const laveArticles = counts?.lave ?? 0;
            const canRepasser = cmd.statut === "lave" && laveArticles > 0;
            const isProcessing = processingId === cmd.id;

            return (
              <li
                key={cmd.id}
                className="rounded-lg border bg-card p-4 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-xs font-semibold text-foreground">
                      {cmd.numero_commande}
                    </p>
                    <p className="mt-1 truncate text-sm font-medium text-foreground">
                      {cmd.client?.nom_complet ?? "—"}
                    </p>
                    {cmd.client?.telephone && (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {cmd.client.telephone}
                      </p>
                    )}
                  </div>
                  <StatusBadge
                    status={cmd.statut}
                    label={STATUT_LABELS[cmd.statut] ?? cmd.statut}
                    variant={statutVariant(cmd.statut)}
                  />
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Shirt className="size-3.5" />
                    {totalArticles} article{totalArticles !== 1 ? "s" : ""}
                  </span>
                  {laveArticles > 0 && (
                    <span className="text-warning">
                      {laveArticles} à repasser
                    </span>
                  )}
                  <span className="ml-auto">
                    Reçu le {formatDateOnly(cmd.date_reception ?? cmd.created_at)}
                  </span>
                </div>

                <div className="mt-3 flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-foreground">
                    {formatFCFA(cmd.montant_total)}
                  </span>
                  {canRepasser ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="default"
                      onClick={() => handleMarquerRepasser(cmd)}
                      disabled={isProcessing}
                      aria-label={`Marquer les articles de la commande ${cmd.numero_commande} comme repassés`}
                    >
                      {isProcessing ? (
                        <>
                          <Loader2 className="size-4 animate-spin" />
                          Traitement…
                        </>
                      ) : (
                        <>
                          <CheckCircle className="size-4" />
                          Marquer repassé
                        </>
                      )}
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      Aucun article à repasser
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </>
    );
  }

  /* ---------------- Rendu principal ---------------- */

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* 1. Header */}
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Mes commandes assignées
        </h1>
        <p className="text-muted-foreground">Repassage</p>
      </div>

      {/* 2. Erreur globale (si présente) */}
      {error && !loading && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-lg border border-danger/30 bg-danger/5 p-4 text-sm text-foreground"
        >
          <AlertCircle className="size-5 shrink-0 text-danger" aria-hidden />
          <div className="min-w-0 flex-1 space-y-1">
            <p className="font-semibold">Impossible de charger les commandes</p>
            <p className="text-muted-foreground">{error}</p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fetchCommandes()}
          >
            Réessayer
          </Button>
        </div>
      )}

      {/* 3. Card avec filtres + liste */}
      <Card>
        <CardHeader className="gap-4 space-y-0">
          <div className="flex flex-row items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <ClipboardList className="size-5 text-primary" />
                Commandes {STATUT_LABELS[statut]?.toLowerCase() ?? statut}
              </CardTitle>
              <CardDescription>
                {statut === "lave"
                  ? "Commandes à traiter — marquez les articles comme repassés une fois le repassage terminé."
                  : "Historique des commandes déjà traitées par le poste repassage."}
              </CardDescription>
            </div>
          </div>
          {renderFilters()}
        </CardHeader>
        <CardContent>{renderTable()}</CardContent>
      </Card>

      {/* 4. Pagination */}
      {!loading && !error && commandes.length > 0 && (
        <CommandesPagination
          page={page}
          totalPages={totalPages}
          total={total}
          pageSize={PAGE_SIZE}
          onPageChange={(p) => setPage(p)}
        />
      )}
    </div>
  );
}
