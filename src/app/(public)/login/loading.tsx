/**
 * e-pressing — Loading state de la page /login
 *
 * AUDIT-C-06: skeleton cohérent avec la forme du formulaire d'auth.
 */
import { Skeleton } from "@/components/ui/skeleton";

export default function LoginLoading() {
  return (
    <div className="mx-auto flex min-h-[80vh] max-w-md flex-col justify-center space-y-6 p-4">
      <div className="space-y-2 text-center">
        <Skeleton className="mx-auto h-8 w-40" />
        <Skeleton className="mx-auto h-4 w-56" />
      </div>
      <div className="space-y-4 rounded-xl border p-6">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    </div>
  );
}
