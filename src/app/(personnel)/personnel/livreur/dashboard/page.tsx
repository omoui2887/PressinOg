/**
 * OgPressing — /personnel/livreur/dashboard (LIV-1)
 * -------------------------------------------------
 * Tableau de bord du livreur :
 *   1. Header (titre "Tableau de bord" + sous-titre "Livreur")
 *   2. 4 StatCards :
 *        - À livrer          (Package, warning)    — pret + livraison=true
 *        - En livraison       (Truck, primary)      — en_livraison
 *        - Livrées aujourd'hui (CheckCircle, secondary) — livre + date_livraison du jour
 *        - En attente retrait (Store, primary)      — pret + livraison=false
 *   3. Raccourci : Commandes à livrer (CTA primary → /personnel/livreur/commandes)
 *   4. Tournées en cours : liste des 5 commandes "en_livraison" avec
 *      numéro, client, adresse_livraison, montant
 *
 * Client component : fetch des données live au montage via 4 endpoints
 * en parallèle. États loading (skeletons) + error (alerte + bouton Réessayer).
 *
 * 🔒 SÉCURITÉ : le layout (personnel)/layout.tsx vérifie déjà l'auth + le
 *    rôle (livreur uniquement sur /personnel/livreur/*). Les endpoints
 *    /api/admin/commandes acceptent n'importe quel personnel actif du
 *    pressing. La RLS isole automatiquement par pressing_id.
 */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle,
  MapPin,
  Package,
  ShoppingBag,
  Store,
  Truck,
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
import {
  WorkflowStagesCard,
  type WorkflowStageArticle,
} from "@/components/ogpressing/workflow-stages-card";
import { StatusBadge } from "@/components/shared";
import {
  STATUT_LABELS,
  statutVariant,
  type CommandeListItem,
} from "@/components/ogpressing/admin/commandes/commandes-helpers";
import { formatFCFA, formatRelative } from "@/lib/utils/format";
import { cn } from "@/lib/utils";

const BASE_PATH = "/personnel/livreur";

/** Statuts de commande dont on souhaite afficher les articles dans la
 *  carte "Étapes du workflow" du dashboard livreur.
 *
 *  On couvre les 3 macro-étapes pour que la carte affiche un panorama
 *  complet (pas seulement l'étape livraison) : l'employé voit où en est
 *  chaque vêtement dans le pipeline. */
const WORKFLOW_STATUTS = [
  "pret",
  "en_livraison",
  "livre",
  "retire",
] as const;

/** Nombre maximum de commandes détaillées par statut pour la carte
 *  workflow. Limite l'explosion N+1 et garde la carte lisible. */
const WORKFLOW_MAX_PAR_STATUT = 20;

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface DashboardStats {
  /** Commandes prêtes avec livraison=true (à livrer chez le client). */
  aLivrer: number;
  /** Commandes actuellement en cours de livraison (statut en_livraison). */
  enLivraison: number;
  /** Commandes livrées aujourd'hui (statut livre, date_livraison du jour). */
  livreesAujourdhui: number;
  /** Commandes prêtes avec livraison=false (retrait sur place). */
  attenteRetrait: number;
}

interface DashboardData {
  stats: DashboardStats;
  tournees: CommandeListItem[];
}

interface CommandesApiResponse {
  success: boolean;
  data: CommandeListItem[];
  total: number;
  error?: string;
}

interface CommandeDetailArticle {
  id: string;
  statut: string;
  ligne_id?: string | null;
  code_qr?: string | null;
  zone_stockage?: string | null;
  created_at?: string | null;
}

interface CommandeDetailLigne {
  id: string;
  description?: string | null;
}

interface CommandeDetailApiResponse {
  success: boolean;
  data?: {
    id: string;
    articles?: CommandeDetailArticle[];
    lignes?: CommandeDetailLigne[] | null;
  } | null;
  error?: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Indique si une date ISO tombe "aujourd'hui" (comparaison local, pas UTC).
 * On utilise les composants year/month/date pour éviter les décalages de TZ.
 */
function isToday(isoDate: string | null | undefined): boolean {
  if (!isoDate) return false;
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

/**
 * Récupère une liste d'articles groupables par macro-étape pour alimenter
 * la carte `WorkflowStagesCard`. Pour chaque statut de commande demandé,
 * on fetch la liste des commandes puis le détail de chacune (articles +
 * lignes) afin de construire des `WorkflowStageArticle` enrichis.
 *
 * Les fetchs par statut sont parallélisés via `Promise.all`. Le total
 * d'articles est plafonné à ~`maxArticles` pour garder la carte lisible.
 */
async function fetchArticlesForWorkflow(
  statuts: readonly string[],
  maxParStatut = WORKFLOW_MAX_PAR_STATUT,
  maxArticles = 80
): Promise<WorkflowStageArticle[]> {
  // 1. Liste des commandes par statut (en parallèle)
  const listesParStatut = await Promise.all(
    statuts.map(async (statut) => {
      try {
        const res = await fetch(
          `/api/admin/commandes?statut=${statut}&pageSize=${maxParStatut}`,
          { cache: "no-store" }
        );
        const json: CommandesApiResponse = await res.json();
        if (!json.success) return [] as CommandeListItem[];
        return json.data ?? ([] as CommandeListItem[]);
      } catch {
        return [] as CommandeListItem[];
      }
    })
  );

  // 2. Déduplication des commandes (un même id peut apparaître dans
  //    plusieurs listes de statut)
  const seen = new Set<string>();
  const commandes: CommandeListItem[] = [];
  for (const liste of listesParStatut) {
    for (const c of liste) {
      if (!seen.has(c.id)) {
        seen.add(c.id);
        commandes.push(c);
      }
    }
  }

  if (commandes.length === 0) return [];

  // 3. Fetch du détail de chaque commande (en parallèle, borné)
  const details = await Promise.allSettled(
    commandes.map((c) =>
      fetch(`/api/admin/commandes/${c.id}`, { cache: "no-store" })
        .then((r) => r.json() as Promise<CommandeDetailApiResponse>)
        .catch(
          () =>
            ({ success: false }) as unknown as CommandeDetailApiResponse
        )
    )
  );

  // 4. Construction du tableau d'articles
  const all: WorkflowStageArticle[] = [];
  for (let i = 0; i < commandes.length; i++) {
    if (all.length >= maxArticles) break;
    const res = details[i];
    if (res.status !== "fulfilled") continue;
    const detail = res.value;
    if (!detail.success || !detail.data) continue;
    const cmd = commandes[i];
    const lignes = detail.data.lignes ?? [];
    for (const a of detail.data.articles ?? []) {
      if (all.length >= maxArticles) break;
      const ligne = lignes.find((l) => l.id === a.ligne_id);
      all.push({
        id: a.id,
        statut: a.statut,
        commande_numero: cmd.numero_commande,
        commande_id: cmd.id,
        client_nom: cmd.client?.nom_complet ?? null,
        description: ligne?.description ?? null,
        code_qr: a.code_qr ?? null,
        zone_stockage: a.zone_stockage ?? null,
        created_at: a.created_at ?? null,
      });
    }
  }
  return all;
}

/* ------------------------------------------------------------------ */
/*  Composant                                                          */
/* ------------------------------------------------------------------ */

export default function LivreurDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Articles pour la carte "Étapes du workflow" (chargement indépendant
  // pour ne pas ralentir le chargement initial du dashboard).
  const [workflowArticles, setWorkflowArticles] = useState<
    WorkflowStageArticle[]
  >([]);
  const [workflowLoading, setWorkflowLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch parallèle :
      //  1. Commandes "pret"        → sert à calculer aLivrer + attenteRetrait
      //  2. Commandes "en_livraison" → sert à calculer enLivraison + tournees
      //  3. Commandes "livre"        → sert à calculer livreesAujourdhui
      //
      // On demande pageSize=200 sur "pret" et "livre" pour récupérer un
      // maximum de lignes et filtrer côté client sur `livraison` (la RLS
      // ne permet pas de filter booléen directement en PostgREST sans
      // une requête dédiée). 200 est un plafond raisonnable : un pressing
      // qui aurait plus de 200 commandes "pret" en même temps est extrêmement
      // rare. La pagination du dashboard n'est pas nécessaire.
      const [pretRes, enLivraisonRes, livreRes] = await Promise.all([
        fetch(`/api/admin/commandes?statut=pret&pageSize=100`, {
          cache: "no-store",
        }),
        fetch(`/api/admin/commandes?statut=en_livraison&pageSize=50`, {
          cache: "no-store",
        }),
        fetch(`/api/admin/commandes?statut=livre&pageSize=100`, {
          cache: "no-store",
        }),
      ]);

      const pretJson: CommandesApiResponse = await pretRes.json();
      const enLivraisonJson: CommandesApiResponse = await enLivraisonRes.json();
      const livreJson: CommandesApiResponse = await livreRes.json();

      if (!pretJson.success) {
        throw new Error(
          pretJson.error || "Erreur lors de la récupération des commandes"
        );
      }

      const pretList = pretJson.data ?? [];
      const enLivraisonList = enLivraisonJson.data ?? [];
      const livreList = livreJson.data ?? [];

      const aLivrer = pretList.filter((c) => c.livraison === true).length;
      const attenteRetrait = pretList.filter(
        (c) => c.livraison !== true
      ).length;
      const livreesAujourdhui = livreList.filter((c) =>
        isToday(c.date_livraison)
      ).length;

      setData({
        stats: {
          aLivrer,
          enLivraison: enLivraisonList.length,
          livreesAujourdhui,
          attenteRetrait,
        },
        // Tournées en cours = les commandes "en_livraison" (limit 5).
        tournees: enLivraisonList.slice(0, 5),
      });
    } catch (err) {
      console.error("[livreur/dashboard] Erreur fetch:", err);
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

  /**
   * Fetch indépendant des articles pour la carte "Étapes du workflow".
   * Lancé en parallèle du `fetchData` principal pour ne pas bloquer
   * l'affichage des StatCards / Raccourcis / Tournées.
   */
  const fetchWorkflow = useCallback(async () => {
    setWorkflowLoading(true);
    try {
      const articles = await fetchArticlesForWorkflow(WORKFLOW_STATUTS);
      setWorkflowArticles(articles);
    } catch (err) {
      console.error("[livreur/dashboard] Erreur workflow:", err);
      setWorkflowArticles([]);
    } finally {
      setWorkflowLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWorkflow();
  }, [fetchWorkflow]);

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
          label="À livrer"
          value={data.stats.aLivrer}
          icon={Package}
          accent="warning"
          description="Prêtes chez le client"
          delay={0}
        />
        <StatCard
          label="En livraison"
          value={data.stats.enLivraison}
          icon={Truck}
          accent="primary"
          description="Tournées en cours"
          delay={60}
        />
        <StatCard
          label="Livrées aujourd'hui"
          value={data.stats.livreesAujourdhui}
          icon={CheckCircle}
          accent="secondary"
          description="Terminées ce jour"
          delay={120}
        />
        <StatCard
          label="En attente retrait"
          value={data.stats.attenteRetrait}
          icon={Store}
          accent="primary"
          description="Retrait sur place"
          delay={180}
        />
      </div>
    );
  }

  /* ---------------- Sous-composant : Tournées en cours ---------------- */

  function renderTournees() {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="text-lg">Tournées en cours</CardTitle>
            <CardDescription>
              Les 5 commandes actuellement en livraison
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
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-lg" />
              ))}
            </div>
          ) : error || !data ? (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
              Données indisponibles
            </div>
          ) : data.tournees.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-muted/20 py-10 text-center">
              <Truck className="size-8 text-muted-foreground/50" />
              <p className="text-sm font-medium text-foreground">
                Aucune tournée en cours
              </p>
              <p className="max-w-xs text-xs text-muted-foreground">
                Les commandes que vous démarrerez en livraison apparaîtront ici.
                Rendez-vous sur « Commandes à livrer » pour démarrer une
                livraison.
              </p>
            </div>
          ) : (
            <ul className="divide-y">
              {data.tournees.map((c) => (
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
                    <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                      <MapPin className="size-3 shrink-0" aria-hidden />
                      <span className="truncate">
                        {c.adresse_livraison || "Adresse non renseignée"}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Démarrée {formatRelative(c.created_at)}
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

  /* ---------------- Sous-composant : Raccourcis ---------------- */

  const shortcuts = useMemo(
    () =>
      [
        {
          href: `${BASE_PATH}/commandes`,
          title: "Commandes à livrer",
          subtitle: "Démarrer ou terminer une livraison",
          icon: ShoppingBag,
          primary: true,
        },
      ] as const,
    []
  );

  /* ---------------- Rendu principal ---------------- */

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* 1. Header */}
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Tableau de bord
        </h1>
        <p className="text-muted-foreground">Livreur</p>
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

      {/* 4. Étapes du workflow — vue d'ensemble des vêtements groupés
          par macro-étape (Prétraiter/Laver, Repasser/Emballer,
          Livrer/Récupérer) */}
      <WorkflowStagesCard
        articles={workflowArticles}
        highlightEtape="livrer_recuperer"
        basePath={BASE_PATH}
        loading={workflowLoading}
        title="Étapes du workflow"
        description="Vue d'ensemble de l'avancement des vêtements"
        emptyMessage="Aucun article en cours de traitement pour le moment."
        maxPerStage={6}
      />

      {/* 5. Raccourcis */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Raccourcis</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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

      {/* 6. Tournées en cours */}
      {renderTournees()}
    </div>
  );
}
