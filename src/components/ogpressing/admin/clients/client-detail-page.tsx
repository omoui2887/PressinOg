/**
 * OgPressing — ClientDetailPage (LOT 8.2 — orchestrator client)
 * --------------------------------------------------------------
 * Composant client orchestrant toute la fiche client détaillée :
 *   - Header sticky (back + nom + 2 boutons : Nouvelle commande, Modifier)
 *   - Tabs (3 onglets) : Informations / Commandes / Paiements
 *   - Onglet "Informations" : coordonnées + stats + préférences + notes
 *     (cards, avec boutons "Modifier" qui ouvrent les dialogs)
 *   - Onglet "Commandes" : historique paginé 50, table desktop + cards
 *     mobile, lignes cliquables → /admin/commandes/{id}
 *   - Onglet "Paiements" : historique de tous les paiements du client,
 *     table desktop + cards mobile
 *
 * Mutations via PATCH /api/admin/clients/{id} (3 dialogs : EditInfoDialog,
 * EditPreferencesDialog, EditNotesDialog). Sur succès, le `currentClient`
 * local est mis à jour → re-render des sections concernées.
 *
 * Layout mobile-first : tabs scrollables, cards empilées. Desktop : grid
 * 2 colonnes pour les sections d'informations.
 */
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Phone,
  Mail,
  MapPin,
  Star,
  ShoppingBag,
  AlertCircle,
  Wallet,
  Pencil,
  Plus,
  StickyNote,
  CreditCard,
  Receipt,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatFCFA, formatDate, formatDateOnly } from "@/lib/utils/format";
import {
  preferencesToList,
  hasPreferences,
} from "@/components/ogpressing/admin/commande-wizard/preferences-labels";
import {
  METHODE_PAIEMENT_LABELS,
  STATUT_CMD_LABELS,
  STATUT_PAIEMENT_LABELS,
  computeSoldeImpaye,
  computeTotalDepense,
  statutCmdVariant,
  statutPaiementVariant,
  type ClientDetail,
  type CommandeListItem,
  type Paiement,
} from "./client-detail-helpers";
import { EditInfoDialog } from "./edit-info-dialog";
import { EditPreferencesDialog } from "./edit-preferences-dialog";
import { EditNotesDialog } from "./edit-notes-dialog";

interface ClientDetailPageProps {
  client: ClientDetail;
  commandes: CommandeListItem[];
  paiements: Paiement[];
  /** Base path for navigation links. Defaults to "/admin".
   *  For personnel variants, set to "/personnel/receptionniste" (or other role).
   *  Links are constructed as `${basePath}/clients/{id}`, `${basePath}/commandes/{id}`, etc. */
  basePath?: string;
  /** When true, hides the "Modifier" buttons and "Nouvelle commande" button (read-only mode
   *  for Caissier who can view but not edit). Default: false. */
  readOnly?: boolean;
}

export function ClientDetailPage({
  client,
  commandes,
  paiements,
  basePath = "/admin",
  readOnly = false,
}: ClientDetailPageProps) {
  // État local du client — mis à jour après chaque édition réussie.
  const [currentClient, setCurrentClient] = useState<ClientDetail>(client);
  const [editInfoOpen, setEditInfoOpen] = useState(false);
  const [editPrefsOpen, setEditPrefsOpen] = useState(false);
  const [editNotesOpen, setEditNotesOpen] = useState(false);
  const [tab, setTab] = useState<string>("informations");

  // Agrégations statistiques (recalculées quand commandes change).
  const stats = useMemo(() => {
    return {
      soldeImpaye: computeSoldeImpaye(commandes),
      totalDepense: computeTotalDepense(commandes),
      nombreCommandes: commandes.length,
      totalPaiements: paiements.reduce((sum, p) => sum + (p.montant || 0), 0),
    };
  }, [commandes, paiements]);

  // Map commande_id → numero_commande pour les paiements (évite un find()
  // par paiement).
  const commandeNumeroMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of commandes) m.set(c.id, c.numero_commande);
    return m;
  }, [commandes]);

  const prefItems = useMemo(
    () => preferencesToList(currentClient.preferences_lavage),
    [currentClient.preferences_lavage]
  );

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      {/* ============================================================ */}
      {/* Header                                                       */}
      {/* ============================================================ */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild aria-label="Retour">
            <Link href={`${basePath}/clients`}>
              <ArrowLeft className="size-5" />
            </Link>
          </Button>
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold tracking-tight text-foreground">
              {currentClient.nom_complet}
            </h1>
            <p className="text-sm text-muted-foreground">
              Client depuis le {formatDateOnly(currentClient.created_at)}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button asChild>
            <Link
              href={`${basePath}/commandes/nouvelle?client_id=${currentClient.id}`}
            >
              <Plus className="size-4" />
              Nouvelle commande
            </Link>
          </Button>
          {!readOnly && (
            <Button variant="outline" onClick={() => setEditInfoOpen(true)}>
              <Pencil className="size-4" />
              Modifier
            </Button>
          )}
        </div>
      </div>

      {/* ============================================================ */}
      {/* Tabs                                                         */}
      {/* ============================================================ */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full justify-start overflow-x-auto sm:w-auto">
          <TabsTrigger value="informations">Informations</TabsTrigger>
          <TabsTrigger value="commandes">
            <ShoppingBag className="size-3.5" />
            Commandes ({stats.nombreCommandes})
          </TabsTrigger>
          <TabsTrigger value="paiements">
            <CreditCard className="size-3.5" />
            Paiements ({paiements.length})
          </TabsTrigger>
        </TabsList>

        {/* ---------------------------------------------------------- */}
        {/* Onglet Informations                                        */}
        {/* ---------------------------------------------------------- */}
        <TabsContent value="informations" className="space-y-4">
          {/* Coordonnées + Statistiques (grid 2 cols sur desktop) */}
          <div className="grid gap-4 md:grid-cols-2">
            {/* Coordonnées */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
                <CardTitle className="text-base">Coordonnées</CardTitle>
                {!readOnly && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditInfoOpen(true)}
                  >
                    <Pencil className="size-3.5" />
                    Modifier
                  </Button>
                )}
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center gap-3">
                  <Phone className="size-4 shrink-0 text-muted-foreground" />
                  <a
                    href={`tel:${currentClient.telephone}`}
                    className="font-medium text-foreground hover:text-primary"
                  >
                    {currentClient.telephone}
                  </a>
                </div>
                {currentClient.email && (
                  <div className="flex items-center gap-3">
                    <Mail className="size-4 shrink-0 text-muted-foreground" />
                    <a
                      href={`mailto:${currentClient.email}`}
                      className="font-medium text-foreground hover:text-primary break-all"
                    >
                      {currentClient.email}
                    </a>
                  </div>
                )}
                {currentClient.adresse && (
                  <div className="flex items-start gap-3">
                    <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <span className="text-foreground">
                      {currentClient.adresse}
                    </span>
                  </div>
                )}
                {!currentClient.email && !currentClient.adresse && (
                  <p className="text-xs italic text-muted-foreground">
                    Email et adresse non renseignés.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Statistiques */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Statistiques</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <AlertCircle className="size-3.5" />
                      Solde impayé
                    </p>
                    <p
                      className={
                        stats.soldeImpaye > 0
                          ? "text-lg font-bold text-danger"
                          : "text-lg font-bold text-foreground"
                      }
                    >
                      {formatFCFA(stats.soldeImpaye)}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Wallet className="size-3.5" />
                      Total dépensé
                    </p>
                    <p className="text-lg font-bold text-foreground">
                      {formatFCFA(stats.totalDepense)}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <ShoppingBag className="size-3.5" />
                      Commandes
                    </p>
                    <p className="text-lg font-bold text-foreground">
                      {stats.nombreCommandes}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Star className="size-3.5 text-warning" />
                      Points fidélité
                    </p>
                    <p className="text-lg font-bold text-foreground">
                      {currentClient.points_fidelite}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Préférences de lavage + Notes (grid 2 cols sur desktop) */}
          <div className="grid gap-4 md:grid-cols-2">
            {/* Préférences de lavage */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
                <CardTitle className="text-base">Préférences de lavage</CardTitle>
                {!readOnly && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditPrefsOpen(true)}
                  >
                    <Pencil className="size-3.5" />
                    Modifier
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                {!hasPreferences(currentClient.preferences_lavage) ? (
                  <p className="text-sm italic text-muted-foreground">
                    Aucune préférence enregistrée.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {prefItems.map((it) => (
                      <li
                        key={it.key}
                        className="flex items-center justify-between gap-3 text-sm"
                      >
                        <span className="flex items-center gap-2 text-muted-foreground">
                          <span aria-hidden className="text-base leading-none">
                            {it.icon}
                          </span>
                          {it.label}
                        </span>
                        <span className="font-medium text-foreground">
                          {it.value}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            {/* Notes */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
                <CardTitle className="flex items-center gap-2 text-base">
                  <StickyNote className="size-4 text-muted-foreground" />
                  Notes
                </CardTitle>
                {!readOnly && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditNotesOpen(true)}
                  >
                    <Pencil className="size-3.5" />
                    Modifier
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                {currentClient.notes ? (
                  <p className="whitespace-pre-wrap text-sm text-foreground">
                    {currentClient.notes}
                  </p>
                ) : (
                  <p className="text-sm italic text-muted-foreground">
                    Aucune note.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ---------------------------------------------------------- */}
        {/* Onglet Commandes                                           */}
        {/* ---------------------------------------------------------- */}
        <TabsContent value="commandes">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShoppingBag className="size-4 text-primary" />
                Historique des commandes
                {stats.nombreCommandes > 0 && (
                  <Badge variant="secondary" className="ml-1">
                    {stats.nombreCommandes}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {commandes.length === 0 ? (
                <div className="flex flex-col items-center py-8 text-center">
                  <Users className="size-10 text-muted-foreground" />
                  <p className="mt-2 text-sm font-medium text-foreground">
                    Aucune commande
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Ce client n&apos;a pas encore de commande enregistrée.
                  </p>
                  <Button asChild className="mt-4" size="sm">
                    <Link
                      href={`${basePath}/commandes/nouvelle?client_id=${currentClient.id}`}
                    >
                      <Plus className="size-4" />
                      Créer la première commande
                    </Link>
                  </Button>
                </div>
              ) : (
                <>
                  {/* Desktop : tableau */}
                  <div className="hidden overflow-hidden rounded-lg border md:block">
                    <table className="w-full text-sm">
                      <thead className="border-b bg-muted/50">
                        <tr className="text-left">
                          <th className="px-4 py-2 font-semibold text-foreground">
                            N° commande
                          </th>
                          <th className="px-4 py-2 font-semibold text-foreground">
                            Date réception
                          </th>
                          <th className="px-4 py-2 font-semibold text-foreground">
                            Statut
                          </th>
                          <th className="px-4 py-2 font-semibold text-foreground">
                            Paiement
                          </th>
                          <th className="px-4 py-2 text-right font-semibold text-foreground">
                            Total
                          </th>
                          <th className="px-4 py-2 text-right font-semibold text-foreground">
                            <span className="sr-only">Voir</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {commandes.map((cmd) => (
                          <tr
                            key={cmd.id}
                            className="group transition-colors hover:bg-accent/50"
                          >
                            <td className="px-4 py-3">
                              <Link
                                href={`${basePath}/commandes/${cmd.id}`}
                                className="font-mono text-xs text-foreground group-hover:text-primary"
                              >
                                {cmd.numero_commande}
                              </Link>
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">
                              {formatDateOnly(cmd.date_reception)}
                            </td>
                            <td className="px-4 py-3">
                              <StatusBadge
                                status={cmd.statut}
                                label={
                                  STATUT_CMD_LABELS[cmd.statut] || cmd.statut
                                }
                                variant={statutCmdVariant(cmd.statut)}
                              />
                            </td>
                            <td className="px-4 py-3">
                              <StatusBadge
                                status={cmd.statut_paiement}
                                label={
                                  STATUT_PAIEMENT_LABELS[cmd.statut_paiement] ||
                                  cmd.statut_paiement
                                }
                                variant={statutPaiementVariant(
                                  cmd.statut_paiement
                                )}
                              />
                            </td>
                            <td className="px-4 py-3 text-right font-medium text-foreground">
                              {formatFCFA(cmd.montant_total)}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <Link
                                href={`${basePath}/commandes/${cmd.id}`}
                                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                              >
                                Voir
                                <ArrowRight className="size-3.5" />
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile : cards */}
                  <ul className="space-y-2 md:hidden">
                    {commandes.map((cmd) => (
                      <li key={cmd.id}>
                        <Link
                          href={`${basePath}/commandes/${cmd.id}`}
                          className="block rounded-lg border bg-card p-3 text-sm transition-colors hover:bg-accent/50 active:bg-accent"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-xs text-foreground">
                              {cmd.numero_commande}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {formatDateOnly(cmd.date_reception)}
                            </span>
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <StatusBadge
                              status={cmd.statut}
                              label={
                                STATUT_CMD_LABELS[cmd.statut] || cmd.statut
                              }
                              variant={statutCmdVariant(cmd.statut)}
                              className="text-xs"
                            />
                            <StatusBadge
                              status={cmd.statut_paiement}
                              label={
                                STATUT_PAIEMENT_LABELS[cmd.statut_paiement] ||
                                cmd.statut_paiement
                              }
                              variant={statutPaiementVariant(
                                cmd.statut_paiement
                              )}
                              className="text-xs"
                            />
                          </div>
                          <p className="mt-2 text-right font-semibold text-foreground">
                            {formatFCFA(cmd.montant_total)}
                          </p>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------------------------------------------------------- */}
        {/* Onglet Paiements                                           */}
        {/* ---------------------------------------------------------- */}
        <TabsContent value="paiements">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Receipt className="size-4 text-primary" />
                Historique des paiements
                {paiements.length > 0 && (
                  <Badge variant="secondary" className="ml-1">
                    {paiements.length}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {paiements.length === 0 ? (
                <div className="flex flex-col items-center py-8 text-center">
                  <CreditCard className="size-10 text-muted-foreground" />
                  <p className="mt-2 text-sm font-medium text-foreground">
                    Aucun paiement enregistré
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Les paiements (acomptes et soldes) des commandes de ce
                    client apparaîtront ici.
                  </p>
                </div>
              ) : (
                <>
                  {/* Desktop : tableau */}
                  <div className="hidden overflow-hidden rounded-lg border md:block">
                    <table className="w-full text-sm">
                      <thead className="border-b bg-muted/50">
                        <tr className="text-left">
                          <th className="px-4 py-2 font-semibold text-foreground">
                            Date
                          </th>
                          <th className="px-4 py-2 font-semibold text-foreground">
                            Commande
                          </th>
                          <th className="px-4 py-2 font-semibold text-foreground">
                            Méthode
                          </th>
                          <th className="px-4 py-2 font-semibold text-foreground">
                            Référence
                          </th>
                          <th className="px-4 py-2 font-semibold text-foreground">
                            Type
                          </th>
                          <th className="px-4 py-2 text-right font-semibold text-foreground">
                            Montant
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {paiements.map((p) => (
                          <tr
                            key={p.id}
                            className="group transition-colors hover:bg-accent/50"
                          >
                            <td className="px-4 py-3 text-muted-foreground">
                              {formatDate(p.date_paiement)}
                            </td>
                            <td className="px-4 py-3">
                              <Link
                                href={`${basePath}/commandes/${p.commande_id}`}
                                className="font-mono text-xs text-foreground group-hover:text-primary"
                              >
                                {commandeNumeroMap.get(p.commande_id) ??
                                  "—"}
                              </Link>
                            </td>
                            <td className="px-4 py-3 text-foreground">
                              {METHODE_PAIEMENT_LABELS[p.methode] ||
                                p.methode}
                            </td>
                            <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                              {p.reference ?? "—"}
                            </td>
                            <td className="px-4 py-3">
                              {p.est_acompte ? (
                                <Badge
                                  variant="outline"
                                  className="border-warning/30 bg-warning/10 text-warning"
                                >
                                  Acompte
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-muted-foreground">
                                  Solde
                                </Badge>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right font-semibold text-foreground">
                              {formatFCFA(p.montant)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="border-t bg-muted/30">
                        <tr>
                          <td
                            colSpan={5}
                            className="px-4 py-3 text-right text-xs font-medium text-muted-foreground"
                          >
                            Total encaissé
                          </td>
                          <td className="px-4 py-3 text-right text-sm font-bold text-foreground">
                            {formatFCFA(stats.totalPaiements)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  {/* Mobile : cards */}
                  <ul className="space-y-2 md:hidden">
                    {paiements.map((p) => (
                      <li key={p.id}>
                        <Link
                          href={`${basePath}/commandes/${p.commande_id}`}
                          className="block rounded-lg border bg-card p-3 text-sm transition-colors hover:bg-accent/50 active:bg-accent"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-xs text-foreground">
                              {commandeNumeroMap.get(p.commande_id) ?? "—"}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {formatDateOnly(p.date_paiement)}
                            </span>
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <Badge variant="outline" className="text-xs">
                              {METHODE_PAIEMENT_LABELS[p.methode] ||
                                p.methode}
                            </Badge>
                            {p.est_acompte ? (
                              <Badge
                                variant="outline"
                                className="border-warning/30 bg-warning/10 text-warning text-xs"
                              >
                                Acompte
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="text-muted-foreground text-xs"
                              >
                                Solde
                              </Badge>
                            )}
                          </div>
                          {p.reference && (
                            <p className="mt-1 font-mono text-xs text-muted-foreground">
                              Réf. {p.reference}
                            </p>
                          )}
                          <p className="mt-2 text-right font-semibold text-foreground">
                            {formatFCFA(p.montant)}
                          </p>
                        </Link>
                      </li>
                    ))}
                    <li className="rounded-lg border bg-muted/30 p-3 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">
                          Total encaissé
                        </span>
                        <span className="font-bold text-foreground">
                          {formatFCFA(stats.totalPaiements)}
                        </span>
                      </div>
                    </li>
                  </ul>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ============================================================ */}
      {/* Dialogs d'édition                                            */}
      {/* ============================================================ */}
      <EditInfoDialog
        client={currentClient}
        open={editInfoOpen}
        onOpenChange={setEditInfoOpen}
        onUpdated={setCurrentClient}
      />
      <EditPreferencesDialog
        client={currentClient}
        open={editPrefsOpen}
        onOpenChange={setEditPrefsOpen}
        onUpdated={setCurrentClient}
      />
      <EditNotesDialog
        client={currentClient}
        open={editNotesOpen}
        onOpenChange={setEditNotesOpen}
        onUpdated={setCurrentClient}
      />
    </div>
  );
}
