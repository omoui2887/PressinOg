/**
 * OgPressing — /personnel/repassage/dashboard (REP-1)
 * ----------------------------------------------------
 * Tableau de bord du poste repassage :
 *   1. Header (titre "Tableau de bord" + sous-titre "Repassage")
 *   2. 4 StatCards :
 *        - À repasser          (Wind, warning)    → commandes statut "lave"
 *        - En cours            (Loader, primary)  → commandes statut "en_traitement"
 *        - Repassées           (CheckCircle, secondary) → commandes statut "repasse"
 *        - Articles à traiter  (Shirt, primary)   → total articles au statut "lave"
 *   3. Raccourci : 1 card "Mes commandes" → /personnel/repassage/commandes
 *   4. Card "File d'attente repassage" : 5 dernières commandes "lave"
 *
 * Client component : fetch parallèle via Promise.all + N+1 borné pour le
 * comptage des articles "à repasser" (détails des 30 premières commandes lave).
 *
 * 🔒 SÉCURITÉ : le layout (personnel)/layout.tsx vérifie déjà l'auth + le
 *    rôle (repassage uniquement sur /personnel/repassage/*). Les endpoints
 *    /api/admin/commandes acceptent n'importe quel personnel actif. La RLS
 *    isole automatiquement par pressing_id.
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  AlertCircle,
  Wind,
  Loader2,
  CheckCircle,
  Shirt,
  ShoppingBag,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/ogpressing/stat-card";
import { StatusBadge } from "@/components/shared";
import {
  STATUT_LABELS,
  statutVariant,
  type CommandeListItem,
  type CommandesApiResponse,
} from "@/components/ogpressing/admin/commandes/commandes-helpers";
import { formatFCFA, formatRelative } from "@/lib/utils/format";

const BASE_PATH = "/personnel/repassage";

/** Borne supérieure sur le nombre de commandes "lave" détaillées pour le
 *  comptage des articles à repasser. Au-delà, le compteur est partiel. */
const MAX_LAVE_DETAIL_FETCH = 30;

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface DashboardStats {
  /** Commandes avec statut="lave" (articles lavés prêts à être repassés). */
  aRepasser: number;
  /** Commandes avec statut="en_traitement". */
  enCours: number;
  /** Commandes avec statut="repasse". */
  repassees: number;
  /** Total des articles au statut "lave" sur les MAX_LAVE_DETAIL_FETCH
   *  premières commandes lave (approximation si > 30). */
  articlesATraiter: number;
  /** Indique si le compteur articlesATraiter est exhaustif. */
  articlesExhaustif: boolean;
}

interface DashboardData {
  stats: DashboardStats;
  fileAttente: CommandeListItem[];
}

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

/* ------------------------------------------------------------------ */
/*  Composant                                                          */
/* ------------------------------------------------------------------ */

export default function RepassageDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch parallèle :
      //  1. 30 premières commandes "lave" (pour file d'attente + articles à traiter)
      //  2. Total commandes "lave" (pageSize=1 → total exhaustif)
      //  3. Total commandes "en_traitement"
      //  4. Total commandes "repasse"
      const [laveListRes, laveTotalRes, enTraitementRes, repasseRes] =
        await Promise.all([
          fetch(
            `/api/admin/commandes?statut=lave&pageSize=${MAX_LAVE_DETAIL_FETCH}`,
            { cache: "no-store" }
          ),
          fetch(`/api/admin/commandes?statut=lave&pageSize=1`, {
            cache: "no-store",
          }),
          fetch(`/api/admin/commandes?statut=en_traitement&pageSize=1`, {
            cache: "no-store",
          }),
          fetch(`/api/admin/commandes?statut=repasse&pageSize=1`, {
            cache: "no-store",
          }),
        ]);

      const laveListJson: CommandesApiResponse = await laveListRes.json();
      const laveTotalJson: CommandesApiResponse = await laveTotalRes.json();
      const enTraitementJson: CommandesApiResponse =
        await enTraitementRes.json();
      const repasseJson: CommandesApiResponse = await repasseRes.json();

      if (!laveListJson.success) {
        throw new Error(
          laveListJson.error ||
            "Erreur lors de la récupération des commandes à repasser"
        );
      }

      // N+1 borné : pour chaque commande lave de la liste, fetch du détail
      // pour compter les articles au statut "lave". Promise.all → parallèle.
      const laveCommandes = laveListJson.data ?? [];
      const detailsRes = await Promise.all(
        laveCommandes.map((c) =>
          fetch(`/api/admin/commandes/${c.id}`, { cache: "no-store" })
            .then((r) => r.json() as Promise<CommandeDetailApiResponse>)
            .catch(() => ({ success: false }) as CommandeDetailApiResponse)
        )
      );

      const articlesATraiter = detailsRes.reduce((sum, d) => {
        if (!d.success || !d.data?.articles) return sum;
        return sum + d.data.articles.filter((a) => a.statut === "lave").length;
      }, 0);

      const totalLave = laveTotalJson.total ?? 0;

      setData({
        stats: {
          aRepasser: totalLave,
          enCours: enTraitementJson.total ?? 0,
          repassees: repasseJson.total ?? 0,
          articlesATraiter,
          articlesExhaustif: totalLave <= laveCommandes.length,
        },
        // File d'attente = les 5 premières "lave" (les plus récentes en
        // première page, tri par created_at DESC côté API).
        fileAttente: laveCommandes.slice(0, 5),
      });
    } catch (err) {
      console.error("[repassage/dashboard] Erreur fetch:", err);
      if (err instanceof TypeError && err.message.includes("fetch")) {
        setError(
          "Erreur réseau. Vérifiez votre connexion internet puis rechargez la page."
        );
      } else if (err instanceof Error && err.message) {
        setError(err.message);
      } else {
        setError(
          "Une erreur est survenue lors du chargement du tableau de bord. Veuillez réessayer."
        );
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /* ---------------- Sous-composant : 4 StatCards ---------------- */

  function renderStatCards() {
    if (loading) {
      return (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-xl" />
          ))}
        </div>
      );
    }
    if (error || !data) return null;

    return (
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="À repasser"
          value={data.stats.aRepasser}
          icon={Wind}
          accent="warning"
          description="Commandes lavées prêtes"
          delay={0}
        />
        <StatCard
          label="En cours"
          value={data.stats.enCours}
          icon={Loader2}
          accent="primary"
          description="Statut en traitement"
          delay={60}
        />
        <StatCard
          label="Repassées"
          value={data.stats.repassees}
          icon={CheckCircle}
          accent="secondary"
          description="Statut repassé"
          delay={120}
        />
        <StatCard
          label="Articles à traiter"
          value={data.stats.articlesATraiter}
          icon={Shirt}
          accent="primary"
          description={
            data.stats.articlesExhaustif
              ? "Articles au statut lavé"
              : "Approximation (30 cmd max)"
          }
          delay={180}
        />
      </div>
    );
  }

  /* ---------------- Sous-composant : Raccourci ---------------- */

  function renderShortcut() {
    if (loading) {
      return <Skeleton className="h-24 w-full rounded-xl" />;
    }
    return (
      <Link
        href={`${BASE_PATH}/commandes`}
        className="group focus:outline-none"
        aria-label="Mes commandes"
      >
        <Card className="relative h-full overflow-hidden border-primary/40 bg-primary text-primary-foreground transition-all hover:-translate-y-0.5 hover:border-primary hover:shadow-lg">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-8 -top-8 size-32 rounded-full bg-primary-foreground/10 blur-2xl"
          />
          <div className="relative flex h-full items-center justify-between gap-4 p-5">
            <div className="flex items-center gap-4">
              <span className="flex size-12 items-center justify-center rounded-xl bg-primary-foreground/15 text-primary-foreground">
                <ShoppingBag className="size-6" />
              </span>
              <div className="space-y-1">
                <p className="text-lg font-bold leading-tight">
                  Mes commandes
                </p>
                <p className="text-sm text-primary-foreground/80">
                  Voir et traiter les commandes à repasser
                </p>
              </div>
            </div>
            <ArrowRight className="size-5 text-primary-foreground/70 transition-transform group-hover:translate-x-1" />
          </div>
        </Card>
      </Link>
    );
  }

  /* ---------------- Sous-composant : File d'attente ---------------- */

  function renderFileAttente() {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="text-lg">File d&apos;attente repassage</CardTitle>
            <CardDescription>
              Les 5 dernières commandes à repasser
            </CardDescription>
          </div>
          <Button asChild variant="outline" size="sm" className="shrink-0">
            <Link href={`${BASE_PATH}/commandes`}>
              Voir tout
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-lg" />
              ))}
            </div>
          ) : error || !data ? (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
              Données indisponibles
            </div>
          ) : data.fileAttente.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-muted/20 py-10 text-center">
              <Wind className="size-8 text-muted-foreground/50" />
              <p className="text-sm font-medium text-foreground">
                Aucune commande à repasser
              </p>
              <p className="max-w-xs text-xs text-muted-foreground">
                Les commandes lavées apparaîtront ici automatiquement. Bon
                travail, tout est à jour&nbsp;!
              </p>
            </div>
          ) : (
            <ul className="divide-y">
              {data.fileAttente.map((c) => (
                <li
                  key={c.id}
                  className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p className="truncate text-sm font-semibold text-foreground">
                      <span className="font-mono text-xs text-muted-foreground">
                        {c.numero_commande ?? "—"}
                      </span>
                      {c.client?.nom_complet && (
                        <>
                          {" — "}
                          <span>{c.client.nom_complet}</span>
                        </>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatRelative(c.created_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-foreground">
                      {formatFCFA(c.montant_total)}
                    </span>
                    <StatusBadge
                      status={c.statut}
                      label={STATUT_LABELS[c.statut] ?? c.statut}
                      variant={statutVariant(c.statut)}
                      className="shrink-0"
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    );
  }

  /* ---------------- Rendu principal ---------------- */

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* 1. Header */}
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Tableau de bord
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
            <p className="font-semibold">
              Impossible de charger le tableau de bord
            </p>
            <p className="text-muted-foreground">{error}</p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fetchData()}
          >
            Réessayer
          </Button>
        </div>
      )}

      {/* 3. StatCards (4) */}
      {renderStatCards()}

      {/* 4. Raccourci */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Raccourci</h2>
        {renderShortcut()}
      </section>

      {/* 5. File d'attente repassage */}
      {renderFileAttente()}
    </div>
  );
}
