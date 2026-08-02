/**
 * Étape 2 — Enregistrement des articles (LOT 7.3)
 * ------------------------------------------------
 * Composant client complet pour la 2nde étape du wizard Nouvelle
 * Commande. Fonctionnalités :
 *
 *   1. Formulaire d'ajout d'article (mobile-first, 2 colonnes en sm+) :
 *      - Type de vêtement (Select enum DB)
 *      - Couleur (Select enum DB) + champ libre `couleur_libre` si "autre"
 *      - État (Select enum DB) avec icône dans l'option + badge preview
 *      - Réserves / détérioration (Textarea optionnel) — protège le pressing
 *      - Service appliqué (Select chargé depuis `GET /api/admin/services`,
 *        options au format "{nom} — {formatFCFA(prix)}")
 *      - Quantité avec boutons +/- (large touch targets, min 1)
 *      - Prix unitaire (read-only) + sous-total (read-only, calcul live)
 *      - Bouton "Ajouter l'article" / "Modifier l'article" (mode édition)
 *
 *   2. Liste des articles ajoutés (compact cards) :
 *      - Libellé "{Type} {Couleur}" + pastille couleur
 *      - Badge état coloré (success / info / warning / danger)
 *      - Service + quantité + sous-total
 *      - Notes (réserves) si présentes
 *      - Bouton éditer (pencil) → recharge l'article dans le formulaire
 *      - Bouton supprimer (trash) → dispatch REMOVE_ARTICLE
 *
 *   3. Total en bas de liste (bold, formatFCFA), mis à jour en temps réel.
 *
 * Ergonomie : cible < 2 minutes par commande. Défauts pré-sélectionnés
 * pour la saisie la plus rapide : type=chemise, couleur=blanc, état=bon.
 * Le service_id + type_vetement sont conservés après ajout pour permettre
 * une saisie rapide d'articles similaires successifs.
 *
 * ⚠️ L'état du formulaire est LOCAL au composant (pas dans le reducer
 * wizard) : seuls les articles validés sont dispatchés au reducer.
 */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  Minus,
  Package,
  Pencil,
  Plus,
  Shirt,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StatusBadge } from "@/components/shared/status-badge";
import { ArticleCatalogPicker } from "@/components/shared/article-catalog-picker";
import { formatFCFA } from "@/lib/utils/format";
import type {
  CouleurVetement,
  EtatVetement,
} from "@/lib/types/database.types";
import type { CatalogueArticle } from "@/lib/catalogue/catalogue-articles";

import {
  COULEUR_LABELS,
  COULEUR_SWATCH,
  ETAT_ICONS,
  ETAT_LABELS,
  ETAT_VARIANT,
} from "./article-labels";
import { typeServiceIcon } from "@/components/ogpressing/admin/services/services-helpers";
import type { ArticleInfo, StepProps } from "./state";

// ============================================================
// Types locaux
// ============================================================

/** Service renvoyé par `GET /api/admin/services` (services actifs). */
interface ServiceItem {
  id: string;
  type: string;
  nom: string;
  prix: number;
  duree_estimee: string | null;
  actif: boolean;
}

/** Article du catalogue sélectionné dans le picker (snapshot local). */
interface SelectedCatalogueArticle {
  id: string;
  slug: string;
  nom: string;
  icone_url: string;
}

/** État local du formulaire d'ajout / édition d'article. */
interface ArticleFormState {
  /** Article du catalogue sélectionné (LOT 15). Null tant que non choisi. */
  catalogue_article: SelectedCatalogueArticle | null;
  couleur: CouleurVetement;
  couleur_libre: string;
  etat: EtatVetement;
  description_etat: string;
  service_id: string;
  quantite: number;
}

// ============================================================
// Constantes dérivées des labels
// ============================================================

const COULEUR_VALUES = Object.keys(COULEUR_LABELS) as CouleurVetement[];
const ETAT_VALUES = Object.keys(ETAT_LABELS) as EtatVetement[];

// ============================================================
// Sous-composants
// ============================================================

/**
 * Petite pastille ronde représentant la couleur — affichée dans la
 * liste des articles et optionnellement à côté du Select couleur.
 */
function CouleurSwatch({
  couleur,
  className,
}: {
  couleur: CouleurVetement;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={`inline-block size-3 shrink-0 rounded-full ${COULEUR_SWATCH[couleur]} ${className ?? ""}`}
    />
  );
}

/**
 * Génère un libellé lisible "Nom du catalogue Couleur" pour un article.
 * Si la couleur est "autre" et que `couleur_libre` est renseigné, on
 * affiche le texte libre à la place du label "Autre".
 */
function articleLabel(a: ArticleInfo): string {
  const couleurTxt =
    a.couleur === "autre" && a.couleur_libre
      ? a.couleur_libre
      : COULEUR_LABELS[a.couleur];
  return `${a.catalogue_article_nom} ${couleurTxt}`;
}

/**
 * Affiche l'illustration d'un article du catalogue avec un fallback
 * sur l'icône lucide `Shirt` si l'image ne charge pas. Utilisé dans
 * le formulaire (carte de sélection) et dans la liste des articles.
 */
function ArticleIcon({
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
    return <Shirt className={`text-muted-foreground ${className ?? ""}`} aria-hidden />;
  }
  return (
    <Image
      src={src}
      alt={alt}
      width={48}
      height={48}
      loading="lazy"
      sizes="48px"
      unoptimized
      onError={() => setErrored(true)}
      className={className}
    />
  );
}

/**
 * Génère un id local unique pour un nouvel article. Utilise
 * `crypto.randomUUID()` quand disponible (navigateurs modernes +
 * Node 19+), avec un fallback déterministe pour les runtimes sans
 * support.
 */
function genArticleId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `art-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// ============================================================
// Composant principal
// ============================================================

export function StepArticles({ state, dispatch }: StepProps) {
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [servicesLoading, setServicesLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  // Dialog de sélection visuelle de l'article du catalogue (LOT 15.2).
  const [pickerOpen, setPickerOpen] = useState(false);

  // Défauts pré-sélectionnés pour saisie rapide (blanc / bon = cas le
  // plus fréquent en pressing). L'article du catalogue est laissé null
  // tant que l'utilisateur ne l'a pas choisi via le picker visuel.
  const [form, setForm] = useState<ArticleFormState>({
    catalogue_article: null,
    couleur: "blanc",
    couleur_libre: "",
    etat: "bon",
    description_etat: "",
    service_id: "",
    quantite: 1,
  });

  // Référence au bloc formulaire pour scroller lors de l'édition.
  const formRef = useRef<HTMLDivElement>(null);

  // --- Chargement initial des services (montage) ---
  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/services", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data?.success && Array.isArray(data.data)) {
          setServices(data.data as ServiceItem[]);
          // Pré-sélectionne le premier service actif pour faciliter
          // la saisie (l'utilisateur peut changer ensuite).
          if (data.data.length > 0) {
            setForm((f) => ({ ...f, service_id: data.data[0].id }));
          }
        } else {
          toast.error("Impossible de charger les services");
        }
      })
      .catch(() => {
        if (!cancelled) toast.error("Impossible de charger les services");
      })
      .finally(() => {
        if (!cancelled) setServicesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // --- Service sélectionné + sous-total du formulaire ---
  const selectedService = useMemo(
    () => services.find((s) => s.id === form.service_id) ?? null,
    [services, form.service_id]
  );

  const formSousTotal = selectedService
    ? selectedService.prix * form.quantite
    : 0;

  // --- Total de tous les articles validés ---
  const totalArticles = useMemo(
    () =>
      state.articles.reduce(
        (sum, a) => sum + a.prix_unitaire * a.quantite,
        0
      ),
    [state.articles]
  );

  const nombrePieces = useMemo(
    () => state.articles.reduce((sum, a) => sum + a.quantite, 0),
    [state.articles]
  );

  // --- Handlers ---
  function handleAddOrUpdate() {
    const svc = services.find((s) => s.id === form.service_id);
    if (!svc) {
      toast.error("Sélectionnez un service");
      return;
    }
    if (!form.catalogue_article) {
      toast.error("Sélectionnez un article du catalogue");
      setPickerOpen(true);
      return;
    }
    if (form.couleur === "autre" && !form.couleur_libre.trim()) {
      toast.error("Précisez la couleur (champ « Autre »)");
      return;
    }
    const article: ArticleInfo = {
      id: editingId ?? genArticleId(),
      service_id: svc.id,
      service_nom: svc.nom,
      catalogue_article_id: form.catalogue_article.id,
      catalogue_article_nom: form.catalogue_article.nom,
      catalogue_article_slug: form.catalogue_article.slug,
      catalogue_article_icone_url: form.catalogue_article.icone_url,
      couleur: form.couleur,
      couleur_libre:
        form.couleur === "autre" ? form.couleur_libre.trim() : undefined,
      etat: form.etat,
      description_etat: form.description_etat.trim() || undefined,
      prix_unitaire: svc.prix,
      quantite: form.quantite,
    };
    if (editingId) {
      dispatch({ type: "EDIT_ARTICLE", id: editingId, article });
      toast.success("Article modifié");
    } else {
      dispatch({ type: "ADD_ARTICLE", article });
      toast.success("Article ajouté");
    }
    // Reset du formulaire en conservant service_id + catalogue_article
    // pour permettre une saisie rapide d'articles similaires successifs.
    setForm((f) => ({
      ...f,
      couleur: "blanc",
      couleur_libre: "",
      etat: "bon",
      description_etat: "",
      quantite: 1,
    }));
    setEditingId(null);
  }

  function handleEdit(article: ArticleInfo) {
    setForm({
      catalogue_article: {
        id: article.catalogue_article_id,
        slug: article.catalogue_article_slug,
        nom: article.catalogue_article_nom,
        icone_url: article.catalogue_article_icone_url,
      },
      couleur: article.couleur,
      couleur_libre: article.couleur_libre ?? "",
      etat: article.etat,
      description_etat: article.description_etat ?? "",
      service_id: article.service_id,
      quantite: article.quantite,
    });
    setEditingId(article.id);
    // Scroll au formulaire pour faciliter l'édition mobile.
    formRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  function handleCancelEdit() {
    setEditingId(null);
    setForm((f) => ({
      ...f,
      catalogue_article: null,
      couleur: "blanc",
      couleur_libre: "",
      etat: "bon",
      description_etat: "",
      quantite: 1,
    }));
  }

  function handleRemove(id: string) {
    // Si l'article supprimé était en cours d'édition, on annule l'édition.
    if (editingId === id) handleCancelEdit();
    dispatch({ type: "REMOVE_ARTICLE", id });
    toast.success("Article supprimé");
  }

  // Sélection d'un article via le picker visuel (LOT 15.2).
  // Met à jour le form.catalogue_article avec le snapshot (id, slug,
  // nom, icone_url) puis ferme le Dialog.
  function handleSelectCatalogueArticle(article: CatalogueArticle) {
    setForm((f) => ({
      ...f,
      catalogue_article: {
        id: article.id,
        slug: article.slug,
        nom: article.nom,
        icone_url: article.icone_url,
      },
    }));
    setPickerOpen(false);
  }

  // --- Conditions d'activation du bouton Ajouter/Modifier ---
  const canSubmit =
    Boolean(selectedService) &&
    Boolean(form.catalogue_article) &&
    form.quantite >= 1;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-foreground">
          Enregistrement des articles
        </h2>
        <p className="text-sm text-muted-foreground">
          Ajoutez les articles à nettoyer, leur couleur, état et service
          associé. Cible : moins de 2 minutes par commande.
        </p>
      </div>

      {/* ====================================================== */}
      {/* FORMULAIRE D'AJOUT / ÉDITION                            */}
      {/* ====================================================== */}
      <div
        ref={formRef}
        className="space-y-4 rounded-lg border bg-card p-4"
      >
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-foreground">
            {editingId ? "Modifier l'article" : "Nouvel article"}
          </h3>
          {editingId && (
            <Button variant="ghost" size="sm" onClick={handleCancelEdit}>
              <X className="size-4" />
              Annuler
            </Button>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {/* --- Article du catalogue (sélection visuelle, LOT 15) --- */}
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="art-catalogue">
              Article <span className="text-danger">*</span>
            </Label>
            <button
              type="button"
              id="art-catalogue"
              onClick={() => setPickerOpen(true)}
              className={`flex w-full items-center gap-3 rounded-md border bg-background p-3 text-left transition-colors hover:bg-muted/40 focus:outline-none focus:ring-2 focus:ring-primary/30 ${
                form.catalogue_article
                  ? "border-primary/40 ring-1 ring-primary/20"
                  : "border-input"
              }`}
              aria-haspopup="dialog"
              aria-expanded={pickerOpen}
            >
              {form.catalogue_article ? (
                <>
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-md bg-muted/40">
                    <ArticleIcon
                      src={form.catalogue_article.icone_url}
                      alt={form.catalogue_article.nom}
                      className="size-10 object-contain"
                    />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-foreground">
                      {form.catalogue_article.nom}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {form.catalogue_article.slug}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs font-medium text-primary">
                    Changer
                  </span>
                </>
              ) : (
                <>
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-md bg-muted/40">
                    <Shirt className="size-6 text-muted-foreground" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-foreground">
                      Choisir un article
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      33 articles illustrés disponibles
                    </span>
                  </span>
                  <span className="shrink-0 text-xs font-medium text-primary">
                    Ouvrir
                  </span>
                </>
              )}
            </button>
          </div>

          {/* --- Couleur --- */}
          <div className="space-y-1.5">
            <Label htmlFor="art-couleur">Couleur</Label>
            <Select
              value={form.couleur}
              onValueChange={(v) =>
                setForm((f) => ({
                  ...f,
                  couleur: v as CouleurVetement,
                  // Reset couleur_libre si on quitte "autre"
                  couleur_libre: v === "autre" ? f.couleur_libre : "",
                }))
              }
            >
              <SelectTrigger id="art-couleur" className="w-full">
                <SelectValue placeholder="Sélectionnez une couleur" />
              </SelectTrigger>
              <SelectContent>
                {COULEUR_VALUES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {COULEUR_LABELS[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* --- Champ "Autre couleur" — visible si couleur === "autre" --- */}
          {form.couleur === "autre" && (
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="art-couleur-libre">Précisez la couleur</Label>
              <Input
                id="art-couleur-libre"
                value={form.couleur_libre}
                onChange={(e) =>
                  setForm((f) => ({ ...f, couleur_libre: e.target.value }))
                }
                placeholder="Ex : violet, multicolore, à carreaux..."
                maxLength={60}
              />
            </div>
          )}

          {/* --- État du vêtement --- */}
          <div className="space-y-1.5">
            <Label htmlFor="art-etat">État du vêtement</Label>
            <div className="flex items-center gap-2">
              <Select
                value={form.etat}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, etat: v as EtatVetement }))
                }
              >
                <SelectTrigger id="art-etat" className="w-full">
                  <SelectValue placeholder="Sélectionnez un état" />
                </SelectTrigger>
                <SelectContent>
                  {ETAT_VALUES.map((e) => (
                    <SelectItem key={e} value={e}>
                      <span className="flex items-center gap-2">
                        <span aria-hidden>{ETAT_ICONS[e]}</span>
                        {ETAT_LABELS[e]}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* Badge preview à côté du Select — attire l'œil sur les états dégradés */}
              <StatusBadge
                status={form.etat}
                label={`${ETAT_ICONS[form.etat]} ${ETAT_LABELS[form.etat]}`}
                variant={ETAT_VARIANT[form.etat]}
                className="shrink-0"
              />
            </div>
          </div>

          {/* --- Quantité avec boutons +/- --- */}
          <div className="space-y-1.5">
            <Label htmlFor="art-quantite">Quantité</Label>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Diminuer la quantité"
                onClick={() =>
                  setForm((f) => ({
                    ...f,
                    quantite: Math.max(1, f.quantite - 1),
                  }))
                }
                disabled={form.quantite <= 1}
              >
                <Minus className="size-4" />
              </Button>
              <Input
                id="art-quantite"
                type="number"
                min={1}
                value={form.quantite}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10);
                  setForm((f) => ({
                    ...f,
                    quantite: Number.isFinite(n) && n >= 1 ? n : 1,
                  }));
                }}
                className="w-20 text-center"
                inputMode="numeric"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Augmenter la quantité"
                onClick={() =>
                  setForm((f) => ({ ...f, quantite: f.quantite + 1 }))
                }
              >
                <Plus className="size-4" />
              </Button>
            </div>
          </div>

          {/* --- Service appliqué --- */}
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="art-service">
              Service appliqué <span className="text-danger">*</span>
            </Label>
            {servicesLoading ? (
              <div className="flex h-11 items-center gap-2 rounded-md border border-input bg-muted/30 px-3 text-sm text-muted-foreground">
                <span className="size-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground" />
                Chargement des services…
              </div>
            ) : services.length === 0 ? (
              <div className="rounded-md border border-warning/40 bg-warning/5 p-3 text-sm">
                <p className="font-medium text-foreground">
                  Aucun service actif configuré pour votre pressing.
                </p>
                <p className="mt-0.5 text-muted-foreground">
                  Un responsable (manager) doit configurer au moins un service
                  dans la page{" "}
                  <a
                    href="/admin/services"
                    className="font-medium text-primary underline underline-offset-2"
                  >
                    Services
                  </a>{" "}
                  avant de pouvoir enregistrer une commande.
                </p>
              </div>
            ) : (
              <Select
                value={form.service_id}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, service_id: v }))
                }
              >
                <SelectTrigger id="art-service" className="w-full">
                  <SelectValue placeholder="Sélectionnez un service" />
                </SelectTrigger>
                <SelectContent>
                  {services.map((s) => {
                    const SvcIcon = typeServiceIcon(s.type);
                    return (
                      <SelectItem key={s.id} value={s.id}>
                        <span className="inline-flex items-center gap-2">
                          <SvcIcon className="size-4 text-muted-foreground" />
                          {s.nom} — {formatFCFA(s.prix)}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* --- Réserves / détérioration --- */}
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="art-reserves">
              Réserves / détérioration (optionnel)
            </Label>
            <Textarea
              id="art-reserves"
              value={form.description_etat}
              onChange={(e) =>
                setForm((f) => ({ ...f, description_etat: e.target.value }))
              }
              placeholder="Ex : tache sur la manche gauche, bouton manquant..."
              rows={2}
              maxLength={300}
            />
            <p className="text-xs text-muted-foreground">
              💡 Ces notes protègent le pressing en cas de réclamation
            </p>
          </div>
        </div>

        {/* --- Prix unitaire + sous-total (read-only) --- */}
        <div className="flex flex-col gap-1 rounded-md bg-muted/40 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="text-muted-foreground">
            Prix unitaire :{" "}
            <span className="font-medium text-foreground">
              {selectedService ? formatFCFA(selectedService.prix) : "—"}
            </span>
          </div>
          <div className="text-muted-foreground">
            Sous-total :{" "}
            <span className="text-base font-bold text-foreground">
              {formatFCFA(formSousTotal)}
            </span>
          </div>
        </div>

        {/* --- Bouton Ajouter / Modifier --- */}
        <Button
          type="button"
          className="w-full sm:w-auto"
          onClick={handleAddOrUpdate}
          disabled={!canSubmit}
        >
          {editingId ? (
            <>
              <Pencil className="size-4" />
              Modifier l&apos;article
            </>
          ) : (
            <>
              <Plus className="size-4" />
              Ajouter l&apos;article
            </>
          )}
        </Button>
      </div>

      {/* ====================================================== */}
      {/* LISTE DES ARTICLES AJOUTÉS                             */}
      {/* ====================================================== */}
      {state.articles.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Package className="size-6" />
          </span>
          <p className="mt-3 text-sm font-medium text-foreground">
            Aucun article enregistré
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Ajoutez au moins un article pour passer à l&apos;étape suivante.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">
              Articles de la commande ({state.articles.length})
            </h3>
            <span className="text-xs text-muted-foreground">
              {nombrePieces} pièce{nombrePieces > 1 ? "s" : ""}
            </span>
          </div>

          <ul className="space-y-2">
            {state.articles.map((article) => {
              const isEditing = article.id === editingId;
              return (
                <li
                  key={article.id}
                  className={`rounded-lg border bg-card p-3 transition-colors ${
                    isEditing ? "border-primary ring-2 ring-primary/20" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-1 gap-3">
                      {/* Illustration du catalogue (LOT 15) */}
                      <span className="flex size-12 shrink-0 items-center justify-center rounded-md bg-muted/40">
                        <ArticleIcon
                          src={article.catalogue_article_icone_url}
                          alt={article.catalogue_article_nom}
                          className="size-10 object-contain"
                        />
                      </span>
                      <div className="min-w-0 flex-1 space-y-1">
                        {/* Ligne 1 : nom du catalogue + couleur + état */}
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-foreground">
                            {articleLabel(article)}
                          </span>
                          <CouleurSwatch couleur={article.couleur} />
                          <StatusBadge
                            status={article.etat}
                            label={`${ETAT_ICONS[article.etat]} ${ETAT_LABELS[article.etat]}`}
                            variant={ETAT_VARIANT[article.etat]}
                          />
                        </div>
                        {/* Ligne 2 : service + quantité + sous-total */}
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span>{article.service_nom}</span>
                          <span className="text-foreground">
                            × {article.quantite}
                          </span>
                          <span className="font-semibold text-foreground">
                            {formatFCFA(
                              article.prix_unitaire * article.quantite
                            )}
                          </span>
                        </div>
                        {/* Ligne 3 : réserves (si présentes) */}
                        {article.description_etat && (
                          <p className="text-xs italic text-muted-foreground">
                            📝 {article.description_etat}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Actions éditer / supprimer */}
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Modifier ${articleLabel(article)}`}
                        onClick={() => handleEdit(article)}
                      >
                        <Pencil className="size-4 text-muted-foreground" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Supprimer ${articleLabel(article)}`}
                        onClick={() => handleRemove(article.id)}
                      >
                        <Trash2 className="size-4 text-danger" />
                      </Button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          {/* Total */}
          <div className="flex items-center justify-between rounded-lg border-2 border-primary/20 bg-primary/5 p-4">
            <span className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Total
            </span>
            <span className="text-xl font-bold text-foreground">
              {formatFCFA(totalArticles)}
            </span>
          </div>
        </div>
      )}

      {/* ====================================================== */}
      {/* DIALOG : SÉLECTEUR VISUEL D'ARTICLE DU CATALOGUE       */}
      {/* (LOT 15.2)                                             */}
      {/* ====================================================== */}
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="flex max-h-[90vh] flex-col gap-4 overflow-hidden p-6 sm:max-w-3xl">
          <DialogHeader className="shrink-0">
            <DialogTitle>Choisir un article</DialogTitle>
            <DialogDescription className="sr-only">
              Parcourez le catalogue d&apos;articles illustrés, filtrez par
              catégorie ou recherchez par nom, puis sélectionnez l&apos;article
              à ajouter à la commande.
            </DialogDescription>
          </DialogHeader>
          <div className="-mx-1 min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-1">
            <ArticleCatalogPicker
              selectedId={form.catalogue_article?.id ?? null}
              onSelect={handleSelectCatalogueArticle}
              compact
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
