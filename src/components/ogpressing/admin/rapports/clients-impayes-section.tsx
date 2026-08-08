/**
 * OgPressing — ClientsImpayesSection (LOT 12.1)
 * -----------------------------------------------
 * Section "Clients avec impayés" de la page /admin/rapports.
 *
 * Affiche la liste des clients dont le solde impayé (somme des
 * montant_total - montant_paye sur les commandes non_paye/partiel) est > 0,
 * triée par montant décroissant (top 20 fourni par l'API).
 *
 * Layout :
 *   - Desktop (md+) : Tableau (Nom | Téléphone | Solde impayé | Nb commandes)
 *   - Mobile : Cards empilées
 *
 * États : loading (skeletons), empty (message), data (table/cards).
 */
"use client";

import { AlertTriangle, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatFCFA } from "@/lib/utils/format";
import type { ClientImpaye } from "./rapports-helpers";

interface ClientsImpayesSectionProps {
  clients: ClientImpaye[];
  loading: boolean;
}

export function ClientsImpayesSection({
  clients,
  loading,
}: ClientsImpayesSectionProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="size-5 text-warning" />
            Clients avec impayés
          </CardTitle>
          {!loading && (
            <Badge
              variant="outline"
              className={cn(
                "border-warning/30 bg-warning/10 text-warning",
                clients.length === 0 && "border-muted text-muted-foreground bg-muted/30"
              )}
            >
              {clients.length} client{clients.length > 1 ? "s" : ""}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-md" />
            ))}
          </div>
        ) : clients.length === 0 ? (
          <EmptyState
            icon={Users}
            compact
            title="Aucun client avec impayé sur cette période"
            description="Tous les clients ont soldé leurs commandes. Les impayés apparaîtront ici dès qu'une commande sera laissée non payée."
          />
        ) : (
          <>
            {/* Vue desktop : tableau */}
            <div className="hidden overflow-hidden rounded-lg border md:block">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Nom</TableHead>
                    <TableHead>Téléphone</TableHead>
                    <TableHead className="text-right">Solde impayé</TableHead>
                    <TableHead className="text-center">
                      Nb commandes impayées
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clients.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium text-foreground">
                        {c.nom_complet}
                      </TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">
                        {c.telephone}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge className="border-transparent bg-danger/10 font-semibold text-danger">
                          {formatFCFA(c.solde_impaye)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center tabular-nums">
                        {c.nombre_commandes_impayees}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Vue mobile : cards */}
            <div className="space-y-3 md:hidden">
              {clients.map((c) => (
                <div
                  key={c.id}
                  className="rounded-lg border border-danger/20 bg-danger/5 p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-foreground">
                        {c.nom_complet}
                      </p>
                      <p className="text-xs tabular-nums text-muted-foreground">
                        {c.telephone}
                      </p>
                    </div>
                    <Badge className="border-transparent bg-danger/10 font-semibold text-danger">
                      {formatFCFA(c.solde_impaye)}
                    </Badge>
                  </div>
                  <div className="mt-2 flex items-center justify-between border-t border-danger/10 pt-2 text-xs text-muted-foreground">
                    <span>{c.nombre_commandes_impayees} commande{c.nombre_commandes_impayees > 1 ? "s" : ""} impayée{c.nombre_commandes_impayees > 1 ? "s" : ""}</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
