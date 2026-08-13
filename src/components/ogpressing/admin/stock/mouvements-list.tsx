/**
 * e-pressing — MouvementsList (LOT 10.2)
 * ---------------------------------------
 * Liste des mouvements de stock.
 *
 * Modes d'affichage :
 *   - viewMode="list" (défaut) : Tableau desktop (md+) + Cards mobile.
 *   - viewMode="grid"          : Grille de cards responsive (remplace table + cards mobile).
 *
 * Colonnes : Date, Produit, Type (badge Entrée vert / Sortie orange),
 * Quantité, Commande (ticket lien si commande_id), Effectué par, Notes.
 */
"use client";

import Link from "next/link";
import { ArrowDownCircle, ArrowUpCircle, History } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import type { ViewMode } from "@/hooks/use-view-mode";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatDateTime, formatQuantite, type MouvementStock } from "./stock-helpers";

interface MouvementsListProps {
  mouvements: MouvementStock[];
  loading: boolean;
  /** Mode d'affichage : "list" (table desktop + cards mobile) ou "grid" (grille de cards). */
  viewMode?: ViewMode;
}

export function MouvementsList({
  mouvements,
  loading,
  viewMode = "list",
}: MouvementsListProps) {
  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (mouvements.length === 0) {
    return (
      <Card className="p-0">
        <EmptyState
          icon={History}
          title="Aucun mouvement"
          description="Les entrées et sorties de stock apparaîtront ici."
          className="m-0 border-0"
        />
      </Card>
    );
  }

  // ---- Mode grille : cards responsives ----
  // Note : en mode grille, sortie est rouge (danger) selon les specs harmonisées,
  // pour distinguer plus fortement les mouvements négatifs dans la vue dense.
  if (viewMode === "grid") {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {mouvements.map((m) => {
          const isEntree = m.type_mouvement === "entree";
          return (
            <article
              key={m.id}
              className="group flex flex-col gap-3 rounded-lg border bg-card p-4 transition-colors hover:bg-accent/50 hover:shadow-sm"
            >
              {/* En-tête : produit + badge type */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-foreground">
                    {m.produit_nom ?? "—"}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {formatDateTime(m.date_mouvement)}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={cn(
                    "shrink-0 gap-1 font-medium",
                    isEntree
                      ? "bg-success/10 text-success border-success/30"
                      : "bg-danger/10 text-danger border-danger/30"
                  )}
                >
                  {isEntree ? (
                    <ArrowDownCircle className="size-3" />
                  ) : (
                    <ArrowUpCircle className="size-3" />
                  )}
                  {isEntree ? "Entrée" : "Sortie"}
                </Badge>
              </div>

              {/* Quantité */}
              <div className="flex items-baseline gap-2">
                <span
                  className={cn(
                    "text-xl font-bold tabular-nums",
                    isEntree ? "text-success" : "text-danger"
                  )}
                >
                  {isEntree ? "+" : "−"}
                  {formatQuantite(m.quantite, m.produit_unite ?? "litre")}
                </span>
              </div>

              {/* Raison / motif */}
              {m.motif && (
                <p className="line-clamp-2 text-xs text-muted-foreground">
                  {m.motif}
                </p>
              )}

              {/* Footer : effectué par + commande liée */}
              <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t pt-2 text-xs text-muted-foreground">
                <span>
                  par{" "}
                  <span className="font-medium text-foreground">
                    {m.enregistre_par_nom ?? "—"}
                  </span>
                </span>
                {m.commande_ticket && (
                  <Link
                    href="/admin/commandes"
                    className="font-medium text-primary hover:underline"
                  >
                    {m.commande_ticket}
                  </Link>
                )}
              </div>
            </article>
          );
        })}
      </div>
    );
  }

  // ---- Mode liste (défaut) : table desktop + cards mobile ----
  return (
    <>
      {/* Vue desktop : tableau */}
      <div className="hidden overflow-hidden rounded-lg border md:block">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-[15%]">Date</TableHead>
              <TableHead>Produit</TableHead>
              <TableHead className="w-[10%]">Type</TableHead>
              <TableHead className="text-right">Quantité</TableHead>
              <TableHead>Commande</TableHead>
              <TableHead>Effectué par</TableHead>
              <TableHead>Notes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {mouvements.map((m) => {
              const isEntree = m.type_mouvement === "entree";
              return (
                <TableRow key={m.id}>
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                    {formatDateTime(m.date_mouvement)}
                  </TableCell>
                  <TableCell className="font-medium text-foreground">
                    {m.produit_nom ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={cn(
                        "gap-1 font-medium",
                        isEntree
                          ? "bg-secondary/10 text-secondary border-secondary/30"
                          : "bg-warning/10 text-warning border-warning/30"
                      )}
                    >
                      {isEntree ? (
                        <ArrowDownCircle className="size-3" />
                      ) : (
                        <ArrowUpCircle className="size-3" />
                      )}
                      {isEntree ? "Entrée" : "Sortie"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    <span className={isEntree ? "text-secondary" : "text-warning"}>
                      {isEntree ? "+" : "−"}
                    </span>
                    {formatQuantite(m.quantite, m.produit_unite ?? "litre")}
                  </TableCell>
                  <TableCell>
                    {m.commande_ticket ? (
                      <Link
                        href={`/admin/commandes`}
                        className="text-sm text-primary hover:underline"
                      >
                        {m.commande_ticket}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {m.enregistre_par_nom ?? "—"}
                  </TableCell>
                  <TableCell className="max-w-xs truncate text-sm text-muted-foreground">
                    {m.motif ?? "—"}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Vue mobile : cards */}
      <div className="space-y-3 md:hidden">
        {mouvements.map((m) => {
          const isEntree = m.type_mouvement === "entree";
          return (
            <Card key={m.id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-foreground">{m.produit_nom ?? "—"}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(m.date_mouvement)}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={cn(
                    "shrink-0 gap-1 font-medium",
                    isEntree
                      ? "bg-secondary/10 text-secondary border-secondary/30"
                      : "bg-warning/10 text-warning border-warning/30"
                  )}
                >
                  {isEntree ? (
                    <ArrowDownCircle className="size-3" />
                  ) : (
                    <ArrowUpCircle className="size-3" />
                  )}
                  {isEntree ? "Entrée" : "Sortie"}
                </Badge>
              </div>
              <div className="mt-3 flex items-center justify-between border-t pt-2">
                <span className="text-lg font-bold tabular-nums">
                  <span className={isEntree ? "text-secondary" : "text-warning"}>
                    {isEntree ? "+" : "−"}
                  </span>
                  {formatQuantite(m.quantite, m.produit_unite ?? "litre")}
                </span>
                {m.enregistre_par_nom && (
                  <span className="text-xs text-muted-foreground">
                    par {m.enregistre_par_nom}
                  </span>
                )}
              </div>
              {m.motif && (
                <p className="mt-2 text-xs text-muted-foreground">{m.motif}</p>
              )}
              {m.commande_ticket && (
                <Link
                  href="/admin/commandes"
                  className="mt-1 inline-block text-xs text-primary hover:underline"
                >
                  Commande : {m.commande_ticket}
                </Link>
              )}
            </Card>
          );
        })}
      </div>
    </>
  );
}
