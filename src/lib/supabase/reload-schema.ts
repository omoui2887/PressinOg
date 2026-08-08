/**
 * OgPressing — Utilitaire de reload du cache PostgREST
 * ------------------------------------------------------
 * PostgREST (moteur REST de Supabase) met en cache le schéma DB.
 * Après une migration qui ajoute une colonne ou une valeur d'enum,
 * le cache reste stale pendant la fenêtre de refresh automatique
 * (~5 min). Durant cette fenêtre, les requêtes utilisant la nouvelle
 * colonne/enum échouent avec :
 *   - PGRST204 (colonne introuvable dans le cache)
 *   - 22P02 (valeur d'enum invalide)
 *
 * Cette fonction appelle `reload_pgrst_schema()` (migration 033) via
 * le client admin (service_role) pour forcer le reload immédiat.
 *
 * Usage : en cas d'erreur PGRST204 ou 22P02 dans un handler API,
 * appeler `reloadPostgrestSchema()`, attendre ~300ms, puis réessayer
 * la requête. Voir src/app/api/admin/commandes/route.ts et [id]/route.ts.
 */
import { getSupabaseAdmin } from "./admin";

/**
 * Détecte si une erreur Supabase est due à un cache PostgREST stale.
 * Codes concernés :
 *   - PGRST204 : colonne introuvable dans le cache schema
 *   - 22P02    : valeur d'enum invalide (enum pas encore dans le cache)
 *
 * @param err - L'erreur retournée par supabase-js
 * @returns true si l'erreur est probablement due à un cache stale
 */
export function isPostgrestSchemaCacheError(
  err: unknown
): boolean {
  if (!err || typeof err !== "object") return false;
  const code = (err as { code?: string }).code;
  const message = (err as { message?: string }).message ?? "";
  return (
    code === "PGRST204" ||
    code === "22P02" ||
    message.includes("schema cache") ||
    message.includes("Could not find the") ||
    message.includes("invalid input value for enum")
  );
}

/**
 * Force PostgREST à recharger son cache de schéma.
 *
 * Appelle la fonction RPC `reload_pgrst_schema()` (migration 033) qui
 * envoie `NOTIFY pgrst, 'reload schema'`. Le reload prend ~100-500ms.
 *
 * Best-effort : ne lève jamais d'exception. Si l'appel échoue (ex: la
 * fonction n'existe pas encore car migration 033 non appliquée), on
 * log juste un warning et on retourne false.
 *
 * @returns true si le reload a été demandé avec succès, false sinon
 */
export async function reloadPostgrestSchema(): Promise<boolean> {
  try {
    const admin = getSupabaseAdmin();
    const { error } = await admin.rpc("reload_pgrst_schema");
    if (error) {
      console.warn(
        "[reload-schema] Impossible d'appeler reload_pgrst_schema():",
        error.message,
        "→ Vérifiez que la migration 033_reload_pgrst_schema.sql a été appliquée."
      );
      return false;
    }
    // PostgREST recharge son cache de manière asynchrone après le NOTIFY.
    // On attend un court délai pour laisser le temps au reload avant le retry.
    await new Promise((resolve) => setTimeout(resolve, 400));
    return true;
  } catch (err) {
    console.warn(
      "[reload-schema] Exception lors du reload du cache PostgREST:",
      err instanceof Error ? err.message : err
    );
    return false;
  }
}
