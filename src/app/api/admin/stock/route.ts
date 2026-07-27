/**
 * OgPressing — API /api/admin/stock (GET + POST) — LOT 10.1
 * ----------------------------------------------------------
 *
 * GET — Liste des produits_stock du pressing connecté :
 *   - recherche par nom (param `q`)
 *   - tri par défaut : produits en alerte en premier (quantite < seuil),
 *     puis par nom alphabétique
 *   - pas de pagination (typiquement < 50 produits par pressing)
 *
 * POST — Création d'un produit_stock :
 *   Body : { nom, categorie, unite, quantite_initiale, seuil_alerte,
 *            date_expiration?, prix_achat_unitaire?, fournisseur?, fds_url? }
 *   Auth : manager actif du pressing. pressing_id forcé à celui du manager.
 *
 * 🔒 SÉCURITÉ :
 *   - getSupabaseServer() (anon + JWT). RLS isole par pressing.
 *   - Vérification rôle manager (actif) pour GET (lecture) et POST (écriture).
 *   - En réalité, la RLS autorise tout le personnel du pressing à lire
 *     produits_stock ; on reste restrictif côté API pour la cohérence.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const CATEGORIES_VALID = [
  "detergent",
  "adoucissant",
  "detacheur",
  "desinfectant",
  "javel",
  "savon",
] as const;

const UNITES_VALID = ["litre", "kg"] as const;

/** Vérifie l'auth + retourne le personnel connecté (manager ou autre rôle
 *  autorisé). Lance une NextResponse 401/403 en cas d'échec via la valeur
 *  retournée `{ error }`. */
async function getConnectedPersonnel(allowWrite: boolean) {
  const supabase = await getSupabaseServer();
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) {
    return {
      error: NextResponse.json(
        { success: false, error: "Non authentifié" },
        { status: 401 }
      ),
    };
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
    return {
      error: NextResponse.json(
        { success: false, error: "Compte inactif ou désactivé" },
        { status: 403 }
      ),
    };
  }
  // Pour l'écriture (POST/PATCH/DELETE/mouvement), on exige le rôle manager.
  if (allowWrite && me.role !== "manager") {
    return {
      error: NextResponse.json(
        { success: false, error: "Accès refusé — manager requis" },
        { status: 403 }
      ),
    };
  }
  return { me, supabase };
}

export async function GET(request: NextRequest) {
  const auth = await getConnectedPersonnel(false);
  if ("error" in auth) return auth.error;
  const { me, supabase } = auth;
  const pressingId = me!.pressing_id;

  const searchParams = request.nextUrl.searchParams;
  const q = (searchParams.get("q") || "").trim();

  let query = supabase
    .from("produits_stock")
    .select(
      "id, pressing_id, nom, categorie, unite, quantite_actuelle, seuil_alerte, prix_achat_unitaire, fournisseur, fds_url, date_expiration, created_at, updated_at"
    )
    .eq("pressing_id", pressingId);

  if (q) {
    const safe = q.replace(/[%_]/g, "");
    query = query.ilike("nom", `%${safe}%`);
  }

  // Tri : nom alphabétique. Le tri "alertes en premier" est fait côté client
  // car Supabase ne supporte pas ORDER BY (quantite < seuil) directement.
  query = query.order("nom", { ascending: true });

  const { data: produits, error } = await query;

  if (error) {
    console.error("[api/admin/stock GET] Erreur SELECT:", error);
    return NextResponse.json(
      { success: false, error: "Erreur lors de la récupération du stock" },
      { status: 500 }
    );
  }

  // Tri applicatif : alertes critiques → warning → ok, puis nom.
  const sorted = (produits ?? []).sort((a, b) => {
    const qa = Number(a.quantite_actuelle);
    const qb = Number(b.quantite_actuelle);
    const sa = Number(a.seuil_alerte);
    const sb = Number(b.seuil_alerte);
    const aCritical = sa > 0 && qa < sa ? 0 : 1;
    const bCritical = sb > 0 && qb < sb ? 0 : 1;
    if (aCritical !== bCritical) return aCritical - bCritical;
    return (a.nom as string).localeCompare(b.nom as string);
  });

  return NextResponse.json({
    success: true,
    data: sorted,
  });
}

/* ================================================================
 *  POST — Création d'un produit_stock (LOT 10.1)
 * ================================================================ */

interface CreateBody {
  nom?: unknown;
  categorie?: unknown;
  unite?: unknown;
  quantite_initiale?: unknown;
  seuil_alerte?: unknown;
  date_expiration?: unknown;
  prix_achat_unitaire?: unknown;
  fournisseur?: unknown;
  fds_url?: unknown;
}

export async function POST(request: NextRequest) {
  const auth = await getConnectedPersonnel(true);
  if ("error" in auth) return auth.error;
  const { me, supabase } = auth;
  const pressingId = me!.pressing_id;

  let body: CreateBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Corps de requête invalide (JSON attendu)" },
      { status: 400 }
    );
  }

  const nom = typeof body.nom === "string" ? body.nom.trim() : "";
  const categorie =
    typeof body.categorie === "string" ? body.categorie : "";
  const unite = typeof body.unite === "string" ? body.unite : "";

  if (!nom || nom.length < 2 || nom.length > 100) {
    return NextResponse.json(
      { success: false, error: "Le nom doit comporter entre 2 et 100 caractères." },
      { status: 400 }
    );
  }
  if (!(CATEGORIES_VALID as readonly string[]).includes(categorie)) {
    return NextResponse.json(
      { success: false, error: "Catégorie invalide." },
      { status: 400 }
    );
  }
  if (!(UNITES_VALID as readonly string[]).includes(unite)) {
    return NextResponse.json(
      { success: false, error: "Unité invalide (litre ou kg)." },
      { status: 400 }
    );
  }

  const quantiteInitiale =
    typeof body.quantite_initiale === "number"
      ? body.quantite_initiale
      : parseFloat(String(body.quantite_initiale ?? "0"));
  const seuilAlerte =
    typeof body.seuil_alerte === "number"
      ? body.seuil_alerte
      : parseFloat(String(body.seuil_alerte ?? "0"));

  if (Number.isNaN(quantiteInitiale) || quantiteInitiale < 0) {
    return NextResponse.json(
      { success: false, error: "Quantité initiale invalide (≥ 0)." },
      { status: 400 }
    );
  }
  if (Number.isNaN(seuilAlerte) || seuilAlerte < 0) {
    return NextResponse.json(
      { success: false, error: "Seuil d'alerte invalide (≥ 0)." },
      { status: 400 }
    );
  }

  // date_expiration : string "YYYY-MM-DD" ou null
  let dateExpiration: string | null = null;
  if (typeof body.date_expiration === "string" && body.date_expiration) {
    const d = new Date(body.date_expiration + "T00:00:00");
    if (Number.isNaN(d.getTime())) {
      return NextResponse.json(
        { success: false, error: "Date d'expiration invalide." },
        { status: 400 }
      );
    }
    dateExpiration = body.date_expiration;
  }

  let prixAchat: number | null = null;
  if (
    body.prix_achat_unitaire !== null &&
    body.prix_achat_unitaire !== undefined &&
    body.prix_achat_unitaire !== ""
  ) {
    prixAchat =
      typeof body.prix_achat_unitaire === "number"
        ? body.prix_achat_unitaire
        : parseInt(String(body.prix_achat_unitaire), 10);
    if (Number.isNaN(prixAchat) || prixAchat < 0) {
      return NextResponse.json(
        { success: false, error: "Prix d'achat invalide (entier ≥ 0)." },
        { status: 400 }
      );
    }
  }

  const fournisseur =
    typeof body.fournisseur === "string" && body.fournisseur.trim()
      ? body.fournisseur.trim().slice(0, 200)
      : null;

  const fdsUrl =
    typeof body.fds_url === "string" && body.fds_url ? body.fds_url : null;

  const { data: produit, error: insertErr } = await supabase
    .from("produits_stock")
    .insert({
      pressing_id: pressingId,
      nom,
      categorie,
      unite,
      quantite_actuelle: quantiteInitiale,
      seuil_alerte: seuilAlerte,
      prix_achat_unitaire: prixAchat,
      fournisseur,
      fds_url: fdsUrl,
      date_expiration: dateExpiration,
    })
    .select(
      "id, pressing_id, nom, categorie, unite, quantite_actuelle, seuil_alerte, prix_achat_unitaire, fournisseur, fds_url, date_expiration, created_at, updated_at"
    )
    .maybeSingle();

  if (insertErr || !produit) {
    console.error("[api/admin/stock POST] Erreur INSERT:", insertErr);
    return NextResponse.json(
      { success: false, error: "Erreur lors de la création du produit." },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, data: produit }, { status: 201 });
}
