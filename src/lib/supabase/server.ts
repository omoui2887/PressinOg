/**
 * OgPressing — Client Supabase côté serveur
 * -----------------------------------------
 * Pour Server Components, Route Handlers, Server Actions et Middleware.
 * Lit/écrit la session JWT dans les cookies HTTP de la requête courante.
 *
 * 🔒 SÉCURITÉ : utilise la clé `anon` + JWT utilisateur → soumis à la RLS.
 * C'est le client à privilégier pour toutes les opérations métier
 * (commandes, clients, stock, etc.) afin que les policies RLS s'appliquent.
 *
 * Usage :
 *   import { getSupabaseServer } from "@/lib/supabase/server";
 *   const supabase = await getSupabaseServer();
 *   const { data } = await supabase.from("pressing").select();
 */
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

export async function getSupabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // La méthode `set` ne peut être appelée que dans un Server Action
            // ou Route Handler. Si on est dans un Server Component en lecture,
            // on ignore silencieusement : le middleware réécrira le cookie au
            // prochain cycle.
          }
        },
      },
    }
  );
}

/**
 * Variante pour le middleware Next.js (cookies synchrones).
 * Le middleware s'exécute avant la résolution des Server Components et
 * doit propager/mettre à jour le cookie de session Supabase.
 */
export function getSupabaseMiddleware(request: NextRequest) {
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
