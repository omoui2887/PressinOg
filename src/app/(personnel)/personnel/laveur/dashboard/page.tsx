/**
 * OgPressing — /personnel/laveur/dashboard (LAV-1)
 * --------------------------------------------------
 * Tableau de bord du laveur :
 *   1. Header (titre "Tableau de bord" + sous-titre "Laveur")
 *   2. 4 StatCards :
 *        - À laver (Droplets, warning)   → commandes statut "recu" ou "en_traitement"
 *        - En cours de lavage (Loader, primary) → commandes statut "en_traitement"
 *        - Lavées aujourd'hui (CheckCircle, secondary) → commandes statut "lave"
 *        - Articles à traiter (Shirt, primary) → somme d'articles non lavés
 *   3. Raccourci : "Mes commandes" → /personnel/laveur/commandes (primary CTA)
 *   4. File d'attente lavage : 5 dernières commandes à laver
 *
 * Client component : fetchs parallèles au montage via `Promise.all`.
 * États loading (skeletons) + error (alerte + bouton Réessayer).
 *
 * 🔒 SÉCURITÉ : le layout (personnel)/layout.tsx vérifie déjà l'auth + le
 *    rôle (laveur uniquement sur /personnel/laveur/*). Les endpoints
 *    /api/admin/commandes acceptent tout personnel actif. La RLS isole par
 *    pressing_id.
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle,
  Droplets,
  Loader2,
  Shirt,
  ShoppingBag,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/ogpressing/stat-card";
import { StatusBadge } from "@/components/shared";
import {
  STATUT_LABELS,
  statutVariant,
  type CommandeListItem,
} from "@/components/ogpressing/admin/commandes/commandes-helpers";
import { formatFCFA, formatRelative } from "@/lib/utils/format";
import { cn } from "@/lib/utils";

const BASE_PATH = "/personnel/laveur";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface DashboardStats {
  /** Commandes à laver (statut "recu" OU "en_traitement"). */
  aLaver: number;
  /** Commandes en cours de lavage (statut "en_traitement"). */
  enCours: number;
  /** Commandes lavées (statut "lave"). */
  lavees: number;
  /** Total d'articles encore à traiter (recu ou en_traitement). */
  articlesATraiter: number;
}

interface DashboardData {
  stats: DashboardStats;
  /** 5 dernières commandes à laver (recu/en_traitement). */
  fileAttente: CommandeListItem[];
}

interface CommandesApiResponse {
  success: boolean;
  data: CommandeListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  error?: string;
}

interface CommandeDetailArticle {
  id: string;
  statut: string;
}

interface CommandeDetailApiResponse {
  success: boolean;
  data: {
    id: string;
    articles: CommandeDetailArticle[];
  } | null;
  error?: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Compte le nombre total d'articles à traiter (statut "recu" ou
 * "en_traitement") pour une liste de commandes.
 *
 * On fetch le détail de chaque commande (car la liste ne renvoie pas les
 * articles imbriqués). Pour limiter le nombre d'appels, on ne fetch que les
 * `maxCommandes` premières commandes "à laver".
 */
async function countArticlesATraiter(
  commandes: CommandeListItem[],
  maxCommandes = 20
): Promise<number> {
  const cibles = commandes.slice(0, maxCommandes);
  if (cibles.length === 0) return 0;

  const results = await Promise.allSettled(
    cibles.map((c) =>
      fetch(`/api/admin/commandes/${c.id}`, { cache: "no-store" }).then((r) =>
        r.json() as Promise<CommandeDetailApiResponse>
      )
    )
  );

  let total = 0;
  results.forEach((res) => {
    if (res.status !== "fulfilled") return;
    const json = res.value;
    if (!json.success || !json.data) return;
    const articles = json.data.articles ?? [];
    total += articles.filter(
      (a) => a.statut === "recu" || a.statut === "en_traitement"
    ).length;
  });
  return total;
}

/* ------------------------------------------------------------------ */
/*  Composant                                                          */
/* ------------------------------------------------------------------ */

export default function LaveurDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch parallèle :
      //  1. Commandes "recu" — pageSize 5 pour la file d'attente + total pour la stat
      //  2. Commandes "en_traitement" — total pour la stat "en cours"
      //  3. Commandes "lave" — pageSize 1, total seulement (pour la stat "lavées")
      //  4. Commandes "recu" (lot large pageSize=20) pour compter les articles à traiter
      const [recuRes, enTraitementRes, laveRes, recuLargRes] =
        await Promise.all([
          fetch(`/api/admin/commandes?statut=recu&pageSize=5`, {
            cache: "no-store",
          }),
          fetch(`/api/admin/commandes?statut=en_traitement&pageSize=1`, {
            cache: "no-store",
          }),
          fetch(`/api/admin/commandes?statut=lave&pageSize=1`, {
            cache: "no-store",
          }),
          fetch(`/api/admin/commandes?statut=recu&pageSize=20`, {
            cache: "no-store",
          }),
        ]);

      const recuJson: CommandesApiResponse = await recuRes.json();
      const enTraitementJson: CommandesApiResponse =
        await enTraitementRes.json();
      const laveJson: CommandesApiResponse = await laveRes.json();
      const recuLargJson: CommandesApiResponse = await recuLargRes.json();

      if (!recuJson.success) {
        throw new Error(
          recuJson.error || "Erreur lors de la récupération des commandes"
        );
      }

      // La file d'attente = 5 dernières commandes "recu" (les en_traitement
      // sont déjà en cours, on les met en file juste après si besoin). On
      // complète avec les en_traitement si on a moins de 5 recu.
      const fileAttente: CommandeListItem[] = [...(recuJson.data ?? [])];
      if (fileAttente.length < 5) {
        const enTraitementData = await fetch(
          `/api/admin/commandes?statut=en_traitement&pageSize=${5 - fileAttente.length}`,
          { cache: "no-store" }
        ).then((r) => r.json() as Promise<CommandesApiResponse>);
        if (enTraitementData.success) {
          fileAttente.push(...(enTraitementData.data ?? []));
        }
      }

      // Compte des articles à traiter (fetch détaillé sur le lot large recu)
      const articlesATraiter = await countArticlesATraiter(
        recuLargJson.data ?? [],
        20
      );

      setData({
        stats: {
          aLaver: (recuJson.total ?? 0) + (enTraitementJson.total ?? 0),
          enCours: enTraitementJson.total ?? 0,
          lavees: laveJson.total ?? 0,
          articlesATraiter,
        },
        fileAttente: fileAttente.slice(0, 5),
      });
    } catch (err) {
      console.error("[laveur/dashboard] Erreur fetch:", err);
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
          label="À laver"
          value={data.stats.aLaver}
          icon={Droplets}
          accent="warning"
          description="Reçues ou en traitement"
          delay={0}
        />
        <StatCard
          label="En cours de lavage"
          value={data.stats.enCours}
          icon={Loader2}
          accent="primary"
          description="Statut « en traitement »"
          delay={60}
        />
        <StatCard
          label="Lavées aujourd'hui"
          value={data.stats.lavees}
          icon={CheckCircle}
          accent="secondary"
          description="Statut « lavé »"
          delay={120}
        />
        <StatCard
          label="Articles à traiter"
          value={data.stats.articlesATraiter}
          icon={Shirt}
          accent="primary"
          description="Articles non encore lavés"
          delay={180}
        />
      </div>
    );
  }

  /* ---------------- Sous-composant : Raccourci ---------------- */

  function renderShortcuts() {
    if (loading) {
      return (
        <section className="space-y-3">
          <Skeleton className="h-6 w-32 rounded" />
          <Skeleton className="h-28 w-full rounded-xl" />
        </section>
      );
    }
    return (
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Raccourci</h2>
        <Link
          href={`${BASE_PATH}/commandes`}
          className="group focus:outline-none"
          aria-label="Mes commandes"
        >
          <Card className="relative overflow-hidden border-primary/40 bg-primary text-primary-foreground transition-all hover:-translate-y-0.5 hover:border-primary hover:shadow-lg">
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
                    Voir et traiter les commandes à laver
                  </p>
                </div>
              </div>
              <ArrowRight className="size-5 text-primary-foreground/70 transition-transform group-hover:translate-x-1" />
            </div>
          </Card>
        </Link>
      </section>
    );
  }

  /* ---------------- Sous-composant : File d'attente ---------------- */

  function renderFileAttente() {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="text-lg">File d&apos;attente lavage</CardTitle>
            <CardDescription>
              Les 5 prochaines commandes à traiter
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
              <CheckCircle className="size-8 text-muted-foreground/50" />
              <p className="text-sm font-medium text-foreground">
                File d&apos;attente vide
              </p>
              <p className="max-w-xs text-xs text-muted-foreground">
                Aucune commande en attente de lavage. Les nouvelles commandes
                reçues apparaîtront ici automatiquement.
              </p>
            </div>
          ) : (
            <ul className="divide-y">
              {data.fileAttente.map((c) => (
                <li
                  key={c.id}
                  className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                >
                  <Link
                    href={`${BASE_PATH}/commandes`}
                    className="min-w-0 flex-1 space-y-0.5 hover:underline"
                  >
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
                      Reçue {formatRelative(c.date_reception ?? c.created_at)}
                    </p>
                  </Link>
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
        <p className="text-muted-foreground">Laveur</p>
      </div>

      {/* 2. Erreur globale (si présente) */}
      {error && !loading && (
        <div
          role="alert"
          className={cn(
            "flex items-start gap-3 rounded-lg border border-danger/30 bg-danger/5 p-4 text-sm text-foreground"
          )}
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
      {renderShortcuts()}

      {/* 5. File d'attente lavage */}
      {renderFileAttente()}
    </div>
  );
}
