/**
 * e-pressing — /personnel/caissier/dashboard (CAIS-1)
 * ---------------------------------------------------
 * Tableau de bord du caissier :
 *   1. Header (titre "Tableau de bord" + sous-titre "Caissier")
 *   2. 4 StatCards : Recette du jour / Commandes impayées /
 *      Paiements partiels / Clients en impayé
 *   3. Raccourcis : Encaisser un paiement / Voir les clients (2 cards)
 *   4. Paiements récents du jour (5 derniers) + lien "Encaisser →"
 *
 * Client component : fetch des données live au montage via plusieurs
 * endpoints en parallèle. États loading (skeletons) + error (alerte).
 *
 * 🔒 SÉCURITÉ : le layout (personnel)/layout.tsx vérifie déjà l'auth + le
 *    rôle (caissier). Les endpoints /api/admin/* acceptent n'importe quel
 *    personnel actif du pressing. La RLS isole automatiquement par
 *    pressing_id.
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  Banknote,
  Clock,
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
import { StatCard } from "@/components/ogpressing/stat-card";
import { StatusBadge } from "@/components/shared";
import { METHODE_PAIEMENT_LABELS } from "@/components/ogpressing/admin/clients/client-detail-helpers";
import { formatFCFA, formatRelative } from "@/lib/utils/format";
import { cn } from "@/lib/utils";

const BASE_PATH = "/personnel/caissier";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface DashboardStats {
  /** Somme des paiements encaissés aujourd'hui (FCFA). */
  recetteDuJour: number;
  /** Nombre de commandes non payées. */
  commandesImpayees: number;
  /** Nombre de commandes partiellement payées. */
  paiementsPartiels: number;
  /** Nombre de clients avec un solde impayé > 0. */
  clientsImpayes: number;
}

interface PaiementRecent {
  id: string;
  montant: number;
  methode: string;
  date_paiement: string;
  commande?: {
    numero_commande: string;
    client?: { nom_complet: string } | null;
  } | null;
}

interface DashboardData {
  stats: DashboardStats;
  paiementsRecents: PaiementRecent[];
}

interface CommandesApiResponse {
  success: boolean;
  total: number;
  error?: string;
}

interface ClientsApiResponse {
  success: boolean;
  total: number;
  error?: string;
}

interface PaiementsApiResponse {
  success: boolean;
  data: PaiementRecent[];
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

export default function CaissierDashboardPage() {
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
      //  1. Rapport paiements du jour (somme = recette + liste des 5 derniers)
      //  2. Commandes non payées (total)
      //  3. Commandes partiellement payées (total)
      //  4. Clients en impayé (total)
      const [paiementsRes, impayesRes, partielsRes, clientsImpayesRes] =
        await Promise.all([
          fetch(`/api/admin/rapports/paiements?${params.toString()}`, {
            cache: "no-store",
          }),
          fetch(`/api/admin/commandes?statut_paiement=non_paye&pageSize=1`, {
            cache: "no-store",
          }),
          fetch(`/api/admin/commandes?statut_paiement=partiel&pageSize=1`, {
            cache: "no-store",
          }),
          fetch(`/api/admin/clients?impayes=true&pageSize=1`, {
            cache: "no-store",
          }),
        ]);

      const paiementsJson: PaiementsApiResponse = await paiementsRes.json();
      const impayesJson: CommandesApiResponse = await impayesRes.json();
      const partielsJson: CommandesApiResponse = await partielsRes.json();
      const clientsImpayesJson: ClientsApiResponse = await clientsImpayesRes.json();

      if (!paiementsJson.success) {
        throw new Error(
          paiementsJson.error || "Erreur lors de la récupération des paiements"
        );
      }

      const paiements = paiementsJson.data ?? [];
      const recetteDuJour = paiements.reduce(
        (sum, p) => sum + (p.montant ?? 0),
        0
      );

      setData({
        stats: {
          recetteDuJour,
          commandesImpayees: impayesJson.total ?? 0,
          paiementsPartiels: partielsJson.total ?? 0,
          clientsImpayes: clientsImpayesJson.total ?? 0,
        },
        paiementsRecents: paiements.slice(0, 5),
      });
    } catch (err) {
      console.error("[caissier/dashboard] Erreur fetch:", err);
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
          description="Paiements encaissés"
          delay={0}
        />
        <StatCard
          label="Commandes impayées"
          value={data.stats.commandesImpayees}
          icon={AlertCircle}
          accent="danger"
          description="Non payées"
          delay={60}
        />
        <StatCard
          label="Paiements partiels"
          value={data.stats.paiementsPartiels}
          icon={Clock}
          accent="warning"
          description="Acomptes en cours"
          delay={120}
        />
        <StatCard
          label="Clients en impayé"
          value={data.stats.clientsImpayes}
          icon={Users}
          accent="secondary"
          description="Solde dû > 0"
          delay={180}
        />
      </div>
    );
  }

  /* ---------------- Sous-composant : Raccourcis ---------------- */

  const shortcuts = [
    {
      href: `${BASE_PATH}/encaisser`,
      title: "Encaisser un paiement",
      subtitle: "Enregistrer un règlement client",
      icon: Wallet,
      primary: true,
    },
    {
      href: `${BASE_PATH}/clients`,
      title: "Clients",
      subtitle: "Consulter les impayés et l'historique",
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
            <CardTitle className="text-lg">Paiements récents du jour</CardTitle>
            <CardDescription>
              Les 5 derniers paiements encaissés aujourd&apos;hui
            </CardDescription>
          </div>
          <Button asChild variant="outline" size="sm" className="shrink-0">
            <Link href={`${BASE_PATH}/encaisser`}>
              Encaisser
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
          ) : data.paiementsRecents.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-muted/20 py-10 text-center">
              <Banknote className="size-8 text-muted-foreground/50" />
              <p className="text-sm font-medium text-foreground">
                Aucun paiement encaissé aujourd&apos;hui
              </p>
              <p className="max-w-xs text-xs text-muted-foreground">
                Les paiements que vous encaisserez apparaîtront ici. Utilisez le
                raccourci «&nbsp;Encaisser un paiement&nbsp;» pour commencer.
              </p>
            </div>
          ) : (
            <ul className="divide-y">
              {data.paiementsRecents.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 space-y-0.5">
                    <p className="truncate text-sm font-semibold text-foreground">
                      <span className="font-mono text-xs text-muted-foreground">
                        {p.commande?.numero_commande ?? "—"}
                      </span>
                      {p.commande?.client?.nom_complet && (
                        <>
                          {" — "}
                          <span>{p.commande.client.nom_complet}</span>
                        </>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatRelative(p.date_paiement)} ·{" "}
                      {METHODE_PAIEMENT_LABELS[p.methode] ?? p.methode}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-foreground">
                    {formatFCFA(p.montant)}
                  </span>
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
        <p className="text-muted-foreground">Caissier</p>
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

      {/* 5. Paiements récents */}
      {renderPaiementsRecents()}
    </div>
  );
}
