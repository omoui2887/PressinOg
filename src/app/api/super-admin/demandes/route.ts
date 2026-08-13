/**
 * e-pressing — API /api/super-admin/demandes (GET)
 * -------------------------------------------------
 * Récupère la liste des demandes d'inscription (table `demandes_inscription`)
 * pour le Super Admin, avec :
 *   - filtre par statut (param `statut` : en_attente | contactee | validee |
 *     refusee | all)
 *   - recherche texte libre (param `q`) sur nom_gerant, nom_pressing,
 *     telephone (ilike insensible à la casse)
 *   - pagination (param `page` 1-indexé, `pageSize` default 20)
 *
 * Joint également la dernière ligne `codes_activation` liée (via demande_id)
 * afin que le front puisse afficher le code généré si la demande est validée.
 *
 * 🔒 SÉCURITÉ : getSupabaseServer() (anon + JWT utilisateur). RLS
 *    `super_admin_full_access` sur `demandes_inscription` et
 *    `codes_activation` via `is_super_admin()` → seul un Super Admin peut
 *    lister ces tables.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const STATUTS_VALID = [
  "en_attente",
  "contactee",
  "validee",
  "refusee",
] as const;

export async function GET(request: NextRequest) {
  const supabase = await getSupabaseServer();
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) {
    return NextResponse.json(
      { success: false, error: "Non authentifié" },
      { status: 401 }
    );
  }

  // Vérifie Super Admin actif
  const { data: superAdmin } = await supabase
    .from("super_admins")
    .select("id")
    .eq("user_id", userData.user.id)
    .eq("actif", true)
    .maybeSingle();

  if (!superAdmin) {
    return NextResponse.json(
      { success: false, error: "Accès refusé — Super Admin requis" },
      { status: 403 }
    );
  }

  // ---- Paramètres de requête ----
  const searchParams = request.nextUrl.searchParams;
  const q = (searchParams.get("q") || "").trim();
  const statutParam = searchParams.get("statut") || "all";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const pageSize = Math.min(
    100,
    Math.max(1, parseInt(searchParams.get("pageSize") || "20", 10))
  );

  const statut = (STATUTS_VALID as readonly string[]).includes(statutParam)
    ? statutParam
    : null;

  // ---- Construction de la requête ----
  // Jointure sur codes_activation (1 demande → 0..N codes ; on prend les plus
  // récents en premier côté front, en lisant l'élément [0] du tableau).
  let query = supabase
    .from("demandes_inscription")
    .select(
      "id, nom_gerant, nom_pressing, telephone, email, ville, commune, message, statut, traite_par, date_traitement, notes_traitement, notes_super_admin, nombre_machines, nombre_employes, plan_souhaite, created_at, updated_at, codes_activation!demande_id(code, date_expiration, utilise, created_at)",
      { count: "exact" }
    );

  if (q) {
    // Recherche ilike insensible à la casse sur 3 colonnes.
    // On retire les virgules (séparateur de clause .or) pour éviter une
    // injection de syntaxe.
    const safe = q.replace(/,/g, "").replace(/%/g, "\\%");
    query = query.or(
      `nom_gerant.ilike.%${safe}%,nom_pressing.ilike.%${safe}%,telephone.ilike.%${safe}%`
    );
  }
  if (statut) {
    query = query.eq("statut", statut);
  }

  query = query
    .order("created_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  const { data: demandes, error, count } = await query;

  if (error) {
    console.error("[api/super-admin/demandes] Erreur SELECT:", error);
    return NextResponse.json(
      { success: false, error: "Erreur lors de la récupération des demandes" },
      { status: 500 }
    );
  }

  const totalRows = count ?? 0;

  // Normalisation du champ joint codes_activation : on l'aplatit en
  // `code_activation` (objet unique ou null) pour faciliter la consommation
  // côté client.
  const data = (demandes ?? []).map((d: Record<string, unknown>) => {
    const codesActivation = (d.codes_activation as
      | Array<{
          code: string;
          date_expiration: string | null;
          utilise: boolean;
          created_at: string;
        }>
      | null) ?? [];
    // codes_activation triés par created_at ASC par défaut côté PostgREST
    // (jointure 1→N). On prend le plus récent (non utilisé en priorité).
    const codeActivation =
      codesActivation.length === 0
        ? null
        : codesActivation.sort((a, b) =>
            b.created_at.localeCompare(a.created_at)
          )[0];
    delete d.codes_activation;
    return { ...d, code_activation: codeActivation };
  });

  return NextResponse.json({
    success: true,
    data,
    total: totalRows,
    page,
    pageSize,
    totalPages: Math.ceil(totalRows / pageSize),
  });
}
