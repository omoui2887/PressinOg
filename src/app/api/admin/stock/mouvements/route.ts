/**
 * e-pressing — API /api/admin/stock/mouvements (GET) — LOT 10.2
 * --------------------------------------------------------------
 * Historique des mouvements de stock du pressing connecté.
 *
 * Filtres (query params) :
 *   - produit_id  : filtre par produit
 *   - type        : 'entree' | 'sortie' (tous par défaut)
 *   - date_start  : date ISO (incluse)
 *   - date_end    : date ISO (incluse)
 *   - page        : 1-indexed (default 1)
 *   - pageSize    : default 20, max 100
 *
 * Tri : date_mouvement DESC.
 * JOIN : produit (nom, unite), personnel (nom_complet), commandes (numero_ticket).
 *
 * 🔒 SÉCURITÉ : personnel authentifié actif. RLS isole via JOIN produits_stock.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const supabase = await getSupabaseServer();
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) {
    return NextResponse.json(
      { success: false, error: "Non authentifié" },
      { status: 401 }
    );
  }
  const { data: me } = await supabase
    .from("personnel")
    .select("id, pressing_id, role, actif, statut_compte")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (
    !me ||
    me.actif !== true ||
    me.statut_compte !== "actif"
  ) {
    return NextResponse.json(
      { success: false, error: "Compte inactif ou désactivé" },
      { status: 403 }
    );
  }

  const searchParams = request.nextUrl.searchParams;
  const produitId = searchParams.get("produit_id") || null;
  const typeMouvement = searchParams.get("type") || null;
  const dateStart = searchParams.get("date_start") || null;
  const dateEnd = searchParams.get("date_end") || null;
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const pageSize = Math.min(
    100,
    Math.max(1, parseInt(searchParams.get("pageSize") || "20", 10))
  );

  // Construction de la requête avec JOINs.
  // On sélectionne depuis mouvements_stock en JOIN produits_stock pour
  // récupérer le nom et l'unité du produit, et filtrer par pressing via RLS.
  let query = supabase
    .from("mouvements_stock")
    .select(
      "id, produit_id, type_mouvement, quantite, motif, date_mouvement, enregistre_par, commande_id, created_at, produit:produits_stock(nom, unite, pressing_id), enregistre_par_personnel:personnel!mouvements_stock_enregistre_par_fkey(nom_complet), commande:commandes(numero_ticket)",
      { count: "exact" }
    );

  // Filtre par produit
  if (produitId) {
    query = query.eq("produit_id", produitId);
  }

  // Filtre par type
  if (typeMouvement === "entree" || typeMouvement === "sortie") {
    query = query.eq("type_mouvement", typeMouvement);
  }

  // Filtres date (date_mouvement est TIMESTAMPTZ)
  if (dateStart) {
    query = query.gte("date_mouvement", `${dateStart}T00:00:00`);
  }
  if (dateEnd) {
    query = query.lte("date_mouvement", `${dateEnd}T23:59:59`);
  }

  query = query
    .order("date_mouvement", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  const { data: mouvements, error, count } = await query;

  if (error) {
    console.error("[api/admin/stock/mouvements GET] Erreur SELECT:", error);
    return NextResponse.json(
      { success: false, error: "Erreur lors de la récupération des mouvements" },
      { status: 500 }
    );
  }

  // Aplatit les JOINs pour un format plus simple côté client.
  const flat = (mouvements ?? []).map((m: Record<string, unknown>) => {
    const produit = (m.produit as Record<string, unknown> | null) ?? {};
    const personnel = (m.enregistre_par_personnel as Record<string, unknown> | null) ?? {};
    const commande = (m.commande as Record<string, unknown> | null) ?? {};
    return {
      id: m.id,
      produit_id: m.produit_id,
      type_mouvement: m.type_mouvement,
      quantite: m.quantite,
      motif: m.motif,
      date_mouvement: m.date_mouvement,
      enregistre_par: m.enregistre_par,
      commande_id: m.commande_id,
      created_at: m.created_at,
      produit_nom: (produit.nom as string) ?? "—",
      produit_unite: (produit.unite as string) ?? "",
      enregistre_par_nom: (personnel.nom_complet as string) ?? null,
      commande_ticket: (commande.numero_ticket as string) ?? null,
    };
  });

  const totalRows = count ?? 0;

  return NextResponse.json({
    success: true,
    data: flat,
    total: totalRows,
    page,
    pageSize,
    totalPages: Math.ceil(totalRows / pageSize),
  });
}
