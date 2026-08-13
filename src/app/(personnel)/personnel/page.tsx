/**
 * e-pressing — /personnel → /personnel/{role}/dashboard
 * ------------------------------------------------------
 * Redirection racine du portail personnel : lit le rôle de l'utilisateur
 * connecté (via Supabase SSR) et le redirige vers son dashboard dédié.
 *
 * Pattern identique au layout `(personnel)` :
 *   - Server Component, `getSupabaseServer()` (anon + JWT utilisateur → RLS)
 *   - Défense en profondeur : le middleware a déjà vérifié l'auth + le rôle,
 *     mais on re-valide côté serveur et on redirige vers /login si l'utilisateur
 *     n'est pas authentifié ou n'a pas de ligne personnel active.
 *
 * Rôles gérés (miroir de l'enum PostgreSQL `role_personnel`) :
 *   manager, receptionniste, caissier, laveur, repassage, livreur, comptable.
 *
 * 🔒 SÉCURITÉ : aucune logique métier modifiée, isolation multi-tenant
 *    préservée (RLS via le client anon + JWT utilisateur).
 */
import { redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { isPersonnelRole } from "@/components/ogpressing/personnel/personnel-nav-config";

export const dynamic = "force-dynamic";

export default async function PersonnelRootPage() {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Non authentifié → /login (le middleware aurait déjà dû le faire).
  if (!user) {
    redirect("/login?next=/personnel");
  }

  // Récupère la ligne personnel (RLS : self via get_pressing_id_utilisateur).
  const { data: personnel } = await supabase
    .from("personnel")
    .select("role, actif, statut_compte")
    .eq("user_id", user.id)
    .maybeSingle();

  // Pas de ligne personnel, compte inactif, ou rôle inconnu → /login.
  if (
    !personnel ||
    personnel.actif !== true ||
    personnel.statut_compte !== "actif" ||
    !isPersonnelRole(personnel.role)
  ) {
    redirect("/login?next=/personnel&error=acces_refuse");
  }

  // Redirection vers le dashboard du rôle (les 7 rôles ont tous une route
  // /personnel/{role}/dashboard — cf. personnel-nav-config.ts).
  redirect(`/personnel/${personnel.role}/dashboard`);
}
