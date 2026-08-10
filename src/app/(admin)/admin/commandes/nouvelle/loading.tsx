/**
 * OgPressing — Loading state de /admin/commandes/nouvelle (wizard 4 étapes).
 * --------------------------------------------------------------------------
 * Squelette affiché pendant que le bundle du wizard (lourd — Recharts +
 * React Hook Form + commande-pos + step-* components) se charge.
 *
 * Reproduit la structure : header (retour + titre + bouton abandonner),
 * stepper horizontal 4 étapes, contenu principal (panneaux 2 cols : étape
 * courante + récap latéral), barre d'action basse.
 */
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

export default function CommandeNouvelleLoading() {
  return (
    <div className="mx-auto max-w-7xl space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Skeleton className="size-9 rounded-md" />
          <div className="space-y-2">
            <Skeleton className="h-7 w-56" />
            <Skeleton className="h-4 w-40" />
          </div>
        </div>
        <Skeleton className="h-9 w-28" />
      </div>

      {/* Stepper 4 étapes */}
      <Card>
        <CardContent className="flex items-center justify-between gap-2 p-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex flex-1 items-center gap-2">
              <Skeleton className="size-8 rounded-full" />
              <div className="hidden flex-1 space-y-2 sm:block">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-2 w-24" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Corps : 2 colonnes (étape courante + récap latéral) */}
      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardContent className="space-y-4 p-5">
            <Skeleton className="h-6 w-44" />
            <Skeleton className="h-9 w-full" />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-24 rounded-lg" />
              ))}
            </div>
            <Skeleton className="h-9 w-full" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-3 p-5">
            <Skeleton className="h-5 w-32" />
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-4 w-full" />
            ))}
            <Skeleton className="h-8 w-full" />
          </CardContent>
        </Card>
      </div>

      {/* Barre d'action basse */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-9 w-32" />
        <Skeleton className="h-9 w-40" />
      </div>
    </div>
  );
}
