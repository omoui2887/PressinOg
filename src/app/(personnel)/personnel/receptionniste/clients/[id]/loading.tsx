/**
 * OgPressing — Loading state de la fiche client
 * /personnel/receptionniste/clients/[id]
 * --------------------------------------------
 * Squelette affiché pendant que le Server Component fetch le client +
 * commandes + paiements (RLS isole par pressing).
 */
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function ReceptionnisteClientDetailLoading() {
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Skeleton className="size-9 rounded-md" />
          <div className="space-y-2">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-4 w-40" />
          </div>
        </div>
        <Skeleton className="h-9 w-40" />
      </div>

      <Skeleton className="h-10 w-full sm:w-auto" />

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-32" />
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-5 w-2/3" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-28" />
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-7 w-28" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
