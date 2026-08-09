/**
 * OgPressing — API /api/super-admin/abonnements (GET)
 * ----------------------------------------------------
 * Récupère la liste de TOUS les abonnements (tous pressings confondus) avec :
 *   - recherche par nom du pressing (param `q`)
 *   - filtre par statut (param `statut` : essai|actif|suspendu|expire|all)
 *   - filtre par plan (param `plan` : starter|pro|business|all)
 *   - pagination (param `page` 1-indexed, `pageSize` default 20)
 *
 * En plus du `data` paginé, la route renvoie :
 *   - `stats` : nombre d'abonnements ACTIFS par plan
 *     ({ starter, pro, business }) — alimente les 3 cartes d'aperçu en haut
 *     de la page.
 *   - `alertes` : compteurs pour la bannière d'alerte
 *     ({ expireBientot, expires }) calculés sur TOUS les abonnements (pas
 *     seulement la page courante), en filtrant par date_fin < now+3j et
 *     date_fin < now respectivement.
 *
 * Tri : `date_fin ASC` (NULLS LAST) → les abonnements qui expirent bientôt
 * apparaissent en premier, afin que les alertes soient visibles en haut de
 * la liste.
 *
 * 🔒 SÉCURITÉ : getSupabaseServer() (client anon + JWT utilisateur).
 * La RLS `super_admin_full_access` (USING is_super_admin()) sur `abonnements`
 * et `pressing` garantit que SEUL un super admin peut lister tous les
 * abonnements. Un utilisateur non super admin reçoit un 403.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const STATUTS_VALID = ["essai", "actif", "suspendu", "expire"] as const;
const PLANS_VALID = ["starter", "pro", "business"] as const;

/** Vérifie que l'appelant est bien un super admin actif et renvoie sa ligne. */
async function ensureSuperAdmin(
  supabase: Awaited<ReturnType<typeof getSupabaseServer>>
) {
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) {
    return {
      error: NextResponse.json(
        { success: false, error: "Non authentifié" },
        { status: 401 }
      ),
    };
  }
  // RLS : is_super_admin() = true renvoie la ligne ; sinon null → 403.
  const { data: superAdmin } = await supabase
    .from("super_admins")
    .select("id, user_id, nom_complet, email")
    .eq("user_id", userData.user.id)
    .eq("actif", true)
    .maybeSingle();

  if (!superAdmin) {
    return {
      error: NextResponse.json(
        { success: false, error: "Accès refusé — super admin requis" },
        { status: 403 }
      ),
    };
  }
  return { superAdmin };
}

export async function GET(request: NextRequest) {
  const supabase = await getSupabaseServer();
  const guard = await ensureSuperAdmin(supabase);
  if ("error" in guard) return guard.error;

  const searchParams = request.nextUrl.searchParams;
  const q = (searchParams.get("q") || "").trim();
  const statutParam = searchParams.get("statut") || "all";
  const planParam = searchParams.get("plan") || "all";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const pageSize = Math.min(
    100,
    Math.max(1, parseInt(searchParams.get("pageSize") || "20", 10))
  );

  const statut = (STATUTS_VALID as readonly string[]).includes(statutParam)
    ? statutParam
    : null;
  const plan = (PLANS_VALID as readonly string[]).includes(planParam)
    ? planParam
    : null;

  // ---- Construction de la requête sur `abonnements` ----
  // Nested select sur `pressing(nom, ville)` pour récupérer le nom du pressing
  // en une seule requête (PostgREST embedded resource).
  let query = supabase
    .from("abonnements")
    .select(
      "id, pressing_id, plan, statut, date_debut, date_fin, montant_mensuel, mode_paiement_derniere_echeance, date_derniere_echeance, reference_paiement, justificatif_url, enregistre_par, created_at, updated_at, pressing!inner(id, nom, ville)",
      { count: "exact" }
    );

  if (statut) {
    query = query.eq("statut", statut);
  }
  if (plan) {
    query = query.eq("plan", plan);
  }
  if (q) {
    // ILIKE insensible à la casse sur le nom du pressing (via la relation
    // embedded). PostgREST supporte la syntaxe `relation.colonne` dans `.or()`.
    const safe = q.replace(/,/g, "");
    query = query.or(`pressing.nom.ilike.%${safe}%`);
  }

  // Tri : date_fin ASC (les abonnements qui expirent bientôt apparaissent en haut).
  // NB: `nulls: 'last'` n'est pas supporté par tous les types Supabase — on se
  // contente de `ascending: true` (PostgREST trie déjà les NULL en dernier par défaut).
  query = query
    .order("date_fin", { ascending: true })
    .range((page - 1) * pageSize, page * pageSize - 1);

  const { data: abonnements, error: abonnementsErr, count: total } =
    await query;

  if (abonnementsErr) {
    console.error("[api/super-admin/abonnements] Erreur SELECT:", abonnementsErr);
    return NextResponse.json(
      { success: false, error: "Erreur lors de la récupération des abonnements" },
      { status: 500 }
    );
  }

  // ---- Stats : compte des abonnements ACTIFS par plan (3 cartes d'aperçu) ----
  // Effectué en parallèle avec les compteurs d'alertes pour minimiser la latence.
  const now = new Date();
  const dans3Jours = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  const nowIso = now.toISOString();
  const dans3JoursIso = dans3Jours.toISOString();

  const [
    { count: starterActif },
    { count: proActif },
    { count: businessActif },
    { count: expireBientot },
    { count: expires },
  ] = await Promise.all([
    supabase
      .from("abonnements")
      .select("id", { count: "exact", head: true })
      .eq("statut", "actif")
      .eq("plan", "starter"),
    supabase
      .from("abonnements")
      .select("id", { count: "exact", head: true })
      .eq("statut", "actif")
      .eq("plan", "pro"),
    supabase
      .from("abonnements")
      .select("id", { count: "exact", head: true })
      .eq("statut", "actif")
      .eq("plan", "business"),
    // Expire bientôt : date_fin non null, dans le futur, < now+3j
    supabase
      .from("abonnements")
      .select("id", { count: "exact", head: true })
      .not("date_fin", "is", null)
      .gte("date_fin", nowIso)
      .lt("date_fin", dans3JoursIso),
    // Expirés : date_fin < now (déjà dépassée)
    supabase
      .from("abonnements")
      .select("id", { count: "exact", head: true })
      .not("date_fin", "is", null)
      .lt("date_fin", nowIso),
  ]);

  const totalRows = total ?? 0;

  return NextResponse.json({
    success: true,
    data: abonnements ?? [],
    total: totalRows,
    page,
    pageSize,
    totalPages: Math.ceil(totalRows / pageSize),
    stats: {
      starter: starterActif ?? 0,
      pro: proActif ?? 0,
      business: businessActif ?? 0,
    },
    alertes: {
      expireBientot: expireBientot ?? 0,
      expires: expires ?? 0,
    },
  });
}
