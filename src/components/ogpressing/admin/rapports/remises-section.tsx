/**
 * OgPressing — RemisesSection (LOT 12.1)
 * ----------------------------------------
 * Section "Remises appliquées" de la page /admin/rapports.
 *
 * Affiche la liste des commandes ayant bénéficié d'une remise sur la période
 * sélectionnée, avec le type et le montant de la remise.
 *
 * Layout :
 *   - Desktop (md+) : Tableau (N° ticket | Client | Type remise | Montant | Date)
 *   - Mobile : Cards empilées
 *
 * États : loading (skeletons), empty (message), data (table/cards).
 */
"use client";

import { Tag } from "lucide-react";
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
import { formatFCFA, formatDate } from "@/lib/utils/format";
import type { RemiseAppliquee } from "./rapports-helpers";

interface RemisesSectionProps {
  remises: RemiseAppliquee[];
  loading: boolean;
}

/** Couleur du badge selon le type de remise. */
function badgeClassForRemiseType(type: string): string {
  switch (type) {
    case "pourcentage":
      return "border-primary/30 bg-primary/10 text-primary";
    case "montant_fixe":
      return "border-secondary/30 bg-secondary/10 text-secondary";
    case "article_gratuit":
      return "border-warning/30 bg-warning/10 text-warning";
    case "fidelite":
      return "border-primary/30 bg-primary/10 text-primary";
    default:
      return "border-muted text-muted-foreground";
  }
}

export function RemisesSection({ remises, loading }: RemisesSectionProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Tag className="size-5 text-primary" />
            Remises appliquées
          </CardTitle>
          {!loading && (
            <Badge variant="outline">
              {remises.length} remise{remises.length > 1 ? "s" : ""}
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
        ) : remises.length === 0 ? (
          <EmptyState
            icon={Tag}
            compact
            title="Aucune remise appliquée sur cette période"
            description="Les commandes bénéficiant d'une remise (pourcentage, montant fixe, article gratuit ou fidélité) apparaîtront ici."
          />
        ) : (
          <>
            {/* Vue desktop : tableau */}
            <div className="hidden overflow-hidden rounded-lg border md:block">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>N° ticket</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Type remise</TableHead>
                    <TableHead className="text-right">Montant remise</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {remises.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs font-medium text-foreground">
                        {r.numero_commande}
                      </TableCell>
                      <TableCell className="text-foreground">
                        {r.client_nom}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn(
                            "font-medium",
                            badgeClassForRemiseType(r.remise_type)
                          )}
                        >
                          {r.remise_type_label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums text-warning">
                        −{formatFCFA(r.montant_remise)}
                      </TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">
                        {formatDate(r.date)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Vue mobile : cards */}
            <div className="space-y-3 md:hidden">
              {remises.map((r) => (
                <div key={r.id} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-mono text-xs font-medium text-foreground">
                        {r.numero_commande}
                      </p>
                      <p className="truncate text-sm font-semibold text-foreground">
                        {r.client_nom}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-bold tabular-nums text-warning">
                      −{formatFCFA(r.montant_remise)}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between border-t pt-2">
                    <Badge
                      variant="outline"
                      className={cn(
                        "font-medium",
                        badgeClassForRemiseType(r.remise_type)
                      )}
                    >
                      {r.remise_type_label}
                    </Badge>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {formatDate(r.date)}
                    </span>
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
