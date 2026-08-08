/**
 * OgPressing — Loading state de la configuration du pressing (P4-F / AUDIT-C-06).
 * --------------------------------------------------------------------------------
 * Squelette de la page /admin/pressing affiché pendant que le Client
 * Component `PressingConfigPage` charge son bundle et récupère les infos
 * du pressing via GET /api/admin/pressing (RLS isole par pressing).
 *
 * Reproduit la structure générale : header (titre), tabs (3 onglets), Card
 * principale avec champs de formulaire.
 */
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function PressingConfigLoading() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Header : titre + sous-titre */}
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-40" />
      </div>

      {/* Tabs (3 onglets) */}
      <Skeleton className="h-10 w-full sm:w-auto" />

      {/* Card principale avec champs formulaire */}
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Champ nom */}
          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-9 w-full" />
          </div>
          {/* 2 champs en grille */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-9 w-full" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-9 w-full" />
            </div>
          </div>
          {/* Champ adresse */}
          <div className="space-y-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-20 w-full" />
          </div>
          {/* 2 champs en grille */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-9 w-full" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-9 w-full" />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
