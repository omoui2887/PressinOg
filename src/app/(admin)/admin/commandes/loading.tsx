/**
 * e-pressing — Loading state de la liste des commandes (P4-F / AUDIT-C-06).
 * --------------------------------------------------------------------------
 * Squelette de la page /admin/commandes affiché pendant que le Client
 * Component `CommandesPage` charge son bundle et récupère la 1re page
 * de commandes via GET /api/admin/commandes (RLS isole par pressing).
 *
 * Reproduit la structure générale : header (titre + actions), barre de
 * filtres, tableau/cards, pagination.
 */
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

export default function CommandesListLoading() {
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Header : titre + actions (Nouvelle commande + Scanner QR) */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-44" />
          <Skeleton className="h-4 w-32" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-9 w-36" />
        </div>
      </div>

      {/* Barre de filtres (recherche + 2 selects + view toggle) */}
      <Card>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <Skeleton className="h-9 flex-1" />
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-9 w-24" />
        </CardContent>
      </Card>

      {/* Tableau commandes (8 lignes) */}
      <Card>
        <CardContent className="p-0">
          {/* En-tête tableau */}
          <div className="flex items-center gap-3 border-b bg-muted/40 px-4 py-3">
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-20" />
          </div>
          {/* Lignes */}
          <div className="divide-y">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-5 w-20 rounded-full" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-24" />
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
