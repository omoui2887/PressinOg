/**
 * OgPressing — API /api/admin/services/[id] (PATCH) — LOT 11.1
 * ------------------------------------------------------------
 * Modification d'un service : nom, prix, actif, duree_estimee.
 * Le `type` n'est PAS modifiable ici (l'UI ne l'édite pas — spec LOT 11.1).
 *
 * 🔒 SÉCURITÉ : manager actif du pressing. RLS isole par pressing_id
 *    (un manager ne peut modifier que les services de son propre pressing).
 *
 * Référence : pattern identique à /api/admin/stock/[id] (LOT 10.1).
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Vérifie l'auth + retourne le personnel connecté (manager only). */
async function getConnectedManager() {
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
    me.role !== "manager" ||
    me.actif !== true ||
    me.statut_compte !== "actif"
  ) {
    return {
      error: NextResponse.json(
        { success: false, error: "Accès refusé — manager requis" },
        { status: 403 }
      ),
    };
  }
  return { me, supabase };
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json(
      { success: false, error: "ID service manquant" },
      { status: 400 }
    );
  }

  const auth = await getConnectedManager();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

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

  if (body.nom !== undefined) {
    if (typeof body.nom !== "string") {
      return NextResponse.json(
        { success: false, error: "Le nom doit être une chaîne de caractères." },
        { status: 400 }
      );
    }
    const nom = body.nom.trim();
    if (nom.length < 2 || nom.length > 100) {
      return NextResponse.json(
        {
          success: false,
          error: "Le nom doit comporter entre 2 et 100 caractères.",
        },
        { status: 400 }
      );
    }
    update.nom = nom;
  }

  if (body.prix !== undefined && body.prix !== null) {
    const prix =
      typeof body.prix === "number"
        ? body.prix
        : parseInt(String(body.prix), 10);
    if (Number.isNaN(prix) || prix < 0 || !Number.isInteger(prix)) {
      return NextResponse.json(
        {
          success: false,
          error: "Prix unitaire invalide (entier ≥ 0 FCFA).",
        },
        { status: 400 }
      );
    }
    update.prix = prix;
  }

  if (body.actif !== undefined) {
    if (typeof body.actif !== "boolean") {
      return NextResponse.json(
        { success: false, error: "Le champ 'actif' doit être un booléen." },
        { status: 400 }
      );
    }
    update.actif = body.actif;
  }

  if (body.duree_estimee !== undefined) {
    // Interval PostgreSQL : on accepte une chaîne libre ("2 hours", "1 day",
    // "90 minutes") ou null pour effacer. La validation réelle est faite par
    // PostgreSQL (code 22007 si format invalide).
    if (
      typeof body.duree_estimee === "string" &&
      body.duree_estimee.trim() !== ""
    ) {
      update.duree_estimee = body.duree_estimee.trim();
    } else {
      update.duree_estimee = null;
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json(
      { success: false, error: "Aucun champ à mettre à jour." },
      { status: 400 }
    );
  }

  const { data: updated, error: updateErr } = await supabase
    .from("services")
    .update(update)
    .eq("id", id)
    .select(
      "id, type, nom, prix, duree_estimee, actif, created_at, updated_at"
    )
    .maybeSingle();

  if (updateErr) {
    console.error("[api/admin/services PATCH] Erreur UPDATE:", updateErr);
    // Format duree_estimee invalide → 22007
    if (updateErr.code === "22007") {
      return NextResponse.json(
        {
          success: false,
          error:
            "Format de durée estimée invalide. Exemples valides : « 2 hours », « 1 day », « 90 minutes ».",
        },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: "Erreur lors de la mise à jour du service." },
      { status: 500 }
    );
  }

  if (!updated) {
    // Soit l'ID n'existe pas, soit la RLS a bloqué (service hors pressing).
    return NextResponse.json(
      {
        success: false,
        error: "Service introuvable ou accès refusé.",
      },
      { status: 404 }
    );
  }

  return NextResponse.json({ success: true, data: updated });
}
