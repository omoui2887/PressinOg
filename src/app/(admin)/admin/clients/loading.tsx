/**
 * e-pressing — Loading state de la liste des clients (P4-F / AUDIT-C-06).
 * ------------------------------------------------------------------------
 * Squelette de la page /admin/clients affiché pendant que le Client
 * Component `ClientsPage` charge son bundle et récupère la 1re page de
 * clients via GET /api/admin/clients (RLS isole par pressing).
 *
 * Reproduit la structure générale : header (titre + bouton Nouveau client),
 * barre de filtres, tableau/cards, pagination.
 */
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

export default function ClientsListLoading() {
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Header : titre + bouton Nouveau client */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-32" />
        </div>
        <Skeleton className="h-9 w-36" />
      </div>

      {/* Barre de filtres (recherche + filtres + view toggle) */}
      <Card>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <Skeleton className="h-9 flex-1" />
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-9 w-24" />
        </CardContent>
      </Card>

      {/* Tableau clients (8 lignes) */}
      <Card>
        <CardContent className="p-0">
          {/* En-tête tableau */}
          <div className="flex items-center gap-3 border-b bg-muted/40 px-4 py-3">
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-24" />
          </div>
          {/* Lignes */}
          <div className="divide-y">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                <Skeleton className="size-8 rounded-full" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-5 w-20 rounded-full" />
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Pagination */}
      <div className="flex items-center justify-center gap-2">
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-8 w-20" />
      </div>
    </div>
  );
}
