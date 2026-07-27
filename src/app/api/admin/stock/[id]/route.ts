/**
 * OgPressing — API /api/admin/stock/[id] (PATCH) — LOT 10.1
 * ---------------------------------------------------------
 * Modification d'un produit_stock : seuil_alerte, nom, catégorie, unité,
 * prix_achat_unitaire, fournisseur, fds_url, date_expiration.
 *
 * 🔒 SÉCURITÉ : manager actif. RLS isole par pressing (un manager ne peut
 *    modifier que les produits de son propre pressing).
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
];
const UNITES_VALID = ["litre", "kg"];

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json(
      { success: false, error: "ID produit manquant" },
      { status: 400 }
    );
  }

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
    me.role !== "manager" ||
    me.actif !== true ||
    me.statut_compte !== "actif"
  ) {
    return NextResponse.json(
      { success: false, error: "Accès refusé — manager requis" },
      { status: 403 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Corps de requête invalide (JSON attendu)" },
      { status: 400 }
    );
  }

  // Construit l'objet update uniquement avec les champs fournis et valides.
  const update: Record<string, unknown> = {};

  if (typeof body.nom === "string") {
    const nom = body.nom.trim();
    if (nom.length < 2 || nom.length > 100) {
      return NextResponse.json(
        { success: false, error: "Le nom doit comporter entre 2 et 100 caractères." },
        { status: 400 }
      );
    }
    update.nom = nom;
  }

  if (typeof body.categorie === "string") {
    if (!CATEGORIES_VALID.includes(body.categorie)) {
      return NextResponse.json(
        { success: false, error: "Catégorie invalide." },
        { status: 400 }
      );
    }
    update.categorie = body.categorie;
  }

  if (typeof body.unite === "string") {
    if (!UNITES_VALID.includes(body.unite)) {
      return NextResponse.json(
        { success: false, error: "Unité invalide." },
        { status: 400 }
      );
    }
    update.unite = body.unite;
  }

  if (body.seuil_alerte !== undefined && body.seuil_alerte !== null) {
    const seuil =
      typeof body.seuil_alerte === "number"
        ? body.seuil_alerte
        : parseFloat(String(body.seuil_alerte));
    if (Number.isNaN(seuil) || seuil < 0) {
      return NextResponse.json(
        { success: false, error: "Seuil d'alerte invalide (≥ 0)." },
        { status: 400 }
      );
    }
    update.seuil_alerte = seuil;
  }

  if (
    body.prix_achat_unitaire !== undefined &&
    body.prix_achat_unitaire !== null &&
    body.prix_achat_unitaire !== ""
  ) {
    const prix =
      typeof body.prix_achat_unitaire === "number"
        ? body.prix_achat_unitaire
        : parseInt(String(body.prix_achat_unitaire), 10);
    if (Number.isNaN(prix) || prix < 0) {
      return NextResponse.json(
        { success: false, error: "Prix d'achat invalide." },
        { status: 400 }
      );
    }
    update.prix_achat_unitaire = prix;
  }

  if (body.fournisseur !== undefined) {
    update.fournisseur =
      typeof body.fournisseur === "string" && body.fournisseur.trim()
        ? body.fournisseur.trim().slice(0, 200)
        : null;
  }

  if (body.fds_url !== undefined) {
    update.fds_url =
      typeof body.fds_url === "string" && body.fds_url ? body.fds_url : null;
  }

  if (body.date_expiration !== undefined) {
    if (
      typeof body.date_expiration === "string" &&
      body.date_expiration
    ) {
      const d = new Date(body.date_expiration + "T00:00:00");
      if (Number.isNaN(d.getTime())) {
        return NextResponse.json(
          { success: false, error: "Date d'expiration invalide." },
          { status: 400 }
        );
      }
      update.date_expiration = body.date_expiration;
    } else {
      update.date_expiration = null;
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json(
      { success: false, error: "Aucun champ à mettre à jour." },
      { status: 400 }
    );
  }

  const { data: updated, error: updateErr } = await supabase
    .from("produits_stock")
    .update(update)
    .eq("id", id)
    .select(
      "id, pressing_id, nom, categorie, unite, quantite_actuelle, seuil_alerte, prix_achat_unitaire, fournisseur, fds_url, date_expiration, created_at, updated_at"
    )
    .maybeSingle();

  if (updateErr || !updated) {
    console.error("[api/admin/stock PATCH] Erreur UPDATE:", updateErr);
    return NextResponse.json(
      { success: false, error: "Erreur lors de la mise à jour du produit." },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, data: updated });
}
