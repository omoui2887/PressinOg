/**
 * e-pressing — Middleware Next.js racine
 * --------------------------------------
 * S'exécute sur TOUTES les requêtes entrantes (sauf fichiers statiques).
 * Pour l'instant : rafraîchit la session Supabase.
 *
 * Dans les prochains prompts, ce middleware sera enrichi pour :
 *   - Protéger les route groups (super-admin) / (admin) / (personnel)
 *   - Rediriger les utilisateurs authentifiés vers leur dashboard selon le rôle
 *   - Rediriger les utilisateurs non authentifiés vers /login
 *
 * Le matcher exclut les fichiers statiques et les images Next.js.
 */
import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Matche toutes les routes SAUF :
     * - _next/static        (fichiers statiques)
     * - _next/image         (optimisation images)
     * - favicon.ico         (favicon)
     * - api                 (les routes API gèrent leur propre auth)
     * - .*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$  (images)
     *
     * Ça évite de rafraîchir la session sur des assets statiques et les
     * API (perf) — les API routes lisent la session via cookies directement.
     */
    "/((?!_next/static|_next/image|favicon.ico|api/.*|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
