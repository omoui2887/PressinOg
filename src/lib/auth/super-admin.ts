/**
 * e-pressing — Helper d'authentification Super Admin (API routes)
 * ----------------------------------------------------------------
 * Vérifie de façon défensive en profondeur que l'appelant est un Super Admin
 * actif (table `super_admins` WHERE actif=true). Retourne la ligne super_admins
 * ou une NextResponse d'erreur à renvoyer immédiatement.
 *
 * Pattern canonique (extrait de /api/super-admin/abonnements/[id]/renouveler) :
 *   const supabase = await getSupabaseServer();
 *   const guard = await ensureSuperAdmin(supabase);
 *   if ("error" in guard) return guard.error;
 *   // sinon : guard.superAdmin.id, guard.superAdmin.nom_complet, etc.
 *
 * 🔒 SÉCURITÉ :
 *   - Vérifie supabase.auth.getUser() (session valide)
 *   - Vérifie super_admins.actif=true (RLS ajoute une couche mais on ne
 *     s'y fie pas uniquement — defense in depth)
 *   - Aucune donnée sensible n'est retournée au-delà de ce dont l'API a besoin
 */
import type { NextResponse } from "next/server";
import type { getSupabaseServer } from "@/lib/supabase/server";

export interface SuperAdminIdentity {
  id: string;
  user_id: string;
  nom_complet: string | null;
  email: string | null;
}

export type EnsureSuperAdminResult =
  | { error: NextResponse }
  | { superAdmin: SuperAdminIdentity };

/**
 * Vérifie l'identité Super Admin de l'appelant.
 *
 * @returns
 *   - Soit `{ error: NextResponse }` (401 ou 403) à renvoyer immédiatement
 *   - Soit `{ superAdmin: SuperAdminIdentity }` si l'appelant est super admin actif
 */
export async function ensureSuperAdmin(
  supabase: Awaited<ReturnType<typeof getSupabaseServer>>
): Promise<EnsureSuperAdminResult> {
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) {
    const { NextResponse } = await import("next/server");
    return {
      error: NextResponse.json(
        { success: false, error: "Non authentifié" },
        { status: 401 }
      ),
    };
  }

  const { data: superAdmin } = await supabase
    .from("super_admins")
    .select("id, user_id, nom_complet, email")
    .eq("user_id", userData.user.id)
    .eq("actif", true)
    .maybeSingle();

  if (!superAdmin) {
    const { NextResponse } = await import("next/server");
    return {
      error: NextResponse.json(
        { success: false, error: "Accès refusé — super admin requis" },
        { status: 403 }
      ),
    };
  }

  return { superAdmin };
}
