/**
 * e-pressing — Loading state du stock (P4-F / AUDIT-C-06).
 * ---------------------------------------------------------
 * Squelette de la page /admin/stock affiché pendant que le Client
 * Component `StockPage` charge son bundle et récupère la liste des
 * produits via GET /api/admin/stock (RLS isole par pressing).
 *
 * Reproduit la structure générale : header (titre + bouton Ajouter produit),
 * barre de filtres, tableau/cards.
 */
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

export default function StockLoading() {
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Header : titre + bouton Ajouter produit + lien Mouvements */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-36" />
          <Skeleton className="h-4 w-32" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-9 w-36" />
        </div>
      </div>

      {/* Barre de filtres */}
      <Card>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <Skeleton className="h-9 flex-1" />
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-9 w-24" />
        </CardContent>
      </Card>

      {/* Tableau produits (8 lignes) */}
      <Card>
        <CardContent className="p-0">
          <div className="flex items-center gap-3 border-b bg-muted/40 px-4 py-3">
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-8 w-8" />
          </div>
          <div className="divide-y">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                <Skeleton className="size-9 rounded-md" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-5 w-20 rounded-full" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-8 w-8" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
