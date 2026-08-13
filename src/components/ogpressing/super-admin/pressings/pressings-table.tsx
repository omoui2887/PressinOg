/**
 * e-pressing — PressingsTable
 * -----------------------------
 * Affiche la liste des pressings (Super Admin) sous forme de :
 *   - Tableau sur desktop (md+) : Nom, Ville, Plan actuel, Statut,
 *     Date de création, Employés actifs, Actions
 *   - Cards empilées sur mobile
 *
 * Chaque ligne/card comporte un bouton "Voir détails" qui ouvre la Sheet
 * (gérée par le parent via `onSelect`).
 *
 * Couleurs des statuts et plans gérées par pressings-helpers pour assurer
 * la cohérence visuelle.
 */
"use client";

import {
  Store,
  MapPin,
  CalendarDays,
  Users,
  ArrowRight,
  Package,
  Mail,
  Phone,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import type { ViewMode } from "@/hooks/use-view-mode";
import {
  PlanBadge,
  StatutPressingBadge,
  type PressingListItem,
} from "./pressings-helpers";

interface PressingsTableProps {
  pressings: PressingListItem[];
  loading?: boolean;
  onSelect: (pressing: PressingListItem) => void;
  /** Mode d'affichage : "list" (tableau desktop + cards mobile) ou "grid"
   *  (grille de cards responsive). Défaut : "list" pour retrocompat. */
  viewMode?: ViewMode;
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

export function PressingsTable({
  pressings,
  loading,
  onSelect,
  viewMode = "list",
}: PressingsTableProps) {
  if (loading) {
    if (viewMode === "grid") {
      return (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-44 w-full rounded-lg" />
          ))}
        </div>
      );
    }
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (pressings.length === 0) {
    return (
      <EmptyState
        icon={Store}
        title="Aucun pressing"
        description="Aucun pressing enregistré."
      />
    );
  }

  // ---- Mode GRILLE : cards responsive (remplace tableau desktop + cards mobile)
  if (viewMode === "grid") {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {pressings.map((pressing) => (
          <article
            key={pressing.id}
            className="flex flex-col rounded-lg border bg-card p-4 transition-colors hover:bg-accent/50 hover:shadow-sm"
          >
            {/* En-tête : nom + statut */}
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-foreground">
                  {pressing.nom}
                </p>
                {pressing.email && (
                  <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
                    <Mail className="size-3 shrink-0" />
                    {pressing.email}
                  </p>
                )}
              </div>
              <StatutPressingBadge statut={pressing.statut} />
            </div>

            {/* Badges : plan actuel + employés + commandes */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <PlanBadge plan={pressing.plan_actuel} />
              <span className="inline-flex items-center gap-1 rounded-md border bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground">
                <Users className="size-3" />
                {pressing.employes_actifs} employé
                {pressing.employes_actifs > 1 ? "s" : ""}
              </span>
              <span className="inline-flex items-center gap-1 rounded-md border bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground">
                <Package className="size-3" />
                {pressing.total_commandes} cmd
              </span>
            </div>

            {/* Coordonnées : téléphone + ville + date création */}
            <div className="mt-3 space-y-1 text-xs text-muted-foreground">
              {pressing.telephone && (
                <p className="flex items-center gap-1.5">
                  <Phone className="size-3 shrink-0" />
                  {pressing.telephone}
                </p>
              )}
              {pressing.ville && (
                <p className="flex items-center gap-1.5">
                  <MapPin className="size-3 shrink-0" />
                  {pressing.ville}
                </p>
              )}
              <p className="flex items-center gap-1.5">
                <CalendarDays className="size-3 shrink-0" />
                Créé le {formatDateShort(pressing.created_at)}
              </p>
            </div>

            {/* Action en bas de card */}
            <div className="mt-auto pt-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onSelect(pressing)}
                className="w-full gap-1.5"
              >
                Voir détails
                <ArrowRight className="size-3.5" />
              </Button>
            </div>
          </article>
        ))}
      </div>
    );
  }

  // ---- Mode LISTE (défaut) : comportement inchangé (tableau desktop + cards mobile)
  return (
    <>
      {/* Desktop : tableau */}
      <div className="hidden overflow-x-auto rounded-lg border md:block">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50">
            <tr className="text-left">
              <th className="px-4 py-3 font-semibold text-foreground">
                Nom du pressing
              </th>
              <th className="px-4 py-3 font-semibold text-foreground">Ville</th>
              <th className="px-4 py-3 font-semibold text-foreground">
                Plan actuel
              </th>
              <th className="px-4 py-3 font-semibold text-foreground">Statut</th>
              <th className="px-4 py-3 font-semibold text-foreground">
                Date de création
              </th>
              <th className="px-4 py-3 text-center font-semibold text-foreground">
                Employés actifs
              </th>
              <th className="px-4 py-3 text-right font-semibold text-foreground">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {pressings.map((pressing) => (
              <tr
                key={pressing.id}
                className="group transition-colors hover:bg-accent/50"
              >
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => onSelect(pressing)}
                    className="flex flex-col text-left"
                  >
                    <span className="font-medium text-foreground group-hover:text-primary">
                      {pressing.nom}
                    </span>
                    {pressing.email && (
                      <span className="text-xs text-muted-foreground">
                        {pressing.email}
                      </span>
                    )}
                  </button>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {pressing.ville ? (
                    <span className="flex items-center gap-1">
                      <MapPin className="size-3.5" />
                      {pressing.ville}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-3">
                  <PlanBadge plan={pressing.plan_actuel} />
                </td>
                <td className="px-4 py-3">
                  <StatutPressingBadge statut={pressing.statut} />
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <CalendarDays className="size-3.5" />
                    {formatDateShort(pressing.created_at)}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  <span className="inline-flex items-center gap-1 text-muted-foreground">
                    <Users className="size-3.5" />
                    {pressing.employes_actifs}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onSelect(pressing)}
                    className="gap-1"
                  >
                    Voir détails
                    <ArrowRight className="size-3.5" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile : cards */}
      <ul className="space-y-3 md:hidden">
        {pressings.map((pressing) => (
          <li key={pressing.id}>
            <button
              type="button"
              onClick={() => onSelect(pressing)}
              className="block w-full rounded-lg border bg-card p-4 text-left transition-colors hover:bg-accent/50 active:bg-accent"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-foreground">
                    {pressing.nom}
                  </p>
                  {pressing.ville && (
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="size-3" />
                      {pressing.ville}
                    </p>
                  )}
                </div>
                <StatutPressingBadge statut={pressing.statut} />
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <PlanBadge plan={pressing.plan_actuel} />
                <span className="inline-flex items-center gap-1 rounded-md border bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground">
                  <Users className="size-3" />
                  {pressing.employes_actifs} employé
                  {pressing.employes_actifs > 1 ? "s" : ""}
                </span>
                <span className="inline-flex items-center gap-1 rounded-md border bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground">
                  <Package className="size-3" />
                  {pressing.total_commandes} cmd
                </span>
                <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
                  <CalendarDays className="size-3" />
                  {formatDateShort(pressing.created_at)}
                </span>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
