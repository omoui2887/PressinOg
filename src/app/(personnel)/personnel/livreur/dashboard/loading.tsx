/**
 * OgPressing — Loading state du dashboard livreur (personnel)
 *
 * AUDIT-C-06: skeleton cohérent avec les autres dashboards.
 */
import { Skeleton } from "@/components/ui/skeleton";

export default function PersonnelLivreurLoading() {
  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-32" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-[124px] w-full rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}
