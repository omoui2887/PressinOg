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

/**
 * Crée un client Supabase côté navigateur. Sync automatique de la session
 * dans les cookies Next.js.
 *
 * 🔒 SÉCURITÉ : clé `anon` (publique) + JWT utilisateur → soumis à la RLS.
 *
 * ⚠️ Si les vars d'env manquent, on retourne un client avec URL placeholder
 *    pour éviter un crash côté navigateur. Les requêtes Supabase échoueront
 *    en 500 mais l'app restera rendable.
 */
export function createSupabaseBrowserClient() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.placeholder";
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}

// Singleton côté navigateur (évite de recréer le client à chaque render)
let browserClient: ReturnType<typeof createBrowserClient> | null = null;

export function getSupabaseBrowser() {
  if (!browserClient) {
    browserClient = createSupabaseBrowserClient();
  }
  return browserClient;
}
