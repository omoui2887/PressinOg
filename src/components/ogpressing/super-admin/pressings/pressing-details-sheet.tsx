/**
 * OgPressing — PressingDetailsSheet
 * -----------------------------------
 * Sheet latérale (côté droit, large sur desktop) affichant les détails
 * complets d'un pressing (Super Admin).
 *
 * Contenu :
 *   - Toutes les infos du pressing (nom, adresse, téléphone, email, horaires)
 *   - Statistiques rapides : employés actifs, total commandes, statut
 *   - Historique des abonnements (tableau)
 *   - Liste du personnel (tableau : nom, rôle, statut compte)
 *   - Bouton Suspendre / Réactiver (avec AlertDialog de confirmation)
 *
 * ℹ️ Note info dans la Sheet : un pressing suspendu ne peut plus se connecter.
 *    Le middleware (cf. §5.5 de `src/lib/supabase/middleware.ts`) vérifie
 *    `pressing.statut='suspendu'` à chaque requête protégée et déconnecte
 *    automatiquement l'utilisateur (signOut + redirect /login?error=pressing_suspendu).
 *
 * Données via GET /api/super-admin/pressings/[id].
 * Mutations via PATCH /api/super-admin/pressings/[id] { statut, motif_suspension? }.
 */
"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import {
  Loader2,
  MapPin,
  Phone,
  Mail,
  CalendarDays,
  Building2,
  Users,
  Package,
  Clock,
  Ban,
  PlayCircle,
  ShieldAlert,
  Info,
  Sparkles,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import {
  PlanBadge,
  StatutAbonnementBadge,
  StatutCompteBadge,
  StatutPressingBadge,
  ROLE_PERSONNEL_LABELS,
  parseHoraires,
  type PressingDetails,
  type PressingListItem,
  type StatutPressing,
} from "./pressings-helpers";

interface PressingDetailsSheetProps {
  /** Pressing sélectionné dans la liste (objet léger). */
  pressing: PressingListItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function formatDateShort(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(new Date(iso));
  } catch {
    return "—";
  }
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return "—";
  }
}

function formatFCFA(montant: number): string {
  if (!Number.isFinite(montant)) return "0 FCFA";
  return new Intl.NumberFormat("fr-FR").format(Math.trunc(montant)) + " FCFA";
}

export function PressingDetailsSheet({
  pressing,
  open,
  onOpenChange,
}: PressingDetailsSheetProps) {
  const [details, setDetails] = useState<PressingDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  // Récupère les détails complets du pressing quand la Sheet s'ouvre
  const fetchDetails = useCallback(async (id: string) => {
    setLoading(true);
    setDetails(null);
    try {
      const res = await fetch(`/api/super-admin/pressings/${id}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (data.success) {
        setDetails(data.data as PressingDetails);
      } else {
        console.error("[pressing-details] Erreur API:", data.error);
        toast.error(data.error || "Erreur lors du chargement du pressing");
      }
    } catch (err) {
      console.error("[pressing-details] Erreur fetch:", err);
      toast.error("Erreur lors du chargement du pressing");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && pressing) {
      fetchDetails(pressing.id);
    } else if (!open) {
      // Reset état quand la Sheet se ferme
      setDetails(null);
      setConfirmOpen(false);
    }
  }, [open, pressing, fetchDetails]);

  // Suspendre / réactiver le pressing
  function handleToggleStatut() {
    if (!details) return;
    const nextStatut: StatutPressing =
      details.statut === "suspendu" ? "actif" : "suspendu";
    setConfirmOpen(false);

    startTransition(async () => {
      try {
        const res = await fetch(`/api/super-admin/pressings/${details.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ statut: nextStatut }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || "Erreur lors de la mise à jour");
        }
        // Met à jour l'état local avec le pressing rafraîchi
        setDetails((prev) =>
          prev
            ? {
                ...prev,
                ...(data.data as Partial<PressingDetails>),
              }
            : prev
        );
        toast.success(
          nextStatut === "suspendu"
            ? "Pressing suspendu"
            : "Pressing réactivé",
          {
            description:
              nextStatut === "suspendu"
                ? "Son personnel ne peut plus se connecter."
                : "Son personnel peut à nouveau se connecter.",
          }
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Erreur inattendue";
        toast.error(msg);
      }
    });
  }

  const isSuspendu = details?.statut === "suspendu";
  const horaires = details ? parseHoraires(details.horaires) : [];

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="w-full gap-0 overflow-y-auto sm:max-w-2xl"
        >
          <SheetHeader className="border-b">
            <SheetTitle className="flex items-center gap-2 text-xl">
              <Building2 className="size-5 text-primary" />
              {pressing?.nom ?? "Détails du pressing"}
            </SheetTitle>
            <SheetDescription className="sr-only">
              Détails complets du pressing : informations, abonnements,
              personnel et actions de gestion.
            </SheetDescription>

            {/* Statut + plan sous le titre */}
            {details && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <StatutPressingBadge statut={details.statut} />
                <PlanBadge
                  plan={
                    details.abonnements && details.abonnements.length > 0
                      ? details.abonnements[0].plan
                      : null
                  }
                />
                <span className="text-xs text-muted-foreground">
                  Créé le {formatDateShort(details.created_at)}
                </span>
              </div>
            )}
          </SheetHeader>

          {loading ? (
            <div className="space-y-4 p-6">
              <Skeleton className="h-24 w-full rounded-lg" />
              <Skeleton className="h-48 w-full rounded-lg" />
              <Skeleton className="h-32 w-full rounded-lg" />
            </div>
          ) : !details ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <Package className="size-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                Impossible de charger les détails.
              </p>
            </div>
          ) : (
            <div className="space-y-6 p-6">
              {/* Stats rapides */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Card className="bg-muted/30">
                  <CardContent className="flex flex-col items-start gap-1 p-3">
                    <span className="flex size-8 items-center justify-center rounded-md bg-secondary/10 text-secondary">
                      <Users className="size-4" />
                    </span>
                    <p className="text-xs text-muted-foreground">
                      Employés actifs
                    </p>
                    <p className="text-lg font-bold text-foreground">
                      {details.personnel.filter(
                        (p) => p.actif && p.statut_compte === "actif"
                      ).length}
                    </p>
                  </CardContent>
                </Card>
                <Card className="bg-muted/30">
                  <CardContent className="flex flex-col items-start gap-1 p-3">
                    <span className="flex size-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <Package className="size-4" />
                    </span>
                    <p className="text-xs text-muted-foreground">
                      Commandes traitées
                    </p>
                    <p className="text-lg font-bold text-foreground">
                      {details.total_commandes}
                    </p>
                  </CardContent>
                </Card>
                <Card className="col-span-2 bg-muted/30 sm:col-span-1">
                  <CardContent className="flex flex-col items-start gap-1 p-3">
                    <span className="flex size-8 items-center justify-center rounded-md bg-warning/10 text-warning">
                      <CalendarDays className="size-4" />
                    </span>
                    <p className="text-xs text-muted-foreground">
                      Activé le
                    </p>
                    <p className="text-sm font-bold text-foreground">
                      {formatDateShort(details.date_activation)}
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Informations générales */}
              <section className="space-y-3">
                <h3 className="text-sm font-semibold text-foreground">
                  Informations générales
                </h3>
                <div className="grid gap-2 text-sm sm:grid-cols-2">
                  <InfoRow
                    icon={<MapPin className="size-4" />}
                    label="Adresse"
                    value={
                      [details.adresse, details.commune, details.ville]
                        .filter(Boolean)
                        .join(", ") || "—"
                    }
                  />
                  <InfoRow
                    icon={<Phone className="size-4" />}
                    label="Téléphone"
                    value={details.telephone ?? "—"}
                  />
                  <InfoRow
                    icon={<Mail className="size-4" />}
                    label="Email"
                    value={details.email ?? "—"}
                  />
                  <InfoRow
                    icon={<Sparkles className="size-4" />}
                    label="Slug"
                    value={details.slug ?? "—"}
                  />
                </div>
              </section>

              {/* Horaires */}
              <section className="space-y-3">
                <h3 className="text-sm font-semibold text-foreground">
                  Horaires d&apos;ouverture
                </h3>
                {details.horaires ? (
                  <div className="rounded-lg border">
                    <table className="w-full text-sm">
                      <tbody className="divide-y">
                        {horaires.map((h) => (
                          <tr key={h.jour}>
                            <td className="px-3 py-2 font-medium text-foreground">
                              {h.label}
                            </td>
                            <td className="px-3 py-2 text-right text-muted-foreground">
                              {h.plage ? (
                                <span className="flex items-center justify-end gap-1">
                                  <Clock className="size-3" />
                                  {h.plage}
                                </span>
                              ) : (
                                <span className="text-danger">Fermé</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="rounded-lg border border-dashed bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
                    Horaires non renseignés
                  </p>
                )}
              </section>

              {/* Historique des abonnements */}
              <section className="space-y-3">
                <h3 className="text-sm font-semibold text-foreground">
                  Historique des abonnements
                </h3>
                {details.abonnements.length === 0 ? (
                  <p className="rounded-lg border border-dashed bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
                    Aucun abonnement enregistré
                  </p>
                ) : (
                  <div className="overflow-x-auto rounded-lg border">
                    <table className="w-full text-sm">
                      <thead className="border-b bg-muted/50">
                        <tr className="text-left">
                          <th className="px-3 py-2 font-semibold text-foreground">
                            Plan
                          </th>
                          <th className="px-3 py-2 font-semibold text-foreground">
                            Statut
                          </th>
                          <th className="px-3 py-2 font-semibold text-foreground">
                            Période
                          </th>
                          <th className="px-3 py-2 text-right font-semibold text-foreground">
                            Montant
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {details.abonnements.map((a) => (
                          <tr key={a.id}>
                            <td className="px-3 py-2">
                              <PlanBadge plan={a.plan} />
                            </td>
                            <td className="px-3 py-2">
                              <StatutAbonnementBadge statut={a.statut} />
                            </td>
                            <td className="px-3 py-2 text-xs text-muted-foreground">
                              <span className="flex flex-col">
                                <span>
                                  Du {formatDateShort(a.date_debut)}
                                </span>
                                <span>
                                  Au {formatDateShort(a.date_fin)}
                                </span>
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right font-medium text-foreground">
                              {formatFCFA(a.montant_mensuel)}
                              <span className="block text-[10px] font-normal text-muted-foreground">
                                / mois
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              {/* Personnel */}
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground">
                    Personnel ({details.personnel.length})
                  </h3>
                </div>
                {details.personnel.length === 0 ? (
                  <p className="rounded-lg border border-dashed bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
                    Aucun personnel enregistré
                  </p>
                ) : (
                  <div className="overflow-x-auto rounded-lg border">
                    <table className="w-full text-sm">
                      <thead className="border-b bg-muted/50">
                        <tr className="text-left">
                          <th className="px-3 py-2 font-semibold text-foreground">
                            Nom
                          </th>
                          <th className="px-3 py-2 font-semibold text-foreground">
                            Rôle
                          </th>
                          <th className="px-3 py-2 font-semibold text-foreground">
                            Statut compte
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {details.personnel.map((p) => (
                          <tr key={p.id}>
                            <td className="px-3 py-2">
                              <div className="flex flex-col">
                                <span className="font-medium text-foreground">
                                  {p.nom_complet}
                                </span>
                                {p.email && (
                                  <span className="text-xs text-muted-foreground">
                                    {p.email}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-2 text-muted-foreground">
                              {ROLE_PERSONNEL_LABELS[p.role] ?? p.role}
                            </td>
                            <td className="px-3 py-2">
                              <StatutCompteBadge statut={p.statut_compte} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              {/* Bloc suspension + note d'info */}
              <section className="space-y-3 border-t pt-4">
                <h3 className="text-sm font-semibold text-foreground">
                  Actions
                </h3>

                {/* Note d'info : middleware vérifie pressing.statut */}
                <div className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
                  <Info className="mt-0.5 size-4 shrink-0 text-primary" />
                  <p className="text-foreground">
                    <span className="font-semibold">
                      Un pressing suspendu ne peut plus se connecter.
                    </span>{" "}
                    Le middleware vérifie automatiquement{" "}
                    <code className="rounded bg-muted px-1 py-0.5 text-xs">
                      pressing.statut=&apos;suspendu&apos;
                    </code>{" "}
                    à chaque requête protégée : tout utilisateur rattaché est
                    déconnecté (signOut) et redirigé vers{" "}
                    <code className="rounded bg-muted px-1 py-0.5 text-xs">
                      /login?error=pressing_suspendu
                    </code>
                    .
                  </p>
                </div>

                {/* Si suspendu, on affiche quand + motif */}
                {isSuspendu && (
                  <div className="rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm">
                    <p className="flex items-center gap-1.5 font-semibold text-danger">
                      <Ban className="size-4" />
                      Pressing suspendu
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Suspendu le {formatDateTime(details.date_suspension)}
                      {details.motif_suspension
                        ? ` — motif : ${details.motif_suspension}`
                        : ""}
                    </p>
                  </div>
                )}

                <Button
                  type="button"
                  variant={isSuspendu ? "default" : "destructive"}
                  className="w-full gap-2"
                  onClick={() => setConfirmOpen(true)}
                  disabled={pending}
                >
                  {pending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : isSuspendu ? (
                    <PlayCircle className="size-4" />
                  ) : (
                    <Ban className="size-4" />
                  )}
                  {isSuspendu ? "Réactiver le pressing" : "Suspendre le pressing"}
                </Button>
              </section>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Boîte de confirmation Suspendre / Réactiver */}
      <AlertDialog
        open={confirmOpen}
        onOpenChange={(o) => {
          if (!o && !pending) setConfirmOpen(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ShieldAlert
                className={
                  isSuspendu
                    ? "size-5 text-secondary"
                    : "size-5 text-danger"
                }
              />
              {isSuspendu
                ? "Réactiver ce pressing ?"
                : "Suspendre ce pressing ?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isSuspendu
                ? `Le pressing « ${details?.nom} » pourra à nouveau se connecter et son personnel reprendra ses activités.`
                : `Le pressing « ${details?.nom} » sera suspendu. Son personnel ne pourra plus se connecter (middleware : signOut automatique + redirection /login). Vous pourrez le réactiver à tout moment.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-2">
            <AlertDialogCancel disabled={pending}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleToggleStatut();
              }}
              disabled={pending}
              className={
                isSuspendu
                  ? "bg-secondary text-white hover:bg-secondary/90"
                  : "bg-danger text-white hover:bg-danger/90"
              }
            >
              {pending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Traitement…
                </>
              ) : isSuspendu ? (
                "Réactiver"
              ) : (
                "Suspendre"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  Sous-composant : ligne d'info (icône + label + valeur)                    */
/* -------------------------------------------------------------------------- */

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2 rounded-md border bg-card p-2.5">
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-medium text-foreground">
          {value}
        </p>
      </div>
    </div>
  );
}
