/**
 * OgPressing — ClientsList
 * -------------------------
 * Affiche la liste des clients enrichis (avec solde_impaye, total_depense,
 * nombre_commandes) sous forme de :
 *   - Tableau sur desktop (md+)
 *   - Cards empilées sur mobile
 *
 * Chaque client est cliquable → /admin/clients/{id} (page de détail).
 *
 * Formatage des montants en FCFA avec séparateur de milliers (fr-FR).
 * Badge "impayé" rouge avec icône si solde_impaye > 0, sinon discret gris.
 */
"use client";

import Link from "next/link";
import {
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  Star,
  ShoppingBag,
  MapPin,
  Phone,
  Package,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface ClientEnrichi {
  id: string;
  nom_complet: string;
  telephone: string;
  email: string | null;
  adresse: string | null;
  points_fidelite: number;
  notes: string | null;
  created_at: string;
  solde_impaye: number;
  total_depense: number;
  nombre_commandes: number;
  derniere_commande: string | null;
}

interface ClientsListProps {
  clients: ClientEnrichi[];
  loading?: boolean;
  /** Base path for client detail links. Defaults to "/admin" (admin space).
   *  Set to "/personnel/receptionniste" (or other role) for personnel variants. */
  basePath?: string;
}

function formatFCFA(value: number): string {
  return new Intl.NumberFormat("fr-FR").format(value) + " FCFA";
}

function ImpayeBadge({ solde }: { solde: number }) {
  if (solde > 0) {
    return (
      <Badge
        variant="destructive"
        className="gap-1 whitespace-nowrap"
        title={`Solde impayé : ${formatFCFA(solde)}`}
      >
        <AlertCircle className="size-3" />
        {formatFCFA(solde)}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1 whitespace-nowrap text-muted-foreground">
      <CheckCircle2 className="size-3 text-secondary" />
      0 FCFA
    </Badge>
  );
}

export function ClientsList({ clients, loading, basePath = "/admin" }: ClientsListProps) {
  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (clients.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Package className="size-7" />
        </span>
        <p className="mt-3 font-medium text-foreground">Aucun client trouvé</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Modifiez votre recherche ou ajoutez un nouveau client.
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
              <th className="px-4 py-3 font-semibold text-foreground">Nom</th>
              <th className="px-4 py-3 font-semibold text-foreground">Téléphone</th>
              <th className="px-4 py-3 text-center font-semibold text-foreground">
                Fidélité
              </th>
              <th className="px-4 py-3 font-semibold text-foreground">
                Solde impayé
              </th>
              <th className="px-4 py-3 font-semibold text-foreground">
                Total dépensé
              </th>
              <th className="px-4 py-3 text-center font-semibold text-foreground">
                Commandes
              </th>
              <th className="px-4 py-3 text-right font-semibold text-foreground">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {clients.map((client) => (
              <tr
                key={client.id}
                className="group transition-colors hover:bg-accent/50"
              >
                <td className="px-4 py-3">
                  <Link
                    href={`${basePath}/clients/${client.id}`}
                    className="flex flex-col"
                  >
                    <span className="font-medium text-foreground group-hover:text-primary">
                      {client.nom_complet}
                    </span>
                    {client.email && (
                      <span className="text-xs text-muted-foreground">
                        {client.email}
                      </span>
                    )}
                  </Link>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {client.telephone}
                </td>
                <td className="px-4 py-3 text-center">
                  <span className="inline-flex items-center gap-1 text-xs">
                    <Star className="size-3.5 text-warning" />
                    {client.points_fidelite}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <ImpayeBadge solde={client.solde_impaye} />
                </td>
                <td className="px-4 py-3 font-medium text-foreground">
                  {formatFCFA(client.total_depense)}
                </td>
                <td className="px-4 py-3 text-center text-muted-foreground">
                  {client.nombre_commandes}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`${basePath}/clients/${client.id}`}
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
        {clients.map((client) => (
          <li key={client.id}>
            <Link
              href={`${basePath}/clients/${client.id}`}
              className="block rounded-lg border bg-card p-4 transition-colors hover:bg-accent/50 active:bg-accent"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-foreground">
                    {client.nom_complet}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                    <Phone className="size-3" />
                    {client.telephone}
                  </p>
                  {client.adresse && (
                    <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
                      <MapPin className="size-3" />
                      {client.adresse}
                    </p>
                  )}
                </div>
                <ArrowRight className="mt-1 size-4 shrink-0 text-muted-foreground" />
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <ImpayeBadge solde={client.solde_impaye} />
                <Badge variant="outline" className="gap-1 text-xs">
                  <ShoppingBag className="size-3" />
                  {client.nombre_commandes} cmd
                </Badge>
                <Badge variant="outline" className="gap-1 text-xs">
                  <Star className="size-3 text-warning" />
                  {client.points_fidelite} pts
                </Badge>
                <span className="ml-auto text-xs font-medium text-foreground">
                  {formatFCFA(client.total_depense)}
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
