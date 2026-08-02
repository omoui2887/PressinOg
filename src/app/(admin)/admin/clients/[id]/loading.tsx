/**
 * OgPressing — Loading state de la fiche client
 * -----------------------------------------------
 * Squelette de la page /admin/clients/{id} affiché pendant que le
 * Server Component fetch le client + 50 commandes + paiements via
 * Supabase (RLS isole par pressing).
 *
 * Reproduit la structure du Client Component `<ClientDetailPage>` :
 *   - Header (retour + nom client + 2 boutons actions)
 *   - Tabs (3 onglets : Informations / Commandes / Paiements)
 *   - Onglet Informations actif :
 *       • Grid 2 cols : Card Coordonnées + Card Statistiques (4 stats)
 *       • Grid 2 cols : Card Préférences + Card Notes
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

export default function ClientDetailLoading() {
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      {/* Header : retour + nom + date + actions */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Skeleton className="size-9 rounded-md" />
          <div className="space-y-2">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-4 w-40" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-9 w-28" />
        </div>
      </div>

      {/* Tabs (3 onglets : Informations / Commandes / Paiements) */}
      <Skeleton className="h-10 w-full sm:w-auto" />

      {/* Tab Informations — Grid 2 cols : Coordonnées + Statistiques */}
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

        {/* Statistiques : 4 stats en grid 2x2 */}
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

      {/* Tab Informations — Grid 2 cols : Préférences + Notes */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-40" />
          </CardHeader>
          <CardContent className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-5 w-full" />
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-20" />
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-3/4" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
