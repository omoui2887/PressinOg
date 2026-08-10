/**
 * OgPressing — Loading state de /personnel/manager/clients
 * --------------------------------------------------------
 * Squelette affiché pendant que le bundle `ClientsPage` se charge +
 * récupère la 1re page de clients via GET /api/admin/clients.
 * Reproduit la structure : header + filtres + tableau 8 lignes + pagination.
 */
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

export default function ManagerClientsListLoading() {
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-32" />
        </div>
        <Skeleton className="h-9 w-36" />
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <Skeleton className="h-9 flex-1" />
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-9 w-24" />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="flex items-center gap-3 border-b bg-muted/40 px-4 py-3">
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-24" />
          </div>
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

      <div className="flex items-center justify-center gap-2">
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-8 w-20" />
      </div>
    </div>
  );
}
