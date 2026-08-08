/**
 * OgPressing — Loading state de la liste des services (P4-F / AUDIT-C-06).
 * --------------------------------------------------------------------------
 * Squelette de la page /admin/services affiché pendant que le Client
 * Component `ServicesPage` charge son bundle et récupère la liste des
 * services via GET /api/admin/services (RLS isole par pressing).
 *
 * Reproduit la structure générale : header (titre + bouton Nouveau service),
 * grille de cards (1 col mobile / 2 md / 3 lg).
 */
import { Skeleton } from "@/components/ui/skeleton";

export default function ServicesListLoading() {
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Header : titre + bouton Nouveau service */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-32" />
        </div>
        <Skeleton className="h-9 w-40" />
      </div>

      {/* Grille de cards (6 services) */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-40 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}
