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
import {
  Minus,
  Package,
  Pencil,
  Plus,
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
import { StatusBadge } from "@/components/shared/status-badge";
import { formatFCFA } from "@/lib/utils/format";
import type {
  CouleurVetement,
  EtatVetement,
  TypeVetement,
} from "@/lib/types/database.types";

import {
  COULEUR_LABELS,
  COULEUR_SWATCH,
  ETAT_ICONS,
  ETAT_LABELS,
  ETAT_VARIANT,
  TYPE_VETEMENT_LABELS,
} from "./article-labels";
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

/** État local du formulaire d'ajout / édition d'article. */
interface ArticleFormState {
  type_vetement: TypeVetement;
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

const TYPE_VETEMENT_VALUES = Object.keys(TYPE_VETEMENT_LABELS) as TypeVetement[];
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
 * Génère un libellé lisible "Type Couleur" pour un article. Si la
 * couleur est "autre" et que `couleur_libre` est renseigné, on
 * affiche le texte libre à la place du label "Autre".
 */
function articleLabel(a: ArticleInfo): string {
  const couleurTxt =
    a.couleur === "autre" && a.couleur_libre
      ? a.couleur_libre
      : COULEUR_LABELS[a.couleur];
  return `${TYPE_VETEMENT_LABELS[a.type_vetement]} ${couleurTxt}`;
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

  // Défauts pré-sélectionnés pour saisie rapide (chemise / blanc / bon
  // = cas le plus fréquent en pressing).
  const [form, setForm] = useState<ArticleFormState>({
    type_vetement: "chemise",
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
    if (form.couleur === "autre" && !form.couleur_libre.trim()) {
      toast.error("Précisez la couleur (champ « Autre »)");
      return;
    }
    const article: ArticleInfo = {
      id: editingId ?? genArticleId(),
      service_id: svc.id,
      service_nom: svc.nom,
      type_vetement: form.type_vetement,
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
    // Reset du formulaire en conservant service_id + type_vetement pour
    // permettre une saisie rapide d'articles similaires successifs.
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
      type_vetement: article.type_vetement,
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

  // --- Conditions d'activation du bouton Ajouter/Modifier ---
  const canSubmit = Boolean(selectedService) && form.quantite >= 1;

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
          {/* --- Type de vêtement --- */}
          <div className="space-y-1.5">
            <Label htmlFor="art-type">Type de vêtement</Label>
            <Select
              value={form.type_vetement}
              onValueChange={(v) =>
                setForm((f) => ({
                  ...f,
                  type_vetement: v as TypeVetement,
                }))
              }
            >
              <SelectTrigger id="art-type" className="w-full">
                <SelectValue placeholder="Sélectionnez un type" />
              </SelectTrigger>
              <SelectContent>
                {TYPE_VETEMENT_VALUES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {TYPE_VETEMENT_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
            <Label htmlFor="art-service">Service appliqué</Label>
            <Select
              value={form.service_id}
              onValueChange={(v) =>
                setForm((f) => ({ ...f, service_id: v }))
              }
              disabled={servicesLoading || services.length === 0}
            >
              <SelectTrigger id="art-service" className="w-full">
                <SelectValue
                  placeholder={
                    servicesLoading
                      ? "Chargement des services..."
                      : services.length === 0
                      ? "Aucun service actif"
                      : "Sélectionnez un service"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {services.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.nom} — {formatFCFA(s.prix)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
                    <div className="min-w-0 flex-1 space-y-1">
                      {/* Ligne 1 : type + couleur + état */}
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
    </div>
  );
}
