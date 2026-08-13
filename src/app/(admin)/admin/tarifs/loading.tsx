/**
 * e-pressing — Loading state des tarifs par article (P4-F / AUDIT-C-06).
 * -----------------------------------------------------------------------
 * Squelette de la page /admin/tarifs affiché pendant que le Client
 * Component `TarifsPage` charge son bundle et récupère le catalogue +
 * les tarifs spécifiques via /api/public/catalogue-articles et
 * /api/admin/tarifs-articles (RLS isole par pressing).
 *
 * Reproduit la structure générale : header (titre + sous-titre), 3 StatCards,
 * onglets de filtre catégorie, grille de ArticleCards.
 */
import { Skeleton } from "@/components/ui/skeleton";

export default function TarifsLoading() {
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Header : titre + sous-titre */}
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-72" />
      </div>

      {/* 3 StatCards */}
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full rounded-xl" />
        ))}
      </div>

      {/* Onglets de filtre catégorie */}
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-24 rounded-full" />
        ))}
      </div>

      {/* Grille de ArticleCards (6 cartes) */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-56 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}
