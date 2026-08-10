/**
 * OgPressing — CommandeDetail (client component, LOT 7.6 + CASIER-FIX-V1)
 * ----------------------------------------------------------------------
 * Composant interactif de la page /admin/commandes/[id]. Reçoit le détail
 * complet de la commande (fetch côté Server Component via Supabase) et
 * gère :
 *   - Affichage read-only de toutes les infos (client, stats, articles,
 *     paiements, notes, dates)
 *   - Édition inline du statut de chaque article (Select → PATCH
 *     /api/admin/commandes/[id]/articles/[articleId]) avec filtrage
 *     dynamique des options selon le workflow (getAllowedNextStatutsArticle).
 *   - Gestion des casiers de stockage (CASIER-FIX-V1) :
 *       • Badge casier (icône Archive + code) sur chaque article rangé
 *         (zone_stockage non-null).
 *       • Dialog de saisie du code casier au passage à "pret".
 *       • Bouton "Libérer le casier" (PATCH zone_stockage=null).
 *   - Boutons "Imprimer le ticket" et "Imprimer les étiquettes"
 *     (window.open + HTML, helpers dans `commande-print.ts`)
 *
 * Ne fait aucun fetch au montage : toutes les données sont passées en props
 * par le Server Component parent. Seules les mises à jour de statut article
 * déclenchent un fetch (PATCH).
 */
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  CreditCard,
  HandCoins,
  Loader2,
  Mail,
  MapPin,
  Package,
  Phone,
  Printer,
  Receipt,
  StickyNote,
  User,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/shared/status-badge";
import { Separator } from "@/components/ui/separator";
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
import { toast } from "sonner";
import { formatFCFA, formatDate, formatDateOnly } from "@/lib/utils/format";
import {
  ETAT_LABELS,
  ETAT_VARIANT,
} from "@/components/ogpressing/admin/commande-wizard/article-labels";
import {
  getAllowedNextStatutsArticle,
  STATUTS_ARTICLE,
} from "@/lib/workflow/commande-statut";
import {
  STATUT_LABELS,
  STATUT_PAIEMENT_LABELS,
  statutPaiementVariant,
  statutVariant,
} from "./commandes-helpers";
import {
  articleDescription,
  methodePaiementLabel,
  printCommandeLabels,
  printCommandeTicket,
  type CommandeDetail as CommandeDetailData,
} from "./commande-print";

interface CommandeDetailProps {
  commande: CommandeDetailData;
  /** Base path for navigation links. Defaults to "/admin".
   *  Links are constructed as `${basePath}/commandes` (back) and
   *  `${basePath}/clients/{id}` (client detail). */
  basePath?: string;
  /** Rôle du personnel connecté (ex: "manager", "receptionniste", ...).
   *  Si "manager", les options du Select de statut article ne sont pas
   *  filtrées par le workflow (override autorisé côté backend).
   *  Optionnel : si non fourni, le filtrage workflow standard s'applique
   *  (matrice TRANSITIONS_ARTICLE_AUTORISEES). */
  role?: string;
}

/**
 * Toutes les options de statut article (libellés FR), dérivées du module
 * workflow. Utilisé comme source, puis filtré dynamiquement pour chaque
 * article via `getAllowedNextStatutsArticle(a.statut, role)`.
 */
const ALL_STATUT_ARTICLE_OPTIONS = STATUTS_ARTICLE.map((s) => ({
  value: s,
  label: STATUT_LABELS[s] ?? s,
}));

/** Regex de validation du code casier côté UI (1-10 alphanumériques).
 *  En harmonie avec la validation backend (chk_zone_stockage_format). */
const ZONE_STOCKAGE_REGEX = /^[A-Za-z0-9]{1,10}$/;

export function CommandeDetail({
  commande,
  basePath = "/admin",
  role,
}: CommandeDetailProps) {
  // Copie locale des articles pour refléter les mises à jour de statut
  // sans devoir refetch toute la commande.
  const [articles, setArticles] = useState(commande.articles);
  // ⚠️ FIX BUG-AUDIT-RUNTIME #3 (P1) : synchronise la copie locale quand la
  // prop `commande` change (navigation A→B sans démonture du composant dans
  // le router App de Next.js). Sans cet effet, les articles de la commande A
  // restaient affichés sur la commande B.
  useEffect(() => {
    setArticles(commande.articles);
  }, [commande.articles]);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // État du dialog de saisie du casier (ouvert quand l'utilisateur
  // sélectionne "pret" dans le Select de statut d'un article). On ne
  // PATCH pas immédiatement : on ouvre le dialog pour demander le code
  // casier, puis on PATCH au clic sur "Confirmer" ou "Passer sans casier".
  const [casierDialogArticleId, setCasierDialogArticleId] = useState<
    string | null
  >(null);
  const [casierInputValue, setCasierInputValue] = useState("");
  const [casierSubmitLoading, setCasierSubmitLoading] = useState(false);

  // ---- Quick actions : Encaisser / Marquer comme retirée ----
  // Rôle effectif dérivé du `basePath` (toujours présent) — surcharge par
  // la prop `role` si fournie. Utilisé pour conditionner l'affichage des
  // boutons d'action rapide conformément à la matrice PRD §3.4.
  const effectiveRole =
    role ??
    (basePath.startsWith("/personnel/")
      ? basePath.split("/")[2] // ex: "manager", "receptionniste", ...
      : "admin");

  const canEncaisser = ["admin", "manager", "caissier", "super_admin"].includes(
    effectiveRole
  );
  const canRetirer = [
    "admin",
    "manager",
    "receptionniste",
    "caissier",
    "super_admin",
  ].includes(effectiveRole);

  // La commande peut être marquée comme « retirée » uniquement si elle est
  // `pret` (le client vient la chercher au pressing) ou `en_livraison` (le
  // client change d'avis et vient la chercher au pressing au lieu de se la
  // faire livrer — cf. PRD §6.4).
  const canMarquerRetire =
    canRetirer &&
    (commande.statut === "pret" || commande.statut === "en_livraison");

  // Le bouton « Encaisser » n'a de sens que si la commande n'est pas
  // entièrement payée.
  const canShowEncaisser =
    canEncaisser && commande.statut_paiement !== "paye";

  const [retirerDialogOpen, setRetirerDialogOpen] = useState(false);
  const [retirerLoading, setRetirerLoading] = useState(false);

  /**
   * POST /api/admin/commandes/[id]/retirer — marque la commande comme
   * « retirée » (tous les articles passent à `retire`, `commande.statut`
   * devient `retire`, `date_retrait` est renseignée). Endpoint ajouté par
   * l'Agent A (FIX-WAVE1-A).
   */
  async function handleRetirerCommande() {
    setRetirerLoading(true);
    try {
      const res = await fetch(
        `/api/admin/commandes/${commande.id}/retirer`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(
          data.error ||
            `Échec du retrait (HTTP ${res.status}). Réessayez ou marquez les articles individuellement.`
        );
      }
      toast.success("Commande marquée comme retirée", {
        description: `Le client a récupéré ses articles — n° ${commande.numero_commande}.`,
      });
      setRetirerDialogOpen(false);
      // Recharge la page pour refléter le nouveau statut + date_retrait.
      if (typeof window !== "undefined") {
        window.location.reload();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur inconnue";
      toast.error("Échec du retrait", { description: msg });
    } finally {
      setRetirerLoading(false);
    }
  }

  // Article actuellement ciblé par le dialog casier (null si dialog fermé).
  const casierDialogArticle = useMemo(
    () =>
      casierDialogArticleId
        ? articles.find((a) => a.id === casierDialogArticleId) ?? null
        : null,
    [articles, casierDialogArticleId]
  );

  // Map ligne_id → service.nom pour afficher le service de chaque article
  const ligneServiceMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of commande.lignes) {
      m.set(l.id, l.service?.nom ?? "—");
    }
    return m;
  }, [commande.lignes]);

  const resteAPayer = Math.max(0, commande.montant_total - commande.montant_paye);
  const totalAvantRemise =
    commande.montant_total_avant_remise ??
    commande.lignes.reduce((s, l) => s + l.prix_unitaire * l.quantite, 0);
  const remiseMontant = commande.montant_remise ?? Math.max(0, totalAvantRemise - commande.montant_total);

  /**
   * PATCH centralisé vers /api/admin/commandes/[id]/articles/[articleId].
   * Gère la mise à jour locale de l'article à partir de la réponse serveur
   * (statut, zone_stockage, date_rangeement) + toast succès/erreur.
   *
   * @param articleId      ID de l'article à mettre à jour.
   * @param payload        Body JSON ({ statut, zone_stockage? }).
   * @param successMessage Message de toast (ou null pour le défaut).
   */
  async function patchArticle(
    articleId: string,
    payload: { statut: string; zone_stockage?: string | null },
    successMessage?: { title: string; description?: string }
  ): Promise<boolean> {
    setUpdatingId(articleId);
    try {
      const res = await fetch(
        `/api/admin/commandes/${commande.id}/articles/${articleId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Échec de la mise à jour");
      }
      // Met à jour l'article localement à partir de la réponse serveur.
      // Si le serveur a libéré le casier (zone_stockage: null), on vide
      // aussi date_rangeement et range_par côté UI pour rester cohérent.
      const updated = data.data ?? {};
      const newZoneStockage =
        updated.zone_stockage === undefined ? undefined : updated.zone_stockage;
      const casierFreed = newZoneStockage === null;
      setArticles((prev) =>
        prev.map((a) =>
          a.id === articleId
            ? {
                ...a,
                statut: updated.statut ?? a.statut,
                zone_stockage:
                  newZoneStockage === undefined
                    ? a.zone_stockage
                    : newZoneStockage,
                date_rangeement:
                  newZoneStockage === undefined
                    ? a.date_rangeement
                    : casierFreed
                      ? null
                      : (updated.date_rangeement ?? a.date_rangeement),
                range_par:
                  newZoneStockage === undefined
                    ? a.range_par
                    : casierFreed
                      ? null
                      : a.range_par,
              }
            : a
        )
      );
      toast.success(
        successMessage?.title ?? "Statut de l'article mis à jour",
        {
          description:
            successMessage?.description ??
            `Nouveau statut : ${
              STATUT_LABELS[updated.statut as string] ?? updated.statut
            }`,
        }
      );
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur inconnue";
      toast.error("Échec de la mise à jour", { description: msg });
      return false;
    } finally {
      setUpdatingId(null);
    }
  }

  /**
   * Handler du Select de statut article. Si la cible est "pret", on
   * n'appelle pas immédiatement le PATCH : on ouvre le dialog de saisie
   * du casier. L'utilisateur pourra alors :
   *   - saisir un code casier puis "Confirmer" (PATCH pret + zone_stockage)
   *   - cliquer "Passer sans casier" (PATCH pret sans zone_stockage)
   *   - annuler (ferme le dialog, ne PATCH pas — le Select revient à sa
   *     valeur initiale car `value` est lié à `a.statut` non modifié).
   *
   * Pour tous les autres statuts, on PATCH directement (le backend
   * libérera automatiquement le casier pour "retire" / "livre").
   */
  function handleArticleStatutChange(articleId: string, newStatut: string) {
    if (newStatut === "pret") {
      const article = articles.find((a) => a.id === articleId);
      // Pré-remplit l'input avec le casier actuel si l'article en a déjà un
      // (cas : re-passage à "pret" alors qu'un casier est déjà assigné).
      setCasierInputValue(article?.zone_stockage ?? "");
      setCasierDialogArticleId(articleId);
      return;
    }
    void patchArticle(articleId, { statut: newStatut });
  }

  /** Confirme l'assignation d'un casier à l'article du dialog. */
  async function handleCasierConfirm() {
    if (!casierDialogArticleId) return;
    const raw = casierInputValue.trim().toUpperCase();
    if (!raw) {
      toast.error("Code casier requis", {
        description:
          "Saisissez un code casier (ex: A1) ou cliquez sur « Passer sans casier ».",
      });
      return;
    }
    if (!ZONE_STOCKAGE_REGEX.test(raw)) {
      toast.error("Code casier invalide", {
        description: "1 à 10 caractères alphanumériques (ex: A1, B2, C10).",
      });
      return;
    }
    setCasierSubmitLoading(true);
    const ok = await patchArticle(
      casierDialogArticleId,
      { statut: "pret", zone_stockage: raw },
      {
        title: "Article rangé dans le casier",
        description: `Statut : Prêt — Casier ${raw}`,
      }
    );
    setCasierSubmitLoading(false);
    if (ok) {
      setCasierDialogArticleId(null);
      setCasierInputValue("");
    }
  }

  /** Passe l'article à "pret" sans assigner de casier. */
  async function handleCasierSkip() {
    if (!casierDialogArticleId) return;
    setCasierSubmitLoading(true);
    const ok = await patchArticle(
      casierDialogArticleId,
      { statut: "pret" },
      {
        title: "Article marqué comme prêt",
        description: "Aucun casier assigné (à assigner plus tard).",
      }
    );
    setCasierSubmitLoading(false);
    if (ok) {
      setCasierDialogArticleId(null);
      setCasierInputValue("");
    }
  }

  /** Ferme le dialog sans PATCH (annulation). */
  function handleCasierClose() {
    if (casierSubmitLoading) return; // pas d'annulation pendant l'envoi
    setCasierDialogArticleId(null);
    setCasierInputValue("");
  }

  /**
   * Libère le casier d'un article "pret" sans changer son statut.
   * PATCH avec `{ statut: "pret", zone_stockage: null }`.
   *
   * ⚠️ Note : selon l'état actuel du backend (CASIER-FIX-V1-BACKEND), un
   * PATCH `statut=pret` + `zone_stockage=null` peut ne PAS libérer le
   * casier (le backend le conserve). La mise à jour locale s'appuie sur
   * la réponse serveur (`data.zone_stockage`) — si le backend ne libère
   * pas, le badge restera affiché. À corriger côté backend si nécessaire.
   */
  async function handleLibererCasier(articleId: string) {
    const ok = await patchArticle(
      articleId,
      { statut: "pret", zone_stockage: null },
      {
        title: "Casier libéré",
        description: "L'article est toujours prêt, mais plus rattaché à un casier.",
      }
    );
    if (!ok) {
      // Le toast d'erreur est déjà géré dans patchArticle.
      return;
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <Button
            variant="ghost"
            size="icon"
            asChild
            aria-label="Retour à la liste"
          >
            <Link href={`${basePath}/commandes`}>
              <ArrowLeft className="size-5" />
            </Link>
          </Button>
          <div>
            <h1 className="font-mono text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              {commande.numero_commande}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <StatusBadge
                status={commande.statut}
                label={STATUT_LABELS[commande.statut] ?? commande.statut}
                variant={statutVariant(commande.statut)}
              />
              <StatusBadge
                status={commande.statut_paiement}
                label={
                  STATUT_PAIEMENT_LABELS[commande.statut_paiement] ??
                  commande.statut_paiement
                }
                variant={statutPaiementVariant(commande.statut_paiement)}
              />
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="size-3" />
                Créée le {formatDate(commande.created_at)}
              </span>
            </div>
          </div>
        </div>

        {/* Actions impression */}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => printCommandeTicket(commande)}
          >
            <Printer className="size-4" />
            Ticket
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => printCommandeLabels(commande)}
          >
            <Printer className="size-4" />
            Étiquettes
          </Button>
        </div>
      </div>

      {/* Quick actions — Encaisser / Marquer comme retirée (PRD §3.4 + §6.4) */}
      {(canShowEncaisser || canMarquerRetire) && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="flex flex-wrap items-center gap-2 py-3">
            <span className="mr-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Actions rapides
            </span>
            {canShowEncaisser && (
              <Button asChild size="sm" variant="default">
                <Link
                  href={`/personnel/caissier/encaisser?commande=${encodeURIComponent(
                    commande.id
                  )}`}
                >
                  <HandCoins className="size-4" />
                  Encaisser
                  {resteAPayer > 0 && (
                    <span className="ml-1 font-semibold">
                      ({formatFCFA(resteAPayer)})
                    </span>
                  )}
                </Link>
              </Button>
            )}
            {canMarquerRetire && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setRetirerDialogOpen(true)}
              >
                <CheckCircle2 className="size-4" />
                Marquer comme retirée
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Client + Stats */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Client */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <User className="size-4 text-primary" />
              Client
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {commande.client ? (
              <>
                <div className="flex items-center justify-between gap-2">
                  <Link
                    href={`${basePath}/clients/${commande.client.id}`}
                    className="font-medium text-foreground hover:text-primary hover:underline"
                  >
                    {commande.client.nom_complet}
                  </Link>
                  <Badge variant="outline" className="gap-1 text-xs">
                    <Wallet className="size-3" />
                    {commande.client.points_fidelite} pts
                  </Badge>
                </div>
                <div className="flex items-center gap-3">
                  <Phone className="size-4 text-muted-foreground" />
                  <a
                    href={`tel:${commande.client.telephone}`}
                    className="font-medium text-foreground hover:text-primary"
                  >
                    {commande.client.telephone}
                  </a>
                </div>
                {commande.client.email && (
                  <div className="flex items-center gap-3">
                    <Mail className="size-4 text-muted-foreground" />
                    <a
                      href={`mailto:${commande.client.email}`}
                      className="font-medium text-foreground hover:text-primary"
                    >
                      {commande.client.email}
                    </a>
                  </div>
                )}
                {commande.client.adresse && (
                  <div className="flex items-start gap-3">
                    <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <span className="text-foreground">
                      {commande.client.adresse}
                    </span>
                  </div>
                )}
              </>
            ) : (
              <p className="text-muted-foreground">Client introuvable</p>
            )}
          </CardContent>
        </Card>

        {/* Stats financières */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CreditCard className="size-4 text-primary" />
              Finances
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Sous-total</p>
                <p className="font-semibold text-foreground">
                  {formatFCFA(totalAvantRemise)}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Remise</p>
                <p
                  className={
                    remiseMontant > 0
                      ? "font-semibold text-danger"
                      : "font-semibold text-muted-foreground"
                  }
                >
                  {remiseMontant > 0
                    ? `−${formatFCFA(remiseMontant)}`
                    : "—"}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Total</p>
                <p className="text-lg font-bold text-foreground">
                  {formatFCFA(commande.montant_total)}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Payé</p>
                <p className="font-semibold text-secondary">
                  {formatFCFA(commande.montant_paye)}
                </p>
              </div>
              <div className="col-span-2 space-y-1">
                <Separator className="my-1" />
                <p className="text-xs text-muted-foreground">Reste à payer</p>
                <p
                  className={
                    resteAPayer > 0
                      ? "text-lg font-bold text-danger"
                      : "text-lg font-bold text-secondary"
                  }
                >
                  {formatFCFA(resteAPayer)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Dates clés */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <Calendar className="size-5 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">Date de réception</p>
              <p className="text-sm font-medium text-foreground">
                {formatDateOnly(commande.date_reception)}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <Clock className="size-5 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">Retrait prévu</p>
              <p className="text-sm font-medium text-foreground">
                {formatDateOnly(commande.date_pret_prevue)}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <CheckCircle2 className="size-5 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">Retiré le</p>
              <p className="text-sm font-medium text-foreground">
                {formatDateOnly(commande.date_retrait)}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Articles */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Package className="size-4 text-primary" />
            Articles ({articles.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {articles.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Aucun article enregistré pour cette commande.
            </p>
          ) : (
            <ul className="space-y-3">
              {articles.map((a, idx) => {
                const desc = articleDescription(a);
                const etatLabel =
                  a.etat &&
                  (ETAT_LABELS[a.etat as keyof typeof ETAT_LABELS] ?? a.etat);
                const etatVariant =
                  a.etat &&
                  (ETAT_VARIANT[a.etat as keyof typeof ETAT_VARIANT] ??
                    "neutral");
                const serviceNom = a.ligne_id
                  ? ligneServiceMap.get(a.ligne_id) ?? "—"
                  : "—";
                // Filtrage dynamique des options du Select selon le workflow
                // (matrice TRANSITIONS_ARTICLE_AUTORISEES). Si `role` est
                // "manager", toutes les options sont renvoyées (override).
                const allowedStatuts = getAllowedNextStatutsArticle(
                  a.statut,
                  role
                );
                const allowedOptions = ALL_STATUT_ARTICLE_OPTIONS.filter((o) =>
                  allowedStatuts.includes(o.value)
                );
                const isUpdating = updatingId === a.id;
                const hasCasier = Boolean(a.zone_stockage);
                return (
                  <li
                    key={a.id}
                    className="rounded-lg border bg-card p-3 sm:p-4"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                            Article {idx + 1} / {articles.length}
                          </span>
                          {a.code_qr && (
                            <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                              {a.code_qr}
                            </span>
                          )}
                        </div>
                        <p className="font-medium text-foreground">{desc}</p>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span>
                            Service :{" "}
                            <span className="font-medium text-foreground">
                              {serviceNom}
                            </span>
                          </span>
                          {etatLabel && etatVariant && (
                            <StatusBadge
                              status={a.etat ?? ""}
                              label={`État : ${etatLabel}`}
                              variant={etatVariant}
                              className="text-[10px]"
                            />
                          )}
                          {a.assigne?.nom_complet && (
                            <span>
                              Assigné à :{" "}
                              <span className="font-medium text-foreground">
                                {a.assigne.nom_complet}
                              </span>
                            </span>
                          )}
                        </div>
                        {a.description_etat && (
                          <p className="rounded-md bg-warning/10 px-2 py-1 text-xs text-warning">
                            {a.description_etat}
                          </p>
                        )}

                        {/* Badge casier + métadonnées de rangement */}
                        {hasCasier && (
                          <div className="flex flex-wrap items-center gap-2 pt-1">
                            <Badge
                              variant="secondary"
                              className="gap-1 font-mono font-semibold"
                              title={`Casier de stockage : ${a.zone_stockage}`}
                            >
                              <Archive className="size-3" />
                              {a.zone_stockage}
                              <button
                                type="button"
                                onClick={() => handleLibererCasier(a.id)}
                                disabled={isUpdating}
                                aria-label={`Libérer le casier ${a.zone_stockage}`}
                                title="Libérer le casier"
                                className="ml-1 inline-flex size-4 items-center justify-center rounded-sm transition-colors hover:bg-secondary-foreground/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                              >
                                {isUpdating ? (
                                  <Loader2 className="size-3 animate-spin" />
                                ) : (
                                  <ArchiveRestore className="size-3" />
                                )}
                              </button>
                            </Badge>
                            <span className="text-[11px] text-muted-foreground">
                              Rangé le {formatDateOnly(a.date_rangeement)}
                              {a.range_par?.nom_complet
                                ? ` par ${a.range_par.nom_complet}`
                                : ""}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Edition inline du statut */}
                      <div className="flex shrink-0 items-center gap-2">
                        <StatusBadge
                          status={a.statut}
                          label={STATUT_LABELS[a.statut] ?? a.statut}
                          variant={statutVariant(a.statut)}
                        />
                        <Select
                          value={a.statut}
                          onValueChange={(v) =>
                            handleArticleStatutChange(a.id, v)
                          }
                          disabled={isUpdating}
                        >
                          <SelectTrigger
                            className="h-9 w-[140px] text-xs sm:h-8 sm:w-[150px]"
                            aria-label={`Modifier le statut de l'article ${idx + 1}`}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {allowedOptions.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {isUpdating && (
                          <Loader2
                            className="size-4 shrink-0 animate-spin text-muted-foreground"
                            aria-label="Mise à jour en cours"
                          />
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Paiements */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Receipt className="size-4 text-primary" />
            Paiements ({commande.paiements.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {commande.paiements.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Aucun paiement enregistré pour cette commande.
            </p>
          ) : (
            <>
              {/* Desktop : table */}
              <div className="hidden overflow-x-auto rounded-lg border md:block">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/50">
                    <tr className="text-left">
                      <th className="px-3 py-2 font-semibold text-foreground">
                        Date
                      </th>
                      <th className="px-3 py-2 font-semibold text-foreground">
                        Méthode
                      </th>
                      <th className="px-3 py-2 font-semibold text-foreground">
                        Référence
                      </th>
                      <th className="px-3 py-2 font-semibold text-foreground">
                        Type
                      </th>
                      <th className="px-3 py-2 text-right font-semibold text-foreground">
                        Montant
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {commande.paiements.map((p) => (
                      <tr key={p.id}>
                        <td className="px-3 py-2 text-muted-foreground">
                          {formatDateOnly(p.date_paiement)}
                        </td>
                        <td className="px-3 py-2 text-foreground">
                          {methodePaiementLabel(p.methode)}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                          {p.reference ?? "—"}
                        </td>
                        <td className="px-3 py-2">
                          {p.est_acompte ? (
                            <Badge variant="outline" className="text-xs">
                              Acompte
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="text-xs text-secondary"
                            >
                              Solde
                            </Badge>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right font-medium text-foreground">
                          {formatFCFA(p.montant)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile : cards */}
              <ul className="divide-y rounded-lg border md:hidden">
                {commande.paiements.map((p) => (
                  <li key={p.id} className="space-y-1.5 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-foreground">
                        {methodePaiementLabel(p.methode)}
                      </span>
                      {p.est_acompte ? (
                        <Badge variant="outline" className="text-xs">
                          Acompte
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="text-xs text-secondary"
                        >
                          Solde
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-muted-foreground">
                        {formatDateOnly(p.date_paiement)}
                      </span>
                      <span className="font-semibold text-foreground">
                        {formatFCFA(p.montant)}
                      </span>
                    </div>
                    {p.reference && (
                      <p className="font-mono text-[10px] text-muted-foreground">
                        Réf. {p.reference}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </CardContent>
      </Card>

      {/* Notes */}
      {commande.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <StickyNote className="size-4 text-primary" />
              Notes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm text-foreground">
              {commande.notes}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Dialog de saisie du casier (passage à "pret") */}
      <Dialog
        open={casierDialogArticleId !== null}
        onOpenChange={(open) => {
          if (!open) handleCasierClose();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Archive className="size-5 text-secondary" />
              Rangement en casier
            </DialogTitle>
            <DialogDescription>
              {casierDialogArticle
                ? `Article ${
                    findArticleIndex(casierDialogArticle.id, articles) + 1
                  } — ${articleDescription(
                    casierDialogArticle
                  )}. Saisissez le code du casier où cet article est rangé.`
                : "Saisissez le code du casier où cet article est rangé."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <label
              htmlFor="casier-input"
              className="text-xs font-medium text-foreground"
            >
              Code casier
            </label>
            <Input
              id="casier-input"
              type="text"
              inputMode="text"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              placeholder="Ex: A1"
              maxLength={10}
              value={casierInputValue}
              onChange={(e) => setCasierInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleCasierConfirm();
                }
              }}
              disabled={casierSubmitLoading}
              className="font-mono uppercase"
              aria-describedby="casier-help"
            />
            <p id="casier-help" className="text-[11px] text-muted-foreground">
              1 à 10 caractères alphanumériques (ex: A1, B2, C10). Le code
              sera mis en majuscules automatiquement.
            </p>
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
            <Button
              type="button"
              variant="ghost"
              onClick={() => handleCasierClose()}
              disabled={casierSubmitLoading}
              className="sm:mr-auto"
            >
              Annuler
            </Button>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleCasierSkip()}
                disabled={casierSubmitLoading}
              >
                Passer sans casier
              </Button>
              <Button
                type="button"
                onClick={() => handleCasierConfirm()}
                disabled={casierSubmitLoading}
              >
                {casierSubmitLoading ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Confirmation…
                  </>
                ) : (
                  <>
                    <Archive className="size-4" />
                    Confirmer
                  </>
                )}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AlertDialog de confirmation : « Marquer comme retirée »
          (action irréversible — passe tous les articles à `retire`
          et fige la commande dans le statut `retire`). */}
      <AlertDialog
        open={retirerDialogOpen}
        onOpenChange={(open) => {
          if (retirerLoading) return; // pas de fermeture pendant l'envoi
          setRetirerDialogOpen(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="size-5 text-secondary" />
              Marquer cette commande comme retirée ?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Vous confirmez que le client a récupéré ses articles pour la
              commande <span className="font-mono">{commande.numero_commande}</span>.
              Cette action est <strong>irréversible</strong> : tous les
              articles passeront au statut « Retiré » et la commande sera
              archivée. Assurez-vous que le solde restant à payer
              ({formatFCFA(resteAPayer)}) a bien été encaissé avant de
              confirmer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={retirerLoading}>
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={retirerLoading}
              onClick={(e) => {
                e.preventDefault();
                void handleRetirerCommande();
              }}
              className="bg-secondary text-secondary-foreground hover:bg-secondary/90"
            >
              {retirerLoading ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Marquage…
                </>
              ) : (
                <>
                  <CheckCircle2 className="size-4" />
                  Confirmer le retrait
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Helper local : index d'un article dans la liste (0-based). */
function findArticleIndex(
  articleId: string,
  articles: CommandeDetailData["articles"]
) {
  return articles.findIndex((a) => a.id === articleId);
}
