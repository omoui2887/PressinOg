/**
 * Cron API — Synchronisation des statuts d'abonnement
 * ====================================================================
 * Route: POST /api/cron/sync-abonnements
 *
 * Appelle la fonction PostgreSQL `synchroniser_statut_abonnements()` qui
 * met à jour les abonnements expirés (essai/actif avec date_fin < NOW()
 * → statut='expire'). Cette route est conçue pour être appelée par un
 * scheduler externe (Vercel Cron, GitHub Actions, systemd timer, etc.).
 *
 * 🔒 SÉCURITÉ
 *   - Authentification par header `Authorization: Bearer <CRON_SECRET>`.
 *     Le secret est comparé à process.env.CRON_SECRET (variable d'env
 *     server-only). Si absent/non configuré → refus (401).
 *   - Cette route NE nécessite PAS de session utilisateur (pas de
 *     middleware auth) — c'est un endpoint machine-à-machine.
 *   - Le matcher du middleware (src/middleware.ts) exclut `/api/.*` →
 *     cette route n'est PAS soumise au garde-fou auth Supabase.
 *   - Utilise getSupabaseAdmin() (service_role) pour bypass RLS et
 *     appeler la fonction SECURITY DEFINER.
 *
 * 📊 COMPORTEMENT
 *   - Appelle `rpc('synchroniser_statut_abonnements')`.
 *   - Retourne le JSON de la fonction : { updated, from_essai,
 *     from_actif, checked_at }.
 *   - Log serveur pour monitoring (sans données sensibles).
 *
 * 🕐 FRÉQUENCE RECOMMANDÉE
 *   - Toutes les 15 minutes (via Vercel Cron / pg_cron / GitHub Actions).
 *   - Le middleware fait AUSSI une vérification temps réel (cache 60s)
 *     → le cron est un filet de sécurité, pas l'unique mécanisme.
 *
 * Configuration vercel.json (si déploiement Vercel) :
 *   {
 *     "crons": [{
 *       "path": "/api/cron/sync-abonnements",
 *       "schedule": "0/15 * * * *"  // toutes les 15 min (cron syntax)
 *     }]
 *   }
 *
 * Le header Authorization est ajouté automatiquement par Vercel Cron
 * via la variable `CRON_SECRET` (à définir dans le dashboard Vercel).
 * Pour GitHub Actions / curl manuel :
 *   curl -X POST \
 *     -H "Authorization: Bearer $CRON_SECRET" \
 *     https://yqaitafigfxlrprrouhr.supabase.co/api/cron/sync-abonnements
 *     (remplacer par l'URL du site en prod)
 */
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

// Force dynamique — jamais de cache statique pour un endpoint cron.
export const dynamic = "force-dynamic";
// Désactive le runtime Edge → utilise Node.js runtime (pour supabase-js admin).
export const runtime = "nodejs";

/**
 * Vérifie le secret d'authentification cron.
 *
 * Le secret DOIT être défini dans process.env.CRON_SECRET. Si absent,
 * la route refuse TOUS les appels (fail-closed) — il faut configurer
 * la variable d'env pour activer le cron.
 *
 * @returns true si l'authentification est valide, false sinon.
 */
function authenticateCron(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || cronSecret.trim().length === 0) {
    // CRON_SECRET non configuré → on refuse. Le déploiement doit définir
    // cette variable pour activer le cron (sécurité fail-closed).
    console.error(
      "[cron/sync-abonnements] CRON_SECRET non configuré — appel refusé."
    );
    return false;
  }
  // Récupère le header Authorization: "Bearer <secret>"
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : "";
  // Comparaison à durée constante pour éviter les timing attacks.
  // (crypto.timingSafeEqual nécessite des buffers de même longueur —
  //  on gère le cas différend manuellement mais de façon sécurisée.)
  if (token.length !== cronSecret.length) return false;
  let diff = 0;
  for (let i = 0; i < token.length; i++) {
    diff |= token.charCodeAt(i) ^ cronSecret.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * POST /api/cron/sync-abonnements
 *
 * Corps: aucun (la fonction ne prend pas de paramètres).
 * Réponse 200: { ok: true, result: { updated, from_essai, from_actif, checked_at } }
 * Réponse 401: { ok: false, error: "unauthorized" }
 * Réponse 500: { ok: false, error: "internal_error", details: string }
 * Réponse 503: { ok: false, error: "function_not_available" }
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  // 1. Authentification
  if (!authenticateCron(request)) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 }
    );
  }

  // 2. Exécution de la fonction PostgreSQL
  try {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin.rpc("synchroniser_statut_abonnements");

    if (error) {
      // PGRST202 = fonction introuvable → la migration 040 n'a pas été appliquée
      if (error.code === "PGRST202" || error.message.includes("Could not find")) {
        console.error(
          "[cron/sync-abonnements] Fonction synchroniser_statut_abonnements() " +
            "introuvable — la migration 040_sync_abonnements_expiration.sql " +
            "n'a pas été appliquée. Exécutez-la via Supabase Dashboard → SQL Editor."
        );
        return NextResponse.json(
          {
            ok: false,
            error: "function_not_available",
            hint: "Apply migration supabase/migrations/040_sync_abonnements_expiration.sql via Supabase Dashboard SQL Editor.",
          },
          { status: 503 }
        );
      }
      console.error(
        "[cron/sync-abonnements] Erreur RPC:",
        error.code,
        error.message
      );
      return NextResponse.json(
        { ok: false, error: "internal_error", details: error.message },
        { status: 500 }
      );
    }

    // 3. Succès
    const result = data as {
      updated: number;
      from_essai: number;
      from_actif: number;
      checked_at: string;
    } | null;

    const summary = result ?? { updated: 0, from_essai: 0, from_actif: 0, checked_at: new Date().toISOString() };
    console.info(
      `[cron/sync-abonnements] OK — ${summary.updated} abonnement(s) expiré(s) ` +
        `(essai: ${summary.from_essai}, actif: ${summary.from_actif}) à ${summary.checked_at}.`
    );

    return NextResponse.json({ ok: true, result: summary });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[cron/sync-abonnements] Exception:", msg);
    return NextResponse.json(
      { ok: false, error: "internal_error", details: msg },
      { status: 500 }
    );
  }
}

/**
 * GET /api/cron/sync-abonnements
 *
 * Certaines plateformes de cron (uptime monitors, GitHub Actions avec curl)
 * utilisent GET au lieu de POST. On accepte GET pour compatibilité, avec
 * la même authentification Bearer.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  return POST(request);
}
