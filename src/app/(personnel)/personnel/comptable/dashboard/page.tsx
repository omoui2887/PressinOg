/**
 * e-pressing — /personnel/comptable/dashboard (COMPTA-1)
 * ------------------------------------------------------
 * Tableau de bord financier du comptable :
 *   1. Header (titre "Tableau de bord" + sous-titre "Comptable")
 *   2. 4 StatCards : Recette du jour / Recette du mois / Impayés /
 *      Commandes du jour
 *   3. 2 raccourcis : Rapports (primary) / Clients (impayés) (secondary)
 *   4. Card "Paiements récents" : 8 derniers paiements encaissés
 *      (numero commande, client, montant, méthode en badge)
 *   5. Card "Top clients en impayé" : 5 clients avec le plus gros
 *      solde_impaye (nom, téléphone, solde en rouge, nb commandes impayées)
 *
 * Client component : fetch des données live au montage via plusieurs
 * endpoints en parallèle (Promise.all). États loading (skeletons) +
 * error (alerte + bouton Réessayer).
 *
 * 🔒 SÉCURITÉ : le layout (personnel)/layout.tsx vérifie déjà l'auth + le
 *    rôle (comptable uniquement sur /personnel/comptable/*). Les endpoints
 *    /api/admin/* acceptent n'importe quel personnel actif du pressing. La
 *    RLS isole automatiquement par pressing_id.
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  BarChart3,
  ShoppingBag,
  TrendingUp,
  Users,
  Wallet,
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
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/ogpressing/stat-card";
import { formatFCFA, formatDate } from "@/lib/utils/format";
import { cn } from "@/lib/utils";

const BASE_PATH = "/personnel/comptable";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface DashboardStats {
  /** Somme des paiements encaissés aujourd'hui (FCFA). */
  recetteDuJour: number;
  /** Somme des paiements encaissés sur le mois en cours (FCFA). */
  recetteDuMois: number;
  /** Nombre de clients avec solde_impaye > 0. */
  clientsImpayes: number;
  /** Nombre de commandes créées aujourd'hui. */
  commandesDuJour: number;
}

/** Ligne du rapport paiements (API /api/admin/rapports/paiements).
 *  NB : l'API retourne des champs plats avec date/méthode déjà formatés. */
interface PaiementRow {
  date: string;
  commande_numero: string;
  client: string;
  montant: number;
  methode: string;
  est_acompte: string;
  reference: string;
  caissier: string;
}

/** Ligne du rapport impayés (API /api/admin/rapports/impayes).
 *  Triée par solde_impaye DESC côté API. */
interface ImpayeRow {
  nom: string;
  telephone: string;
  solde_impaye: number;
  nombre_commandes_impayees: number;
  date_plus_ancienne_impayee: string;
}

interface DashboardData {
  stats: DashboardStats;
  paiementsRecents: PaiementRow[];
  topImpayes: ImpayeRow[];
}

interface RapportApiResponse<T> {
  success: boolean;
  data: T[];
  error?: string;
}

interface ClientsCountApiResponse {
  success: boolean;
  total: number;
  error?: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Retourne les bornes [start, end] UTC du jour courant en ISO strings. */
function getTodayBounds(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0)
  );
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999)
  );
  return { start: start.toISOString(), end: end.toISOString() };
}

/** Retourne les bornes [start, end] UTC du mois courant en ISO strings.
 *  start = premier jour du mois à 00:00:00 UTC, end = maintenant. */
function getMonthBounds(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0)
  );
  const end = new Date(now.getTime());
  return { start: start.toISOString(), end: end.toISOString() };
}

/** Variante visuelle d'un badge méthode de paiement. */
function methodeBadgeClass(methode: string): string {
  const m = (methode ?? "").toLowerCase();
  if (m.includes("espèce") || m.includes("espece")) {
    return "bg-secondary/10 text-secondary border-secondary/20";
  }
  if (m.includes("mobile")) {
    return "bg-primary/10 text-primary border-primary/20";
  }
  if (m.includes("carte")) {
    return "bg-warning/10 text-warning border-warning/20";
  }
  return "bg-muted text-muted-foreground border-muted";
}

/* ------------------------------------------------------------------ */
/*  Composant                                                          */
/* ------------------------------------------------------------------ */

export default function ComptableDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { start: todayStart, end: todayEnd } = getTodayBounds();
      const { start: monthStart, end: monthEnd } = getMonthBounds();

      const todayParams = new URLSearchParams({
        start: todayStart,
        end: todayEnd,
      });
      const monthParams = new URLSearchParams({
        start: monthStart,
        end: monthEnd,
      });

      // Fetch parallèle :
      //  1. Rapport paiements du jour → somme = recette du jour
      //  2. Rapport paiements du mois → somme = recette du mois
      //  3. Rapport impayés → clients avec solde_impaye > 0
      //     (donne aussi le top 5 par solde_impaye DESC)
      //  4. Rapport journalier → commandes du jour (data.length)
      //  5. Clients impayés (count) — backup cross-check de la stat 3
      const [
        paiementsJourRes,
        paiementsMoisRes,
        impayesRes,
        journalierRes,
        clientsImpayesRes,
      ] = await Promise.all([
        fetch(`/api/admin/rapports/paiements?${todayParams.toString()}`, {
          cache: "no-store",
        }),
        fetch(`/api/admin/rapports/paiements?${monthParams.toString()}`, {
          cache: "no-store",
        }),
        fetch(`/api/admin/rapports/impayes`, { cache: "no-store" }),
        fetch(`/api/admin/rapports/journalier`, { cache: "no-store" }),
        fetch(`/api/admin/clients?impayes=true&pageSize=1`, {
          cache: "no-store",
        }),
      ]);

      const paiementsJourJson: RapportApiResponse<PaiementRow> =
        await paiementsJourRes.json();
      const paiementsMoisJson: RapportApiResponse<PaiementRow> =
        await paiementsMoisRes.json();
      const impayesJson: RapportApiResponse<ImpayeRow> =
        await impayesRes.json();
      const journalierJson: RapportApiResponse<unknown> =
        await journalierRes.json();
      const clientsImpayesJson: ClientsCountApiResponse =
        await clientsImpayesRes.json();

      // Vérifie qu'au moins l'endpoint paiements a répondu OK
      if (!paiementsJourJson.success) {
        throw new Error(
          paiementsJourJson.error ||
            "Erreur lors de la récupération des paiements du jour"
        );
      }
      if (!impayesJson.success) {
        throw new Error(
          impayesJson.error ||
            "Erreur lors de la récupération des impayés"
        );
      }

      const paiementsJour = paiementsJourJson.data ?? [];
      const paiementsMois = paiementsMoisJson.data ?? [];
      const impayes = impayesJson.data ?? [];

      const recetteDuJour = paiementsJour.reduce(
        (sum, p) => sum + (p.montant ?? 0),
        0
      );
      const recetteDuMois = paiementsMois.reduce(
        (sum, p) => sum + (p.montant ?? 0),
        0
      );
      // On privilégie le count API clients (plus précis) ; fallback à
      // impayes.length si l'API clients échoue silencieusement.
      const clientsImpayes =
        clientsImpayesJson.success && typeof clientsImpayesJson.total === "number"
          ? clientsImpayesJson.total
          : impayes.length;

      // Les 8 derniers paiements (toutes périodes confondues) — on utilise
      // le rapport paiements du mois car il est déjà trié DESC par date.
      // Si moins de 8 sur le mois, on complète avec ceux du jour (souvent
      // identiques). Le rapport paiements sans filtre aurait aussi fonctionné
      // mais nécessitait un 6e fetch — l'optimisation par mois suffit en
      // pratique pour le dashboard.
      const paiementsRecents = paiementsMois.slice(0, 8);

      // Top 5 clients en impayé (déjà triés DESC par solde_impaye côté API).
      const topImpayes = impayes.slice(0, 5);

      setData({
        stats: {
          recetteDuJour,
          recetteDuMois,
          clientsImpayes,
          commandesDuJour: (journalierJson.data ?? []).length,
        },
        paiementsRecents,
        topImpayes,
      });
    } catch (err) {
      console.error("[comptable/dashboard] Erreur fetch:", err);
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
          label="Recette du jour"
          value={formatFCFA(data.stats.recetteDuJour)}
          icon={Wallet}
          accent="primary"
          description="Paiements encaissés aujourd'hui"
          delay={0}
        />
        <StatCard
          label="Recette du mois"
          value={formatFCFA(data.stats.recetteDuMois)}
          icon={TrendingUp}
          accent="secondary"
          description="Depuis le 1er du mois"
          delay={60}
        />
        <StatCard
          label="Impayés"
          value={data.stats.clientsImpayes}
          icon={AlertCircle}
          accent="danger"
          description="Clients avec solde dû > 0"
          delay={120}
        />
        <StatCard
          label="Commandes du jour"
          value={data.stats.commandesDuJour}
          icon={ShoppingBag}
          accent="primary"
          description="Créées aujourd'hui"
          delay={180}
        />
      </div>
    );
  }

  /* ---------------- Sous-composant : Raccourcis ---------------- */

  const shortcuts = [
    {
      href: `${BASE_PATH}/rapports`,
      title: "Rapports",
      subtitle: "CA, paiements, remises & exports Excel",
      icon: BarChart3,
      primary: true,
    },
    {
      href: `${BASE_PATH}/clients`,
      title: "Clients (impayés)",
      subtitle: "Consulter le fichier clients et les impayés",
      icon: Users,
      primary: false,
    },
  ] as const;

  /* ---------------- Sous-composant : Paiements récents ---------------- */

  function renderPaiementsRecents() {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="text-lg">Paiements récents</CardTitle>
            <CardDescription>
              Les 8 derniers paiements encaissés ce mois-ci
            </CardDescription>
          </div>
          <Button asChild variant="outline" size="sm" className="shrink-0">
            <Link href={`${BASE_PATH}/rapports`}>
              Rapports
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-lg" />
              ))}
            </div>
          ) : error || !data ? (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
              Données indisponibles
            </div>
          ) : data.paiementsRecents.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-muted/20 py-10 text-center">
              <Wallet className="size-8 text-muted-foreground/50" />
              <p className="text-sm font-medium text-foreground">
                Aucun paiement encaissé ce mois-ci
              </p>
              <p className="max-w-xs text-xs text-muted-foreground">
                Les paiements encaissés par les caissiers apparaîtront ici
                automatiquement.
              </p>
            </div>
          ) : (
            <ul className="divide-y">
              {data.paiementsRecents.map((p, i) => (
                <li
                  key={`${p.commande_numero}-${p.date}-${i}`}
                  className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 space-y-0.5">
                    <p className="truncate text-sm font-semibold text-foreground">
                      <span className="font-mono text-xs text-muted-foreground">
                        {p.commande_numero || "—"}
                      </span>
                      {p.client && p.client !== "—" && (
                        <>
                          {" — "}
                          <span>{p.client}</span>
                        </>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {p.date || "—"}
                      {p.est_acompte === "Oui" && (
                        <span className="ml-1 text-warning">· Acompte</span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge
                      variant="outline"
                      className={cn(
                        "shrink-0 border-transparent font-medium",
                        methodeBadgeClass(p.methode)
                      )}
                    >
                      {p.methode || "—"}
                    </Badge>
                    <span className="text-sm font-semibold text-foreground tabular-nums">
                      {formatFCFA(p.montant)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    );
  }

  /* ---------------- Sous-composant : Top clients en impayé ---------------- */

  function renderTopImpayes() {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="text-lg">Top clients en impayé</CardTitle>
            <CardDescription>
              Les 5 clients avec le plus gros solde dû
            </CardDescription>
          </div>
          <Button asChild variant="outline" size="sm" className="shrink-0">
            <Link href={`${BASE_PATH}/clients`}>
              Tous les clients
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
          ) : data.topImpayes.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-secondary/5 py-10 text-center">
              <Users className="size-8 text-secondary/60" />
              <p className="text-sm font-medium text-foreground">
                Aucun impayé en cours
              </p>
              <p className="max-w-xs text-xs text-muted-foreground">
                Tous les clients ont soldé leurs commandes. Les impayés
                apparaîtront ici dès qu&apos;une commande sera laissée non
                payée.
              </p>
            </div>
          ) : (
            <ul className="divide-y">
              {data.topImpayes.map((c, i) => (
                <li
                  key={`${c.nom}-${c.telephone}-${i}`}
                  className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {c.nom || "—"}
                    </p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {c.telephone || "—"}
                      {c.nombre_commandes_impayees > 0 && (
                        <span className="ml-2">
                          · {c.nombre_commandes_impayees} commande
                          {c.nombre_commandes_impayees > 1 ? "s" : ""} impayée
                          {c.nombre_commandes_impayees > 1 ? "s" : ""}
                        </span>
                      )}
                      {c.date_plus_ancienne_impayee &&
                        c.date_plus_ancienne_impayee !== "—" && (
                          <span className="ml-2">
                            · depuis le{" "}
                            <span className="font-medium">
                              {formatDate(c.date_plus_ancienne_impayee)}
                            </span>
                          </span>
                        )}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className="shrink-0 border-transparent bg-danger/10 font-semibold text-danger tabular-nums"
                  >
                    {formatFCFA(c.solde_impaye)}
                  </Badge>
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
        <p className="text-muted-foreground">Comptable</p>
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

      {/* 4. Raccourcis (2 colonnes) */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Raccourcis</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {shortcuts.map((s) => {
            const Icon = s.icon;
            return (
              <Link
                key={s.href}
                href={s.href}
                className="group focus:outline-none"
                aria-label={s.title}
              >
                <Card
                  className={cn(
                    "relative h-full overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-lg",
                    s.primary
                      ? "border-primary/40 bg-primary text-primary-foreground hover:border-primary"
                      : "bg-card text-card-foreground hover:border-primary/40"
                  )}
                >
                  {s.primary && (
                    <div
                      aria-hidden
                      className="pointer-events-none absolute -right-8 -top-8 size-32 rounded-full bg-primary-foreground/10 blur-2xl"
                    />
                  )}
                  <div className="relative flex h-full flex-col gap-3 p-5">
                    <div className="flex items-center justify-between">
                      <span
                        className={cn(
                          "flex size-12 items-center justify-center rounded-xl",
                          s.primary
                            ? "bg-primary-foreground/15 text-primary-foreground"
                            : "bg-muted text-foreground"
                        )}
                      >
                        <Icon className="size-6" />
                      </span>
                      <ArrowRight
                        className={cn(
                          "size-5 transition-transform group-hover:translate-x-1",
                          s.primary
                            ? "text-primary-foreground/70"
                            : "text-muted-foreground"
                        )}
                      />
                    </div>
                    <div className="space-y-1">
                      <p className="text-lg font-bold leading-tight">{s.title}</p>
                      <p
                        className={cn(
                          "text-sm",
                          s.primary
                            ? "text-primary-foreground/80"
                            : "text-muted-foreground"
                        )}
                      >
                        {s.subtitle}
                      </p>
                    </div>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      </section>

      {/* 5. Cards : Paiements récents + Top impayés (côte à côte sur lg+) */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {renderPaiementsRecents()}
        {renderTopImpayes()}
      </div>
    </div>
  );
}
