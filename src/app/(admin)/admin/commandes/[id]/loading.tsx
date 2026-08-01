/**
 * OgPressing — Loading state du détail commande
 * ------------------------------------------------
 * Squelette de la page /admin/commandes/{id} affiché pendant que le
 * Server Component résout `fetchCommandeDetail()` (requête PostgREST
 * robuste avec fallback — voir src/lib/queries/commande-detail.ts).
 *
 * Reproduit la structure du Client Component `<CommandeDetail>` :
 *   - Header (retour + titre "CMD-XXXX" + 2 badges statut + boutons Ticket/Étiquettes)
 *   - Grid 2 cols : Card Client + Card Finances
 *   - Grid 3 cols : Dates clés (réception / retrait prévu / retiré)
 *   - Card Articles (liste à 5 items)
 *   - Card Paiements (table à 5 lignes)
 *
 * Utilise le composant `<Skeleton>` (LOT 16.7 — effet shimmer via
 * la classe .shimmer de globals.css).
 */
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";

export default function CommandeDetailLoading() {
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      {/* Header : retour + titre + badges statut + actions impression */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <Skeleton className="size-9 rounded-md" />
          <div className="space-y-2">
            <Skeleton className="h-7 w-36" />
            <div className="flex items-center gap-2">
              <Skeleton className="h-7 w-24" />
              <Skeleton className="h-7 w-24" />
              <Skeleton className="h-4 w-40" />
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-28" />
        </div>
      </div>

      {/* Grid 2 cols : Card Client + Card Finances */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-24" />
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-5 w-1/2" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-24" />
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-6 w-24" />
                </div>
              ))}
              <div className="col-span-2 space-y-2">
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-8 w-32" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Grid 3 cols : Dates clés */}
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="flex items-center gap-3 py-4">
              <Skeleton className="size-5 rounded-full" />
              <div className="space-y-2">
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-4 w-24" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Card Articles (5 items) */}
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent>
          <ul className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <li
                key={i}
                className="rounded-lg border bg-card p-3 sm:p-4"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3 w-28" />
                    <Skeleton className="h-5 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-6 w-20" />
                    <Skeleton className="h-8 w-[150px]" />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Card Paiements (table 5 lignes) */}
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-lg border">
            <div className="border-b bg-muted/50 px-3 py-2">
              <div className="flex justify-between gap-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-24" />
              </div>
            </div>
            <div className="divide-y">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center px-3 py-2">
                  <Skeleton className="h-4 flex-1" />
                  <Skeleton className="ml-3 h-4 w-24" />
                  <Skeleton className="ml-3 h-4 w-20" />
                  <Skeleton className="ml-3 h-5 w-16 rounded-full" />
                  <Skeleton className="ml-3 h-4 w-20" />
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
