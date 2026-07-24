/**
 * OgPressing — Client Supabase côté navigateur
 * ---------------------------------------------
 * Utilise createBrowserClient (@supabase/ssr) qui synchronise automatiquement
 * la session dans les cookies Next.js.
 *
 * 🔒 SÉCURITÉ : ce client utilise la clé `anon` (publique) et est donc soumis
 * aux politiques RLS définies côté Supabase. Ne JAMAIS importer la
 * service_role ici.
 *
 * Usage :
 *   import { supabaseBrowser } from "@/lib/supabase/client";
 *   const { data } = await supabaseBrowser.from("pressing").select();
 */
import { createBrowserClient } from "@supabase/ssr";

export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// Singleton côté navigateur (évite de recréer le client à chaque render)
let browserClient: ReturnType<typeof createBrowserClient> | null = null;

export function getSupabaseBrowser() {
  if (!browserClient) {
    browserClient = createSupabaseBrowserClient();
  }
  return browserClient;
}
