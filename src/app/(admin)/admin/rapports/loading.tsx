/**
 * e-pressing — Loading state des rapports (P4-F / AUDIT-C-06).
 * -------------------------------------------------------------
 * Squelette de la page /admin/rapports affiché pendant que le Client
 * Component `RapportsPage` charge son bundle (incluant les 3 charts
 * Recharts ~95KB lazy-loadés) et récupère les données via
 * GET /api/admin/rapports (RLS isole par pressing).
 *
 * Reproduit la structure générale : header (titre + sélecteur période),
 * 4 StatCards, 3 graphs, sections clients impayés + remises.
 */
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function RapportsLoading() {
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Header : titre + sélecteur période */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-36" />
          <Skeleton className="h-4 w-32" />
        </div>
        <Skeleton className="h-9 w-72" />
      </div>

      {/* 4 StatCards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full rounded-xl" />
        ))}
      </div>

      {/* 2 Charts (CA par jour + CA par mode de paiement) */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-40" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-44" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
      </div>

      {/* Chart CA par type de service */}
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>

      {/* Sections clients impayés + remises */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-36" />
          </CardHeader>
          <CardContent className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-md" />
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-32" />
          </CardHeader>
          <CardContent className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-md" />
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
