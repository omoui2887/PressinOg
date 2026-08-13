/**
 * e-pressing — POS / Caisse : store Zustand
 * ==========================================
 * État léger du panier POS. Survit à l'ouverture d'une boîte de dialogue
 * (nouveau client, fiche client) et peut être restauré après une erreur
 * réseau — le panier n'est jamais perdu en cas d'échec de validation.
 *
 * Toute la logique de calcul (sous-total, remise, net, reste) est déléguée
 * aux fonctions pures de `calc.ts` via les sélecteurs exportés.
 */
import { create } from "zustand";
import type {
  PosArticle,
  PosCartLine,
  PosClient,
  PosMethodePaiement,
  PosRemiseType,
  PosCommandeCree,
  PosCategorieId,
} from "./types";
import {
  generateReference,
  localId,
  computeDateRetrait,
  hasExpress,
} from "./calc";

export type PosSearchMode = "article" | "code";

interface PosState {
  // ---------- Catalogue ----------
  articles: PosArticle[];
  source: "api" | "mock" | "mixed";
  loadingArticles: boolean;
  searchMode: PosSearchMode;
  searchQuery: string;
  activeCategorie: PosCategorieId;

  // ---------- Panier ----------
  cartLines: PosCartLine[];
  flashId: string | null; // carte récemment cliquée (effet visuel)

  // ---------- Client ----------
  client: PosClient | null;
  clientPassage: boolean; // client de passage (nom facultatif, tél obligatoire)

  // ---------- Dates ----------
  dateDepot: string; // ISO
  dateRetrait: string; // ISO

  // ---------- Finance ----------
  remiseType: PosRemiseType;
  remiseValeur: number;
  paye: number;
  methodePaiement: PosMethodePaiement | null;
  referencePaiement: string;
  notes: string;

  // ---------- Contexte ----------
  reference: string;
  pressingLabel: string;
  agentLabel: string;

  // ---------- Soumission ----------
  submitting: boolean;
  submitError: string | null;
  commandeCree: PosCommandeCree | null;

  // ---------- Actions ----------
  setArticles: (articles: PosArticle[], source: PosState["source"]) => void;
  setLoadingArticles: (v: boolean) => void;
  setSearchMode: (m: PosSearchMode) => void;
  setSearchQuery: (q: string) => void;
  setActiveCategorie: (c: PosCategorieId) => void;

  addArticle: (article: PosArticle) => void;
  incLine: (id: string) => void;
  decLine: (id: string) => void;
  removeLine: (id: string) => void;
  setQty: (id: string, qty: number) => void;
  toggleExpress: (id: string) => void;
  setLineNote: (id: string, note: string) => void;
  clearCart: () => void;

  setClient: (c: PosClient | null) => void;
  setClientPassage: (v: boolean) => void;

  setDateDepot: (iso: string) => void;
  setDateRetrait: (iso: string) => void;
  shiftRetrait: (hours: number) => void;
  recomputeRetrait: () => void;

  setRemiseType: (t: PosRemiseType) => void;
  setRemiseValeur: (v: number) => void;
  setPaye: (v: number) => void;
  setMethodePaiement: (m: PosMethodePaiement | null) => void;
  setReferencePaiement: (r: string) => void;
  setNotes: (n: string) => void;

  setContext: (pressingLabel: string, agentLabel: string) => void;
  setSubmitting: (v: boolean) => void;
  setSubmitError: (e: string | null) => void;
  setCommandeCree: (c: PosCommandeCree | null) => void;

  /** Initialise les valeurs dépendant du temps (réf, dates, panier démo).
   *  À appeler côté client au montage pour éviter une mismatch d'hydration. */
  initSession: () => void;

  reset: () => void;
}

function recomputeRetraitFromState(
  dateDepot: string,
  cartLines: PosCartLine[]
): string {
  return computeDateRetrait(new Date(dateDepot), hasExpress(cartLines)).toISOString();
}

export const usePosStore = create<PosState>((set, get) => ({
  articles: [],
  source: "mock",
  loadingArticles: true,
  searchMode: "article",
  searchQuery: "",
  activeCategorie: "tous",

  // Déterministe (vide) au montage → évite la mismatch d'hydration SSR.
  // Renseigné côté client par initSession().
  cartLines: [],
  flashId: null,

  client: null,
  clientPassage: false,

  dateDepot: "",
  dateRetrait: "",

  remiseType: "aucune",
  remiseValeur: 0,
  paye: 0,
  methodePaiement: null,
  referencePaiement: "",
  notes: "",

  reference: "",
  pressingLabel: "",
  agentLabel: "",

  submitting: false,
  submitError: null,
  commandeCree: null,

  setArticles: (articles, source) => set({ articles, source, loadingArticles: false }),
  setLoadingArticles: (v) => set({ loadingArticles: v }),
  setSearchMode: (m) => set({ searchMode: m }),
  setSearchQuery: (q) => set({ searchQuery: q }),
  setActiveCategorie: (c) =>
    set((s) => ({
      activeCategorie: s.activeCategorie === c ? "tous" : c,
    })),

  addArticle: (article) =>
    set((s) => {
      const existing = s.cartLines.find(
        (l) => l.article.id === article.id
      );
      if (existing) {
        return {
          cartLines: s.cartLines.map((l) =>
            l.id === existing.id ? { ...l, quantite: l.quantite + 1 } : l
          ),
          flashId: existing.id,
        };
      }
      const line: PosCartLine = {
        id: localId(),
        article,
        quantite: 1,
        express: false,
        // Défauts alignés sur l'enum DB (couleur_vetement / etat_vetement).
        // ⚠️ Ne PAS utiliser "autre" pour couleur : cela déclencherait
        //    l'exigence de `couleur_libre` côté API (validation 400).
        // ⚠️ Ne PAS utiliser "correct" pour etat : valeur absente de l'enum
        //    (valeurs valides : bon, acceptable, use, dechire, tache).
        couleur: "blanc",
        etat: "bon",
      };
      return { cartLines: [...s.cartLines, line], flashId: line.id };
    }),

  incLine: (id) =>
    set((s) => ({
      cartLines: s.cartLines.map((l) =>
        l.id === id ? { ...l, quantite: l.quantite + 1 } : l
      ),
    })),

  decLine: (id) =>
    set((s) => {
      const line = s.cartLines.find((l) => l.id === id);
      if (!line) return {};
      if (line.quantite <= 1) {
        return { cartLines: s.cartLines.filter((l) => l.id !== id) };
      }
      return {
        cartLines: s.cartLines.map((l) =>
          l.id === id ? { ...l, quantite: l.quantite - 1 } : l
        ),
      };
    }),

  removeLine: (id) =>
    set((s) => ({ cartLines: s.cartLines.filter((l) => l.id !== id) })),

  setQty: (id, qty) =>
    set((s) => ({
      cartLines: s.cartLines
        .map((l) =>
          l.id === id ? { ...l, quantite: Math.max(0, Math.trunc(qty)) } : l
        )
        .filter((l) => l.quantite > 0),
    })),

  toggleExpress: (id) =>
    set((s) => {
      const cartLines = s.cartLines.map((l) =>
        l.id === id ? { ...l, express: !l.express } : l
      );
      // Raccourcit la date de retrait si un article devient Express.
      return {
        cartLines,
        dateRetrait: recomputeRetraitFromState(s.dateDepot, cartLines),
      };
    }),

  setLineNote: (id, note) =>
    set((s) => ({
      cartLines: s.cartLines.map((l) =>
        l.id === id ? { ...l, note: note || undefined } : l
      ),
    })),

  clearCart: () =>
    set((s) => ({
      cartLines: [],
      paye: 0,
      methodePaiement: null,
      referencePaiement: "",
      remiseType: "aucune",
      remiseValeur: 0,
      notes: "",
      submitError: null,
    })),

  setClient: (c) => set({ client: c, clientPassage: false }),
  setClientPassage: (v) =>
    set((s) =>
      v
        ? { clientPassage: true, client: null }
        : { clientPassage: false }
    ),

  setDateDepot: (iso) =>
    set((s) => ({
      dateDepot: iso,
      dateRetrait: recomputeRetraitFromState(iso, s.cartLines),
    })),
  setDateRetrait: (iso) => set({ dateRetrait: iso }),
  shiftRetrait: (hours) =>
    set((s) => {
      const base = new Date(s.dateDepot);
      const next = new Date(base.getTime() + hours * 3600 * 1000);
      return { dateRetrait: next.toISOString() };
    }),
  recomputeRetrait: () =>
    set((s) => ({
      dateRetrait: recomputeRetraitFromState(s.dateDepot, s.cartLines),
    })),

  setRemiseType: (t) => set({ remiseType: t }),
  setRemiseValeur: (v) => set({ remiseValeur: Math.max(0, Math.trunc(v)) }),
  setPaye: (v) =>
    set(() => {
      const paye = Math.max(0, Math.trunc(v));
      // Si le montant payé retombe à 0, on efface la méthode de paiement.
      return { paye, methodePaiement: paye > 0 ? get().methodePaiement : null };
    }),
  setMethodePaiement: (m) => set({ methodePaiement: m }),
  setReferencePaiement: (r) => set({ referencePaiement: r }),
  setNotes: (n) => set({ notes: n }),

  setContext: (pressingLabel, agentLabel) => set({ pressingLabel, agentLabel }),
  setSubmitting: (v) => set({ submitting: v }),
  setSubmitError: (e) => set({ submitError: e }),
  setCommandeCree: (c) => set({ commandeCree: c }),

  initSession: () =>
    set((s) => {
      // N'initialise qu'une seule fois (évite d'écraser si déjà fait).
      if (s.reference) return {};
      const n = new Date();
      return {
        reference: generateReference(n),
        dateDepot: n.toISOString(),
        dateRetrait: computeDateRetrait(n, false).toISOString(),
        // Panier VIDE par défaut au montage/rafraîchissement.
        // L'opérateur ajoute lui-même les articles en cliquant sur les cartes.
        cartLines: [],
      };
    }),

  reset: () =>
    set(() => {
      const n = new Date();
      return {
        cartLines: [],
        client: null,
        clientPassage: false,
        dateDepot: n.toISOString(),
        dateRetrait: computeDateRetrait(n, false).toISOString(),
        remiseType: "aucune",
        remiseValeur: 0,
        paye: 0,
        methodePaiement: null,
        referencePaiement: "",
        notes: "",
        reference: generateReference(n),
        submitting: false,
        submitError: null,
        commandeCree: null,
        searchQuery: "",
        activeCategorie: "tous",
      };
    }),
}));
