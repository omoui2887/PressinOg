/**
 * OgPressing — Client Supabase côté serveur
 * -----------------------------------------
 * Pour Server Components, Route Handlers et Server Actions.
 * Lit/écrit la session JWT dans les cookies HTTP de la requête courante.
 *
 * 🔒 SÉCURITÉ : utilise la clé `anon` + JWT utilisateur → soumis à la RLS.
 * C'est le client à privilégier pour toutes les opérations métier
 * (commandes, clients, stock, etc.) afin que les policies RLS s'appliquent.
 *
 * ⚠️ Pour le MIDDLEWARE Next.js, utiliser `@/lib/supabase/middleware` à la
 * place (cookies synchrones NextRequest/NextResponse).
 *
 * Usage :
 *   import { getSupabaseServer } from "@/lib/supabase/server";
 *   const supabase = await getSupabaseServer();
 *   const { data } = await supabase.from("pressing").select();
 */
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

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
