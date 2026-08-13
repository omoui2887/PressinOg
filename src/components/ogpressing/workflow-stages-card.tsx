/**
 * e-pressing — WorkflowStagesCard (CASIER-FIX-V1)
 * -------------------------------------------------
 * Carte partagée affichant les articles d'une commande (ou d'un ensemble de
 * commandes) groupés par macro-étape du workflow de traitement :
 *
 *   1. Prétraiter / Laver    (recu, en_traitement, lave)
 *   2. Repasser / Emballer   (repasse, pret)
 *   3. Livrer / Récupérer    (en_livraison, livre, retire)
 *
 * Utilisée dans les dashboards personnel (laveur, repassage, livreur,
 * réceptionniste) pour donner une vue d'ensemble immédiate de l'état
 * d'avancement des vêtements dans le pipeline.
 *
 * Props :
 *   - articles        : liste d'articles (avec statut + infos commande)
 *   - highlightEtape  : macro-étape à mettre en avant (celle du rôle courant)
 *   - basePath        : base pour les liens vers le détail commande
 *   - loading         : affiche des skeletons si true
 *   - emptyMessage    : message si la liste est vide
 *
 * Composant de présentation (pas de fetch, pas d'état interne) — utilise
 * les helpers du module `src/lib/workflow/commande-statut.ts`.
 */
"use client";

import Link from "next/link";
import {
  AlertCircle,
  Droplets,
  type LucideIcon,
  PackageCheck,
  Shirt,
  Wind,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/shared";
import { cn } from "@/lib/utils";
import { formatRelative } from "@/lib/utils/format";
import {
  ETAPE_TRAITEMENT_DESCRIPTIONS,
  ETAPE_TRAITEMENT_ICONS,
  ETAPE_TRAITEMENT_LABELS,
  ETAPES_TRAITEMENT,
  type EtapeTraitement,
  STATUT_ARTICLE_LABELS,
  grouperArticlesParEtape,
} from "@/lib/workflow/commande-statut";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/** Article minimal attendu par la carte. */
export interface WorkflowStageArticle {
  id: string;
  statut: string | null | undefined;
  /** Numéro de commande pour le lien (ex: "CMD-2026-00001"). */
  commande_numero?: string | null;
  /** ID de la commande (pour construire le lien). */
  commande_id?: string | null;
  /** Nom du client (pour affichage). */
  client_nom?: string | null;
  /** Description de l'article (ligne commande). */
  description?: string | null;
  /** Code QR de l'article. */
  code_qr?: string | null;
  /** Casier de stockage si l'article est rangé. */
  zone_stockage?: string | null;
  /** Date de création de l'article (pour tri). */
  created_at?: string | null;
}

export interface WorkflowStagesCardProps {
  /** Liste d'articles à grouper par macro-étape. */
  articles: WorkflowStageArticle[];
  /** Macro-étape à mettre en avant (celle du rôle courant).
   *  La colonne correspondante aura une bordure colorée + un fond teinté. */
  highlightEtape?: EtapeTraitement;
  /** Base pour les liens vers le détail commande (ex: "/personnel/laveur"). */
  basePath?: string;
  /** Affiche des skeletons si true. */
  loading?: boolean;
  /** Titre de la carte. */
  title?: string;
  /** Description de la carte. */
  description?: string;
  /** Message affiché si la liste est vide. */
  emptyMessage?: string;
  /** Nombre max d'articles à afficher par étape (défaut 8). */
  maxPerStage?: number;
  className?: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Mappe un nom d'icône (string) vers le composant Lucide. */
const ICON_MAP: Record<string, LucideIcon> = {
  Droplets,
  Wind,
  PackageCheck,
};

/** Variante de couleur (border + bg) pour chaque macro-étape. */
const ETAPE_STYLES: Record<
  EtapeTraitement,
  { border: string; bg: string; icon: string; count: string }
> = {
  pretraiter_laver: {
    border: "border-warning/40",
    bg: "bg-warning/5",
    icon: "bg-warning/15 text-warning",
    count: "text-warning",
  },
  repasser_emballer: {
    border: "border-primary/40",
    bg: "bg-primary/5",
    icon: "bg-primary/15 text-primary",
    count: "text-primary",
  },
  livrer_recuperer: {
    border: "border-secondary/40",
    bg: "bg-secondary/5",
    icon: "bg-secondary/15 text-secondary",
    count: "text-secondary",
  },
};

/* ------------------------------------------------------------------ */
/*  Composant                                                          */
/* ------------------------------------------------------------------ */

export function WorkflowStagesCard({
  articles,
  highlightEtape,
  basePath = "/personnel/manager",
  loading = false,
  title = "Étapes du workflow",
  description = "Vue d'ensemble de l'avancement des vêtements",
  emptyMessage = "Aucun article à afficher pour le moment.",
  maxPerStage = 8,
  className,
}: WorkflowStagesCardProps) {
  // --- États de chargement ---
  if (loading) {
    return (
      <Card className={cn("overflow-hidden", className)}>
        <CardHeader>
          <Skeleton className="h-6 w-48 rounded" />
          <Skeleton className="mt-1 h-4 w-72 rounded" />
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            {ETAPES_TRAITEMENT.map((etape) => (
              <div
                key={etape}
                className="space-y-3 rounded-lg border p-4"
              >
                <Skeleton className="h-8 w-8 rounded-lg" />
                <Skeleton className="h-5 w-32 rounded" />
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full rounded" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  // --- Groupement par macro-étape ---
  const grouped = grouperArticlesParEtape(articles);
  const total = articles.length;

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader>
        <div className="flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle className="text-lg">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
            {total} article{total > 1 ? "s" : ""}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-muted/20 py-10 text-center">
            <Shirt className="size-8 text-muted-foreground/50" />
            <p className="text-sm font-medium text-foreground">
              {emptyMessage}
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-3">
            {ETAPES_TRAITEMENT.map((etape) => {
              const items = grouped[etape];
              const isHighlighted = highlightEtape === etape;
              const styles = ETAPE_STYLES[etape];
              const iconName = ETAPE_TRAITEMENT_ICONS[etape];
              const Icon = ICON_MAP[iconName] ?? Droplets;
              const visibleItems = items.slice(0, maxPerStage);
              const hiddenCount = items.length - visibleItems.length;

              return (
                <div
                  key={etape}
                  className={cn(
                    "flex flex-col rounded-lg border p-4 transition-colors",
                    styles.border,
                    isHighlighted ? cn(styles.bg, "ring-2 ring-offset-1 ring-offset-background") : "bg-card"
                  )}
                  aria-label={`Étape : ${ETAPE_TRAITEMENT_LABELS[etape]}`}
                >
                  {/* En-tête de colonne */}
                  <div className="mb-3 flex items-center gap-3">
                    <span
                      className={cn(
                        "flex size-9 shrink-0 items-center justify-center rounded-lg",
                        styles.icon
                      )}
                      aria-hidden
                    >
                      <Icon className="size-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {ETAPE_TRAITEMENT_LABELS[etape]}
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {ETAPE_TRAITEMENT_DESCRIPTIONS[etape]}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 text-2xl font-bold tabular-nums",
                        styles.count
                      )}
                      aria-label={`${items.length} article${items.length > 1 ? "s" : ""}`}
                    >
                      {items.length}
                    </span>
                  </div>

                  {/* Liste des articles */}
                  {items.length === 0 ? (
                    <p className="rounded-md bg-muted/30 px-3 py-4 text-center text-xs text-muted-foreground">
                      Aucun article
                    </p>
                  ) : (
                    <ul className="max-h-80 space-y-2 overflow-y-auto pr-1">
                      {visibleItems.map((a) => (
                        <li
                          key={a.id}
                          className="rounded-md border bg-background p-2.5 text-xs transition-colors hover:bg-accent/40"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              {a.commande_id && a.commande_numero ? (
                                <Link
                                  href={`${basePath}/commandes/${a.commande_id}`}
                                  className="font-mono text-[11px] font-semibold text-foreground hover:text-primary hover:underline"
                                >
                                  {a.commande_numero}
                                </Link>
                              ) : (
                                <span className="text-[11px] text-muted-foreground">
                                  —
                                </span>
                              )}
                              {a.client_nom && (
                                <p className="mt-0.5 truncate font-medium text-foreground">
                                  {a.client_nom}
                                </p>
                              )}
                              {a.description && (
                                <p className="mt-0.5 truncate text-muted-foreground">
                                  {a.description}
                                </p>
                              )}
                            </div>
                            <div className="flex shrink-0 flex-col items-end gap-1">
                              <StatusBadge
                                status={a.statut ?? ""}
                                label={
                                  STATUT_ARTICLE_LABELS[a.statut ?? ""] ??
                                  a.statut ??
                                  "—"
                                }
                                variant="neutral"
                                className="text-[10px]"
                              />
                              {a.zone_stockage && (
                                <span className="inline-flex items-center gap-0.5 rounded bg-secondary/15 px-1.5 py-0.5 font-mono text-[10px] font-bold text-secondary">
                                  🗄 {a.zone_stockage}
                                </span>
                              )}
                            </div>
                          </div>
                          {a.created_at && (
                            <p className="mt-1 text-[10px] text-muted-foreground">
                              {formatRelative(a.created_at)}
                            </p>
                          )}
                        </li>
                      ))}
                      {hiddenCount > 0 && (
                        <li className="rounded-md border border-dashed bg-muted/20 px-3 py-2 text-center text-[11px] text-muted-foreground">
                          + {hiddenCount} autre{hiddenCount > 1 ? "s" : ""}…
                        </li>
                      )}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Export d'un sous-composant pour un résumé compact (KPIs)          */
/* ------------------------------------------------------------------ */

export interface WorkflowStagesSummaryProps {
  articles: WorkflowStageArticle[];
  highlightEtape?: EtapeTraitement;
  className?: string;
}

/**
 * Variante compacte : n'affiche que 3 "mini-cartes" avec le compte par
 * étape, sans la liste détaillée. Utile pour les dashboards qui ont déjà
 * beaucoup de contenu.
 */
export function WorkflowStagesSummary({
  articles,
  highlightEtape,
  className,
}: WorkflowStagesSummaryProps) {
  const grouped = grouperArticlesParEtape(articles);

  return (
    <div
      className={cn(
        "grid gap-3 grid-cols-1 sm:grid-cols-3",
        className
      )}
    >
      {ETAPES_TRAITEMENT.map((etape) => {
        const count = grouped[etape].length;
        const isHighlighted = highlightEtape === etape;
        const styles = ETAPE_STYLES[etape];
        const iconName = ETAPE_TRAITEMENT_ICONS[etape];
        const Icon = ICON_MAP[iconName] ?? Droplets;

        return (
          <div
            key={etape}
            className={cn(
              "flex items-center gap-3 rounded-lg border p-3 transition-colors",
              styles.border,
              isHighlighted ? styles.bg : "bg-card"
            )}
          >
            <span
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-lg",
                styles.icon
              )}
              aria-hidden
            >
              <Icon className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-muted-foreground">
                {ETAPE_TRAITEMENT_LABELS[etape]}
              </p>
              <p className="text-xl font-bold tabular-nums text-foreground">
                {count}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
