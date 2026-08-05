/**
 * <PosCaisse /> — Orchestrateur de l'écran POS / Caisse OgPressing.
 * ================================================================
 * Assemble les 13 composants POS selon la structure de l'interface de
 * référence (catalogue à gauche, commande à droite, en-tête + boutons).
 *
 * - État partagé via le store Zustand (survit aux dialogues + erreurs réseau).
 * - Données via la couche `data.ts` (API Supabase + repli mock).
 * - Calculs via les fonctions pures de `calc.ts`.
 * - Raccourcis clavier comptoir : F2 (recherche article), F3 (recherche
 *   client), F9 (valider), Échap (vider la recherche).
 * - Validation anti double-clic (loading + désactivation).
 * - Confirmation de succès avec numéro de commande + impression étiquettes.
 *
 * Adapté à l'application OgPressing : POST /api/admin/commandes (Supabase,
 * RLS multi-tenant). Aucun paiement en ligne — uniquement déclaratif.
 */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  CheckCircle2,
  Printer,
  Plus,
  ShoppingCart,
  Eye,
} from "lucide-react";

import { usePosStore } from "@/lib/pos/store";
import {
  getArticles,
  getCategories,
  getCatalogueCategories,
  createCommande,
} from "@/lib/pos/data";
import { computeFinance, computeTotalEtiquettes } from "@/lib/pos/calc";
import type {
  PosArticle,
  PosCartLine,
  PosCatalogueCategorie,
  PosCategorie,
  PosClient,
  PosCommandeCree,
} from "@/lib/pos/types";
import { formatFcfa, formatDateTime } from "@/lib/pos/format";

import { PosHeader } from "./pos-header";
import { ArticleSearchBar } from "./article-search-bar";
import { CatalogueCategoryBar } from "./catalogue-category-bar";
import { ProductGrid } from "./product-grid";
import { CategoryBar } from "./category-bar";
import { OrderTable } from "./order-table";
import { CustomerPanel } from "./customer-panel";
import { DatePanel } from "./date-panel";
import { PaymentSummary } from "./payment-summary";
import { ActionButtons } from "./action-buttons";

interface PosCaisseProps {
  /** Chemin de base pour les liens de retour (ex: /personnel/receptionniste). */
  basePath?: string;
}

export function PosCaisse({ basePath }: PosCaisseProps) {
  const { toast } = useToast();
  const s = usePosStore();

  // Refs pour les raccourcis clavier (focus).
  const articleSearchRef = useRef<HTMLInputElement | null>(null);
  const clientSearchRef = useRef<HTMLInputElement | null>(null);

  // États locaux UI (ne survivent pas nécessairement — mais le panier oui).
  const [categories, setCategories] = useState<PosCategorie[]>([]);
  // 9 catégories du catalogue global (Vêtements traités, Linge de maison, …).
  const [catalogueCategories, setCatalogueCategories] = useState<
    PosCatalogueCategorie[]
  >([]);
  // Filtre actif par catégorie de catalogue ("tous" = aucun filtre).
  const [activeCatalogueCategorie, setActiveCatalogueCategorie] = useState<
    string | "tous"
  >("tous");
  const [confirmAnnuler, setConfirmAnnuler] = useState(false);
  const [newClientOpen, setNewClientOpen] = useState(false);
  const [newClient, setNewClient] = useState({
    nom: "",
    telephone: "",
    commune: "",
  });
  const [newClientLoading, setNewClientLoading] = useState(false);
  const [passageTelephone, setPassageTelephone] = useState("");
  const [showMobileCart, setShowMobileCart] = useState(false);

  // ---------- Chargement initial du catalogue ----------
  // ⚠️ Utilise usePosStore.getState() pour les setters afin de garder la
  // callback stable (sinon dépendance sur `s` → boucle infinie d'effets).
  const loadArticles = useCallback(async () => {
    const store = usePosStore.getState();
    store.setLoadingArticles(true);
    const [{ articles, source }, cats, catalogueCats] = await Promise.all([
      getArticles(),
      getCategories(),
      getCatalogueCategories(),
    ]);
    store.setArticles(articles, source);
    setCategories(cats);
    setCatalogueCategories(catalogueCats);
    if (source === "mock") {
      toast({
        title: "Mode démonstration",
        description:
          "Catalogue fictif affiché (aucun service configuré sur ce pressing).",
      });
    }
  }, [toast]);

  useEffect(() => {
    // Initialise les valeurs dépendant du temps côté client (anti mismatch SSR).
    usePosStore.getState().initSession();
    loadArticles();
  }, [loadArticles]);

  // ---------- Synchronisation auto avec le module « Tarifs par article » ----------
  // Lorsque l'administrateur modifie un tarif dans /admin/tarifs (souvent dans
  // un onglet séparé) et revient sur l'onglet POS, on recharge automatiquement
  // les articles pour refléter les nouveaux prix. Cela garantit que le POS est
  // toujours synchronisé avec la dernière configuration tarifaire, sans que
  // l'utilisateur n'ait à cliquer manuellement sur le bouton refresh.
  useEffect(() => {
    let lastReload = Date.now();
    const MIN_INTERVAL_MS = 5000; // anti-rafaîchissement excessif (throttle 5s)

    const reloadIfStale = () => {
      const now = Date.now();
      if (now - lastReload < MIN_INTERVAL_MS) return;
      lastReload = now;
      // Recharge silencieusement (sans toast « mode démonstration » même si mock).
      // On appelle getArticles() directement pour éviter le toast du loadArticles().
      void (async () => {
        try {
          const [{ articles, source }, cats, catalogueCats] = await Promise.all([
            getArticles(),
            getCategories(),
            getCatalogueCategories(),
          ]);
          const store = usePosStore.getState();
          store.setArticles(articles, source);
          setCategories(cats);
          setCatalogueCategories(catalogueCats);
        } catch {
          /* silent — on garde les données existantes */
        }
      })();
    };

    // L'utilisateur revient sur l'onglet POS (après avoir edité les tarifs).
    const onFocus = () => reloadIfStale();
    // L'onglet redevient visible (cas multi-fenêtres).
    const onVisibility = () => {
      if (document.visibilityState === "visible") reloadIfStale();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  // ---------- Raccourcis clavier comptoir ----------
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // F2 : focus recherche article
      if (e.key === "F2") {
        e.preventDefault();
        articleSearchRef.current?.focus();
      }
      // F3 : focus recherche client
      else if (e.key === "F3") {
        e.preventDefault();
        clientSearchRef.current?.focus();
      }
      // F9 : valider
      else if (e.key === "F9") {
        e.preventDefault();
        // Ne déclenche que si validation possible.
        const can = s.cartLines.length > 0 && !s.submitting;
        if (can) void handleValider();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [s.cartLines, s.submitting, s.client, s.clientPassage, passageTelephone, s.paye, s.methodePaiement]);

  // ---------- Calculs financiers (fonction pure) ----------
  const finance = useMemo(
    () =>
      computeFinance({
        lines: s.cartLines,
        remiseType: s.remiseType,
        remiseValeur: s.remiseValeur,
        paye: s.paye,
      }),
    [s.cartLines, s.remiseType, s.remiseValeur, s.paye]
  );

  const etiquettes = useMemo(
    () => computeTotalEtiquettes(s.cartLines),
    [s.cartLines]
  );

  // Quantité par article (pour les badges compteur sur les cartes).
  const quantiteParArticle = useMemo(() => {
    const map: Record<string, number> = {};
    for (const l of s.cartLines) {
      map[l.article.id] = (map[l.article.id] ?? 0) + l.quantite;
    }
    return map;
  }, [s.cartLines]);

  // ---------- Validation ----------
  const canValidate =
    s.cartLines.length > 0 &&
    !s.submitting &&
    (s.client !== null ||
      (s.clientPassage && passageTelephone.trim().length >= 8)) &&
    // Si un paiement est saisi, la méthode est obligatoire.
    (s.paye <= 0 || s.methodePaiement !== null);

  async function handleValider() {
    if (!canValidate) {
      toast({
        title: "Validation impossible",
        description: !s.client && !s.clientPassage
          ? "Sélectionnez un client ou activez le client de passage."
          : s.cartLines.length === 0
            ? "Ajoutez au moins un article."
            : "Veuillez compléter les informations manquantes.",
        variant: "destructive",
      });
      return;
    }

    s.setSubmitting(true);
    s.setSubmitError(null);

    try {
      // Résout le client_id (crée un client de passage si nécessaire).
      let clientId = s.client?.id ?? "";
      if (!clientId && s.clientPassage) {
        const created = await createPassageClient(passageTelephone.trim());
        clientId = created.id;
      }
      if (!clientId) throw new Error("Client requis.");

      const payload = {
        client_id: clientId,
        date_pret_prevue: s.dateRetrait,
        notes: s.notes.trim() || undefined,
        articles: s.cartLines.map((l) => ({
          service_id: l.article.service_id,
          // UUID réel du catalogue_articles (résolu côté data.ts depuis
          // /api/public/catalogue-articles). La source de vérité DB reste
          // service_id — l'UUID catalogue sert de FK pour les articles_vetements.
          catalogue_article_id: l.article.catalogue_article_id,
          catalogue_article_nom: l.article.catalogue_nom,
          couleur: l.couleur ?? "autre",
          etat: l.etat ?? "correct",
          description_etat: l.note,
          quantite: l.quantite,
        })),
        remise:
          s.remiseType !== "aucune" && s.remiseValeur > 0
            ? { type: s.remiseType, valeur: s.remiseValeur }
            : undefined,
        acompte:
          s.paye > 0 && s.methodePaiement
            ? {
                montant: s.paye,
                methode: s.methodePaiement,
                reference: s.referencePaiement.trim() || undefined,
              }
            : undefined,
      };

      const created = await createCommande(payload);
      s.setCommandeCree(created);
      toast({
        title: "Commande créée",
        description: `${created.numero_commande} — ${formatFcfa(created.montant_total)}`,
      });
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Échec de la création.";
      s.setSubmitError(msg);
      toast({
        title: "Échec de la validation",
        description: msg + " Le panier a été conservé.",
        variant: "destructive",
      });
    } finally {
      s.setSubmitting(false);
    }
  }

  // Crée un client de passage (nom auto, téléphone fourni).
  async function createPassageClient(tel: string): Promise<PosClient> {
    const res = await fetch("/api/admin/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nom_complet: `Client de passage ${tel.slice(-4)}`,
        telephone: tel,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.success) {
      throw new Error(
        typeof json?.error === "string"
          ? json.error
          : "Impossible de créer le client de passage."
      );
    }
    const c = json.data;
    return {
      id: c.id,
      nom: c.nom_complet ?? "Client de passage",
      telephone: c.telephone ?? tel,
      email: c.email ?? null,
      commune: c.commune ?? null,
      solde_impaye: 0,
    };
  }

  // ---------- Nouveau client ----------
  async function handleCreateClient() {
    if (!newClient.nom.trim() || !newClient.telephone.trim()) {
      toast({
        title: "Champs requis",
        description: "Le nom et le téléphone sont obligatoires.",
        variant: "destructive",
      });
      return;
    }
    setNewClientLoading(true);
    try {
      const res = await fetch("/api/admin/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nom_complet: newClient.nom.trim(),
          telephone: newClient.telephone.trim(),
          adresse: newClient.commune.trim() || undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.success) {
        throw new Error(
          typeof json?.error === "string" ? json.error : "Échec création client."
        );
      }
      const c = json.data;
      s.setClient({
        id: c.id,
        nom: c.nom_complet,
        telephone: c.telephone,
        email: c.email ?? null,
        commune: c.commune ?? null,
        solde_impaye: 0,
      });
      setNewClientOpen(false);
      setNewClient({ nom: "", telephone: "", commune: "" });
      toast({ title: "Client créé", description: c.nom_complet });
    } catch (err) {
      toast({
        title: "Échec création client",
        description: err instanceof Error ? err.message : "Erreur inconnue.",
        variant: "destructive",
      });
    } finally {
      setNewClientLoading(false);
    }
  }

  // ---------- Annuler ----------
  function handleAnnuler() {
    s.clearCart();
    s.setClient(null);
    setPassageTelephone("");
    s.setClientPassage(false);
    setConfirmAnnuler(false);
    toast({ title: "Commande annulée", description: "Le panier a été vidé." });
  }

  // ---------- Après succès : nouvelle commande ----------
  function handleNouvelleCommande() {
    s.reset();
    setPassageTelephone("");
    // Réinitialise aussi le filtre par catégorie de catalogue (parité avec
    // s.reset() qui remet activeCategorie à "tous" côté store).
    setActiveCatalogueCategorie("tous");
    loadArticles();
  }

  // ---------- Écran de confirmation (succès) ----------
  if (s.commandeCree) {
    return (
      <ConfirmationScreen
        commande={s.commandeCree}
        etiquettes={etiquettes}
        basePath={basePath}
        onNouvelle={handleNouvelleCommande}
      />
    );
  }

  const totalArticles = s.cartLines.reduce((n, l) => n + l.quantite, 0);

  return (
    <div className="pos-root flex h-full min-h-0 flex-col overflow-hidden bg-[var(--pos-bg)]">
      {/* En-tête */}
      <PosHeader
        reference={s.reference}
        montantTotal={finance.net_a_payer}
        pressingLabel={s.pressingLabel}
        agentLabel={s.agentLabel}
      />

      {/* Corps : 2 colonnes (desktop) / empilé (mobile) */}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* ===== COLONNE GAUCHE — Catalogue ===== */}
        <section className="flex min-h-0 flex-col border-b border-[var(--pos-border)] lg:w-[51%] lg:border-b-0 lg:border-r">
          <div className="p-2 pb-0">
            <ArticleSearchBar
              query={s.searchQuery}
              mode={s.searchMode}
              loading={s.loadingArticles}
              onQueryChange={s.setSearchQuery}
              onModeChange={s.setSearchMode}
              onRefresh={loadArticles}
              registerRef={(el) => (articleSearchRef.current = el)}
            />
          </div>
          {/*
            Barre de filtre par catégorie de catalogue (Vêtements, Linge, …).
            Indépendante de la <CategoryBar /> ci-dessous (qui filtre par type
            de service) : les deux dimensions se combinent (ET logique).
            Toujours rendue (comme la CategoryBar) : tant que les catégories
            ne sont pas chargées, seul "Tous" est visible — pas de saut de
            layout lors de l'hydratation.
          */}
          <CatalogueCategoryBar
            categories={catalogueCategories}
            active={activeCatalogueCategorie}
            onSelect={setActiveCatalogueCategorie}
          />
          <ProductGrid
            articles={s.articles}
            query={s.searchQuery}
            activeCategorie={s.activeCategorie}
            activeCatalogueCategorie={activeCatalogueCategorie}
            quantiteParArticle={quantiteParArticle}
            flashId={s.flashId}
            onAdd={(a: PosArticle) => s.addArticle(a)}
          />
          <CategoryBar
            categories={categories}
            active={s.activeCategorie}
            onSelect={s.setActiveCategorie}
          />
        </section>

        {/* ===== COLONNE DROITE — Commande ===== */}
        <section className="pos-scroll flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2 lg:w-[49%]">
          <OrderTable
            lines={s.cartLines}
            flashId={s.flashId}
            onInc={s.incLine}
            onDec={s.decLine}
            onRemove={s.removeLine}
            onQty={s.setQty}
            onToggleExpress={s.toggleExpress}
            onNote={s.setLineNote}
          />

          <CustomerPanel
            client={s.client}
            clientPassage={s.clientPassage}
            passageTelephone={passageTelephone}
            onPick={s.setClient}
            onClear={() => s.setClient(null)}
            onPassage={(v) => {
              s.setClientPassage(v);
              if (v) setPassageTelephone("");
            }}
            onPassageTelephone={setPassageTelephone}
            onNewClient={() => setNewClientOpen(true)}
            onViewClient={() => {
              toast({
                title: "Fiche client",
                description: "Ouverture de la fiche client (à venir).",
              });
            }}
            registerSearchRef={(el) => (clientSearchRef.current = el)}
          />

          <DatePanel
            dateDepot={s.dateDepot}
            dateRetrait={s.dateRetrait}
            onDepotChange={s.setDateDepot}
            onRetraitChange={s.setDateRetrait}
            onShift={s.shiftRetrait}
          />

          <PaymentSummary
            sousTotal={finance.sous_total}
            remiseType={s.remiseType}
            remiseValeur={s.remiseValeur}
            remiseMontant={finance.remise_montant}
            netAPayer={finance.net_a_payer}
            paye={finance.paye}
            reste={finance.reste}
            statut={finance.statut}
            methode={s.methodePaiement}
            reference={s.referencePaiement}
            onRemiseType={s.setRemiseType}
            onRemiseValeur={s.setRemiseValeur}
            onPaye={s.setPaye}
            onMethode={s.setMethodePaiement}
            onReference={s.setReferencePaiement}
          />

          {/* Erreur réseau (panier conservé) */}
          {s.submitError && (
            <div className="rounded border border-[var(--pos-danger)] bg-[#FDECEC] px-2 py-1.5 text-[11px] text-[var(--pos-danger)]">
              {s.submitError}
            </div>
          )}

          <ActionButtons
            submitting={s.submitting}
            canValidate={canValidate}
            onAnnuler={() => {
              if (s.cartLines.length > 0) setConfirmAnnuler(true);
              else handleAnnuler();
            }}
            onValider={handleValider}
          />
        </section>
      </div>

      {/* ===== Barre flottante mobile ===== */}
      {totalArticles > 0 && (
        <div className="pos-mobile-bar fixed inset-x-0 bottom-0 z-30 flex items-center justify-between px-3 py-2 lg:hidden">
          <button
            type="button"
            onClick={() => setShowMobileCart((v) => !v)}
            className="flex items-center gap-2 text-[13px] font-medium"
          >
            <ShoppingCart className="h-4 w-4" />
            {totalArticles} article{totalArticles > 1 ? "s" : ""}
            <Eye className="h-3.5 w-3.5" />
          </button>
          <span className="pos-mono text-[14px] font-bold">
            {formatFcfa(finance.net_a_payer)}
          </span>
        </div>
      )}

      {/* ===== Dialog confirmation annulation ===== */}
      <AlertDialog open={confirmAnnuler} onOpenChange={setConfirmAnnuler}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Annuler la commande ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action va vider le panier ({totalArticles} article
              {totalArticles > 1 ? "s" : ""}, {formatFcfa(finance.net_a_payer)}).
              Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Retour</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleAnnuler}
              className="bg-[var(--pos-danger)] text-white hover:bg-[var(--pos-danger-dark)]"
            >
              Oui, annuler
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ===== Dialog nouveau client ===== */}
      <Dialog open={newClientOpen} onOpenChange={setNewClientOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Nouveau client</DialogTitle>
            <DialogDescription>
              Créez un client rapidement sans perdre le panier en cours.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-1">
            <div className="space-y-1">
              <Label htmlFor="nc-nom" className="text-[12px]">
                Nom complet *
              </Label>
              <Input
                id="nc-nom"
                value={newClient.nom}
                onChange={(e) =>
                  setNewClient((p) => ({ ...p, nom: e.target.value }))
                }
                placeholder="Ex : Awa Koné"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="nc-tel" className="text-[12px]">
                Téléphone *
              </Label>
              <Input
                id="nc-tel"
                value={newClient.telephone}
                onChange={(e) =>
                  setNewClient((p) => ({ ...p, telephone: e.target.value }))
                }
                placeholder="07 07 07 07 07"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="nc-commune" className="text-[12px]">
                Commune
              </Label>
              <Input
                id="nc-commune"
                value={newClient.commune}
                onChange={(e) =>
                  setNewClient((p) => ({ ...p, commune: e.target.value }))
                }
                placeholder="Cocody"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setNewClientOpen(false)}
              disabled={newClientLoading}
            >
              Annuler
            </Button>
            <Button onClick={handleCreateClient} disabled={newClientLoading}>
              {newClientLoading ? "Création…" : "Créer le client"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================
// Écran de confirmation (succès validation)
// ============================================================

interface ConfirmationScreenProps {
  commande: PosCommandeCree;
  etiquettes: number;
  basePath?: string;
  onNouvelle: () => void;
}

function ConfirmationScreen({
  commande,
  etiquettes,
  basePath,
  onNouvelle,
}: ConfirmationScreenProps) {
  const commandesPath = basePath ? `${basePath}/commandes` : "/admin/commandes";
  return (
    <div className="pos-root flex min-h-screen flex-col items-center justify-center bg-[var(--pos-bg)] p-4">
      <div className="pos-panel w-full max-w-md p-6 text-center">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-[#E7F6EC]">
          <CheckCircle2 className="h-8 w-8 text-[var(--pos-green)]" />
        </div>
        <h2 className="text-[18px] font-bold text-[var(--pos-text)]">
          Commande enregistrée
        </h2>
        <p className="mt-1 text-[12px] text-[var(--pos-text-muted)]">
          La commande a été créée avec succès.
        </p>

        <div className="mt-4 space-y-1.5 rounded border border-[var(--pos-border)] bg-[var(--pos-primary-50)] p-3 text-left">
          <div className="flex justify-between text-[12px]">
            <span className="text-[var(--pos-text-muted)]">Numéro :</span>
            <span className="pos-mono font-bold text-[var(--pos-primary)]">
              {commande.numero_commande}
            </span>
          </div>
          <div className="flex justify-between text-[12px]">
            <span className="text-[var(--pos-text-muted)]">Montant :</span>
            <span className="pos-mono font-bold text-[var(--pos-danger)]">
              {formatFcfa(commande.montant_total)}
            </span>
          </div>
          <div className="flex justify-between text-[12px]">
            <span className="text-[var(--pos-text-muted)]">Statut :</span>
            <span className="font-semibold capitalize">
              {commande.statut_paiement}
            </span>
          </div>
          <div className="flex justify-between text-[12px]">
            <span className="text-[var(--pos-text-muted)]">Étiquettes :</span>
            <span className="pos-mono font-semibold">
              {etiquettes} à imprimer
            </span>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-2">
          <Button
            onClick={() => window.print()}
            className="pos-btn-validate h-10"
          >
            <Printer className="mr-2 h-4 w-4" />
            Imprimer les étiquettes
          </Button>
          <Button onClick={onNouvelle} variant="outline" className="h-10">
            <Plus className="mr-2 h-4 w-4" />
            Nouvelle commande
          </Button>
          <a
            href={commandesPath}
            className="mt-1 block text-center text-[12px] text-[var(--pos-primary)] hover:underline"
          >
            Retour aux commandes
          </a>
        </div>
      </div>
    </div>
  );
}

// Référence inutilisée pour éviter le tree-shaking du type PosCartLine (debug).
export type { PosCartLine };
