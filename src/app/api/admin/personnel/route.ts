/**
 * OgPressing — API /api/admin/personnel (GET)
 * -------------------------------------------
 * Récupère la liste des employés du pressing connecté avec :
 *   - recherche par nom ou téléphone (param `q`)
 *   - filtre par rôle (param `role` : manager|receptionniste|caissier|laveur|repassage|livreur|comptable|all)
 *   - filtre par statut de compte (param `statut` : actif|invite_en_attente|desactive|all)
 *   - pagination (param `page` 1-indexed, `pageSize` default 20)
 *
 * Renvoie AUSSI les informations de limite du plan d'abonnement :
 *   - plan : starter | pro | business
 *   - limit : 3 | 8 | null (null = illimité)
 *   - count : nombre d'employés actifs+en attente (occupant un siège)
 *   - limitAtteinte : boolean (count >= limit, false si illimité)
 *
 * 🔒 SÉCURITÉ : getSupabaseServer() (client anon + JWT). RLS `isolation_pressing`
 * sur `personnel` garantit qu'on ne voit que les collègues du même pressing.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Limites de sièges par plan (PRD §16).
const PLAN_LIMITS: Record<string, number | null> = {
  starter: 3,
  pro: 8,
  business: null, // illimité
};

const ROLES_VALID = [
  "manager",
  "receptionniste",
  "caissier",
  "laveur",
  "repassage",
  "livreur",
  "comptable",
] as const;

const STATUTS_VALID = ["actif", "invite_en_attente", "desactive"] as const;

export async function GET(request: NextRequest) {
  const supabase = await getSupabaseServer();
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) {
    return NextResponse.json(
      { success: false, error: "Non authentifié" },
      { status: 401 }
    );
  }

  // Récupère le pressing_id + rôle du manager connecté (défense en profondeur)
  const { data: me } = await supabase
    .from("personnel")
    .select("pressing_id, role, actif, statut_compte")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (
    !me ||
    me.role !== "manager" ||
    me.actif !== true ||
    me.statut_compte !== "actif"
  ) {
    return NextResponse.json(
      { success: false, error: "Accès refusé — manager requis" },
      { status: 403 }
    );
  }

  const pressingId = me.pressing_id;

  // ---- Récupère le plan d'abonnement actuel (le plus récent) ----
  const { data: latestAbonnement } = await supabase
    .from("abonnements")
    .select("plan")
    .eq("pressing_id", pressingId)
    .order("date_debut", { ascending: false })
    .limit(1)
    .maybeSingle();

  const plan = latestAbonnement?.plan ?? "starter";
  const limit = PLAN_LIMITS[plan] ?? null; // null = illimité

  // ---- Compte les employés occupant un siège (actif + invite_en_attente) ----
  const { count: seatCount } = await supabase
    .from("personnel")
    .select("id", { count: "exact", head: true })
    .eq("pressing_id", pressingId)
    .in("statut_compte", ["actif", "invite_en_attente"]);

  const count = seatCount ?? 0;
  const limitAtteinte = limit !== null && count >= limit;

  // ---- Paramètres de requête ----
  const searchParams = request.nextUrl.searchParams;
  const q = (searchParams.get("q") || "").trim();
  const roleParam = searchParams.get("role") || "all";
  const statutParam = searchParams.get("statut") || "all";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const pageSize = Math.min(
    100,
    Math.max(1, parseInt(searchParams.get("pageSize") || "20", 10))
  );

  const role = (ROLES_VALID as readonly string[]).includes(roleParam)
    ? roleParam
    : null;
  const statut = (STATUTS_VALID as readonly string[]).includes(statutParam)
    ? statutParam
    : null;

  // ---- Construction de la requête sur `personnel` (RLS isole par pressing) ----
  let query = supabase
    .from("personnel")
    .select(
      "id, nom_complet, email, telephone, role, methode_creation, statut_compte, date_invitation, date_activation, date_desactivation, actif, created_at",
      { count: "exact" }
    )
    .eq("pressing_id", pressingId);

  if (q) {
    const safe = q.replace(/,/g, "");
    query = query.or(`nom_complet.ilike.%${safe}%,telephone.ilike.%${safe}%`);
  }
  if (role) {
    query = query.eq("role", role);
  }
  if (statut) {
    query = query.eq("statut_compte", statut);
  }

  query = query
    .order("created_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  const { data: personnel, error: personnelErr, count: total } = await query;

  if (personnelErr) {
    console.error("[api/admin/personnel] Erreur SELECT:", personnelErr);
    return NextResponse.json(
      { success: false, error: "Erreur lors de la récupération du personnel" },
      { status: 500 }
    );
  }

  const totalRows = total ?? 0;

  return NextResponse.json({
    success: true,
    data: personnel ?? [],
    total: totalRows,
    page,
    pageSize,
    totalPages: Math.ceil(totalRows / pageSize),
    // Infos de limite de plan
    plan,
    limit,
    count,
    limitAtteinte,
  });
}
