/**
 * OgPressing — PersonnelList
 * ---------------------------
 * Affiche la liste des employés du pressing sous forme de :
 *   - Tableau sur desktop (md+) : Nom, Rôle, Téléphone, Statut, Créé le, Actions
 *   - Cards empilées sur mobile
 *
 * Chaque ligne/card embarque le PersonnelActionsMenu (3 points) qui gère
 * Modifier / Reset password / Renvoyer invitation / Désactiver / Réactiver.
 *
 * Couleurs des rôles et statuts gérées par personnel-helpers (RoleBadge,
 * StatutBadge) pour assurer la cohérence visuelle.
 */
"use client";

import { Phone, Mail, UserCog, CalendarDays } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  type Employe,
  RoleBadge,
  StatutBadge,
  formatDateShort,
} from "./personnel-helpers";
import { PersonnelActionsMenu } from "./personnel-actions-menu";

interface PersonnelListProps {
  employes: Employe[];
  loading?: boolean;
  onUpdated?: () => void;
}

export function PersonnelList({ employes, loading, onUpdated }: PersonnelListProps) {
  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (employes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <UserCog className="size-7" />
        </span>
        <p className="mt-3 font-medium text-foreground">Aucun employé trouvé</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Modifiez vos filtres ou ajoutez un nouvel employé.
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
              <th className="px-4 py-3 font-semibold text-foreground">Nom complet</th>
              <th className="px-4 py-3 font-semibold text-foreground">Rôle</th>
              <th className="px-4 py-3 font-semibold text-foreground">Téléphone</th>
              <th className="px-4 py-3 font-semibold text-foreground">Statut</th>
              <th className="px-4 py-3 font-semibold text-foreground">Créé le</th>
              <th className="px-4 py-3 text-right font-semibold text-foreground">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {employes.map((employe) => (
              <tr
                key={employe.id}
                className="transition-colors hover:bg-accent/50"
              >
                <td className="px-4 py-3">
                  <div className="flex flex-col">
                    <span className="font-medium text-foreground">
                      {employe.nom_complet}
                    </span>
                    {employe.email && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Mail className="size-3" />
                        {employe.email}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <RoleBadge role={employe.role} />
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {employe.telephone ? (
                    <span className="flex items-center gap-1">
                      <Phone className="size-3.5" />
                      {employe.telephone}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-3">
                  <StatutBadge statut={employe.statut_compte} />
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <CalendarDays className="size-3.5" />
                    {formatDateShort(employe.created_at)}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <PersonnelActionsMenu
                    employe={employe}
                    onUpdated={onUpdated}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile : cards */}
      <ul className="space-y-3 md:hidden">
        {employes.map((employe) => (
          <li
            key={employe.id}
            className="rounded-lg border bg-card p-4"
          >
            {/* En-tête : nom + actions */}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-foreground">
                  {employe.nom_complet}
                </p>
                {employe.email && (
                  <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
                    <Mail className="size-3" />
                    {employe.email}
                  </p>
                )}
                {employe.telephone && (
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                    <Phone className="size-3" />
                    {employe.telephone}
                  </p>
                )}
              </div>
              <PersonnelActionsMenu
                employe={employe}
                onUpdated={onUpdated}
              />
            </div>

            {/* Badges : rôle + statut */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <RoleBadge role={employe.role} />
              <StatutBadge statut={employe.statut_compte} />
            </div>

            {/* Date de création */}
            <div className="mt-3 flex items-center gap-1 border-t pt-2 text-xs text-muted-foreground">
              <CalendarDays className="size-3" />
              Créé le {formatDateShort(employe.created_at)}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

// Réexport du type pour réutilisation par le parent
export type { Employe };
