/**
 * OgPressing — CommandesList
 * ---------------------------
 * Affiche la liste des commandes sous forme de :
 *   - Tableau sur desktop (md+) : N° ticket, Client, Statut, Paiement,
 *     Montant total, Date création, Date retrait prévue, Actions
 *   - Cards empilées sur mobile avec les mêmes infos
 *
 * Chaque ligne/card est cliquable → /admin/commandes/{id} (page détail).
 *
 * États :
 *   - loading : 5 skeletons
 *   - empty   : dashed border + icône + message
 *   - data    : tableau/cards
 *
 * Formatage via `formatFCFA` + `formatDateOnly` de `@/lib/utils/format`.
 * Statuts via `StatusBadge` (variant info/success/warning/danger/neutral).
 */
"use client";

import Link from "next/link";
import {
  ArrowRight,
  Calendar,
  Clock,
  Package,
  Phone,
  User,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatFCFA, formatDateOnly } from "@/lib/utils/format";
import {
  STATUT_LABELS,
  STATUT_PAIEMENT_LABELS,
  statutPaiementVariant,
  statutVariant,
  type CommandeListItem,
} from "./commandes-helpers";

interface CommandesListProps {
  commandes: CommandeListItem[];
  loading?: boolean;
}

export function CommandesList({ commandes, loading }: CommandesListProps) {
  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (commandes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Package className="size-7" />
        </span>
        <p className="mt-3 font-medium text-foreground">
          Aucune commande trouvée
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Modifiez votre recherche ou créez une nouvelle commande.
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
                N° ticket
              </th>
              <th className="px-4 py-3 font-semibold text-foreground">Client</th>
              <th className="px-4 py-3 font-semibold text-foreground">Statut</th>
              <th className="px-4 py-3 font-semibold text-foreground">
                Paiement
              </th>
              <th className="px-4 py-3 text-right font-semibold text-foreground">
                Montant
              </th>
              <th className="px-4 py-3 font-semibold text-foreground">Créée le</th>
              <th className="px-4 py-3 font-semibold text-foreground">
                Retrait prévu
              </th>
              <th className="px-4 py-3 text-right font-semibold text-foreground">
                Actions
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
                    href={`/admin/commandes/${cmd.id}`}
                    className="font-mono text-xs font-medium text-foreground group-hover:text-primary"
                  >
                    {cmd.numero_commande}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/commandes/${cmd.id}`}
                    className="flex flex-col"
                  >
                    <span className="font-medium text-foreground group-hover:text-primary">
                      {cmd.client?.nom_complet ?? "—"}
                    </span>
                    {cmd.client?.telephone && (
                      <span className="text-xs text-muted-foreground">
                        {cmd.client.telephone}
                      </span>
                    )}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge
                    status={cmd.statut}
                    label={STATUT_LABELS[cmd.statut] ?? cmd.statut}
                    variant={statutVariant(cmd.statut)}
                  />
                </td>
                <td className="px-4 py-3">
                  <StatusBadge
                    status={cmd.statut_paiement}
                    label={
                      STATUT_PAIEMENT_LABELS[cmd.statut_paiement] ??
                      cmd.statut_paiement
                    }
                    variant={statutPaiementVariant(cmd.statut_paiement)}
                  />
                </td>
                <td className="px-4 py-3 text-right font-medium text-foreground">
                  {formatFCFA(cmd.montant_total)}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {formatDateOnly(cmd.created_at)}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {formatDateOnly(cmd.date_pret_prevue)}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/admin/commandes/${cmd.id}`}
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
      <ul className="space-y-3 md:hidden">
        {commandes.map((cmd) => (
          <li key={cmd.id}>
            <Link
              href={`/admin/commandes/${cmd.id}`}
              className="block rounded-lg border bg-card p-4 transition-colors hover:bg-accent/50 active:bg-accent"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-xs font-semibold text-foreground">
                    {cmd.numero_commande}
                  </p>
                  <p className="mt-1 flex items-center gap-1 truncate text-sm font-medium text-foreground">
                    <User className="size-3 text-muted-foreground" />
                    {cmd.client?.nom_complet ?? "—"}
                  </p>
                  {cmd.client?.telephone && (
                    <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
                      <Phone className="size-3" />
                      {cmd.client.telephone}
                    </p>
                  )}
                </div>
                <ArrowRight className="mt-1 size-4 shrink-0 text-muted-foreground" />
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <StatusBadge
                  status={cmd.statut}
                  label={STATUT_LABELS[cmd.statut] ?? cmd.statut}
                  variant={statutVariant(cmd.statut)}
                />
                <StatusBadge
                  status={cmd.statut_paiement}
                  label={
                    STATUT_PAIEMENT_LABELS[cmd.statut_paiement] ??
                    cmd.statut_paiement
                  }
                  variant={statutPaiementVariant(cmd.statut_paiement)}
                />
                <span className="ml-auto text-sm font-semibold text-foreground">
                  {formatFCFA(cmd.montant_total)}
                </span>
              </div>

              <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="size-3" />
                  {formatDateOnly(cmd.created_at)}
                </span>
                {cmd.date_pret_prevue && (
                  <span className="flex items-center gap-1">
                    <Calendar className="size-3" />
                    Retrait : {formatDateOnly(cmd.date_pret_prevue)}
                  </span>
                )}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
