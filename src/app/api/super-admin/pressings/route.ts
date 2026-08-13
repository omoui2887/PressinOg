/**
 * e-pressing — API /api/super-admin/pressings (GET)
 * ----------------------------------------------------
 * Liste des pressings clients (vue Super Admin).
 *
 * Fonctionnalités :
 *   - Recherche instantanée par nom OU ville (param `q`, ILIKE insensible à la casse)
 *   - Pagination 20/page (param `page` 1-indexed, `pageSize` default 20, max 100)
 *   - Tri par `created_at DESC` (plus récents en premier)
 *
 * Pour chaque pressing, l'API renvoie en plus des colonnes de la table `pressing` :
 *   - `plan_actuel` : plan du dernier abonnement (starter|pro|business) ou null si aucun
 *   - `employes_actifs` : nombre de personnel WHERE actif=true AND statut_compte='actif'
 *   - `total_commandes` : nombre total de commandes du pressing
 *
 * 🔒 SÉCURITÉ : getSupabaseServer() (client anon + JWT utilisateur).
 *   - Le layout `(super-admin)` + le middleware garantissent que l'appelant est
 *     super admin. En défense en profondeur, l'API vérifie à nouveau via
 *     `super_admins` (actif=true) avant toute lecture.
 *   - RLS : policy `super_admin_full_access` sur `pressing`, `abonnements`,
 *     `personnel`, `commandes` donne au super admin un accès total en lecture.
 *
 * ⚡ PERF : pour éviter 40+ count queries (2 par pressing × 20 pressings),
 *   on récupère en parallèle :
 *     1. la page de pressings (avec count exact pour la pagination)
 *     2. tous les abonnements des pressings de la page (on garde le plus récent)
 *     3. tous les personnel actifs des pressings de la page (on groupe/counts côté JS)
 *     4. toutes les commandes des pressings de la page (idem)
 *   → 4 requêtes Supabase parallèles au lieu de 40+ séquentielles.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const PAGE_SIZE_DEFAULT = 20;
const PAGE_SIZE_MAX = 100;

interface AbonnementRow {
  pressing_id: string;
  plan: string;
  date_debut: string;
}

interface PersonnelRow {
  pressing_id: string;
}

interface CommandeRow {
  pressing_id: string;
}

export async function GET(request: NextRequest) {
  const supabase = await getSupabaseServer();
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) {
    return NextResponse.json(
      { success: false, error: "Non authentifié" },
      { status: 401 }
    );
  }

  // ---- Défense en profondeur : vérifie l'appartenance au rôle super admin ----
  const { data: superAdminRow } = await supabase
    .from("super_admins")
    .select("id")
    .eq("user_id", userData.user.id)
    .eq("actif", true)
    .maybeSingle();

  if (!superAdminRow) {
    return NextResponse.json(
      { success: false, error: "Accès refusé — super admin requis" },
      { status: 403 }
    );
  }

  // ---- Paramètres de requête ----
  const searchParams = request.nextUrl.searchParams;
  const q = (searchParams.get("q") || "").trim();
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const pageSize = Math.min(
    PAGE_SIZE_MAX,
    Math.max(1, parseInt(searchParams.get("pageSize") || String(PAGE_SIZE_DEFAULT), 10))
  );

  // ---- Requête principale sur `pressing` (RLS super_admin_full_access) ----
  let pressingsQuery = supabase
    .from("pressing")
    .select(
      "id, nom, slug, telephone, email, adresse, ville, commune, logo_url, statut, date_activation, horaires, created_at, updated_at",
      { count: "exact" }
    );

  if (q) {
    // Recherche ILIKE sur nom OU ville (PostgREST : OR sur 2 colonnes)
    const safe = q.replace(/,/g, "");
    pressingsQuery = pressingsQuery.or(
      `nom.ilike.%${safe}%,ville.ilike.%${safe}%`
    );
  }

  pressingsQuery = pressingsQuery
    .order("created_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  const { data: pressings, error: pressingsErr, count } = await pressingsQuery;

  if (pressingsErr) {
    console.error("[api/super-admin/pressings] Erreur SELECT pressing:", pressingsErr);
    return NextResponse.json(
      { success: false, error: "Erreur lors de la récupération des pressings" },
      { status: 500 }
    );
  }

  if (!pressings || pressings.length === 0) {
    return NextResponse.json({
      success: true,
      data: [],
      total: count ?? 0,
      page,
      pageSize,
      totalPages: 0,
    });
  }

  // ---- Récupère en parallèle les données agrégées pour cette page ----
  const pressingIds = pressings.map((p) => p.id);

  const [abonnementsRes, personnelActifRes, commandesRes] = await Promise.all([
    // Abonnements : on garde le plus récent (date_debut DESC) par pressing
    supabase
      .from("abonnements")
      .select("pressing_id, plan, date_debut")
      .in("pressing_id", pressingIds)
      .order("date_debut", { ascending: false }),
    // Personnel actif : on compte côté JS (count groupé non supporté en PostgREST sans RPC)
    supabase
      .from("personnel")
      .select("pressing_id")
      .in("pressing_id", pressingIds)
      .eq("actif", true)
      .eq("statut_compte", "actif"),
    // Commandes : on compte côté JS
    supabase
      .from("commandes")
      .select("pressing_id")
      .in("pressing_id", pressingIds),
  ]);

  // ---- Calcule le plan actuel par pressing (1er abonnement le plus récent vu l'ORDER BY) ----
  const planByPressing = new Map<string, string>();
  if (abonnementsRes.data) {
    for (const a of abonnementsRes.data as AbonnementRow[]) {
      if (!planByPressing.has(a.pressing_id)) {
        planByPressing.set(a.pressing_id, a.plan);
      }
    }
  }

  // ---- Compte les employés actifs par pressing ----
  const employesByPressing = new Map<string, number>();
  for (const p of pressingIds) employesByPressing.set(p, 0);
  if (personnelActifRes.data) {
    for (const r of personnelActifRes.data as PersonnelRow[]) {
      const cur = employesByPressing.get(r.pressing_id) ?? 0;
      employesByPressing.set(r.pressing_id, cur + 1);
    }
  }

  // ---- Compte les commandes par pressing ----
  const commandesByPressing = new Map<string, number>();
  for (const p of pressingIds) commandesByPressing.set(p, 0);
  if (commandesRes.data) {
    for (const c of commandesRes.data as CommandeRow[]) {
      const cur = commandesByPressing.get(c.pressing_id) ?? 0;
      commandesByPressing.set(c.pressing_id, cur + 1);
    }
  }

  // ---- Fusionne tout dans la réponse ----
  const enriched = pressings.map((p) => ({
    ...p,
    plan_actuel: planByPressing.get(p.id) ?? null,
    employes_actifs: employesByPressing.get(p.id) ?? 0,
    total_commandes: commandesByPressing.get(p.id) ?? 0,
  }));

  const total = count ?? 0;
  const totalPages = Math.ceil(total / pageSize);

  return NextResponse.json({
    success: true,
    data: enriched,
    total,
    page,
    pageSize,
    totalPages,
  });
}
