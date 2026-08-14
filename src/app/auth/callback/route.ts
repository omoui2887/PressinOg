/**
 * e-pressing — Route /auth/callback (échange du code PKCE Supabase)
 * -----------------------------------------------------------------
 *
 * Route publique appelée par Supabase Auth lorsqu'un utilisateur clique sur
 * un lien d'invitation par email (ou un lien de réinitialisation de mot de
 * passe). Le lien contient un paramètre `code` (PKCE) que cette route échange
 * contre une session serveur via `supabase.auth.exchangeCodeForSession(code)`.
 * La session est posée dans un cookie httpOnly par le client middleware
 * Supabase (@supabase/ssr), puis l'utilisateur est redirigé vers le path
 * `next` (validé contre une whitelist stricte).
 *
 * FLUX D'INVITATION (complet) :
 *   1. Manager crée un employé via POST /api/admin/personnel
 *      { methode: "lien_invitation", email, ... }
 *   2. L'API appelle `supabase.auth.admin.inviteUserByEmail(email, { redirectTo })`
 *      avec `redirectTo = ${SITE_URL}/auth/callback?next=/personnel/changer-mot-de-passe`
 *   3. Supabase envoie un email contenant un lien de la forme :
 *        https://app.e-pressing.com/auth/callback?code=<PKCE>&next=/personnel/changer-mot-de-passe
 *   4. L'employé clique → GET /auth/callback?code=...&next=...
 *   5. Cette route échange `code` contre une session → cookie httpOnly posé
 *   6. Redirect vers `next` (/personnel/changer-mot-de-passe)
 *   7. Le middleware (updateSession) voit la session + mot_de_passe_temporaire=true
 *      → laisse passer vers /personnel/changer-mot-de-passe
 *   8. L'employé définit son mot de passe → statut_compte passe à 'actif'
 *
 * SÉCURITÉ (AUDIT_SECURITE.md Conclusion #7 — HAUTE) :
 *   - `code` OBLIGATOIRE (sinon redirect /login?error=callback_invalid)
 *   - `next` validé par whitelist stricte (anti open redirect, CWE-601) :
 *       * doit commencer par "/" mais pas par "//" (anti //evil.com)
 *       * doit être dans { /personnel/changer-mot-de-passe, /admin/dashboard }
 *         OU matcher /personnel/{role}/dashboard (role ∈ ROLES_PERSONNEL)
 *       * sinon fallback vers "/"
 *   - En cas d'erreur d'échange : log serveur SANS exposer error.message
 *     au client (redirect /login?error=callback_failed) — aligné sur la
 *     Conclusion #8 (masquer err.message).
 *
 * RÉFÉRENCE : https://supabase.com/docs/guides/auth/server-side/nextjs
 */
import { NextResponse, type NextRequest } from "next/server";
import { createMiddlewareClient } from "@/lib/supabase/middleware";
import { isEnvConfigured } from "@/lib/env";

// Force le rendu dynamique (route ne doit jamais être mise en cache statiquement
// car elle dépend des cookies et des query params à chaque appel).
export const dynamic = "force-dynamic";

/** Whitelist stricte des paths autorisés pour le paramètre `next`.
 * Empêche un open redirect vers des URLs externes ou des paths non autorisés
 * (CWE-601 — Open Redirect). */
const ALLOWED_NEXT_PATHS: ReadonlySet<string> = new Set([
  "/personnel/changer-mot-de-passe",
  "/admin/dashboard",
]);

/** Pattern pour /personnel/{role}/dashboard.
 * Les rôles valides sont le miroir de l'enum PostgreSQL `role_personnel`
 * (voir src/lib/supabase/middleware.ts → ROLES_PERSONNEL). */
const PERSONNEL_DASHBOARD_RE =
  /^\/personnel\/(manager|receptionniste|caissier|laveur|repassage|livreur|comptable)\/dashboard$/;

/**
 * Valide qu'un path `next` est autorisé (anti open redirect).
 *
 * Règles :
 *   1. Doit commencer par "/" (path relatif, pas d'URL absolue)
 *   2. Ne doit PAS commencer par "//" (évite //evil.com → URL protocol-relative)
 *   3. Doit être dans la whitelist stricte OU matcher le pattern
 *      /personnel/{role}/dashboard
 *
 * Si invalide, l'appelant doit faire un fallback vers "/".
 */
function isAllowedNextPath(next: string): boolean {
  if (!next.startsWith("/") || next.startsWith("//")) {
    return false;
  }
  if (ALLOWED_NEXT_PATHS.has(next)) {
    return true;
  }
  if (PERSONNEL_DASHBOARD_RE.test(next)) {
    return true;
  }
  return false;
}

/**
 * GET /auth/callback?code=<PKCE>&next=<path>
 *
 * Échange le code PKCE contre une session Supabase et redirige vers `next`.
 *
 * Étapes :
 *   1. Extrait `code` et `next` des query params.
 *   2. Valide `code` (présent) et `next` (whitelist, anti open redirect).
 *   3. Crée un client Supabase middleware (pose les cookies httpOnly via
 *      le callback setAll sur responseRef.current).
 *   4. Appelle `supabase.auth.exchangeCodeForSession(code)` :
 *        - succès : session posée dans les cookies → on redirige vers `next`
 *        - erreur : log serveur + redirect /login?error=callback_failed
 *   5. Propage les cookies de session de responseRef.current vers la
 *      réponse de redirection (sinon la session serait perdue).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const nextRaw = searchParams.get("next") ?? "/";

  // 1. Validation du paramètre `code` (obligatoire — sinon la route ne peut
  //    rien échanger, on redirige vers /login avec un code d'erreur générique).
  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=callback_invalid`);
  }

  // 2. Validation du paramètre `next` (anti open redirect + whitelist).
  //    Si invalide, on fallback silencieusement vers "/" plutôt que de
  //    renvoyer une erreur — l'utilisateur est tout de même authentifié,
  //    il atterrit sur la home (le middleware le redirigera vers son
  //    dashboard si nécessaire).
  const next = isAllowedNextPath(nextRaw) ? nextRaw : "/";

  // 3. Création du client Supabase middleware.
  //    createMiddlewareClient retourne { supabase, responseRef } où
  //    responseRef.current est la NextResponse qui contiendra les cookies
  //    de session posés par setAll (cf. src/lib/supabase/middleware.ts).
  //
  // 🔒 Garde-fou env : si les vars Supabase ne sont pas configurées (absentes
  //    ou placeholders), createMiddlewareClient lèverait une Error qui
  //    casserait cette route. On redirige à la place vers /login avec un
  //    code d'erreur clair — cohérent avec le comportement du middleware.
  if (!isEnvConfigured()) {
    console.error(
      "[/auth/callback][FATAL] Supabase env vars manquantes — " +
        "redirection vers /login (config_incomplete)."
    );
    return NextResponse.redirect(
      `${origin}/login?error=config_incomplete`
    );
  }

  const { supabase, responseRef } = createMiddlewareClient(request);

  // 4. Échange du code PKCE contre une session.
  //    exchangeCodeForSession appelle setAll en interne → pose les cookies
  //    de session httpOnly sur responseRef.current.
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    // 🔒 Sécurité (audit Conclusion #8) : log serveur détaillé SANS exposer
    // error.message au client. On ne renvoie qu'un code d'erreur générique
    // dans l'URL de redirection.
    console.error(
      "[/auth/callback] exchangeCodeForSession error:",
      error.message
    );
    return NextResponse.redirect(`${origin}/login?error=callback_failed`);
  }

  // 5. Succès : redirige vers `next` en propageant les cookies de session
  //    posés par exchangeCodeForSession sur responseRef.current.
  //    Sans cette propagation, la NextResponse.redirect serait vierge de
  //    cookies et la session serait perdue (l'utilisateur devrait se
  //    reconnecter).
  const redirectUrl = new URL(next, origin);
  const redirect = NextResponse.redirect(redirectUrl);
  responseRef.current.cookies.getAll().forEach((c) => {
    redirect.cookies.set(c.name, c.value, c);
  });
  return redirect;
}
