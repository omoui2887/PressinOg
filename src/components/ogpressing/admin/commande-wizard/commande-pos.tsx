/**
 * OgPressing — Nouvelle Commande : interface POS mono-page
 * ========================================================
 * Refonte visuelle du wizard en une interface POS (Point de Vente) mono-page
 * inspirée du modèle de référence habituel des pressings, SANS changer
 * l'architecture applicative (mêmes API, même reducer, même schéma DB).
 *
 * Layout (desktop) — 2 colonnes :
 *   ┌── HEADER : Retour + Titre + (Réf bleu · Montant Total rouge) ──┐
 *   ├── CATALOGUE (gauche ~45%) ──┤ COMMANDE (droite ~55%) ──┤
 *   │ 🔍 Recherche (bleu)          │ Table articles (en-tête bleu)   │
 *   │ ┌────┐ ┌────┐ ┌────┐         │ +/− Qté · ✎ · 🗑                │
 *   │ │img │ │img │ │img │         │ ─────────────────────────       │
 *   │ │1000│ │500 │ │2000│ ← rouge │ Client (recherche inline)       │
 *   │ └────┘ └────┘ └────┘         │ Statut Non Soldé/Soldé + dates  │
 *   │ [Lavage][Repassage][...]     │ Remise & Acompte (collapsible)  │
 *   └──────────────────────────────┤ Récap financier 2×2             │
 *                                  │ Annuler (rouge) · Valider (bleu)│
 *   └──────────────────────────────┴─────────────────────────────────┘
 *
 * Architecture préservée :
 *   - État partagé via `wizardReducer` (cf. state.ts) — inchangé
 *   - POST /api/admin/commandes — payload identique au wizard
 *   - Écran de confirmation (QR + étiquettes) = <StepConfirmation> réutilisé
 *   - Aucune nouvelle API, aucun changement DB
 *
 * Mobile-first : les 2 colonnes s'empilent (catalogue au-dessus, commande
 * en dessous). La table des articles reste scrollable horizontalement.
 */
"use client";

import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  AlertCircle,
  Calendar,
  Check,
  ChevronDown,
  Clock,
  Loader2,
  Mail,
  Minus,
  Package,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Shirt,
  Sparkles,
  Tag,
  Trash2,
  User,
  UserCheck,
  UserPlus,
  UserX,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import { formatFCFA } from "@/lib/utils/format";
import type {
  CouleurVetement,
  EtatVetement,
  MethodePaiement,
  RemiseType,
} from "@/lib/types/database.types";
import type { CatalogueArticle } from "@/lib/catalogue/catalogue-articles";
import {
  TYPES_SERVICES,
  typeServiceIcon,
} from "@/components/ogpressing/admin/services/services-helpers";
import { NewClientDialog } from "@/components/ogpressing/admin/clients/new-client-dialog";

import {
  COULEUR_LABELS,
  COULEUR_SWATCH,
  ETAT_ICONS,
  ETAT_LABELS,
  ETAT_VARIANT,
} from "./article-labels";
import {
  METHODE_PAIEMENT_LABELS,
  METHODE_PAIEMENT_OPTIONS,
  REMISE_TYPE_LABELS,
  REMISE_TYPE_OPTIONS,
  computeFideliteRemisePercent,
} from "./remise-labels";
import {
  computeMontantRemise,
  computeSousTotal,
  computeTotal,
  initialState,
  wizardReducer,
  type ArticleInfo,
  type ClientInfo,
  type PreferencesLavage,
  type WizardDispatch,
  type WizardState,
} from "./state";
import { StepConfirmation } from "./step-confirmation";

// ============================================================
// Types locaux
// ============================================================

interface ServiceItem {
  id: string;
  type: string;
  nom: string;
  prix: number;
  duree_estimee: string | null;
  actif: boolean;
}

interface ClientSearchResult {
  id: string;
  nom_complet: string;
  telephone: string;
  email: string | null;
  points_fidelite: number;
  solde_impaye: number;
}

interface ClientDetail {
  id: string;
  nom_complet: string;
  telephone: string;
  email: string | null;
  points_fidelite: number;
  preferences_lavage: PreferencesLavage | null;
}

interface ArticleFormState {
  catalogue_article: { id: string; slug: string; nom: string; icone_url: string } | null;
  couleur: CouleurVetement;
  couleur_libre: string;
  etat: EtatVetement;
  description_etat: string;
  service_id: string;
  quantite: number;
}

// ============================================================
// Constantes
// ============================================================

const COULEUR_VALUES = Object.keys(COULEUR_LABELS) as CouleurVetement[];
const ETAT_VALUES = Object.keys(ETAT_LABELS) as EtatVetement[];
const TAB_TOUS = "tous";

// ============================================================
// Helpers
// ============================================================

function getInitial(nom: string): string {
  const t = nom.trim();
  return t ? t.charAt(0).toUpperCase() : "?";
}

function genArticleId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `art-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function articleLabel(a: ArticleInfo): string {
  const couleurTxt =
    a.couleur === "autre" && a.couleur_libre
      ? a.couleur_libre
      : COULEUR_LABELS[a.couleur];
  return `${a.catalogue_article_nom} ${couleurTxt}`;
}

/** Convertit une date ISO en valeur `yyyy-MM-dd` pour <input type="date">. */
function toDateInputValue(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  } catch {
    return "";
  }
}

/** Convertit une valeur `yyyy-MM-dd` + `HH:mm` en ISO string. */
function fromDateInputValue(dateStr: string, timeStr: string): string {
  try {
    const d = new Date(`${dateStr}T${timeStr || "00:00"}:00`);
    if (Number.isNaN(d.getTime())) return new Date().toISOString();
    return d.toISOString();
  } catch {
    return new Date().toISOString();
  }
}

// ============================================================
// Sous-composants visuels
// ============================================================

function CouleurSwatch({ couleur, className }: { couleur: CouleurVetement; className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block size-3 shrink-0 rounded-full ${COULEUR_SWATCH[couleur]} ${className ?? ""}`}
    />
  );
}

function ArticleIcon({ src, alt, className }: { src: string; alt: string; className?: string }) {
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

function ClientAvatar({ nom, size = "md" }: { nom: string; size?: "md" | "lg" }) {
  const sizing = size === "lg" ? "size-10 text-base" : "size-8 text-sm";
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary ${sizing}`}
      aria-hidden
    >
      {getInitial(nom)}
    </span>
  );
}

function ImpayeBadge({ solde }: { solde: number }) {
  if (!(solde > 0)) return null;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md border border-warning/30 bg-warning/10 px-1.5 py-0.5 text-[11px] font-medium text-warning whitespace-nowrap"
      title={`Solde impayé : ${formatFCFA(solde)}`}
    >
      <AlertCircle className="size-3" />
      Impayé
    </span>
  );
}

// ============================================================
// Section : Catalogue (colonne gauche)
// ============================================================

interface CatalogueSectionProps {
  services: ServiceItem[];
  servicesLoading: boolean;
  onAddArticle: (article: CatalogueArticle, service: ServiceItem) => void;
}

function CatalogueSection({ services, servicesLoading, onAddArticle }: CatalogueSectionProps) {
  const [catalogue, setCatalogue] = useState<CatalogueArticle[]>([]);
  const [catalogueLoading, setCatalogueLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeServiceType, setActiveServiceType] = useState<string>(TAB_TOUS);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/public/catalogue-articles", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data?.success && Array.isArray(data.data)) {
          const actifs = (data.data as CatalogueArticle[])
            .filter((a) => a.actif)
            .sort((a, b) => (a.ordre_affichage ?? 0) - (b.ordre_affichage ?? 0));
          setCatalogue(actifs);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setCatalogueLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const currentService = useMemo<ServiceItem | null>(() => {
    if (services.length === 0) return null;
    if (activeServiceType === TAB_TOUS) return services[0];
    return services.find((s) => s.type === activeServiceType) ?? services[0];
  }, [services, activeServiceType]);

  const filteredCatalogue = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return catalogue;
    return catalogue.filter((a) => a.nom.toLowerCase().includes(q));
  }, [catalogue, searchQuery]);

  return (
    <div className="flex h-full flex-col gap-3 rounded-lg border bg-card p-3">
      {/* Barre de recherche (style POS — fond bleu foncé) */}
      <div className="flex items-center gap-2 rounded-md bg-primary p-2">
        <span
          className="flex size-8 shrink-0 items-center justify-center rounded bg-primary-foreground/20 text-primary-foreground"
          aria-hidden
        >
          <Shirt className="size-4" />
        </span>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher un article…"
            className="h-9 border-0 bg-background pl-9 text-foreground shadow-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary-foreground/50"
            aria-label="Rechercher un article dans le catalogue"
          />
        </div>
        <button
          type="button"
          onClick={() => setSearchQuery("")}
          aria-label="Réinitialiser la recherche"
          className="flex size-8 shrink-0 items-center justify-center rounded bg-primary-foreground/20 text-primary-foreground transition-colors hover:bg-primary-foreground/30"
        >
          <RefreshCw className="size-4" />
        </button>
      </div>

      {/* Grille catalogue */}
      <div className="min-h-[200px] flex-1 overflow-y-auto pr-1">
        {catalogueLoading ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="flex h-32 animate-pulse flex-col rounded-md border bg-muted/40" />
            ))}
          </div>
        ) : filteredCatalogue.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Package className="size-5" />
            </span>
            <p className="mt-2 text-sm font-medium text-foreground">
              {searchQuery ? "Aucun article trouvé" : "Catalogue vide"}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {searchQuery ? "Essayez un autre mot-clé." : "Le catalogue global sera disponible ici."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {filteredCatalogue.map((article) => {
              const price = currentService?.prix;
              return (
                <button
                  key={article.id}
                  type="button"
                  onClick={() => currentService && onAddArticle(article, currentService)}
                  disabled={!currentService}
                  className="group relative flex flex-col overflow-hidden rounded-md border bg-background text-left transition-all hover:border-primary/50 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label={`Ajouter ${article.nom} à la commande`}
                >
                  {/* Photo de l'article (format carré, style POS) */}
                  <span className="flex aspect-square items-center justify-center bg-muted/30 p-2">
                    <ArticleIcon
                      src={article.icone_url}
                      alt={article.nom}
                      className="size-full object-contain"
                    />
                  </span>
                  {/* Badge prix rouge (style POS — coin supérieur droit) */}
                  <span className="absolute right-1 top-1 rounded bg-danger px-1.5 py-0.5 text-[11px] font-bold leading-none text-danger-foreground shadow-sm">
                    {price != null ? formatFCFA(price) : "—"}
                  </span>
                  {/* Nom de l'article en bleu (style POS) */}
                  <span className="line-clamp-2 border-t bg-card px-1.5 py-1 text-center text-[11px] font-medium leading-tight text-primary">
                    {article.nom}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Onglets catégories — miniatures style POS (icône au-dessus, label en dessous) */}
      <div className="grid grid-cols-3 gap-1.5 border-t pt-2 sm:grid-cols-5">
        <button
          type="button"
          onClick={() => setActiveServiceType(TAB_TOUS)}
          className={`flex flex-col items-center gap-1 rounded-md p-2 text-[11px] font-medium transition-colors ${
            activeServiceType === TAB_TOUS
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground"
          }`}
        >
          <Shirt className="size-5" />
          Tous
        </button>
        {TYPES_SERVICES.map((t) => {
          const Icon = t.icon;
          const exists = services.some((s) => s.type === t.value);
          if (!exists && services.length > 0) return null;
          return (
            <button
              key={t.value}
              type="button"
              onClick={() => setActiveServiceType(t.value)}
              className={`flex flex-col items-center gap-1 rounded-md p-2 text-[11px] font-medium transition-colors ${
                activeServiceType === t.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              <Icon className="size-5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {!servicesLoading && services.length === 0 && (
        <div className="rounded-md border border-warning/40 bg-warning/5 p-2.5 text-xs">
          <p className="font-medium text-foreground">Aucun service actif configuré.</p>
          <p className="mt-0.5 text-muted-foreground">
            Un responsable doit configurer au moins un service dans la page{" "}
            <a href="/admin/services" className="font-medium text-primary underline underline-offset-2">
              Services
            </a>{" "}
            avant de pouvoir enregistrer une commande.
          </p>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Section : Table des articles (panier)
// ============================================================

interface CartTableProps {
  state: WizardState;
  dispatch: WizardDispatch;
  onEdit: (article: ArticleInfo) => void;
}

function CartTable({ state, dispatch, onEdit }: CartTableProps) {
  const nombrePieces = state.articles.reduce((s, a) => s + a.quantite, 0);

  function handleQtyChange(id: string, delta: number) {
    const article = state.articles.find((a) => a.id === id);
    if (!article) return;
    const newQty = Math.max(1, article.quantite + delta);
    if (newQty === article.quantite) return;
    dispatch({ type: "EDIT_ARTICLE", id, article: { ...article, quantite: newQty } });
  }

  function handleRemove(id: string) {
    dispatch({ type: "REMOVE_ARTICLE", id });
    toast.success("Article supprimé");
  }

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <h3 className="text-sm font-semibold text-foreground">Articles de la commande</h3>
        <span className="text-xs text-muted-foreground">
          {state.articles.length} ligne{state.articles.length > 1 ? "s" : ""} · {nombrePieces} pièce{nombrePieces > 1 ? "s" : ""}
        </span>
      </div>

      {state.articles.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Package className="size-5" />
          </span>
          <p className="mt-2 text-sm font-medium text-foreground">Aucun article</p>
          <p className="mt-0.5 max-w-[16rem] text-xs text-muted-foreground">
            Cliquez sur un article du catalogue à gauche pour l&apos;ajouter.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-primary text-primary-foreground">
                <th scope="col" className="w-[80px] px-2 py-2 text-left text-xs font-semibold">
                  Action
                </th>
                <th scope="col" className="px-2 py-2 text-left text-xs font-semibold">
                  Désignation
                </th>
                <th scope="col" className="w-[80px] px-2 py-2 text-right text-xs font-semibold">
                  P.U
                </th>
                <th scope="col" className="w-[100px] px-2 py-2 text-center text-xs font-semibold">
                  Qté
                </th>
                <th scope="col" className="w-[90px] px-2 py-2 text-right text-xs font-semibold">
                  Total
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {state.articles.map((article) => {
                const ligneTotal = article.prix_unitaire * article.quantite;
                return (
                  <tr key={article.id} className="bg-background hover:bg-accent/30">
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => onEdit(article)}
                          aria-label={`Modifier ${articleLabel(article)}`}
                          className="flex size-7 items-center justify-center rounded-full bg-primary/10 text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
                        >
                          <Pencil className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemove(article.id)}
                          aria-label={`Supprimer ${articleLabel(article)}`}
                          className="flex size-7 items-center justify-center rounded-full bg-danger/10 text-danger transition-colors hover:bg-danger hover:text-danger-foreground"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-2">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded bg-muted/40">
                          <ArticleIcon
                            src={article.catalogue_article_icone_url}
                            alt={article.catalogue_article_nom}
                            className="size-7 object-contain"
                          />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-foreground">
                            {articleLabel(article)}
                          </p>
                          <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                            <CouleurSwatch couleur={article.couleur} />
                            {article.service_nom}
                            {article.description_etat && <span className="italic">· 📝</span>}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-foreground">
                      {formatFCFA(article.prix_unitaire)}
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleQtyChange(article.id, -1)}
                          disabled={article.quantite <= 1}
                          aria-label="Diminuer la quantité"
                          className="flex size-6 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <Minus className="size-3" />
                        </button>
                        <span className="min-w-[1.5rem] text-center font-semibold tabular-nums text-foreground">
                          {article.quantite}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleQtyChange(article.id, 1)}
                          aria-label="Augmenter la quantité"
                          className="flex size-6 items-center justify-center rounded-full bg-primary/10 text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
                        >
                          <Plus className="size-3" />
                        </button>
                      </div>
                    </td>
                    <td className="px-2 py-2 text-right font-semibold tabular-nums text-foreground">
                      {formatFCFA(ligneTotal)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Section : Client (recherche inline compacte)
// ============================================================

interface ClientSectionProps {
  state: WizardState;
  dispatch: WizardDispatch;
}

function ClientSection({ state, dispatch }: ClientSectionProps) {
  const hasClient = state.client !== null;
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [results, setResults] = useState<ClientSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchingId, setFetchingId] = useState<string | null>(null);
  const [showResults, setShowResults] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  const doSearch = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/clients?q=${encodeURIComponent(q)}&page=1&pageSize=10`,
        { cache: "no-store" }
      );
      const data = await res.json();
      if (data?.success && Array.isArray(data.data)) {
        setResults(data.data as ClientSearchResult[]);
        setShowResults(true);
      } else {
        setResults([]);
      }
    } catch {
      setResults([]);
      toast.error("Impossible de rechercher les clients. Réessayez.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const trimmed = debouncedQuery.trim();
    if (!trimmed) {
      setResults([]);
      setShowResults(false);
      return;
    }
    doSearch(trimmed);
  }, [debouncedQuery, doSearch]);

  async function fetchClientDetail(id: string): Promise<ClientInfo | null> {
    try {
      const res = await fetch(`/api/admin/clients/${id}`, { cache: "no-store" });
      if (!res.ok) return null;
      const json = await res.json();
      if (!json.success || !json.data) return null;
      const d: ClientDetail = json.data;
      return {
        id: d.id,
        nom: d.nom_complet,
        telephone: d.telephone,
        email: d.email,
        solde_impaye: 0,
        preferences_lavage: d.preferences_lavage ?? null,
        points_fidelite: d.points_fidelite ?? 0,
      };
    } catch {
      return null;
    }
  }

  async function handleSelect(c: ClientSearchResult) {
    setFetchingId(c.id);
    const detail = await fetchClientDetail(c.id);
    setFetchingId(null);
    if (!detail) {
      toast.error("Impossible de charger ce client. Réessayez.");
      return;
    }
    dispatch({ type: "SET_CLIENT", client: { ...detail, solde_impaye: c.solde_impaye } });
    setQuery("");
    setDebouncedQuery("");
    setResults([]);
    setShowResults(false);
  }

  function handleCreated(c: { id: string; nom_complet: string; telephone: string; email: string | null }) {
    dispatch({
      type: "SET_CLIENT",
      client: {
        id: c.id,
        nom: c.nom_complet,
        telephone: c.telephone,
        email: c.email ?? null,
        solde_impaye: 0,
        preferences_lavage: null,
        points_fidelite: 0,
      },
    });
    setQuery("");
    setResults([]);
    setShowResults(false);
    toast.success(`Client « ${c.nom_complet} » sélectionné.`);
  }

  function handleClearClient() {
    dispatch({ type: "CLEAR_CLIENT" });
  }

  const client = state.client;

  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="mb-2 flex items-center gap-2">
        <User className="size-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground">Client</h3>
      </div>

      {!hasClient ? (
        <div className="space-y-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Nom ou téléphone…"
                className="pl-9"
                aria-label="Rechercher un client"
                autoComplete="off"
              />
            </div>
            <NewClientDialog
              onCreated={handleCreated}
              trigger={
                <Button variant="outline" size="sm" className="shrink-0">
                  <UserPlus className="size-4" />
                  Nouveau
                </Button>
              }
            />
          </div>

          {showResults && debouncedQuery.trim() && (
            <div className="max-h-60 overflow-y-auto rounded-md border bg-background">
              {loading && results.length === 0 ? (
                <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  Recherche…
                </div>
              ) : results.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-6 text-center">
                  <UserX className="size-5 text-muted-foreground" />
                  <p className="mt-1 text-xs text-muted-foreground">Aucun client trouvé</p>
                </div>
              ) : (
                <ul role="listbox" aria-label="Résultats clients">
                  {results.map((c) => (
                    <li key={c.id} role="option" aria-selected={false}>
                      <button
                        type="button"
                        onClick={() => handleSelect(c)}
                        disabled={fetchingId === c.id}
                        className="flex w-full items-center gap-2 border-b px-3 py-2 text-left transition-colors last:border-b-0 hover:bg-accent/50 disabled:opacity-60"
                      >
                        <ClientAvatar nom={c.nom_complet} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground">{c.nom_complet}</p>
                          <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                            <Phone className="size-3" />
                            {c.telephone}
                          </p>
                        </div>
                        {fetchingId === c.id ? (
                          <Loader2 className="size-4 animate-spin text-muted-foreground" />
                        ) : (
                          <ImpayeBadge solde={c.solde_impaye} />
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      ) : (
        client && (
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 items-start gap-2">
              <ClientAvatar nom={client.nom} size="lg" />
              <div className="min-w-0 space-y-0.5">
                <div className="flex items-center gap-1.5">
                  <UserCheck className="size-3.5 shrink-0 text-secondary" />
                  <p className="truncate font-semibold text-foreground">{client.nom}</p>
                </div>
                <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                  <Phone className="size-3" />
                  {client.telephone}
                </p>
                {client.email && (
                  <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                    <Mail className="size-3" />
                    {client.email}
                  </p>
                )}
                <div className="pt-0.5">
                  <ImpayeBadge solde={client.solde_impaye} />
                </div>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={handleClearClient} className="shrink-0 text-xs">
              <RefreshCw className="size-3.5" />
              Changer
            </Button>
          </div>
        )
      )}
    </div>
  );
}

// ============================================================
// Section : Statut paiement + Dates
// ============================================================

interface StatusDateSectionProps {
  state: WizardState;
  dispatch: WizardDispatch;
  total: number;
}

function StatusDateSection({ state, dispatch, total }: StatusDateSectionProps) {
  const acompteMontant = state.acompte?.montant ?? 0;
  // "Soldé" = acompte couvre la totalité ; "Non Soldé" sinon
  const isSolde = total > 0 && acompteMontant >= total;

  function handleStatutChange(solde: boolean) {
    if (solde && total > 0) {
      // Soldé → acompte = total (paiement complet)
      dispatch({
        type: "SET_ACOMPTE",
        acompte: {
          montant: total,
          methode: state.acompte?.methode ?? "especes",
          reference: state.acompte?.reference,
        },
      });
    } else {
      // Non Soldé → pas d'acompte
      dispatch({ type: "SET_ACOMPTE", acompte: null });
    }
  }

  // Dates : dépôt = maintenant (lecture seule), retrait = date_pret_prevue
  const depotDate = toDateInputValue(new Date().toISOString());
  const depotTime = new Date().toTimeString().slice(0, 5);
  const retraitDate = toDateInputValue(state.date_pret_prevue);

  function handleRetraitDateChange(dateStr: string) {
    const time = state.date_pret_prevue
      ? new Date(state.date_pret_prevue).toTimeString().slice(0, 5)
      : "12:00";
    dispatch({ type: "SET_DATE_PRET_PREVUE", date: fromDateInputValue(dateStr, time) });
  }

  function handleRetraitTimeChange(timeStr: string) {
    dispatch({
      type: "SET_DATE_PRET_PREVUE",
      date: fromDateInputValue(retraitDate || toDateInputValue(new Date().toISOString()), timeStr),
    });
  }

  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="mb-2 flex items-center gap-2">
        <Calendar className="size-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground">Statut & Dates</h3>
      </div>

      <div className="space-y-3">
        {/* Radio Non Soldé / Soldé */}
        <div className="flex items-center gap-4">
          <label className="flex cursor-pointer items-center gap-1.5 text-sm">
            <input
              type="radio"
              name="statut-paiement"
              checked={!isSolde}
              onChange={() => handleStatutChange(false)}
              className="size-4 accent-primary"
            />
            <span className={!isSolde ? "font-medium text-foreground" : "text-muted-foreground"}>
              Non Soldé
            </span>
          </label>
          <label className="flex cursor-pointer items-center gap-1.5 text-sm">
            <input
              type="radio"
              name="statut-paiement"
              checked={isSolde}
              onChange={() => handleStatutChange(true)}
              className="size-4 accent-primary"
            />
            <span className={isSolde ? "font-medium text-foreground" : "text-muted-foreground"}>
              Soldé
            </span>
          </label>
        </div>

        {/* Déposé le (lecture seule, auto = maintenant) */}
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Déposé le</Label>
            <Input type="date" value={depotDate} readOnly className="h-9 bg-muted/50 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Heure</Label>
            <div className="relative">
              <Clock className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input type="time" value={depotTime} readOnly className="h-9 bg-muted/50 pl-8 text-sm" />
            </div>
          </div>
        </div>

        {/* A retirer le (éditable) */}
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">A Retirer le</Label>
            <Input
              type="date"
              value={retraitDate}
              onChange={(e) => handleRetraitDateChange(e.target.value)}
              className="h-9 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Heure</Label>
            <div className="relative">
              <Clock className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="time"
                value={state.date_pret_prevue ? new Date(state.date_pret_prevue).toTimeString().slice(0, 5) : "12:00"}
                onChange={(e) => handleRetraitTimeChange(e.target.value)}
                className="h-9 pl-8 text-sm"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Section : Remise & Acompte (collapsible)
// ============================================================

interface RemiseAcompteSectionProps {
  state: WizardState;
  dispatch: WizardDispatch;
  sousTotal: number;
  total: number;
}

function RemiseAcompteSection({ state, dispatch, sousTotal, total }: RemiseAcompteSectionProps) {
  const [open, setOpen] = useState(false);
  const pointsFidelite = state.client?.points_fidelite ?? 0;
  const suggestedFidelitePercent = computeFideliteRemisePercent(pointsFidelite);

  // Édition locale du type de remise + valeur
  const remiseType: RemiseType = state.remise?.type ?? "aucune";
  const remiseValeur = state.remise?.valeur ?? 0;

  function applyRemise(type: RemiseType, valeur: number) {
    if (type === "aucune") {
      dispatch({ type: "SET_REMISE", remise: null });
      return;
    }

    let montant = 0;
    if (type === "pourcentage") {
      montant = Math.round((sousTotal * Math.min(100, Math.max(0, valeur))) / 100);
    } else if (type === "montant_fixe") {
      montant = Math.min(sousTotal, Math.max(0, valeur));
    } else if (type === "fidelite") {
      montant = Math.round((sousTotal * suggestedFidelitePercent) / 100);
    } else if (type === "article_gratuit") {
      // Offre l'article le moins cher
      const cheaper = [...state.articles].sort((a, b) => a.prix_unitaire - b.prix_unitaire)[0];
      montant = cheaper ? cheaper.prix_unitaire * cheaper.quantite : 0;
    }
    dispatch({
      type: "SET_REMISE",
      remise: { type, valeur, montant },
    });
  }

  // Acompte
  const acompteMontant = state.acompte?.montant ?? 0;
  const acompteMethode: MethodePaiement = state.acompte?.methode ?? "especes";
  const acompteReference = state.acompte?.reference ?? "";

  function applyAcompte(montant: number, methode: MethodePaiement, reference?: string) {
    const m = Math.max(0, Math.min(total, montant));
    if (m <= 0) {
      dispatch({ type: "SET_ACOMPTE", acompte: null });
    } else {
      dispatch({
        type: "SET_ACOMPTE",
        acompte: { montant: m, methode, reference: reference?.trim() || undefined },
      });
    }
  }

  return (
    <div className="rounded-lg border bg-card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-3 py-2 text-left"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2">
          <Tag className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">Remise & Acompte</h3>
          {(state.remise || state.acompte) && (
            <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
              {(state.remise ? "Remise" : "") + (state.remise && state.acompte ? " · " : "") + (state.acompte ? "Acompte" : "")}
            </span>
          )}
        </span>
        <ChevronDown className={`size-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="space-y-4 border-t px-3 py-3">
          {/* Remise */}
          <div className="space-y-2">
            <Label className="text-xs font-medium text-muted-foreground">Remise</Label>
            <div className="grid grid-cols-2 gap-2">
              <Select
                value={remiseType}
                onValueChange={(v) => {
                  const t = v as RemiseType;
                  if (t === "fidelite") applyRemise("fidelite", suggestedFidelitePercent);
                  else if (t === "aucune") applyRemise("aucune", 0);
                  else applyRemise(t, remiseValeur || 0);
                }}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REMISE_TYPE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value} disabled={o.value === "article_gratuit" && state.articles.length === 0}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {remiseType === "pourcentage" && (
                <div className="relative">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={remiseValeur || ""}
                    onChange={(e) => applyRemise("pourcentage", parseInt(e.target.value, 10) || 0)}
                    placeholder="0"
                    className="h-9 pr-8 text-sm"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                </div>
              )}
              {remiseType === "montant_fixe" && (
                <Input
                  type="number"
                  min={0}
                  max={sousTotal}
                  value={remiseValeur || ""}
                  onChange={(e) => applyRemise("montant_fixe", parseInt(e.target.value, 10) || 0)}
                  placeholder="0"
                  className="h-9 text-sm"
                />
              )}
              {remiseType === "fidelite" && (
                <div className="flex h-9 items-center rounded-md border bg-muted/30 px-3 text-xs text-muted-foreground">
                  {suggestedFidelitePercent > 0
                    ? `${suggestedFidelitePercent}% (${pointsFidelite} pts)`
                    : `Seuil non atteint (${pointsFidelite}/50 pts)`}
                </div>
              )}
              {remiseType === "article_gratuit" && (
                <div className="flex h-9 items-center rounded-md border bg-muted/30 px-3 text-xs text-muted-foreground">
                  Article le moins cher offert
                </div>
              )}
            </div>
          </div>

          {/* Acompte */}
          <div className="space-y-2">
            <Label className="text-xs font-medium text-muted-foreground">
              Acompte (max {formatFCFA(total)})
            </Label>
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="number"
                min={0}
                max={total}
                value={acompteMontant || ""}
                onChange={(e) => applyAcompte(parseInt(e.target.value, 10) || 0, acompteMethode, acompteReference)}
                placeholder="0"
                className="h-9 text-sm"
              />
              <Select
                value={acompteMethode}
                onValueChange={(v) => applyAcompte(acompteMontant, v as MethodePaiement, acompteReference)}
                disabled={acompteMontant <= 0}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {METHODE_PAIEMENT_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {acompteMontant > 0 && (
              <Input
                type="text"
                value={acompteReference}
                onChange={(e) => applyAcompte(acompteMontant, acompteMethode, e.target.value)}
                placeholder="Référence (ex : n° Mobile Money) — optionnel"
                className="h-9 text-sm"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Section : Récap financier 2×2
// ============================================================

function FinancialRecap({
  remise,
  paye,
  net,
  reste,
}: {
  remise: number;
  paye: number;
  net: number;
  reste: number;
}) {
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border">
      <div className="bg-card p-3">
        <p className="text-xs text-muted-foreground">Remise</p>
        <p className="text-sm font-semibold text-foreground">{formatFCFA(remise)}</p>
      </div>
      <div className="bg-card p-3">
        <p className="text-xs text-muted-foreground">Payé</p>
        <p className="text-sm font-semibold text-primary">{formatFCFA(paye)}</p>
      </div>
      <div className="bg-card p-3">
        <p className="text-xs text-muted-foreground">Net à payer</p>
        <p className="text-sm font-semibold text-primary">{formatFCFA(net)}</p>
      </div>
      <div className="bg-danger/5 p-3">
        <p className="text-xs text-muted-foreground">Reste</p>
        <p className="text-sm font-bold text-danger">{formatFCFA(reste)}</p>
      </div>
    </div>
  );
}

// ============================================================
// Dialog : édition d'un article
// ============================================================

interface ArticleEditDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editing: ArticleInfo | null;
  services: ServiceItem[];
  servicesLoading: boolean;
  onSave: (article: ArticleInfo) => void;
}

function ArticleEditDialog({ open, onOpenChange, editing, services, servicesLoading, onSave }: ArticleEditDialogProps) {
  // Initialisation paresseuse du formulaire depuis l'article en édition.
  // Le remontage via `key` (cf. parent) garantit une réinitialisation propre
  // à chaque ouverture sur un article différent — sans useEffect/setState.
  const [form, setForm] = useState<ArticleFormState>(() => ({
    catalogue_article: editing
      ? {
          id: editing.catalogue_article_id,
          slug: editing.catalogue_article_slug,
          nom: editing.catalogue_article_nom,
          icone_url: editing.catalogue_article_icone_url,
        }
      : null,
    couleur: editing?.couleur ?? "blanc",
    couleur_libre: editing?.couleur_libre ?? "",
    etat: editing?.etat ?? "bon",
    description_etat: editing?.description_etat ?? "",
    service_id: editing?.service_id ?? "",
    quantite: editing?.quantite ?? 1,
  }));

  function handleClose() {
    onOpenChange(false);
  }

  function handleSave() {
    if (!editing || !form.catalogue_article) return;
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
      id: editing.id,
      service_id: svc.id,
      service_nom: svc.nom,
      catalogue_article_id: form.catalogue_article.id,
      catalogue_article_nom: form.catalogue_article.nom,
      catalogue_article_slug: form.catalogue_article.slug,
      catalogue_article_icone_url: form.catalogue_article.icone_url,
      couleur: form.couleur,
      couleur_libre: form.couleur === "autre" ? form.couleur_libre.trim() : undefined,
      etat: form.etat,
      description_etat: form.description_etat.trim() || undefined,
      prix_unitaire: svc.prix,
      quantite: form.quantite,
    };
    onSave(article);
    toast.success("Article modifié");
    handleClose();
  }

  const selectedService = services.find((s) => s.id === form.service_id) ?? null;
  const formSousTotal = selectedService ? selectedService.prix * form.quantite : 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-4 overflow-hidden p-6 sm:max-w-lg">
        <DialogHeader className="shrink-0">
          <DialogTitle>Modifier l&apos;article</DialogTitle>
          <DialogDescription className="sr-only">
            Ajustez la couleur, l&apos;état, la quantité, le service et les réserves.
          </DialogDescription>
        </DialogHeader>

        <div className="-mx-1 min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-1">
          <div className="space-y-4">
            {form.catalogue_article && (
              <div className="flex items-center gap-3 rounded-md border bg-muted/30 p-3">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-md bg-background">
                  <ArticleIcon src={form.catalogue_article.icone_url} alt={form.catalogue_article.nom} className="size-10 object-contain" />
                </span>
                <div className="min-w-0">
                  <p className="truncate font-medium text-foreground">{form.catalogue_article.nom}</p>
                  <p className="text-xs text-muted-foreground">{form.catalogue_article.slug}</p>
                </div>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="pos-art-couleur">Couleur</Label>
                <Select
                  value={form.couleur}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, couleur: v as CouleurVetement, couleur_libre: v === "autre" ? f.couleur_libre : "" }))
                  }
                >
                  <SelectTrigger id="pos-art-couleur" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COULEUR_VALUES.map((c) => (
                      <SelectItem key={c} value={c}>{COULEUR_LABELS[c]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="pos-art-etat">État du vêtement</Label>
                <div className="flex items-center gap-2">
                  <Select value={form.etat} onValueChange={(v) => setForm((f) => ({ ...f, etat: v as EtatVetement }))}>
                    <SelectTrigger id="pos-art-etat" className="w-full">
                      <SelectValue />
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
                  <StatusBadge status={form.etat} label={`${ETAT_ICONS[form.etat]} ${ETAT_LABELS[form.etat]}`} variant={ETAT_VARIANT[form.etat]} className="shrink-0" />
                </div>
              </div>

              {form.couleur === "autre" && (
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="pos-art-couleur-libre">Précisez la couleur</Label>
                  <Input id="pos-art-couleur-libre" value={form.couleur_libre} onChange={(e) => setForm((f) => ({ ...f, couleur_libre: e.target.value }))} placeholder="Ex : violet, multicolore…" maxLength={60} />
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="pos-art-quantite">Quantité</Label>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" size="icon" aria-label="Diminuer" onClick={() => setForm((f) => ({ ...f, quantite: Math.max(1, f.quantite - 1) }))} disabled={form.quantite <= 1}>
                    <Minus className="size-4" />
                  </Button>
                  <Input id="pos-art-quantite" type="number" min={1} value={form.quantite} onChange={(e) => { const n = parseInt(e.target.value, 10); setForm((f) => ({ ...f, quantite: Number.isFinite(n) && n >= 1 ? n : 1 })); }} className="w-20 text-center" inputMode="numeric" />
                  <Button type="button" variant="outline" size="icon" aria-label="Augmenter" onClick={() => setForm((f) => ({ ...f, quantite: f.quantite + 1 }))}>
                    <Plus className="size-4" />
                  </Button>
                </div>
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="pos-art-service">Service appliqué <span className="text-danger">*</span></Label>
                {servicesLoading ? (
                  <div className="flex h-11 items-center gap-2 rounded-md border border-input bg-muted/30 px-3 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" />
                    Chargement des services…
                  </div>
                ) : (
                  <Select value={form.service_id} onValueChange={(v) => setForm((f) => ({ ...f, service_id: v }))}>
                    <SelectTrigger id="pos-art-service" className="w-full">
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

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="pos-art-reserves">Réserves / détérioration (optionnel)</Label>
                <Textarea id="pos-art-reserves" value={form.description_etat} onChange={(e) => setForm((f) => ({ ...f, description_etat: e.target.value }))} placeholder="Ex : tache sur la manche gauche…" rows={2} maxLength={300} />
              </div>
            </div>

            <div className="flex flex-col gap-1 rounded-md bg-muted/40 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
              <div className="text-muted-foreground">
                Prix unitaire : <span className="font-medium text-foreground">{selectedService ? formatFCFA(selectedService.prix) : "—"}</span>
              </div>
              <div className="text-muted-foreground">
                Sous-total : <span className="text-base font-bold text-foreground">{formatFCFA(formSousTotal)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t pt-3">
          <Button type="button" variant="destructive" onClick={handleClose}>
            <X className="size-4" />
            Annuler
          </Button>
          <Button type="button" onClick={handleSave}>
            <Pencil className="size-4" />
            Modifier
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Composant principal : CommandePOS
// ============================================================

export function CommandePOS({ basePath = "/admin" }: { basePath?: string } = {}) {
  const [state, dispatch] = useReducer(wizardReducer, initialState);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [servicesLoading, setServicesLoading] = useState(true);
  const [preselecting, setPreselecting] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingArticle, setEditingArticle] = useState<ArticleInfo | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Pré-sélection client depuis ?client_id=<id>
  useEffect(() => {
    if (typeof window === "undefined") return;
    const clientId = new URLSearchParams(window.location.search).get("client_id");
    if (!clientId) return;
    setPreselecting(true);
    (async () => {
      try {
        const res = await fetch(`/api/admin/clients/${clientId}`, { cache: "no-store" });
        if (!res.ok) return;
        const json = await res.json();
        if (!json.success || !json.data) return;
        const d: ClientDetail = json.data;
        const client: ClientInfo = {
          id: d.id,
          nom: d.nom_complet,
          telephone: d.telephone,
          email: d.email,
          solde_impaye: 0,
          preferences_lavage: d.preferences_lavage ?? null,
          points_fidelite: d.points_fidelite ?? 0,
        };
        dispatch({ type: "SET_CLIENT", client });
      } catch {
        // ignore
      } finally {
        setPreselecting(false);
      }
    })();
  }, []);

  // Chargement des services
  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/services", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data?.success && Array.isArray(data.data)) {
          setServices(data.data as ServiceItem[]);
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

  // --- Calculs financiers ---
  const sousTotal = useMemo(() => computeSousTotal(state), [state]);
  const montantRemise = useMemo(() => computeMontantRemise(state), [state]);
  const total = useMemo(() => computeTotal(state), [state]);
  const acompteMontant = state.acompte?.montant ?? 0;
  const resteAPayer = Math.max(0, total - acompteMontant);

  // --- Référence provisoire (générée côté client uniquement pour éviter
  //     l'erreur d'hydratation : le timestamp diffère entre serveur et client) ---
  const [provisionalRef, setProvisionalRef] = useState<string>("CMD-PROV-······");
  useEffect(() => {
    setProvisionalRef(
      `CMD-PROV-${new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).replace(/:/g, "")}`
    );
  }, []);

  // --- Handlers ---
  function handleAddArticle(article: CatalogueArticle, service: ServiceItem) {
    const newArticle: ArticleInfo = {
      id: genArticleId(),
      service_id: service.id,
      service_nom: service.nom,
      catalogue_article_id: article.id,
      catalogue_article_nom: article.nom,
      catalogue_article_slug: article.slug,
      catalogue_article_icone_url: article.icone_url,
      couleur: "blanc",
      couleur_libre: undefined,
      etat: "bon",
      description_etat: undefined,
      prix_unitaire: service.prix,
      quantite: 1,
    };
    dispatch({ type: "ADD_ARTICLE", article: newArticle });
    toast.success(`${article.nom} ajouté`);
  }

  function handleEditArticle(article: ArticleInfo) {
    setEditingArticle(article);
    setEditOpen(true);
  }

  function handleSaveArticle(article: ArticleInfo) {
    dispatch({ type: "EDIT_ARTICLE", id: article.id, article });
  }

  async function handleValider() {
    if (!state.client) {
      toast.error("Sélectionnez un client avant de valider.");
      return;
    }
    if (state.articles.length === 0) {
      toast.error("Ajoutez au moins un article avant de valider.");
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        client_id: state.client.id,
        articles: state.articles.map((a) => ({
          service_id: a.service_id,
          catalogue_article_id: a.catalogue_article_id,
          catalogue_article_nom: a.catalogue_article_nom,
          couleur: a.couleur,
          couleur_libre: a.couleur_libre,
          etat: a.etat,
          description_etat: a.description_etat,
          quantite: a.quantite,
        })),
        remise: state.remise ? { type: state.remise.type, valeur: state.remise.valeur } : null,
        acompte: state.acompte
          ? { montant: state.acompte.montant, methode: state.acompte.methode, reference: state.acompte.reference }
          : null,
        date_pret_prevue: state.date_pret_prevue,
        notes: state.notes || undefined,
        appliquer_preferences: state.appliquerPreferences,
      };

      const res = await fetch("/api/admin/commandes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `Erreur ${res.status} lors de la création de la commande`);
      }
      dispatch({ type: "SET_COMMANDE_CREE", commande: data.data });
      toast.success("✅ Commande créée avec succès");
    } catch (e) {
      let message: string;
      if (e instanceof TypeError && e.message.includes("fetch")) {
        message = "Erreur réseau. Vérifiez votre connexion internet.";
      } else if (e instanceof Error && e.message) {
        message = e.message;
      } else {
        message = "Une erreur est survenue. Veuillez réessayer.";
      }
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  // --- Écran de confirmation (après POST succès) ---
  if (state.commandeCree) {
    return <StepConfirmation state={state} dispatch={dispatch} basePath={basePath} />;
  }

  // --- Interface POS mono-page ---
  const canSubmit = state.client !== null && state.articles.length > 0 && !submitting;

  return (
    <div className="flex min-h-[calc(100dvh-12rem)] flex-col gap-3 md:min-h-[calc(100dvh-7rem)]">
      {/* Header : retour + titre */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild aria-label="Retour aux commandes">
          <Link href={`${basePath}/commandes`}>
            <X className="size-5" />
          </Link>
        </Button>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold tracking-tight text-foreground sm:text-2xl">
            Nouvelle commande
          </h1>
        </div>
      </div>

      {/* Barre POS : Réf (bleu) + Montant Total (rouge) */}
      <div className="flex items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3 shadow-sm">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Réf :</span>
          <span className="truncate font-mono text-sm font-semibold text-primary">{provisionalRef}</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Montant Total :</span>
          <span className="text-lg font-bold text-danger">{formatFCFA(total)}</span>
        </div>
      </div>

      {/* Layout 2 colonnes */}
      <div className="grid flex-1 gap-3 lg:grid-cols-[minmax(0,45fr)_minmax(0,55fr)]">
        {/* COLONNE GAUCHE — CATALOGUE */}
        <CatalogueSection
          services={services}
          servicesLoading={servicesLoading}
          onAddArticle={handleAddArticle}
        />

        {/* COLONNE DROITE — COMMANDE */}
        <div className="flex flex-col gap-3">
          {preselecting ? (
            <div className="flex items-center justify-center gap-2 rounded-lg border bg-card py-8 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Pré-sélection du client…
            </div>
          ) : null}

          {/* Table des articles */}
          <CartTable state={state} dispatch={dispatch} onEdit={handleEditArticle} />

          {/* Client */}
          <ClientSection state={state} dispatch={dispatch} />

          {/* Statut & Dates */}
          <StatusDateSection state={state} dispatch={dispatch} total={total} />

          {/* Remise & Acompte */}
          <RemiseAcompteSection state={state} dispatch={dispatch} sousTotal={sousTotal} total={total} />

          {/* Récap financier 2×2 */}
          <FinancialRecap remise={montantRemise} paye={acompteMontant} net={total} reste={resteAPayer} />
        </div>
      </div>

      {/* Barre d'action : Annuler (rouge) / Valider (bleu) */}
      <div className="sticky bottom-0 z-20 mt-2 flex items-center justify-between gap-3 rounded-lg border bg-background/95 px-4 py-3 shadow-lg backdrop-blur">
        <Button variant="destructive" asChild>
          <Link href={`${basePath}/commandes`}>
            <X className="size-4" />
            Annuler
          </Link>
        </Button>
        {!canSubmit && !submitting && (
          <p className="hidden text-xs text-muted-foreground sm:block">
            {!state.client ? "Sélectionnez un client" : "Ajoutez au moins un article"}
          </p>
        )}
        <Button onClick={handleValider} disabled={!canSubmit}>
          {submitting ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Création…
            </>
          ) : (
            <>
              <Check className="size-4" />
              Valider
            </>
          )}
        </Button>
      </div>

      {/* Dialog d'édition d'article — `key` force le remontage (réinit du
          formulaire) à chaque changement d'article édité, sans useEffect. */}
      <ArticleEditDialog
        key={editingArticle?.id ?? "closed"}
        open={editOpen}
        onOpenChange={setEditOpen}
        editing={editingArticle}
        services={services}
        servicesLoading={servicesLoading}
        onSave={handleSaveArticle}
      />
    </div>
  );
}
