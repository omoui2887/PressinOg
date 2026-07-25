/**
 * OgPressing — CommandeDetail (client component, LOT 7.6)
 * --------------------------------------------------------
 * Composant interactif de la page /admin/commandes/[id]. Reçoit le détail
 * complet de la commande (fetch côté Server Component via Supabase) et
 * gère :
 *   - Affichage read-only de toutes les infos (client, stats, articles,
 *     paiements, notes, dates)
 *   - Édition inline du statut de chaque article (Select → PATCH
 *     /api/admin/commandes/[id]/articles/[articleId])
 *   - Boutons "Imprimer le ticket" et "Imprimer les étiquettes"
 *     (window.open + HTML, helpers dans `commande-print.ts`)
 *
 * Ne fait aucun fetch au montage : toutes les données sont passées en props
 * par le Server Component parent. Seules les mises à jour de statut article
 * déclenchent un fetch (PATCH).
 */
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  CreditCard,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/shared/status-badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { formatFCFA, formatDate, formatDateOnly } from "@/lib/utils/format";
import {
  ETAT_LABELS,
  ETAT_VARIANT,
} from "@/components/ogpressing/admin/commande-wizard/article-labels";
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
}

/** Options du Select de statut article (7 valeurs de l'enum). */
const STATUT_ARTICLE_OPTIONS = [
  { value: "recu", label: "Reçu" },
  { value: "en_traitement", label: "En traitement" },
  { value: "lave", label: "Lavé" },
  { value: "repasse", label: "Repassé" },
  { value: "pret", label: "Prêt" },
  { value: "retire", label: "Retiré" },
  { value: "livre", label: "Livré" },
];

export function CommandeDetail({ commande }: CommandeDetailProps) {
  // Copie locale des articles pour refléter les mises à jour de statut
  // sans devoir refetch toute la commande.
  const [articles, setArticles] = useState(commande.articles);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

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

  async function handleArticleStatutChange(
    articleId: string,
    newStatut: string
  ) {
    setUpdatingId(articleId);
    try {
      const res = await fetch(
        `/api/admin/commandes/${commande.id}/articles/${articleId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ statut: newStatut }),
        }
      );
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Échec de la mise à jour");
      }
      // Met à jour l'article localement
      setArticles((prev) =>
        prev.map((a) =>
          a.id === articleId ? { ...a, statut: data.data.statut } : a
        )
      );
      toast.success("Statut de l'article mis à jour", {
        description: `Nouveau statut : ${
          STATUT_LABELS[data.data.statut] ?? data.data.statut
        }`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur inconnue";
      toast.error("Échec de la mise à jour", { description: msg });
    } finally {
      setUpdatingId(null);
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
            <Link href="/admin/commandes">
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
                    href={`/admin/clients/${commande.client.id}`}
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
                          disabled={updatingId === a.id}
                        >
                          <SelectTrigger
                            className="h-8 w-[150px] text-xs"
                            aria-label={`Modifier le statut de l'article ${idx + 1}`}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {STATUT_ARTICLE_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
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
            <div className="overflow-hidden rounded-lg border">
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
    </div>
  );
}
