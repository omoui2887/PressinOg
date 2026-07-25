/**
 * OgPressing — API /api/admin/services (GET)
 * -------------------------------------------
 * Renvoie la liste des services ACTIFS du pressing connecté. Utilisé par
 * le wizard de création de commande (LOT 7) pour n'afficher que les
 * services disponibles à la vente.
 *
 * Réponse :
 *   { success: true, data: Service[] }
 *   où Service = { id, type, nom, prix, duree_estimee, actif }
 *
 * Tri : type ASC puis prix ASC.
 *
 * 🔒 SÉCURITÉ :
 *   - getSupabaseServer() (client anon + JWT) → RLS `isolation_pressing`
 *     isole automatiquement par pressing_id.
 *   - Auth : n'importe quel personnel actif (statut_compte='actif', actif=true)
 *     du pressing (manager / receptionniste / caissier / laveur / repassage /
 *     livreur / comptable) — tous ceux qui peuvent créer une commande.
 *   - 401 si non authentifié, 403 si personnel non autorisé.
 */
import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await getSupabaseServer();
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) {
    return NextResponse.json(
      { success: false, error: "Non authentifié" },
      { status: 401 }
    );
  }

  // Vérifie que l'appelant est un personnel actif du pressing
  const { data: me } = await supabase
    .from("personnel")
    .select("id, pressing_id, role, actif, statut_compte")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (!me) {
    return NextResponse.json(
      { success: false, error: "Accès refusé — personnel introuvable" },
      { status: 403 }
    );
  }
  if (me.actif !== true || me.statut_compte !== "actif") {
    return NextResponse.json(
      { success: false, error: "Accès refusé — compte inactif" },
      { status: 403 }
    );
  }

  // Récupère les services actifs du pressing (RLS isole par pressing_id)
  const { data: services, error: servicesErr } = await supabase
    .from("services")
    .select("id, type, nom, prix, duree_estimee, actif")
    .eq("actif", true)
    .order("type", { ascending: true })
    .order("prix", { ascending: true });

  if (servicesErr) {
    console.error("[api/admin/services] Erreur SELECT:", servicesErr);
    return NextResponse.json(
      { success: false, error: "Erreur lors de la récupération des services" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    data: services ?? [],
  });
}
