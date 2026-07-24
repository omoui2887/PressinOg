/**
 * OgPressing — Helper Supabase pour le Middleware Next.js
 * -------------------------------------------------------
 * Sert de factory : crée un client Supabase Server adapté au contexte
 * Middleware (cookies synchrones NextRequest/NextResponse) et expose une
 * fonction `updateSession` qui :
 *   1. Récupère la session JWT Supabase depuis les cookies
 *   2. La rafraîchit si expirée
 *   3. Réécrit les cookies dans la réponse
 *   4. Protège les route groups (super-admin) / (admin) / (personnel)
 *      en vérifiant le rôle de l'utilisateur authentifié
 *
 * 🔒 SÉCURITÉ : ce client utilise la clé `anon` + JWT utilisateur → soumis RLS.
 * La vérification de rôle s'appuie sur les policies RLS :
 *   - Super Admin  : peut lire sa propre ligne dans `super_admins`
 *                   (policy super_admin_full_access USING is_super_admin())
 *   - Admin/Personnel : peut lire sa propre ligne dans `personnel`
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

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
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
  });

  return { supabase, response };
}

/** Préfixes de routes protégées par rôle. */
const PROTECTED_PREFIXES = ["/super-admin", "/admin", "/personnel"] as const;

/** Construit une réponse de redirection en préservant les cookies de session rafraîchie. */
function redirectTo(
  request: NextRequest,
  response: NextResponse,
  path: string
): NextResponse {
  const url = new URL(path, request.url);
  const redirect = NextResponse.redirect(url);
  // Propage les cookies (session rafraîchie) vers la réponse de redirection.
  response.cookies.getAll().forEach((c) => {
    redirect.cookies.set(c.name, c.value, c);
  });
  return redirect;
}

/**
 * Met à jour la session Supabase à chaque requête + protège les routes.
 */
export async function updateSession(
  request: NextRequest
): Promise<NextResponse> {
  // 🔒 Garde-fou : si les vars d'env Supabase ne sont pas configurées,
  // on laisse passer la requête sans auth (pour ne pas casser tout le site).
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
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some((p) =>
    pathname === p || pathname.startsWith(p + "/")
  );

  if (!isProtected) {
    // Route publique : on laisse passer (session rafraîchie dans la réponse).
    return response;
  }

  // 1. Non authentifié sur une route protégée → /login?next=...
  if (!user) {
    return redirectTo(request, response, `/login?next=${encodeURIComponent(pathname)}`);
  }

  // 2. Vérification du rôle selon le préfixe.
  if (pathname === "/super-admin" || pathname.startsWith("/super-admin/")) {
    // Super Admin : doit avoir une ligne active dans super_admins.
    // RLS : is_super_admin() = true autorise la lecture de sa propre ligne.
    const { data: sa } = await supabase
      .from("super_admins")
      .select("id")
      .eq("user_id", user.id)
      .eq("actif", true)
      .maybeSingle();
    if (!sa) {
      return redirectTo(
        request,
        response,
        `/login?next=${encodeURIComponent(pathname)}&error=acces_refuse`
      );
    }
  } else if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    // Admin pressing : personnel avec rôle 'manager' actif.
    const { data: pers } = await supabase
      .from("personnel")
      .select("id, role, actif, statut_compte")
      .eq("user_id", user.id)
      .maybeSingle();
    const ok =
      pers &&
      pers.role === "manager" &&
      pers.actif === true &&
      pers.statut_compte === "actif";
    if (!ok) {
      return redirectTo(
        request,
        response,
        `/login?next=${encodeURIComponent(pathname)}&error=acces_refuse`
      );
    }
  } else if (pathname === "/personnel" || pathname.startsWith("/personnel/")) {
    // Personnel : n'importe quel employé actif (hors manager → /admin).
    const { data: pers } = await supabase
      .from("personnel")
      .select("id, actif, statut_compte")
      .eq("user_id", user.id)
      .maybeSingle();
    const ok = pers && pers.actif === true && pers.statut_compte === "actif";
    if (!ok) {
      return redirectTo(
        request,
        response,
        `/login?next=${encodeURIComponent(pathname)}&error=acces_refuse`
      );
    }
  }

  return response;
}
