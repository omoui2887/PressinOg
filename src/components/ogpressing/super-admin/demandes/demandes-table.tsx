/**
 * OgPressing — DemandesTable
 * ---------------------------
 * Affiche la liste des demandes d'inscription :
 *   - Tableau sur desktop (md+) : Date, Nom + Prénom, Nom du pressing, Ville,
 *     Téléphone, Statut (badge coloré), Actions (bouton "Voir détails")
 *   - Cards empilées sur mobile
 *
 * Le bouton "Voir détails" ouvre la Sheet détaillée gérée par le parent.
 */
"use client";

import { CalendarDays, Phone, MapPin, Inbox, Eye, Mail, Building2, Hash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/shared";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import type { ViewMode } from "@/hooks/use-view-mode";
import {
  PLAN_LABELS,
  STATUT_LABELS,
  STATUT_VARIANTS,
  type DemandeInscription,
} from "./types";

interface DemandesTableProps {
  demandes: DemandeInscription[];
  loading?: boolean;
  onVoirDetails: (demande: DemandeInscription) => void;
  /** Mode d'affichage : "list" (tableau desktop + cards mobile) ou "grid"
   *  (grille de cards responsive). Défaut : "list" pour retrocompat. */
  viewMode?: ViewMode;
}

export function DemandesTable({
  demandes,
  loading,
  onVoirDetails,
  viewMode = "list",
}: DemandesTableProps) {
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

  if (demandes.length === 0) {
    return (
      <EmptyState
        icon={Inbox}
        title="Aucune demande"
        description="Aucune demande d'inscription en attente."
      />
    );
  }

  // ---- Mode GRILLE : cards responsive (remplace tableau desktop + cards mobile)
  if (viewMode === "grid") {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {demandes.map((d) => {
          const planLabel = d.plan_souhaite
            ? (PLAN_LABELS[d.plan_souhaite] ?? d.plan_souhaite)
            : null;
          return (
            <article
              key={d.id}
              className="flex flex-col rounded-lg border bg-card p-4 transition-colors hover:bg-accent/50 hover:shadow-sm"
            >
              {/* En-tête : pressing + statut */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate font-semibold text-foreground">
                    <Building2 className="size-4 shrink-0 text-muted-foreground" />
                    {d.nom_pressing}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {d.nom_gerant}
                  </p>
                </div>
                <StatusBadge
                  status={d.statut}
                  label={STATUT_LABELS[d.statut]}
                  variant={STATUT_VARIANTS[d.statut]}
                />
              </div>

              {/* Badges : plan demandé (si renseigné) + date */}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {planLabel && (
                  <Badge variant="outline" className="gap-1 text-xs">
                    <Hash className="size-3" />
                    {planLabel}
                  </Badge>
                )}
                <Badge variant="outline" className="gap-1 text-xs text-muted-foreground">
                  <CalendarDays className="size-3" />
                  {formatDateShort(d.created_at)}
                </Badge>
              </div>

              {/* Coordonnées : email + téléphone + ville */}
              <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                {d.email && (
                  <p className="flex items-center gap-1.5 truncate">
                    <Mail className="size-3 shrink-0" />
                    {d.email}
                  </p>
                )}
                <p className="flex items-center gap-1.5">
                  <Phone className="size-3 shrink-0" />
                  {d.telephone}
                </p>
                {d.ville && (
                  <p className="flex items-center gap-1.5">
                    <MapPin className="size-3 shrink-0" />
                    {d.ville}
                  </p>
                )}
              </div>

              {/* Action en bas de card */}
              <div className="mt-auto pt-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onVoirDetails(d)}
                  className="w-full gap-1.5"
                >
                  <Eye className="size-4" />
                  Voir détails
                </Button>
              </div>
            </article>
          );
        })}
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
              <th className="px-4 py-3 font-semibold text-foreground">Date</th>
              <th className="px-4 py-3 font-semibold text-foreground">
                Nom du gérant
              </th>
              <th className="px-4 py-3 font-semibold text-foreground">
                Nom du pressing
              </th>
              <th className="px-4 py-3 font-semibold text-foreground">Ville</th>
              <th className="px-4 py-3 font-semibold text-foreground">
                Téléphone
              </th>
              <th className="px-4 py-3 font-semibold text-foreground">Statut</th>
              <th className="px-4 py-3 text-right font-semibold text-foreground">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {demandes.map((d) => (
              <tr
                key={d.id}
                className="transition-colors hover:bg-accent/50"
              >
                <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <CalendarDays className="size-3.5" />
                    {formatDateShort(d.created_at)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="font-medium text-foreground">
                    {d.nom_gerant}
                  </span>
                </td>
                <td className="px-4 py-3 text-foreground">{d.nom_pressing}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {d.ville ? (
                    <span className="flex items-center gap-1">
                      <MapPin className="size-3.5" />
                      {d.ville}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Phone className="size-3.5" />
                    {d.telephone}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge
                    status={d.statut}
                    label={STATUT_LABELS[d.statut]}
                    variant={STATUT_VARIANTS[d.statut]}
                  />
                </td>
                <td className="px-4 py-3 text-right">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onVoirDetails(d)}
                    className="gap-1.5"
                  >
                    <Eye className="size-4" />
                    Voir détails
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile : cards */}
      <ul className="space-y-3 md:hidden">
        {demandes.map((d) => (
          <li
            key={d.id}
            className="rounded-lg border bg-card p-4"
          >
            {/* En-tête : nom + statut */}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="truncate font-semibold text-foreground">
                  {d.nom_gerant}
                </p>
                <p className="truncate text-sm text-muted-foreground">
                  {d.nom_pressing}
                </p>
              </div>
              <StatusBadge
                status={d.statut}
                label={STATUT_LABELS[d.statut]}
                variant={STATUT_VARIANTS[d.statut]}
                className="shrink-0"
              />
            </div>

            {/* Métadonnées */}
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <CalendarDays className="size-3" />
                {formatDateShort(d.created_at)}
              </span>
              {d.ville && (
                <span className="flex items-center gap-1">
                  <MapPin className="size-3" />
                  {d.ville}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Phone className="size-3" />
                {d.telephone}
              </span>
            </div>

            {/* Action */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => onVoirDetails(d)}
              className="mt-3 w-full gap-1.5"
            >
              <Eye className="size-4" />
              Voir détails
            </Button>
          </li>
        ))}
      </ul>
    </>
  );
}

/** Formatage date court JJ/MM/AAAA (sans heure, plus compact sur mobile). */
function formatDateShort(dateISO: string): string {
  const d = new Date(dateISO);
  if (Number.isNaN(d.getTime())) return "—";
  const jj = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const aaaa = d.getFullYear();
  return `${jj}/${mm}/${aaaa}`;
}
