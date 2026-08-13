/**
 * e-pressing — /personnel/receptionniste/dashboard (REC-1)
 * --------------------------------------------------------
 * Tableau de bord du réceptionniste :
 *   1. Header (titre "Tableau de bord" + sous-titre "Réceptionniste")
 *   2. 4 StatCards : Commandes du jour / À récupérer / Clients enregistrés /
 *      Recette du jour
 *   3. Raccourcis : Nouvelle commande / Scanner QR / Clients (3 grosses cards)
 *   4. Commandes récentes (5 dernières) + lien "Voir tout →"
 *
 * Client component : fetch des données live au montage via plusieurs endpoints
 * en parallèle. États loading (skeletons) + error (alerte simple).
 *
 * 🔒 SÉCURITÉ : le layout (personnel)/layout.tsx vérifie déjà l'auth + le
 *    rôle. Les endpoints /api/admin/* (commandes, clients, rapports/journalier,
 *    rapports/paiements) acceptent n'importe quel personnel actif du pressing.
 *    La RLS isole automatiquement par pressing_id.
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Package,
  QrCode,
  ShoppingBag,
  Users,
  Wallet,
  AlertCircle,
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
} from "@/components/ogpressing/admin/commandes/commandes-helpers";
import { formatFCFA, formatRelative } from "@/lib/utils/format";
import { cn } from "@/lib/utils";

const BASE_PATH = "/personnel/receptionniste";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface DashboardStats {
  /** Nombre de commandes créées aujourd'hui (via /api/admin/rapports/journalier). */
  commandesDuJour: number;
  /** Nombre de commandes prêtes à être retirées (statut="pret"). */
  aRecuperer: number;
  /** Nombre total de clients du pressing. */
  clientsEnregistres: number;
  /** Somme des paiements encaissés aujourd'hui (FCFA). */
  recetteDuJour: number;
}

interface DashboardData {
  stats: DashboardStats;
  recentes: CommandeListItem[];
}

interface RapportJournalierRow {
  numero_ticket?: string;
  montant_total?: number;
}

interface RapportPaiementRow {
  montant?: number;
}

interface CommandesApiResponse {
  success: boolean;
  data: CommandeListItem[];
  total: number;
  error?: string;
}

interface RapportApiResponse<T> {
  success: boolean;
  data: T[];
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

/* ------------------------------------------------------------------ */
/*  Composant                                                          */
/* ------------------------------------------------------------------ */

export default function ReceptionnisteDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { start, end } = getTodayBounds();
      const params = new URLSearchParams({ start, end });

      // Fetch parallèle :
      //  1. Commandes récentes (5 dernières) + total
      //  2. Commandes "prêtes" (statut=pret, total seulement)
      //  3. Total clients (pageSize=1 pour ne récupérer que le count)
      //  4. Rapport journalier (liste des commandes du jour → count = data.length)
      //  5. Rapport paiements (somme des paiements du jour → recette)
      const [recentesRes, pretRes, clientsRes, journalierRes, paiementsRes] =
        await Promise.all([
          fetch(`/api/admin/commandes?pageSize=5`, { cache: "no-store" }),
          fetch(`/api/admin/commandes?statut=pret&pageSize=1`, {
            cache: "no-store",
          }),
          fetch(`/api/admin/clients?pageSize=1`, { cache: "no-store" }),
          fetch(`/api/admin/rapports/journalier`, { cache: "no-store" }),
          fetch(`/api/admin/rapports/paiements?${params.toString()}`, {
            cache: "no-store",
          }),
        ]);

      const recentesJson: CommandesApiResponse = await recentesRes.json();
      const pretJson: CommandesApiResponse = await pretRes.json();
      const clientsJson: CommandesApiResponse = await clientsRes.json();
      const journalierJson: RapportApiResponse<RapportJournalierRow> =
        await journalierRes.json();
      const paiementsJson: RapportApiResponse<RapportPaiementRow> =
        await paiementsRes.json();

      // Vérifie qu'au moins les endpoints critiques ont répondu OK
      if (!recentesJson.success) {
        throw new Error(
          recentesJson.error || "Erreur lors de la récupération des commandes"
        );
      }

      const recetteDuJour = (paiementsJson.data ?? []).reduce(
        (sum, p) => sum + (p.montant ?? 0),
        0
      );

      setData({
        stats: {
          commandesDuJour: (journalierJson.data ?? []).length,
          aRecuperer: pretJson.total ?? 0,
          clientsEnregistres: clientsJson.total ?? 0,
          recetteDuJour,
        },
        recentes: recentesJson.data ?? [],
      });
    } catch (err) {
      console.error("[receptionniste/dashboard] Erreur fetch:", err);
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
          label="Commandes du jour"
          value={data.stats.commandesDuJour}
          icon={ShoppingBag}
          accent="primary"
          description="Créées aujourd'hui"
          delay={0}
        />
        <StatCard
          label="À récupérer"
          value={data.stats.aRecuperer}
          icon={Package}
          accent="secondary"
          description="Prêtes en presse"
          delay={60}
        />
        <StatCard
          label="Clients enregistrés"
          value={data.stats.clientsEnregistres}
          icon={Users}
          accent="primary"
          description="Fichier clients"
          delay={120}
        />
        <StatCard
          label="Recette du jour"
          value={formatFCFA(data.stats.recetteDuJour)}
          icon={Wallet}
          accent="secondary"
          description="Paiements encaissés"
          delay={180}
        />
      </div>
    );
  }

  /* ---------------- Sous-composant : Raccourcis ---------------- */

  const shortcuts = [
    {
      href: `${BASE_PATH}/commandes/nouvelle`,
      title: "Nouvelle commande",
      subtitle: "Enregistrer une commande client",
      icon: ShoppingBag,
      primary: true,
    },
    {
      href: `${BASE_PATH}/scanner-qr`,
      title: "Scanner QR",
      subtitle: "Retrouver une commande par QR Code",
      icon: QrCode,
      primary: false,
    },
    {
      href: `${BASE_PATH}/clients`,
      title: "Clients",
      subtitle: "Consulter le fichier clients",
      icon: Users,
      primary: false,
    },
  ] as const;

  /* ---------------- Sous-composant : Commandes récentes ---------------- */

  function renderRecentes() {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="text-lg">Commandes récentes</CardTitle>
            <CardDescription>
              Les 5 dernières commandes enregistrées
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
          ) : data.recentes.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-muted/20 py-10 text-center">
              <ShoppingBag className="size-8 text-muted-foreground/50" />
              <p className="text-sm font-medium text-foreground">
                Aucune commande pour le moment
              </p>
              <p className="max-w-xs text-xs text-muted-foreground">
                Les nouvelles commandes apparaîtront ici. Utilisez le raccourci
                «&nbsp;Nouvelle commande&nbsp;» pour enregistrer une commande.
              </p>
            </div>
          ) : (
            <ul className="divide-y">
              {data.recentes.map((c) => (
                <li
                  key={c.id}
                  className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 space-y-0.5">
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
        <p className="text-muted-foreground">Réceptionniste</p>
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

      {/* 4. Raccourcis */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Raccourcis</h2>
        <div className="grid gap-4 sm:grid-cols-3">
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

      {/* 5. Commandes récentes */}
      {renderRecentes()}
    </div>
  );
}
