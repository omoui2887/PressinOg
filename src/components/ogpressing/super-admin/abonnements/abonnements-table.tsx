/**
 * OgPressing — AbonnementsTable
 * ------------------------------
 * Affiche la liste des abonnements sous forme de :
 *   - Tableau sur desktop (md+) — 7 colonnes : Nom du pressing, Plan, Statut,
 *     Date de début, Date de fin, Montant mensuel, Actions
 *   - Cards empilées sur mobile (même infos)
 *
 * Actions par abonnement (composant <AbonnementActions>) :
 *   - "Renouveler"       → ouvre le dialog de paiement déclaratif (prolonge
 *                          date_fin de +1 mois, statut='actif')
 *   - "Changer de plan"  → submenu avec les 3 plans (met à jour abonnements.plan
 *                          + montant_mensuel)
 *   - "Suspendre"        → AlertDialog de confirmation (statut='suspendu')
 *
 * Lignes surlignées :
 *   - expire bientôt (date_fin dans < 3 jours) → fond warning/5 + badge orange
 *   - expiré (date_fin < now)                  → fond danger/5 + badge rouge
 */
"use client";

import { useState, useTransition } from "react";
import {
  MoreHorizontal,
  RotateCw,
  RefreshCw,
  Ban,
  Loader2,
  ShieldAlert,
  Building2,
  Calendar,
  CalendarClock,
  CalendarX,
  Wallet,
  MapPin,
  Package,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
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
import { StatusBadge } from "@/components/shared";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { formatFCFA, formatDateOnly } from "@/lib/utils/format";
import { RenouvellementDialog } from "./renouvellement-dialog";
import {
  type Abonnement,
  type PlanAbonnement,
  PLAN_LABELS,
  PLAN_MONTANTS,
  STATUT_LABELS,
  STATUT_VARIANTS,
  isExpire,
  isExpireBientot,
} from "./abonnements-helpers";

interface AbonnementsTableProps {
  abonnements: Abonnement[];
  loading?: boolean;
  onUpdated?: () => void;
}

/* ---------------------------------------------------------------- */
/*  AbonnementActions — menu 3-points + dialog de renouvellement    */
/* ---------------------------------------------------------------- */

interface AbonnementActionsProps {
  abonnement: Abonnement;
  onUpdated?: () => void;
}

function AbonnementActions({ abonnement, onUpdated }: AbonnementActionsProps) {
  const [renouvelerOpen, setRenouvelerOpen] = useState(false);
  const [suspendreOpen, setSuspendreOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  async function changerPlan(plan: PlanAbonnement) {
    if (plan === abonnement.plan) {
      toast.info("Cet abonnement est déjà sur ce plan");
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch(`/api/super-admin/abonnements/${abonnement.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "changer_plan", plan }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || "Erreur lors du changement de plan");
        }
        toast.success(`Plan changé pour ${PLAN_LABELS[plan]}`, {
          description: `Nouveau montant : ${formatFCFA(PLAN_MONTANTS[plan])}/mois`,
        });
        onUpdated?.();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Erreur inattendue";
        toast.error(msg);
      }
    });
  }

  async function suspendre() {
    setSuspendreOpen(false);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/super-admin/abonnements/${abonnement.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "suspendre" }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || "Erreur lors de la suspension");
        }
        toast.success(
          `Abonnement de ${abonnement.pressing?.nom} suspendu`
        );
        onUpdated?.();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Erreur inattendue";
        toast.error(msg);
      }
    });
  }

  const isSuspendu = abonnement.statut === "suspendu";

  return (
    <>
      <div className="flex items-center justify-end gap-1">
        {/* Renouveler — bouton direct */}
        <Button
          size="sm"
          variant="default"
          className="h-8 gap-1"
          onClick={() => setRenouvelerOpen(true)}
          disabled={pending}
        >
          <RotateCw className="size-3.5" />
          <span className="hidden sm:inline">Renouveler</span>
        </Button>

        {/* Menu 3-points : changer de plan / suspendre */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 shrink-0"
              aria-label={`Actions pour ${abonnement.pressing?.nom}`}
              disabled={pending}
            >
              {pending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <MoreHorizontal className="size-4" />
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              {abonnement.pressing?.nom}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />

            {/* Changer de plan — submenu */}
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <RefreshCw className="size-4" />
                Changer de plan
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-56">
                {(Object.keys(PLAN_LABELS) as PlanAbonnement[]).map((p) => (
                  <DropdownMenuItem
                    key={p}
                    onClick={() => changerPlan(p)}
                    disabled={p === abonnement.plan}
                  >
                    <div className="flex w-full items-center justify-between">
                      <span>{PLAN_LABELS[p]}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatFCFA(PLAN_MONTANTS[p])}
                      </span>
                    </div>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>

            <DropdownMenuSeparator />

            {/* Suspendre */}
            {!isSuspendu && (
              <DropdownMenuItem
                onClick={() => setSuspendreOpen(true)}
                className="text-danger focus:text-danger"
              >
                <Ban className="size-4" />
                Suspendre
              </DropdownMenuItem>
            )}
            {isSuspendu && (
              <DropdownMenuItem disabled>
                <Ban className="size-4" />
                Déjà suspendu
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Dialog de renouvellement (déclaratif) */}
      <RenouvellementDialog
        abonnement={abonnement}
        open={renouvelerOpen}
        onOpenChange={setRenouvelerOpen}
        onRenewed={onUpdated}
      />

      {/* AlertDialog de confirmation pour la suspension */}
      <AlertDialog
        open={suspendreOpen}
        onOpenChange={(o) => {
          if (!o && !pending) setSuspendreOpen(o);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ShieldAlert className="size-5 text-danger" />
              Suspendre cet abonnement ?
            </AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{abonnement.pressing?.nom}</strong> n&apos;aura plus accès
              à la plateforme OgPressing. L&apos;abonnement passe en statut{" "}
              <span className="font-medium text-danger">suspendu</span>. Vous
              pourrez le réactiver à tout moment en enregistrant un nouveau
              paiement.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-2">
            <AlertDialogCancel disabled={pending}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                suspendre();
              }}
              disabled={pending}
              className="bg-danger text-white hover:bg-danger/90"
            >
              {pending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Suspension…
                </>
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

/* ---------------------------------------------------------------- */
/*  Helpers d'affichage                                             */
/* ---------------------------------------------------------------- */

function PlanBadge({ plan }: { plan: PlanAbonnement }) {
  const colors: Record<PlanAbonnement, string> = {
    starter: "bg-muted text-foreground border-border",
    pro: "bg-primary/10 text-primary border-primary/20",
    business: "bg-secondary/10 text-secondary border-secondary/20",
  };
  return (
    <Badge variant="outline" className={cn("font-medium", colors[plan])}>
      {PLAN_LABELS[plan]}
    </Badge>
  );
}

function DateFinCell({ dateFin }: { dateFin: string | null }) {
  if (!dateFin) {
    return <span className="text-muted-foreground">—</span>;
  }
  const expire = isExpire(dateFin);
  const bientot = isExpireBientot(dateFin);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-sm",
        expire
          ? "font-medium text-danger"
          : bientot
          ? "font-medium text-warning"
          : "text-foreground"
      )}
    >
      {expire ? (
        <CalendarX className="size-3.5" />
      ) : bientot ? (
        <CalendarClock className="size-3.5" />
      ) : (
        <Calendar className="size-3.5 text-muted-foreground" />
      )}
      {formatDateOnly(dateFin)}
    </span>
  );
}

/* ---------------------------------------------------------------- */
/*  AbonnementsTable                                                */
/* ---------------------------------------------------------------- */

export function AbonnementsTable({
  abonnements,
  loading,
  onUpdated,
}: AbonnementsTableProps) {
  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (abonnements.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Package className="size-7" />
        </span>
        <p className="mt-3 font-medium text-foreground">
          Aucun abonnement trouvé
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Modifiez vos filtres ou attendez qu&apos;un pressing active son
          abonnement.
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Desktop : tableau */}
      <div className="hidden overflow-hidden rounded-lg border md:block">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50">
            <tr className="text-left">
              <th className="px-4 py-3 font-semibold text-foreground">
                Pressing
              </th>
              <th className="px-4 py-3 font-semibold text-foreground">Plan</th>
              <th className="px-4 py-3 font-semibold text-foreground">Statut</th>
              <th className="px-4 py-3 font-semibold text-foreground">
                Date début
              </th>
              <th className="px-4 py-3 font-semibold text-foreground">
                Date fin
              </th>
              <th className="px-4 py-3 font-semibold text-foreground">
                Montant/mois
              </th>
              <th className="px-4 py-3 text-right font-semibold text-foreground">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {abonnements.map((ab) => {
              const exp = isExpire(ab.date_fin);
              const bientot = isExpireBientot(ab.date_fin);
              return (
                <tr
                  key={ab.id}
                  className={cn(
                    "transition-colors hover:bg-accent/50",
                    exp && "bg-danger/5",
                    !exp && bientot && "bg-warning/5"
                  )}
                >
                  <td className="px-4 py-3">
                    <div className="flex flex-col">
                      <span className="font-medium text-foreground">
                        {ab.pressing?.nom ?? "—"}
                      </span>
                      {ab.pressing?.ville && (
                        <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                          <MapPin className="size-3" />
                          {ab.pressing.ville}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <PlanBadge plan={ab.plan} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge
                      status={ab.statut}
                      label={STATUT_LABELS[ab.statut]}
                      variant={STATUT_VARIANTS[ab.statut]}
                    />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {formatDateOnly(ab.date_debut)}
                  </td>
                  <td className="px-4 py-3">
                    <DateFinCell dateFin={ab.date_fin} />
                  </td>
                  <td className="px-4 py-3 font-medium text-foreground">
                    {formatFCFA(ab.montant_mensuel)}
                  </td>
                  <td className="px-4 py-3">
                    <AbonnementActions abonnement={ab} onUpdated={onUpdated} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile : cards */}
      <ul className="space-y-3 md:hidden">
        {abonnements.map((ab) => {
          const exp = isExpire(ab.date_fin);
          const bientot = isExpireBientot(ab.date_fin);
          return (
            <li
              key={ab.id}
              className={cn(
                "rounded-lg border bg-card p-4",
                exp && "border-danger/30 bg-danger/5",
                !exp && bientot && "border-warning/30 bg-warning/5"
              )}
            >
              {/* En-tête : nom + statut */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate font-semibold text-foreground">
                    <Building2 className="size-4 shrink-0 text-muted-foreground" />
                    {ab.pressing?.nom ?? "—"}
                  </p>
                  {ab.pressing?.ville && (
                    <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
                      <MapPin className="size-3" />
                      {ab.pressing.ville}
                    </p>
                  )}
                </div>
                <StatusBadge
                  status={ab.statut}
                  label={STATUT_LABELS[ab.statut]}
                  variant={STATUT_VARIANTS[ab.statut]}
                />
              </div>

              {/* Badges plan + montant */}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <PlanBadge plan={ab.plan} />
                <Badge variant="outline" className="gap-1 text-xs">
                  <Wallet className="size-3" />
                  {formatFCFA(ab.montant_mensuel)}/mois
                </Badge>
              </div>

              {/* Dates */}
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <p className="text-muted-foreground">Date début</p>
                  <p className="font-medium text-foreground">
                    {formatDateOnly(ab.date_debut)}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Date fin</p>
                  <DateFinCell dateFin={ab.date_fin} />
                </div>
              </div>

              {/* Actions */}
              <div className="mt-3 border-t pt-3">
                <AbonnementActions abonnement={ab} onUpdated={onUpdated} />
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
