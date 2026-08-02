/**
 * OgPressing — CataloguePage (client orchestrator) — LOT 15.4
 * ------------------------------------------------------------
 * Page /super-admin/catalogue : gestion du catalogue global d'articles
 * par le Super Admin.
 *
 * Fonctionnalités :
 *   - Fetch TOUS les articles (actifs + inactifs) via
 *     GET /api/super-admin/catalogue
 *   - Regroupement par catégorie via `groupArticlesByCategorie` (ordre
 *     défini par `CATALOGUE_CATEGORIES`, catégories inconnues à la fin)
 *   - Header : titre + compteur total + bouton "Ajouter un article"
 *   - Sections par catégorie : icône + nom + compteur + grille de cards
 *   - Card : illustration (Image avec fallback Shirt), nom, slug, badge
 *     ordre_affichage, Switch actif (PATCH direct optimiste), bouton Modifier
 *   - États : loading (skeletons animate-pulse), error (message + retry),
 *     empty (message centré)
 *
 * Données via :
 *   - GET    /api/super-admin/catalogue
 *   - POST   /api/super-admin/catalogue          (ajout)
 *   - PATCH  /api/super-admin/catalogue/[id]     (édition + toggle actif)
 *
 * Référence pattern :
 *   - admin/services/services-page.tsx (CRUD + switch actif optimiste)
 *   - super-admin/pressings/pressings-page.tsx (fetch + états loading/error)
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import {
  Shirt,
  Plus,
  Pencil,
  Tags,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { cn } from "@/lib/utils";
import { getIconForCategorie } from "@/lib/catalogue/catalogue-articles";
import {
  groupArticlesByCategorie,
  type CatalogueArticle,
} from "./catalogue-helpers";
import { CatalogueForm } from "./catalogue-form";

// ---------------------------------------------------------------
// Types réponse API
// ---------------------------------------------------------------

interface CatalogueApiResponse {
  success: boolean;
  data: CatalogueArticle[];
  error?: string;
}

// ---------------------------------------------------------------
// Composant principal
// ---------------------------------------------------------------

export function CataloguePage() {
  const [articles, setArticles] = useState<CatalogueArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // États dialog
  const [addOpen, setAddOpen] = useState(false);
  const [editArticle, setEditArticle] = useState<CatalogueArticle | null>(null);

  const fetchArticles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/super-admin/catalogue", {
        cache: "no-store",
      });
      const data: CatalogueApiResponse = await res.json();
      if (data.success) {
        setArticles(data.data ?? []);
      } else {
        setArticles([]);
        setError(data.error ?? "Erreur lors du chargement du catalogue");
      }
    } catch (err) {
      console.error("[catalogue] Erreur fetch:", err);
      setArticles([]);
      setError("Impossible de charger le catalogue. Réessayez.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchArticles();
  }, [fetchArticles]);

  // Bascule l'état actif d'un article (optimistic + PATCH direct, sans
  // attendre la soumission du formulaire d'édition).
  async function handleToggleActif(article: CatalogueArticle) {
    const nouveauStatut = !article.actif;
    // Optimistic : on inverse immédiatement dans la liste.
    setArticles((prev) =>
      prev.map((a) =>
        a.id === article.id ? { ...a, actif: nouveauStatut } : a
      )
    );
    try {
      const res = await fetch(`/api/super-admin/catalogue/${article.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actif: nouveauStatut }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Erreur lors de la mise à jour");
      }
      toast.success(
        nouveauStatut ? "Article activé" : "Article désactivé",
        {
          description: `${article.nom} est maintenant ${
            nouveauStatut ? "actif" : "inactif"
          }.`,
        }
      );
    } catch (err) {
      // Rollback : remet l'ancien état
      setArticles((prev) =>
        prev.map((a) =>
          a.id === article.id ? { ...a, actif: article.actif } : a
        )
      );
      toast.error("Échec de la mise à jour", {
        description: err instanceof Error ? err.message : "Erreur inconnue",
      });
    }
  }

  // Ouvre le dialog d'édition pour un article donné.
  function handleEdit(article: CatalogueArticle) {
    setEditArticle(article);
  }

  // Ferme le dialog d'édition et refresh la liste (pour répercuter les
  // changements de slug, nom, catégorie, icône, ordre, actif).
  function handleEditOpenChange(open: boolean) {
    if (!open) {
      setEditArticle(null);
      // Refresh léger : on ne refetch que si on avait un article en édition
      // (évite un fetch inutile à la fermeture du dialog ajout sans submit).
      if (editArticle) {
        fetchArticles();
      }
    }
  }

  // Ferme le dialog d'ajout et refresh la liste si un article a été créé.
  function handleAddOpenChange(open: boolean) {
    setAddOpen(open);
    if (!open) {
      // Toujours refresh après fermeture du dialog d'ajout : si l'utilisateur
      // a créé un article, on le voit dans la liste ; s'il a annulé, le
      // fetch est idempotent (aucun changement visible).
      if (!loading) fetchArticles();
    }
  }

  // Calcul des groupes (avec mémorisation légère via useCallback inutile ici
  // car les articles changent souvent ; on recalcule à chaque render — OK
  // pour 33-50 articles).
  const grouped = groupArticlesByCategorie(articles);
  const totalActifs = articles.filter((a) => a.actif).length;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
            <Shirt className="size-6 text-primary" />
            Catalogue d&apos;articles
          </h1>
          <p className="text-sm text-muted-foreground">
            Gérez le catalogue global d&apos;articles du pressing.
            {articles.length > 0 && (
              <>
                {" "}
                <span className="font-medium text-foreground">
                  {articles.length}
                </span>{" "}
                article{articles.length > 1 ? "s" : ""} ·{" "}
                <span className="font-medium text-secondary">{totalActifs}</span>{" "}
                actif{totalActifs > 1 ? "s" : ""}
              </>
            )}
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)} className="h-11">
          <Plus className="mr-2 size-4" />
          Ajouter un article
        </Button>
      </div>

      {/* États */}
      {loading ? (
        <CatalogueLoadingState />
      ) : error ? (
        <CatalogueErrorState message={error} onRetry={fetchArticles} />
      ) : articles.length === 0 ? (
        <CatalogueEmptyState onAdd={() => setAddOpen(true)} />
      ) : (
        // Liste regroupée par catégorie
        <div className="space-y-8">
          {grouped.map((groupe) => {
            const CategorieIcon = getIconForCategorie(groupe.categorie);
            return (
              <section
                key={groupe.categorie}
                className="space-y-3"
                aria-label={`Catégorie : ${groupe.categorie}`}
              >
                {/* En-tête du groupe */}
                <div className="flex items-center gap-2">
                  <span className="flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <CategorieIcon className="size-4" />
                  </span>
                  <h2 className="text-base font-semibold text-foreground">
                    {groupe.categorie}
                  </h2>
                  <Badge variant="outline" className="font-medium">
                    {groupe.articles.length}
                  </Badge>
                </div>

                {/* Grille de cards */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                  {groupe.articles.map((article) => (
                    <CatalogueCard
                      key={article.id}
                      article={article}
                      onToggle={handleToggleActif}
                      onEdit={handleEdit}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* Dialog ajout */}
      <CatalogueForm
        article={null}
        open={addOpen}
        onOpenChange={handleAddOpenChange}
        onSaved={fetchArticles}
      />

      {/* Dialog édition */}
      <CatalogueForm
        article={editArticle}
        open={editArticle !== null}
        onOpenChange={handleEditOpenChange}
        onSaved={fetchArticles}
      />
    </div>
  );
}

// ---------------------------------------------------------------
// Sous-composant : Card d'un article
// ---------------------------------------------------------------

interface CatalogueCardProps {
  article: CatalogueArticle;
  onToggle: (a: CatalogueArticle) => void;
  onEdit: (a: CatalogueArticle) => void;
}

function CatalogueCard({ article, onToggle, onEdit }: CatalogueCardProps) {
  const [imageError, setImageError] = useState(false);

  return (
    <Card
      className={cn(
        "relative gap-2 overflow-hidden p-3 transition-shadow hover:shadow-md",
        !article.actif && "bg-muted/40 opacity-80"
      )}
    >
      {/* Illustration */}
      <div className="relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-md bg-muted/30">
        {article.icone_url && !imageError ? (
          <Image
            src={article.icone_url}
            alt={article.nom}
            fill
            unoptimized
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 16vw"
            className="object-contain p-2"
            onError={() => setImageError(true)}
          />
        ) : (
          <Shirt className="size-10 text-muted-foreground/40" />
        )}
      </div>

      {/* Nom + slug */}
      <div className="min-w-0 space-y-0.5">
        <p className="truncate text-sm font-semibold text-foreground" title={article.nom}>
          {article.nom}
        </p>
        <p
          className="truncate font-mono text-[11px] text-muted-foreground"
          title={article.slug}
        >
          {article.slug}
        </p>
      </div>

      {/* Badge ordre + actif */}
      <div className="flex items-center justify-between gap-1">
        <Badge variant="outline" className="px-1.5 py-0 text-[10px] font-medium tabular-nums">
          #{article.ordre_affichage}
        </Badge>
        <div className="flex items-center gap-1">
          <Switch
            checked={article.actif}
            onCheckedChange={() => onToggle(article)}
            aria-label={`Activer/désactiver ${article.nom}`}
          />
          <span
            className={cn(
              "text-[10px] font-medium",
              article.actif ? "text-secondary" : "text-muted-foreground"
            )}
          >
            {article.actif ? "Actif" : "Inactif"}
          </span>
        </div>
      </div>

      {/* Action Modifier */}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 w-full justify-center gap-1.5 text-xs"
        onClick={() => onEdit(article)}
      >
        <Pencil className="size-3.5" />
        Modifier
      </Button>
    </Card>
  );
}

// ---------------------------------------------------------------
// Sous-composants : états (loading / error / empty)
// ---------------------------------------------------------------

function CatalogueLoadingState() {
  return (
    <div className="space-y-8">
      {/* 3 groupes de skeletons pour simuler l'affichage typique */}
      {Array.from({ length: 3 }).map((_, sectionIdx) => (
        <div key={sectionIdx} className="space-y-3">
          <div className="flex items-center gap-2">
            <Skeleton className="size-7 rounded-md" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-5 w-8 rounded-full" />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {Array.from({ length: 6 }).map((_, cardIdx) => (
              <div
                key={cardIdx}
                className="space-y-2 rounded-xl border p-3"
              >
                <Skeleton className="aspect-square w-full rounded-md" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-2.5 w-2/3" />
                <Skeleton className="h-8 w-full" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function CatalogueErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <Card className="flex flex-col items-center justify-center gap-3 p-12 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-danger/10 text-danger">
        <AlertCircle className="size-7" />
      </span>
      <div>
        <p className="font-semibold text-foreground">
          Impossible de charger le catalogue
        </p>
        <p className="mt-1 text-sm text-muted-foreground">{message}</p>
      </div>
      <Button onClick={onRetry} variant="outline" className="gap-2">
        <RefreshCw className="size-4" />
        Réessayer
      </Button>
    </Card>
  );
}

function CatalogueEmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <EmptyState
      icon={Tags}
      title="Aucun article dans le catalogue"
      description="Ajoutez votre premier article pour démarrer le catalogue global."
      action={
        <Button onClick={onAdd} className="gap-2">
          <Plus className="size-4" />
          Ajouter un article
        </Button>
      }
    />
  );
}
