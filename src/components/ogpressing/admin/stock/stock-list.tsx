/**
 * e-pressing — StockList (LOT 10.1)
 * ----------------------------------
 * Liste des produits de stock.
 *
 * Modes d'affichage :
 *   - viewMode="list" (défaut) : Tableau desktop (md+) + Cards mobile.
 *   - viewMode="grid"          : Grille de cards responsive (remplace table + cards mobile).
 *
 * Colonnes : Nom, Catégorie (badge), Quantité + unité, Seuil, Statut (🔴🟡✅),
 * Expiration (badge si proche/dépassée), Actions.
 *
 * Tri : alertes critiques en premier (géré côté API + réaffichage ici).
 */
"use client";

import { PackageOpen, AlertTriangle } from "lucide-react";
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
import {
  categorieBadgeClass,
  categorieLabel,
  formatDate,
  formatFCFA,
  formatQuantite,
  getExpirationStatus,
  getStockStatus,
  type ProduitStock,
} from "./stock-helpers";
import { StockActionsMenu } from "./stock-actions-menu";

interface StockListProps {
  produits: ProduitStock[];
  loading: boolean;
  /** Mode d'affichage : "list" (table desktop + cards mobile) ou "grid" (grille de cards). */
  viewMode?: ViewMode;
  onMouvement: (p: ProduitStock) => void;
  onEdit: (p: ProduitStock) => void;
}

export function StockList({
  produits,
  loading,
  viewMode = "list",
  onMouvement,
  onEdit,
}: StockListProps) {
  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (produits.length === 0) {
    return (
      <EmptyState
        icon={PackageOpen}
        title="Aucun article en stock"
        description="Le stock de biodétergents est vide."
      />
    );
  }

  // Compteurs pour l'en-tête
  const criticalCount = produits.filter(
    (p) =>
      Number(p.seuil_alerte) > 0 &&
      Number(p.quantite_actuelle) < Number(p.seuil_alerte)
  ).length;

  const alerteBanner =
    criticalCount > 0 ? (
      <div className="flex items-center gap-2 rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm">
        <AlertTriangle className="size-4 shrink-0 text-danger" />
        <span className="text-danger">
          <strong>{criticalCount}</strong> produit{criticalCount > 1 ? "s" : ""} en alerte de stock bas.
        </span>
      </div>
    ) : null;

  // ---- Mode grille : cards responsives ----
  if (viewMode === "grid") {
    return (
      <div className="space-y-3">
        {alerteBanner}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {produits.map((p) => {
            const status = getStockStatus(
              Number(p.quantite_actuelle),
              Number(p.seuil_alerte)
            );
            const exp = getExpirationStatus(p.date_expiration);
            return (
              <article
                key={p.id}
                className={cn(
                  "group flex flex-col gap-3 rounded-lg border bg-card p-4 transition-colors hover:bg-accent/50 hover:shadow-sm",
                  status.level === "critical" && "border-danger/30 bg-danger/5"
                )}
              >
                {/* En-tête : nom + menu actions */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-foreground">
                      {p.nom}
                    </p>
                    {p.fournisseur && (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {p.fournisseur}
                      </p>
                    )}
                  </div>
                  <StockActionsMenu
                    produit={p}
                    onMouvement={() => onMouvement(p)}
                    onEdit={() => onEdit(p)}
                  />
                </div>

                {/* Badges : catégorie + statut stock + expiration */}
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant="outline"
                    className={cn("font-medium", categorieBadgeClass(p.categorie))}
                  >
                    {categorieLabel(p.categorie)}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={cn("gap-1 font-medium", status.badgeClass)}
                  >
                    <span aria-hidden>{status.emoji}</span>
                    {status.label}
                  </Badge>
                  {exp.level === "expired" && (
                    <Badge variant="outline" className={cn("font-medium", exp.badgeClass)}>
                      Expiré
                    </Badge>
                  )}
                  {exp.level === "soon" && (
                    <Badge variant="outline" className={cn("font-medium", exp.badgeClass)}>
                      {exp.label}
                    </Badge>
                  )}
                </div>

                {/* Footer : quantité + seuil + prix */}
                <div className="mt-auto grid grid-cols-3 gap-2 border-t pt-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Quantité</p>
                    <p
                      className={cn(
                        "font-bold tabular-nums text-foreground",
                        status.level === "critical" && "text-danger",
                        status.level === "warning" && "text-warning"
                      )}
                    >
                      {formatQuantite(p.quantite_actuelle, p.unite)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Seuil</p>
                    <p className="font-medium tabular-nums text-muted-foreground">
                      {formatQuantite(p.seuil_alerte, p.unite)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Prix achat</p>
                    <p className="font-medium tabular-nums text-muted-foreground">
                      {p.prix_achat_unitaire
                        ? formatFCFA(p.prix_achat_unitaire)
                        : "—"}
                    </p>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    );
  }

  // ---- Mode liste (défaut) : table desktop + cards mobile ----
  return (
    <div className="space-y-3">
      {alerteBanner}

      {/* Vue desktop : tableau */}
      <div className="hidden overflow-hidden rounded-lg border md:block">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-[30%]">Nom</TableHead>
              <TableHead>Catégorie</TableHead>
              <TableHead className="text-right">Quantité</TableHead>
              <TableHead className="text-right">Seuil</TableHead>
              <TableHead className="text-center">Statut</TableHead>
              <TableHead>Expiration</TableHead>
              <TableHead className="w-12 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {produits.map((p) => {
              const status = getStockStatus(
                Number(p.quantite_actuelle),
                Number(p.seuil_alerte)
              );
              const exp = getExpirationStatus(p.date_expiration);
              return (
                <TableRow key={p.id} className={cn(status.level === "critical" && "bg-danger/5")}>
                  <TableCell className="font-medium text-foreground">
                    {p.nom}
                    {p.fournisseur && (
                      <span className="block text-xs font-normal text-muted-foreground">
                        {p.fournisseur}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn("font-medium", categorieBadgeClass(p.categorie))}>
                      {categorieLabel(p.categorie)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {formatQuantite(p.quantite_actuelle, p.unite)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {formatQuantite(p.seuil_alerte, p.unite)}
                  </TableCell>
                  <TableCell className="text-center">
                    <span className="inline-flex items-center gap-1.5 text-sm font-medium">
                      <span aria-hidden>{status.emoji}</span>
                      <span className={cn(
                        status.level === "critical" && "text-danger",
                        status.level === "warning" && "text-warning",
                        status.level === "ok" && "text-muted-foreground"
                      )}>
                        {status.label}
                      </span>
                    </span>
                  </TableCell>
                  <TableCell>
                    {p.date_expiration ? (
                      <span className="text-sm">
                        {formatDate(p.date_expiration)}
                        {exp.level === "expired" && (
                          <Badge variant="outline" className={cn("ml-2", exp.badgeClass)}>
                            Expiré
                          </Badge>
                        )}
                        {exp.level === "soon" && (
                          <Badge variant="outline" className={cn("ml-2", exp.badgeClass)}>
                            {exp.label}
                          </Badge>
                        )}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <StockActionsMenu
                      produit={p}
                      onMouvement={() => onMouvement(p)}
                      onEdit={() => onEdit(p)}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Vue mobile : cards */}
      <div className="space-y-3 md:hidden">
        {produits.map((p) => {
          const status = getStockStatus(
            Number(p.quantite_actuelle),
            Number(p.seuil_alerte)
          );
          const exp = getExpirationStatus(p.date_expiration);
          return (
            <Card
              key={p.id}
              className={cn(
                "p-4",
                status.level === "critical" && "border-danger/30 bg-danger/5"
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-foreground">{p.nom}</p>
                  <Badge variant="outline" className={cn("mt-1 font-medium", categorieBadgeClass(p.categorie))}>
                    {categorieLabel(p.categorie)}
                  </Badge>
                </div>
                <StockActionsMenu
                  produit={p}
                  onMouvement={() => onMouvement(p)}
                  onEdit={() => onEdit(p)}
                />
              </div>
              <div className="mt-3 flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Quantité actuelle</p>
                  <p className="text-lg font-bold tabular-nums text-foreground">
                    {formatQuantite(p.quantite_actuelle, p.unite)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Seuil d'alerte</p>
                  <p className="text-sm tabular-nums text-muted-foreground">
                    {formatQuantite(p.seuil_alerte, p.unite)}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between border-t pt-2">
                <span className="inline-flex items-center gap-1.5 text-sm font-medium">
                  <span aria-hidden>{status.emoji}</span>
                  <span className={cn(
                    status.level === "critical" && "text-danger",
                    status.level === "warning" && "text-warning",
                    status.level === "ok" && "text-secondary"
                  )}>
                    {status.label}
                  </span>
                </span>
                {p.date_expiration && (
                  <span className="text-xs text-muted-foreground">
                    Exp. {formatDate(p.date_expiration)}
                    {exp.level === "expired" && (
                      <Badge variant="outline" className={cn("ml-1", exp.badgeClass)}>
                        Expiré
                      </Badge>
                    )}
                    {exp.level === "soon" && (
                      <Badge variant="outline" className={cn("ml-1", exp.badgeClass)}>
                        {exp.label}
                      </Badge>
                    )}
                  </span>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
