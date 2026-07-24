/**
 * OgPressing — Helper Supabase pour le Middleware Next.js
 * -------------------------------------------------------
 * Sert de factory : crée un client Supabase Server adapté au contexte
 * Middleware (cookies synchrones NextRequest/NextResponse) et expose une
 * fonction `updateSession` qui :
 *   1. Récupère la session JWT Supabase depuis les cookies
 *   2. La rafraîchit si expirée
 *   3. Réécrit les cookies dans la réponse
 *
 * Ce fichier est volontairement séparé de `server.ts` (Server Components) car
 * le middleware s'exécute dans un runtime différent (Edge par défaut) et
 * manipule les cookies de manière synchrone via NextRequest/NextResponse.
 *
 * 🔒 SÉCURITÉ : ce client utilise la clé `anon` + JWT utilisateur → soumis RLS.
 *
 * Référence : https://supabase.com/docs/guides/auth/server-side/nextjs
 */
import { createServerClient, type SupabaseClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Crée un client Supabase adapté au middleware Next.js.
 * À utiliser UNIQUEMENT dans /src/middleware.ts.
 */
export function createMiddlewareClient(
  request: NextRequest
): { supabase: SupabaseClient; response: NextResponse } {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // On met à jour les cookies de la requête pour que les handlers
          // suivants voient la nouvelle session, puis on propage dans la
          // réponse qui sera renvoyée au navigateur.
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  return { supabase, response };
}

/**
 * Met à jour la session Supabase à chaque requête.
 *
 * Pour l'instant (structure initiale), la fonction se contente de rafraîchir
 * la session. Elle sera enrichie dans les prochains prompts avec :
 *   - Redirection des utilisateurs non authentifiés vers /login
 *   - Redirection par rôle (Super Admin / Admin / Personnel)
 *   - Protection des route groups (public) / (super-admin) / (admin) / (personnel)
 *
 * @returns NextResponse à propager depuis le middleware
 */
export async function updateSession(
  request: NextRequest
): Promise<NextResponse> {
  const { supabase, response } = createMiddlewareClient(request);

  // Rafraîchit la session si expirée — IMPORTANT : ne pas retirer cet appel,
  // c'est lui qui met à jour le cookie d'auth dans la réponse.
  await supabase.auth.getUser();

  // TODO (prochains prompts) : logique de redirection par rôle / route group.
  // Pour l'instant, on laisse tout passer librement.

  return response;
}
