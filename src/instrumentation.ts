/**
 * e-pressing — Next.js Instrumentation Hook
 * ------------------------------------------
 * Issue #17 — Phase 4 security hardening.
 *
 * Next.js 16 instrumentation hook : appelé UNE FOIS au boot du serveur
 * (Node.js runtime — pas l'Edge Runtime). Sert à valider les variables
 * d'environnement critiques avant que la première requête ne soit servie.
 *
 * Signature Next.js 16 : `export async function register() { ... }`.
 * Le hook est détecté automatiquement par Next.js (pas besoin de config
 * supplémentaire tant que le fichier s'appelle `instrumentation.ts` à la
 * racine de `src/`).
 *
 * 🔒 SÉCURITÉ :
 *   - On wrappe `validateEnv()` dans un try/catch pour ne JAMAIS crasher
 *     le boot — un crash ici rendrait l'application totalement
 *     indisponible (y compris les routes publiques comme la landing et
 *     /login, qui doivent rester accessibles même si Supabase est mal
 *     configuré — pour permettre à l'utilisateur de voir le site).
 *   - Les erreurs sont uniquement loggées (console.error), jamais
 *     propagées.
 *   - On log le timing pour diagnostiquer un boot lent (validateEnv est
 *     synchrone, donc < 1 ms en pratique).
 *
 * Référence : https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation
 */

export async function register(): Promise<void> {
  const start = Date.now();
  try {
    // Import dynamique pour éviter de tirer le module env.ts dans le bundle
    // client (env.ts contient des références à SUPABASE_SERVICE_ROLE_KEY
    // qui ne doit JAMAIS être exposée côté client).
    const { validateEnv } = await import("@/lib/env");
    validateEnv();
  } catch (err) {
    // Ne jamais crasher le boot — logguer et continuer.
    // L'application démarrera sans validation préalable, mais le middleware
    // (src/lib/supabase/middleware.ts) effectuera son propre garde-fou au
    // runtime (fail-closed sur les routes protégées).
    console.error(
      "[instrumentation] Erreur lors de la validation des variables d'environnement :",
      err instanceof Error ? err.message : String(err)
    );
  }
  const elapsed = Date.now() - start;
  if (process.env.NODE_ENV !== "production" && elapsed > 50) {
    console.warn(
      `[instrumentation] Validation des variables d'environnement lente (${elapsed} ms).`
    );
  }
}
