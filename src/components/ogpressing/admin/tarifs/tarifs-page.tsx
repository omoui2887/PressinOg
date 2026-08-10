/**
 * OgPressing — Page "Tarifs par article" (LOT 16) — task 4
 * --------------------------------------------------------
 * Page /admin/tarifs : permet au manager de fixer un prix (FCFA) pour
 * chaque article du catalogue × chaque type de prestation (6 services).
 *
 * Architecture :
 *   - TarifsPage (client, this file)  : orchestre fetch + state + handlers
 *   - <ArticleCard/> (inline)         : carte d'un article avec ses 6 inputs
 *   - <CategorySection/> (inline)     : section regroupée par catégorie
 *   - <CategoryTab/> + <StatCard/>    : petits composants de présentation
 *
 * Flux de données :
 *   GET /api/public/catalogue-articles → 33 articles actifs (commun à tous)
 *   GET /api/admin/tarifs-articles?all=true → tarifs du pressing connecté
 *   POST /api/admin/tarifs-articles → upsert (article + service → prix)
 *   DELETE /api/admin/tarifs-articles/[id] → supprime un tarif
 *
 * Sécurité :
 *   - RLS isole les tarifs par pressing (côté API + DB).
 *   - Seul un manager actif peut écrire (POST/PATCH/DELETE).
 *   - Lecture (GET) ouverte à tout personnel actif.
 *
 * Référence UI : src/components/ogpressing/admin/services/services-page.tsx
 * (même header, mêmes conventions de couleurs bg-card / border / text-primary).
 */
"use client";

import { createElement, useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import {
  ReceiptText,
  Shirt,
  Package,
  CheckCircle2,
  Minus,
  Trash2,
  Save,
  Loader2,
  AlertTriangle,
  LayoutGrid,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { cn } from "@/lib/utils";
import {
  CATALOGUE_CATEGORIES,
  getIconForCategorie,
  type CatalogueArticle,
} from "@/lib/catalogue/catalogue-articles";
import {
  TYPES_SERVICES,
  formatFCFA,
  parseFCFA,
  type TarifArticle,
  type TarifsByArticle,
  type TypeService,
} from "./tarifs-helpers";

/** Valeur spéciale pour l'onglet "Tous" (pas une catégorie réelle). */
const TAB_TOUS = "__tous__";

// ============================================================
// Composant principal
// ============================================================

export function TarifsPage() {
  const [articles, setArticles] = useState<CatalogueArticle[]>([]);
  const [tarifs, setTarifs] = useState<TarifArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategorie, setActiveCategorie] = useState<string>(TAB_TOUS);

  // -------- Fetch initial : catalogue + tarifs en parallèle --------
  // En arrière-plan, synchronise les services avec les tarifs existants
  // (auto-crée les services manquants pour les tarifs configurés avant
  // l'auto-provisionnement). Non-bloquant, silencieux en cas de succès.
  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      // Sync des services en parallèle du fetch (best-effort, non-bloquant).
      fetch("/api/admin/tarifs-articles/sync-services", {
        method: "POST",
      }).catch(() => {
        /* silencieux : la sync est un best-effort */
      });

      const [catRes, tarifRes] = await Promise.all([
        fetch("/api/public/catalogue-articles", { cache: "no-store" }),
        fetch("/api/admin/tarifs-articles?all=true", { cache: "no-store" }),
      ]);
      const catData = await catRes.json();
      const tarifData = await tarifRes.json();
      const newArticles: CatalogueArticle[] =
        catData?.success && Array.isArray(catData.data) ? catData.data : [];
      const newTarifs: TarifArticle[] =
        tarifData?.success && Array.isArray(tarifData.data) ? tarifData.data : [];
      // On ne garde que les articles actifs, triés par ordre_affichage.
      const actifs = newArticles
        .filter((a) => a.actif)
        .sort(
          (a, b) => (a.ordre_affichage ?? 0) - (b.ordre_affichage ?? 0)
        );
      setArticles(actifs);
      setTarifs(newTarifs);
    } catch {
      setArticles([]);
      setTarifs([]);
      toast.error("Erreur de chargement", {
        description:
          "Impossible de récupérer le catalogue et les tarifs. Réessayez ultérieurement.",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // -------- Map d'accès rapide : articleId → serviceType → TarifArticle --------
  const tarifMap = useMemo<TarifsByArticle>(() => {
    const map: TarifsByArticle = {};
    for (const t of tarifs) {
      if (!map[t.catalogue_article_id]) {
        map[t.catalogue_article_id] = {};
      }
      map[t.catalogue_article_id][t.type_service] = t;
    }
    return map;
  }, [tarifs]);

  // -------- Stats : total / avec tarif / sans tarif --------
  const stats = useMemo(() => {
    const total = articles.length;
    const avecTarif = articles.filter((a) => {
      const m = tarifMap[a.id];
      return m && Object.keys(m).length > 0;
    }).length;
    return {
      total,
      avecTarif,
      sansTarif: Math.max(0, total - avecTarif),
    };
  }, [articles, tarifMap]);

  // -------- Groupes par catégorie (ordre CATALOGUE_CATEGORIES + "Autres") --------
  const grouped = useMemo(() => {
    const groups = CATALOGUE_CATEGORIES.map((c) => ({
      categorie: c.nom,
      icon: c.icon,
      articles: articles.filter((a) => a.categorie === c.nom),
    })).filter((g) => g.articles.length > 0);

    // Articles dont la catégorie n'est pas dans la liste initiale (catégorie
    // personnalisée ajoutée par le Super Admin).
    const knownCats = new Set(CATALOGUE_CATEGORIES.map((c) => c.nom));
    const orphelins = articles.filter((a) => !knownCats.has(a.categorie));
    if (orphelins.length > 0) {
      groups.push({
        categorie: "Autres",
        icon: Package,
        articles: orphelins,
      });
    }
    return groups;
  }, [articles]);

  const visibleGroups =
    activeCategorie === TAB_TOUS
      ? grouped
      : grouped.filter((g) => g.categorie === activeCategorie);

  // -------- Handler : sauvegarder un tarif (upsert) --------
  const handleSave = useCallback(
    async (
      article: CatalogueArticle,
      service: TypeService,
      prix: number
    ): Promise<boolean> => {
      if (Number.isNaN(prix) || prix < 0) {
        toast.error("Prix invalide", {
          description: "Entrez un montant entier positif (FCFA).",
        });
        return false;
      }
      try {
        const res = await fetch("/api/admin/tarifs-articles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            catalogue_article_id: article.id,
            type_service: service,
            prix,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || "Échec de la sauvegarde");
        }
        const saved = data.data as TarifArticle;
        // Met à jour le tableau des tarifs (remplace l'existante ou ajoute)
        setTarifs((prev) => {
          const idx = prev.findIndex(
            (t) =>
              t.catalogue_article_id === article.id &&
              t.type_service === service
          );
          if (idx >= 0) {
            const copy = [...prev];
            copy[idx] = saved;
            return copy;
          }
          return [...prev, saved];
        });
        toast.success("Tarif enregistré", {
          description: `${article.nom} · ${TYPES_SERVICES.find((t) => t.value === service)?.label} → ${formatFCFA(prix)}`,
        });
        return true;
      } catch (err) {
        toast.error("Échec de la sauvegarde", {
          description: err instanceof Error ? err.message : "Erreur inconnue",
        });
        return false;
      }
    },
    []
  );

  // -------- Handler : supprimer un tarif (optimistic + rollback) --------
  const handleDelete = useCallback(
    async (
      tarifId: string,
      articleNom: string,
      service: TypeService
    ): Promise<boolean> => {
      // Snapshot pour rollback
      const previous = tarifs;
      // Optimistic : retire immédiatement le tarif
      setTarifs((prev) => prev.filter((t) => t.id !== tarifId));
      try {
        const res = await fetch(`/api/admin/tarifs-articles/${tarifId}`, {
          method: "DELETE",
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || "Échec de la suppression");
        }
        toast.success("Tarif supprimé", {
          description: `${articleNom} · ${TYPES_SERVICES.find((t) => t.value === service)?.label} — le prix générique du service s'appliquera.`,
        });
        return true;
      } catch (err) {
        // Rollback
        setTarifs(previous);
        toast.error("Échec de la suppression", {
          description: err instanceof Error ? err.message : "Erreur inconnue",
        });
        return false;
      }
    },
    [tarifs]
  );

  // ============================================================
  // Rendu
  // ============================================================

  return (
    <div className="space-y-6">
      {/* ---------- En-tête ---------- */}
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
          <ReceiptText className="size-6 text-primary" aria-hidden />
          Tarifs par article
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Définissez le prix de chaque article selon le type de prestation.
          Seul le manager peut modifier ces tarifs. Les articles sans tarif
          spécifique utilisent le prix générique du service.
        </p>
      </header>

      {/* ---------- Stats ---------- */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
        <StatCard
          label="Articles du catalogue"
          value={loading ? null : stats.total}
          icon={Package}
          tone="default"
        />
        <StatCard
          label="Articles avec tarif"
          value={loading ? null : stats.avecTarif}
          icon={CheckCircle2}
          tone="success"
        />
        <StatCard
          label="Articles sans tarif"
          value={loading ? null : stats.sansTarif}
          icon={Minus}
          tone="muted"
        />
      </div>

      {/* ---------- Bannière d'avertissement si aucun tarif ---------- */}
      {!loading && tarifs.length === 0 && articles.length > 0 && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/5 p-4"
        >
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
          <div className="min-w-0">
            <p className="font-medium text-foreground">
              Aucun tarif spécifique configuré.
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Les prix génériques des services seront utilisés pour le calcul
              des commandes. Configurez au moins un tarif par article pour
              affiner votre grille tarifaire.
            </p>
          </div>
        </div>
      )}

      {/* ---------- Onglets de filtre par catégorie ---------- */}
      {!loading && articles.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <CategoryTab
            active={activeCategorie === TAB_TOUS}
            onClick={() => setActiveCategorie(TAB_TOUS)}
            icon={LayoutGrid}
            label="Tous"
            count={articles.length}
          />
          {CATALOGUE_CATEGORIES.map((c) => {
            const count = articles.filter(
              (a) => a.categorie === c.nom
            ).length;
            if (count === 0) return null;
            return (
              <CategoryTab
                key={c.nom}
                active={activeCategorie === c.nom}
                onClick={() => setActiveCategorie(c.nom)}
                icon={c.icon}
                label={c.nom}
                count={count}
              />
            );
          })}
        </div>
      )}

      {/* ---------- États : loading / empty / contenu ---------- */}
      {loading ? (
        <div className="space-y-6">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="space-y-3">
              <Skeleton className="h-6 w-48" />
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 3 }).map((_, j) => (
                  <Skeleton key={j} className="h-64 w-full rounded-lg" />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : articles.length === 0 ? (
        <EmptyState
          icon={Package}
          title="Catalogue vide"
          description="Aucun article actif dans le catalogue global. Le Super Admin doit ajouter des articles avant de pouvoir configurer des tarifs."
        />
      ) : (
        <div className="space-y-8">
          {visibleGroups.map((group) => {
            const GroupIcon = group.icon;
            const groupCount = group.articles.length;
            // Compte d'articles du groupe qui ont au moins un tarif
            const groupAvecTarif = group.articles.filter((a) => {
              const m = tarifMap[a.id];
              return m && Object.keys(m).length > 0;
            }).length;
            return (
              <section key={group.categorie} className="space-y-3">
                {/* En-tête du groupe */}
                <div className="flex items-center gap-2">
                  <span
                    className="flex size-7 items-center justify-center rounded-md bg-muted"
                    aria-hidden
                  >
                    <GroupIcon className="size-4 text-muted-foreground" />
                  </span>
                  <h2 className="text-base font-semibold text-foreground">
                    {group.categorie}
                  </h2>
                  <Badge variant="outline" className="font-medium">
                    {groupAvecTarif}/{groupCount}
                  </Badge>
                </div>

                {/* Grille de cartes d'articles */}
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {group.articles.map((article) => (
                    <ArticleCard
                      key={article.id}
                      article={article}
                      tarifsByService={tarifMap[article.id] ?? {}}
                      onSave={handleSave}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
              </section>
            );
          })}

          {visibleGroups.length === 0 && (
            <EmptyState
              icon={Package}
              title="Aucun article dans cette catégorie"
              description="Sélectionnez une autre catégorie ou l'onglet « Tous »."
            />
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Sous-composant : StatCard
// ============================================================

interface StatCardProps {
  label: string;
  value: number | null;
  icon: LucideIcon;
  tone: "default" | "success" | "muted";
}

function StatCard({ label, value, icon: Icon, tone }: StatCardProps) {
  const iconBg =
    tone === "success"
      ? "bg-success/10 text-success"
      : tone === "muted"
        ? "bg-muted text-muted-foreground"
        : "bg-primary/10 text-primary";
  return (
    <Card className="flex items-center gap-3 p-4">
      <span
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-md",
          iconBg
        )}
        aria-hidden
      >
        <Icon className="size-5" />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        {/* 
          Block element (<Skeleton> = <div>) cannot be nested inside <p>;
          using a <div> here avoids the hydration mismatch warning.
        */}
        <div className="mt-0.5 text-2xl font-bold tabular-nums text-foreground">
          {value === null ? (
            <Skeleton className="h-7 w-10" />
          ) : (
            value
          )}
        </div>
      </div>
    </Card>
  );
}

// ============================================================
// Sous-composant : CategoryTab (bouton de filtre)
// ============================================================

interface CategoryTabProps {
  active: boolean;
  onClick: () => void;
  icon: LucideIcon;
  label: string;
  count: number;
}

function CategoryTab({ active, onClick, icon: Icon, label, count }: CategoryTabProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
      )}
    >
      <Icon className="size-4" aria-hidden />
      <span className="truncate">{label}</span>
      <span
        className={cn(
          "rounded-full px-1.5 py-0.5 text-xs font-semibold tabular-nums",
          active
            ? "bg-primary-foreground/20 text-primary-foreground"
            : "bg-muted text-muted-foreground"
        )}
      >
        {count}
      </span>
    </button>
  );
}

// ============================================================
// Sous-composant : ArticleCard (carte d'un article avec 6 inputs)
// ============================================================

interface ArticleCardProps {
  article: CatalogueArticle;
  tarifsByService: Partial<Record<TypeService, TarifArticle>>;
  onSave: (
    article: CatalogueArticle,
    service: TypeService,
    prix: number
  ) => Promise<boolean>;
  onDelete: (
    tarifId: string,
    articleNom: string,
    service: TypeService
  ) => Promise<boolean>;
}

/**
 * Badge affichant la catégorie d'un article avec son icône Lucide.
 *
 * On utilise `createElement` plutôt que `<Icon />` car la règle ESLint
 * `react-hooks/static-components` interdit d'assigner une icône Lucide à
 * une variable capitalisée dans le corps d'un composant (faux positif —
 * l'icône est une référence stable, pas un composant créé à la volée).
 * `createElement(getIconForCategorie(...), props)` est équivalent à
 * `<Icon {...props} />` sans déclencher la règle.
 */
function CategorieBadge({ categorie }: { categorie: string }) {
  return (
    <Badge
      variant="outline"
      className="mt-1.5 inline-flex items-center gap-1 font-medium text-muted-foreground"
    >
      {createElement(getIconForCategorie(categorie), {
        className: "size-3",
        "aria-hidden": true,
      })}
      {categorie}
    </Badge>
  );
}

function ArticleCard({
  article,
  tarifsByService,
  onSave,
  onDelete,
}: ArticleCardProps) {
  // État local des 6 inputs (string pour permettre la saisie libre).
  // Initialisé une seule fois à partir des tarifs existants ; ensuite
  // l'input est la source de vérité (le serveur confirme via props mais
  // on n'écrase pas la saisie en cours).
  const [inputs, setInputs] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const t of TYPES_SERVICES) {
      const tarif = tarifsByService[t.value];
      init[t.value] = tarif ? String(tarif.prix) : "";
    }
    return init;
  });

  // Per-input "saving" + "deleting" flags pour afficher les spinners.
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [deleting, setDeleting] = useState<Record<string, boolean>>({});

  /** Indique si l'input a une valeur différente du tarif serveur. */
  function isDirty(service: TypeService): boolean {
    const tarif = tarifsByService[service];
    const current = parseFCFA(inputs[service] ?? "");
    if (!tarif) {
      // Pas de tarif serveur → dirty si l'utilisateur a saisi quelque chose
      return inputs[service]?.trim() !== "" && current > 0;
    }
    return tarif.prix !== current;
  }

  /** Sauvegarde un tarif (déclenché par bouton ou par blur si dirty). */
  async function handleSave(service: TypeService) {
    if (!isDirty(service)) return;
    const prix = parseFCFA(inputs[service] ?? "");
    if (prix <= 0) {
      toast.error("Prix invalide", {
        description: "Entrez un montant supérieur à 0 FCFA.",
      });
      return;
    }
    setSaving((p) => ({ ...p, [service]: true }));
    await onSave(article, service, prix);
    setSaving((p) => ({ ...p, [service]: false }));
  }

  /** Supprime un tarif (puis clear l'input local si succès). */
  async function handleDelete(service: TypeService) {
    const tarif = tarifsByService[service];
    if (!tarif) return;
    setDeleting((p) => ({ ...p, [service]: true }));
    const ok = await onDelete(tarif.id, article.nom, service);
    setDeleting((p) => ({ ...p, [service]: false }));
    if (ok) {
      setInputs((prev) => ({ ...prev, [service]: "" }));
    }
  }

  return (
    <Card className="flex flex-col gap-3 p-4">
      {/* -------- En-tête : illustration + nom + badge catégorie -------- */}
      <div className="flex items-start gap-3">
        <span className="flex size-16 shrink-0 items-center justify-center rounded-md bg-muted/40 p-1.5">
          <ArticleIllustration
            src={article.icone_url}
            alt={article.nom}
            className="size-full object-contain"
          />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold leading-tight text-foreground">
            {article.nom}
          </h3>
          <CategorieBadge categorie={article.categorie} />
        </div>
      </div>

      {/* -------- Liste des 6 services avec inputs prix -------- */}
      <div className="space-y-2 border-t pt-3">
        {TYPES_SERVICES.map((t) => {
          const tarif = tarifsByService[t.value];
          const Icon = t.icon;
          const isSet = !!tarif;
          const dirty = isDirty(t.value);
          const isSaving = saving[t.value];
          const isDeleting = deleting[t.value];
          const inputId = `tarif-${article.id}-${t.value}`;
          return (
            <div
              key={t.value}
              className="flex flex-wrap items-center gap-2 sm:flex-nowrap"
            >
              {/* Label du service */}
              <label
                htmlFor={inputId}
                className="flex w-full items-center gap-2 sm:w-32 sm:shrink-0"
              >
                <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="truncate text-sm text-foreground">
                  {t.label}
                </span>
              </label>

              {/* Input prix + suffixe FCFA */}
              <div className="relative flex-1 sm:max-w-[140px]">
                <Input
                  id={inputId}
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={inputs[t.value] ?? ""}
                  onChange={(e) =>
                    setInputs((prev) => ({ ...prev, [t.value]: e.target.value }))
                  }
                  onBlur={() => handleSave(t.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.currentTarget.blur();
                    }
                  }}
                  placeholder="—"
                  aria-label={`Prix ${t.label} pour ${article.nom}, en FCFA`}
                  disabled={isSaving || isDeleting}
                  className={cn(
                    "h-8 pr-12 text-right tabular-nums",
                    dirty && "border-warning ring-1 ring-warning/40"
                  )}
                />
                <span
                  className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[11px] font-medium text-muted-foreground"
                  aria-hidden
                >
                  FCFA
                </span>
              </div>

              {/* Indicateur d'état + actions */}
              <div className="flex items-center gap-1">
                {/* Spinner si save/delete en cours */}
                {isSaving || isDeleting ? (
                  <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />
                ) : isSet && !dirty ? (
                  <CheckCircle2
                    className="size-4 text-success"
                    aria-label="Tarif configuré"
                  />
                ) : !isSet && !dirty ? (
                  <Minus
                    className="size-4 text-muted-foreground"
                    aria-label="Pas de tarif spécifique — prix générique applicable"
                  />
                ) : dirty ? (
                  // Bouton "Enregistrer" visible seulement quand l'input est sale
                  <Button
                    type="button"
                    size="icon"
                    variant="default"
                    className="size-8 shrink-0"
                    onClick={() => handleSave(t.value)}
                    // Empêche le blur de l'input avant le clic (sinon le blur
                    // sauve déjà et le bouton disparaît avant le click).
                    onMouseDown={(e) => e.preventDefault()}
                    disabled={isSaving}
                    aria-label={`Enregistrer le prix ${t.label} pour ${article.nom}`}
                  >
                    <Save className="size-4" />
                  </Button>
                ) : null}

                {/* Bouton suppression (si un tarif existe) */}
                {isSet && (
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => handleDelete(t.value)}
                    onMouseDown={(e) => e.preventDefault()}
                    disabled={isDeleting}
                    aria-label={`Supprimer le tarif ${t.label} pour ${article.nom}`}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ============================================================
// Sous-composant : ArticleIllustration
// ============================================================

/**
 * Affiche l'illustration PNG d'un article du catalogue. Si l'URL est vide
 * ou si l'image ne charge pas (asset manquant), on retombe sur l'icône
 * lucide "Shirt" pour éviter une image cassée.
 *
 * Reprend le pattern du composant `ArticleIcon` de commande-pos.tsx
 * (LOT 7) pour rester visuellement cohérent.
 */
function ArticleIllustration({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const [errored, setErrored] = useState(false);
  if (errored || !src) {
    return (
      <Shirt
        className={cn("text-muted-foreground", className)}
        aria-hidden
      />
    );
  }
  return (
    <Image
      src={src}
      alt={alt}
      width={64}
      height={64}
      loading="lazy"
      sizes="64px"
      unoptimized
      onError={() => setErrored(true)}
      className={className}
    />
  );
}
