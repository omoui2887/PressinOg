/**
 * OgPressing — Loading state de la page /activation
 *
 * AUDIT-C-06: skeleton cohérent avec le stepper d'activation.
 */
import { Skeleton } from "@/components/ui/skeleton";

export default function ActivationLoading() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 md:p-6">
      <div className="space-y-2 text-center">
        <Skeleton className="mx-auto h-8 w-56" />
        <Skeleton className="mx-auto h-4 w-72" />
      </div>
      <div className="space-y-4 rounded-xl border p-6">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    </div>
  );
}
