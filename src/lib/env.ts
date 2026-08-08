/**
 * OgPressing — Validation des variables d'environnement au boot
 * -------------------------------------------------------------
 * Issue #17 — Phase 4 security hardening.
 *
 * Objectif : valider au plus tôt (dès l'import du module, et de façon
 * explicite au boot via `instrumentation.ts`) la présence des variables
 * d'environnement critiques pour Supabase.
 *
 * Comportement :
 *   - Les variables REQUISES (URL, anon, service_role) : si l'une est
 *     manquante → `isEnvConfigured()` retourne false, et `validateEnv()`
 *     log une erreur claire côté serveur. On NE LÈVE PAS d'exception au
 *     boot (Next.js instrumention hook tourne dans un contexte fragile :
 *     un throw casserait toute la boot, y compris les routes publiques).
 *     Le middleware (`src/lib/supabase/middleware.ts`) effectue déjà un
 *     garde-fou fail-closed : si les vars manquent, les routes protégées
 *     sont redirigées vers /login?error=config_incomplete.
 *   - Les variables OPTIONNELLES (PAT Supabase, NEXT_PUBLIC_SITE_URL) :
 *     un warning est loggué si absentes, mais aucune erreur n'est levée.
 *
 * `env` object : accessurs typés qui retournent soit la valeur, soit
 * `null` si absente. Préférer `env.X` à `process.env.X` partout dans le
 * code applicatif — cela centralise la lecture et permet de tracer les
 * usages.
 *
 * 🔒 SÉCURITÉ :
 *   - Ce module ne LOGUE JAMAIS la valeur des variables (seulement leur
 *     présence/absence) — éviter les fuites de clés dans les logs.
 *   - Les vars `NEXT_PUBLIC_*` sont volontairement exposées au client
 *     (URL Supabase, anon key) — c'est normal, RLS nous protège.
 *   - `SUPABASE_SERVICE_ROLE_KEY` NE JAMAIS importer côté client.
 */
/**
 * Variables d'environnement REQUISES pour que l'application fonctionne.
 * Si l'une est absente → `isEnvConfigured()` retourne false et
 * `validateEnv()` log une erreur.
 */
const REQUIRED_ENV_VARS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

/**
 * Variables d'environnement OPTIONNELLES. Si absentes, on log un warning
 * (informationnel) mais on ne bloque rien.
 */
const OPTIONAL_ENV_VARS = [
  "SUPABASE_PAT",
  "NEXT_PUBLIC_SITE_URL",
] as const;

/**
 * Objet `env` : accessurs typés pour toutes les variables d'environnement
 * connues. Préférer cet objet à `process.env.X` dans le code applicatif.
 *
 * Chaque accesseur retourne :
 *   - la valeur (string) si la variable est définie et non vide,
 *   - `null` sinon.
 *
 * Pour les booléens / nombres, utiliser les helpers dédiés
 * (`envBool`, `envInt`) — non nécessaires pour l'instant.
 */
export const env = {
  /** URL publique du projet Supabase (ex : https://xxx.supabase.co). */
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? null,
  /** Clé anon publique (RLSappliquée côté client). */
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? null,
  /** Clé service_role (SERVER ONLY — contourne RLS). */
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? null,
  /** Personal Access Token Supabase (pour l'API management, scripts CLI). */
  supabasePat: process.env.SUPABASE_PAT ?? null,
  /** URL publique du site (pour OG metadata, emails, etc.). */
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? null,
  /** Secret optionnel pour signer le cookie de cache rôle (middleware).
   *  Si absent, le middleware fallback sur `NEXT_PUBLIC_SUPABASE_ANON_KEY`. */
  roleCacheSecret: process.env.OGP_ROLE_CACHE_SECRET ?? null,
} as const;

/**
 * Retourne true si toutes les variables d'environnement REQUISES sont
 * présentes et non vides. Ne lève jamais d'exception.
 *
 * Utilisé par :
 *   - `validateEnv()` (instrumentation boot)
 *   - le middleware (garde-fou fail-closed pour les routes protégées)
 *   - les scripts CLI (dev-keeper, etc.)
 */
export function isEnvConfigured(): boolean {
  for (const key of REQUIRED_ENV_VARS) {
    const value = process.env[key];
    if (!value || value.trim().length === 0) return false;
    // Détection des placeholders courants (fichier .env.example non
    // substitué) — on les considère comme "manquants".
    if (
      value === "REPLACE_WITH_ANON_KEY" ||
      value === "REPLACE_WITH_SERVICE_ROLE_KEY" ||
      value === "your-supabase-url" ||
      value === "https://your-project.supabase.co"
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Validation explicite des variables d'environnement. À appeler au boot
 * de l'application (Next.js instrumentation hook — `src/instrumentation.ts`).
 *
 * Comportement :
 *   - Si toutes les vars requises sont présentes → log informatif (en dev
 *     uniquement) et retourne sans erreur.
 *   - Si des vars requises manquent → log une erreur claire côté serveur
 *     (sans révéler les valeurs des vars présentes), mais NE LÈVE PAS
 *     d'exception. Le boot continue — c'est le middleware qui bloquera
 *     les routes protégées au runtime.
 *   - Pour les vars optionnelles manquantes → log un warning.
 *
 * ⚠️ Cette fonction est idempotente et sans effet de bord (en dehors du
 *    log) — elle peut être appelée plusieurs fois sans risque.
 */
export function validateEnv(): void {
  const missing: string[] = [];
  const placeholder: string[] = [];

  for (const key of REQUIRED_ENV_VARS) {
    const value = process.env[key];
    if (!value || value.trim().length === 0) {
      missing.push(key);
      continue;
    }
    if (
      value === "REPLACE_WITH_ANON_KEY" ||
      value === "REPLACE_WITH_SERVICE_ROLE_KEY" ||
      value === "your-supabase-url" ||
      value === "https://your-project.supabase.co"
    ) {
      placeholder.push(`${key} (valeur placeholder détectée)`);
    }
  }

  if (missing.length > 0) {
    console.error(
      `[env][FATAL] Variables d'environnement requises manquantes : ` +
        `${missing.join(", ")}. ` +
        `L'application va démarrer mais les routes protégées seront ` +
        `redirigées vers /login?error=config_incomplete. ` +
        `Vérifiez que le fichier .env.local existe à la racine du projet ` +
        `et contient ces valeurs (Dashboard Supabase → Settings → API).`
    );
  }

  if (placeholder.length > 0) {
    console.error(
      `[env][FATAL] Variables d'environnement avec valeur placeholder : ` +
        `${placeholder.join(", ")}. ` +
        `Remplacez-les par les vraies valeurs du Dashboard Supabase.`
    );
  }

  // Vars optionnelles : warning simple, non bloquant.
  const missingOptional: string[] = [];
  for (const key of OPTIONAL_ENV_VARS) {
    const value = process.env[key];
    if (!value || value.trim().length === 0) {
      missingOptional.push(key);
    }
  }
  if (missingOptional.length > 0) {
    console.warn(
      `[env][WARN] Variables d'environnement optionnelles manquantes : ` +
        `${missingOptional.join(", ")}. ` +
        `Fonctionnalités non critiques désactivées (API management ` +
        `Supabase, OG metadata, emails, etc.).`
    );
  }

  // En dev, on log un message positif si tout est OK (aide au debug).
  if (
    process.env.NODE_ENV !== "production" &&
    missing.length === 0 &&
    placeholder.length === 0
  ) {
    console.info(
      `[env] Variables d'environnement Supabase configurées ✓ ` +
        `(${REQUIRED_ENV_VARS.length} requises, ` +
        `${OPTIONAL_ENV_VARS.length - missingOptional.length}/${OPTIONAL_ENV_VARS.length} optionnelles).`
    );
  }
}

export { REQUIRED_ENV_VARS, OPTIONAL_ENV_VARS };
