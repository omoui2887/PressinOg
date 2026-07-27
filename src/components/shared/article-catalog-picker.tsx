/**
 * OgPressing — ArticleCatalogPicker (LOT 15.2)
 * --------------------------------------------
 * Sélecteur visuel d'article du catalogue global, destiné à remplacer le
 * dropdown "Type de vêtement" dans l'Étape 2 du wizard "Nouvelle commande".
 *
 * Fonctionnement :
 *   - Récupère les articles actifs via GET /api/public/catalogue-articles
 *     (tout utilisateur authentifié ; catalogue global non filtré par pressing).
 *   - Barre de recherche instantanée (filtre par nom, en français).
 *   - Onglets horizontaux scrollables : "Tous" + les 9 catégories connues
 *     (CATALOGUE_CATEGORIES) + catégories dynamiques ajoutées par le Super
 *     Admin (non présentes dans la liste statique).
 *   - Grille de cards cliquables : 3 colonnes mobile / 4 sm / 5 md / 6 lg.
 *     Chaque card affiche l'illustration (next/image lazy) + le nom de
 *     l'article. Au clic, appelle `onSelect(article)`.
 *
 * État visuel :
 *   - Loading : skeleton grid (12 cards animées)
 *   - Error   : message + bouton "Réessayer" (retry fetch)
 *   - Empty   : icône Package + "Aucun article trouvé"
 *   - Selected: border-primary + ring-2 ring-primary/20 + check overlay
 *
 * Image fallback :
 *   - Si `next/image` onError (fichier manquant, 404, format invalide),
 *     on bascule en mode `imgError=true` et on affiche l'icône lucide
 *     `Shirt` (gris) à la place, à la même taille que l'image.
 *
 * Deux modes d'usage (le composant ne gère PAS l'état du Dialog) :
 *   - Inline compact : rendu direct dans le DOM (ex : dans un formulaire)
 *   - Dialog mode    : le parent wrap le picker dans un `<Dialog>` et
 *                      contrôle `open`. Le picker appelle juste `onSelect`.
 *
 * 🚀 PERF :
 *   - next/image avec loading="lazy" + sizes="64px" (display size fixe) +
 *     `unoptimized` (icône_url peut être un chemin local `/images/articles/…`
 *     OU une URL Supabase Storage distante ; `unoptimized` évite de devoir
 *     configurer `images.remotePatterns` dans next.config.ts qu'on ne peut
 *     pas modifier hors périmètre).
 *   - `cv-auto` (content-visibility: auto) sur chaque card pour skipper
 *     le rendu hors viewport. Override de `contain-intrinsic-size` via
 *     inline style (1px 110px) car la classe globale `cv-auto` définit
 *     1px 600px qui est trop grand pour des cards de ~110px de haut.
 *   - `useMemo` sur la liste filtrée et la liste des onglets.
 *   - Debounce 150 ms sur la recherche (état `searchInput` immédiat pour
 *     l'Input contrôlé, `searchQuery` debouncé utilisé pour le filtrage).
 *   - Pas d'IntersectionObserver (le picker est interactif, pas une
 *     animation d'apparition).
 *
 * Usage :
 *   <ArticleCatalogPicker
 *     selectedId={currentArticle?.catalogue_article_id ?? null}
 *     onSelect={(article) => {
 *       setFormValue(article);
 *       setDialogOpen(false); // parent ferme son Dialog
 *     }}
 *     compact
 *   />
 *
 * API : voir `ArticleCatalogPickerProps` ci-dessous.
 */
"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import Image from "next/image";
import {
  Check,
  Package,
  RefreshCw,
  Search,
  Shirt,
  X,
  type LucideIcon,
} from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  CATALOGUE_CATEGORIES,
  getIconForCategorie,
  type CatalogueArticle,
} from "@/lib/catalogue/catalogue-articles";

// ============================================================
// Types & constantes locales
// ============================================================

export interface ArticleCatalogPickerProps {
  /** Article actuellement sélectionné (id UUID) — mis en avant dans la grille. */
  selectedId?: string | null;
  /** Callback appelé quand l'utilisateur clique sur une card d'article. */
  onSelect: (article: CatalogueArticle) => void;
  /** Classe additionnelle sur le conteneur racine. */
  className?: string;
  /** Afficher la barre de recherche (défaut : true). */
  showSearch?: boolean;
  /** Afficher les onglets de catégorie (défaut : true). */
  showCategories?: boolean;
  /** Mode compact : masque le texte d'en-tête (défaut : false). */
  compact?: boolean;
}

/** Shape de la réponse API (défensive : on ignore les champs inattendus). */
interface CatalogueApiResponse {
  success: boolean;
  data?: CatalogueArticle[];
  error?: string;
}

/** Valeur spéciale pour l'onglet "Tous" (aucune catégorie n'a ce nom). */
const TAB_TOUS = "Tous";

/** Hauteur intrinsèque estimée d'une card pour content-visibility. */
const CARD_INTRINSIC_HEIGHT = "1px 110px";

/** Délai de debounce pour la recherche (ms). Évite de filtrer 33+ articles
 * à chaque frappe et de relancer le rendu de la grille trop souvent. */
const SEARCH_DEBOUNCE_MS = 150;

// ============================================================
// Sub-composants
// ============================================================

/**
 * Card d'article unique. Gère son propre état d'erreur d'image (fallback
 * vers l'icône lucide `Shirt`). Est un `<button>` pour l'accessibilité
 * clavier et le toucher (zone tactile min 80x80px sur mobile).
 */
function ArticleCard({
  article,
  selected,
  onSelect,
}: {
  article: CatalogueArticle;
  selected: boolean;
  onSelect: (article: CatalogueArticle) => void;
}) {
  const [imgError, setImgError] = useState(false);

  // Override de contain-intrinsic-size (la classe cv-auto globale définit
  // 1px 600px, trop grand pour nos cards de ~110px). Inline style > class.
  const cvStyle: CSSProperties = {
    containIntrinsicSize: CARD_INTRINSIC_HEIGHT,
  };

  return (
    <button
      type="button"
      onClick={() => onSelect(article)}
      aria-pressed={selected}
      aria-label={`Sélectionner l'article ${article.nom}`}
      style={cvStyle}
      className={cn(
        "cv-auto group relative flex min-h-[80px] min-w-[80px] flex-col items-center justify-start gap-1.5 rounded-lg border-2 bg-card p-2 text-center transition-all",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-1",
        "hover:border-primary/60 hover:bg-accent/40 hover:shadow-sm",
        selected
          ? "border-primary ring-2 ring-primary/20"
          : "border-border"
      )}
    >
      {/* Badge de sélection (overlay top-right) */}
      {selected && (
        <span
          className="absolute right-1 top-1 z-10 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm"
          aria-hidden
        >
          <Check className="size-3.5" strokeWidth={3} />
        </span>
      )}

      {/* Illustration (next/image lazy) ou fallback Shirt */}
      <div className="flex size-16 shrink-0 items-center justify-center">
        {!imgError ? (
          <Image
            src={article.icone_url}
            alt={article.nom}
            width={64}
            height={64}
            loading="lazy"
            sizes="64px"
            unoptimized
            onError={() => setImgError(true)}
            className="size-16 object-contain"
          />
        ) : (
          <Shirt
            className="size-12 text-muted-foreground/70"
            strokeWidth={1.5}
            aria-hidden
          />
        )}
      </div>

      {/* Nom de l'article (2 lignes max) */}
      <span
        className={cn(
          "line-clamp-2 w-full text-xs font-medium leading-tight",
          selected ? "text-primary" : "text-foreground"
        )}
      >
        {article.nom}
      </span>
    </button>
  );
}

/**
 * Squelette de chargement : barre de recherche + onglets + grille de 12
 * cards placeholder (animate-pulse via <Skeleton />).
 */
function PickerSkeleton() {
  return (
    <div className="space-y-4" aria-hidden>
      {/* Skeleton recherche */}
      <Skeleton className="h-10 w-full" />
      {/* Skeleton onglets */}
      <div className="flex gap-2 overflow-hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-24 shrink-0 rounded-full" />
        ))}
      </div>
      {/* Skeleton grille */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
        {Array.from({ length: 12 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}

/**
 * État vide (catalogue sans article ou filtre sans résultat). Icône Package
 * + message + hint. `role="status"` + `aria-live="polite"` pour les SR.
 */
function PickerEmptyState({ hint }: { hint: string }) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-12 text-center"
      role="status"
      aria-live="polite"
    >
      <span className="flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Package className="size-7" />
      </span>
      <div>
        <p className="font-medium text-foreground">Aucun article trouvé</p>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">{hint}</p>
      </div>
    </div>
  );
}

/**
 * État d'erreur : message + bouton "Réessayer" qui relance le fetch.
 */
function PickerErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-12 text-center"
      role="alert"
    >
      <span className="flex size-14 items-center justify-center rounded-full bg-danger/10 text-danger">
        <Package className="size-7" />
      </span>
      <div>
        <p className="font-medium text-foreground">
          Impossible de charger le catalogue
        </p>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">{message}</p>
      </div>
      <Button onClick={onRetry} variant="outline" size="sm">
        <RefreshCw className="size-4" />
        Réessayer
      </Button>
    </div>
  );
}

// ============================================================
// Composant principal
// ============================================================

export function ArticleCatalogPicker({
  selectedId,
  onSelect,
  className,
  showSearch = true,
  showCategories = true,
  compact = false,
}: ArticleCatalogPickerProps) {
  const [articles, setArticles] = useState<CatalogueArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // `searchInput` est la valeur immédiate du champ (pour un input réactif).
  // `searchQuery` est la valeur debouncée utilisée pour filtrer la grille.
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>(TAB_TOUS);

  // -------- Debounce recherche (150 ms) --------
  // Met à jour `searchQuery` 150 ms après la dernière frappe. Évite de
  // re-filtrer (et re-rendre toute la grille) à chaque caractère tapé,
  // surtout utile si le catalogue grossit (> 50 articles).
  useEffect(() => {
    const handle = setTimeout(() => {
      setSearchQuery(searchInput);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [searchInput]);

  // -------- Fetch catalogue --------
  const fetchArticles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/public/catalogue-articles", {
        cache: "no-store",
      });
      // Tentative de parse JSON défensif (réponse non-JSON = erreur HTTP)
      const body: CatalogueApiResponse = await res.json().catch(() => ({
        success: false,
        error: `Erreur HTTP ${res.status}`,
      }));
      if (!res.ok || !body.success || !body.data) {
        throw new Error(
          body.error ?? `Erreur lors de la récupération du catalogue (${res.status})`
        );
      }
      setArticles(body.data);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "Erreur lors du chargement du catalogue";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchArticles();
  }, [fetchArticles]);

  // -------- Liste des onglets (Tous + 9 catégories + dynamiques) --------
  const tabs = useMemo<
    Array<{ value: string; label: string; Icon: LucideIcon }>
  >(() => {
    // Onglets connus : "Tous" (icône Package) + les 9 catégories statiques
    const knownTabs: Array<{ value: string; label: string; Icon: LucideIcon }> =
      [
        { value: TAB_TOUS, label: TAB_TOUS, Icon: Package },
        ...CATALOGUE_CATEGORIES.map((c) => ({
          value: c.nom,
          label: c.nom,
          Icon: c.icon,
        })),
      ];

    // Catégories dynamiques : présentes dans les articles MAIS absentes de
    // CATALOGUE_CATEGORIES (ajoutées par le Super Admin via /super-admin/catalogue).
    const knownSet = new Set(CATALOGUE_CATEGORIES.map((c) => c.nom));
    const dynamicCats = Array.from(
      new Set(
        articles
          .map((a) => a.categorie)
          .filter((c) => !knownSet.has(c))
      )
    );
    const dynamicTabs: Array<{
      value: string;
      label: string;
      Icon: LucideIcon;
    }> = dynamicCats.map((cat) => ({
      value: cat,
      label: cat,
      Icon: getIconForCategorie(cat),
    }));

    return [...knownTabs, ...dynamicTabs];
  }, [articles]);

  // -------- Liste filtrée (par catégorie + recherche) --------
  const filteredArticles = useMemo(() => {
    let list = articles;
    if (activeCategory !== TAB_TOUS) {
      list = list.filter((a) => a.categorie === activeCategory);
    }
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((a) => a.nom.toLowerCase().includes(q));
    }
    return list;
  }, [articles, searchQuery, activeCategory]);

  // ============================================================
  // Render
  // ============================================================

  // 1. Loading
  if (loading) {
    return (
      <div className={cn("w-full", className)} role="status" aria-live="polite">
        <span className="sr-only">Chargement du catalogue d'articles…</span>
        <PickerSkeleton />
      </div>
    );
  }

  // 2. Error
  if (error) {
    return (
      <PickerErrorState
        message={error}
        onRetry={() => void fetchArticles()}
      />
    );
  }

  // 3. Ready (articles chargés, éventuellement filtrés)
  const emptyHint =
    searchQuery || activeCategory !== TAB_TOUS
      ? "Modifiez votre recherche ou changez de catégorie."
      : "Le catalogue est vide pour le moment. Réessayez plus tard.";

  return (
    <div className={cn("flex w-full flex-col gap-3", className)}>
      {/* En-tête (masqué en mode compact) */}
      {!compact && (
        <p className="text-sm font-medium text-muted-foreground">
          Sélectionnez un article du catalogue
        </p>
      )}

      {/* Barre de recherche */}
      {showSearch && (
        <div className="relative w-full">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Rechercher un article…"
            className="h-10 pl-9 pr-9"
            aria-label="Rechercher un article du catalogue"
          />
          {searchInput && (
            <button
              type="button"
              onClick={() => {
                setSearchInput("");
                setSearchQuery(""); // reset immédiat (pas besoin d'attendre le debounce)
              }}
              aria-label="Effacer la recherche"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      )}

      {/* Onglets de catégorie (scrollables horizontalement) */}
      {showCategories && tabs.length > 1 && (
        <div
          className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
          role="tablist"
          aria-label="Filtrer par catégorie d'article"
        >
          {tabs.map((tab) => {
            const isActive = activeCategory === tab.value;
            const Icon = tab.Icon;
            return (
              <button
                key={tab.value}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveCategory(tab.value)}
                className={cn(
                  "inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-sm font-medium transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                  isActive
                    ? "border-primary bg-primary text-primary-foreground shadow-sm"
                    : "border-border bg-card text-foreground hover:border-primary/40 hover:bg-accent"
                )}
              >
                <Icon className="size-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Grille de cards ou état vide */}
      {filteredArticles.length === 0 ? (
        <PickerEmptyState hint={emptyHint} />
      ) : (
        <div
          className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6"
          role="listbox"
          aria-label="Articles du catalogue"
        >
          {filteredArticles.map((article) => (
            <ArticleCard
              key={article.id}
              article={article}
              selected={selectedId ? article.id === selectedId : false}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default ArticleCatalogPicker;
