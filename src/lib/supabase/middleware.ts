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

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // 🔒 Garde-fou : si les variables d'env Supabase ne sont pas configurées,
  // on log une erreur claire côté serveur et on lève une Error explicite.
  // Cela évite l'erreur opaque "Your project's URL and Key are required"
  // qui venait de createServerClient quand on lui passait undefined.
  if (!supabaseUrl || !supabaseAnonKey) {
    const missing: string[] = [];
    if (!supabaseUrl) missing.push("NEXT_PUBLIC_SUPABASE_URL");
    if (!supabaseAnonKey) missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    const msg =
      `[createMiddlewareClient] Variables d'environnement Supabase manquantes : ` +
      `${missing.join(", ")}. ` +
      `Vérifiez que le fichier .env.local existe à la racine du projet et contient ces valeurs. ` +
      `Dashboard Supabase → Settings → API pour récupérer les clés.`;
    console.error(msg);
    throw new Error(msg);
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
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
  // 🔒 Garde-fou : si les vars d'env Supabase ne sont pas configurées
  // (ex: .env.local supprimé ou placeholders non remplacés), on skippe
  // l'init Supabase et on laisse passer la requête sans auth.
  // Cela évite que tout le site crashe sur un middleware mal configuré —
  // l'utilisateur peut au moins voir la landing page pendant qu'il corrige.
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY === "REPLACE_WITH_ANON_KEY"
  ) {
    console.warn(
      "[updateSession] Supabase env vars manquantes — middleware skip " +
        "(auth désactivée temporairement). Configurez .env.local pour activer l'auth."
    );
    return NextResponse.next({ request });
  }

  const { supabase, response } = createMiddlewareClient(request);

  // Rafraîchit la session si expirée — IMPORTANT : ne pas retirer cet appel,
  // c'est lui qui met à jour le cookie d'auth dans la réponse.
  await supabase.auth.getUser();

  // TODO (prochains prompts) : logique de redirection par rôle / route group.
  // Pour l'instant, on laisse tout passer librement.

  return response;
}
