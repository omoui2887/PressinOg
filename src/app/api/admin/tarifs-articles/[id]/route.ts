/**
 * e-pressing — API /api/admin/tarifs-articles/[id] (PATCH + DELETE)
 * -----------------------------------------------------------------
 * Modification / suppression d'un tarif article spécifique.
 *
 * PATCH — Met à jour le prix, la durée estimée ou le statut actif.
 *   Body partiel : { prix?, duree_estimee?, actif? }
 *   Auth : manager actif du pressing.
 *
 * DELETE — Supprime définitivement le tarif.
 *   Auth : manager actif du pressing.
 *
 * 🔒 SÉCURITÉ : RLS isole par pressing (le tarif doit appartenir au
 *    pressing du manager connecté). Vérification explicite également
 *    côté application avant update/delete.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function getManagerAndSupabase() {
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

  if (!me || me.actif !== true || me.statut_compte !== "actif") {
    return {
      error: NextResponse.json(
        { success: false, error: "Compte inactif ou désactivé" },
        { status: 403 }
      ),
    };
  }
  if (me.role !== "manager") {
    return {
      error: NextResponse.json(
        { success: false, error: "Accès refusé — manager requis" },
        { status: 403 }
      ),
    };
  }
  return { me, supabase };
}

// ================================================================
//  PATCH
// ================================================================
interface PatchBody {
  prix?: unknown;
  duree_estimee?: unknown;
  actif?: unknown;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getManagerAndSupabase();
  if ("error" in auth) return auth.error;
  const { me, supabase } = auth;

  const { id } = await params;

  let body: PatchBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Corps de requête invalide (JSON attendu)" },
      { status: 400 }
    );
  }

  const updatePayload: Record<string, unknown> = {};

  if (body.prix !== undefined) {
    const prix =
      typeof body.prix === "number"
        ? body.prix
        : parseInt(String(body.prix), 10);
    if (Number.isNaN(prix) || prix < 0) {
      return NextResponse.json(
        { success: false, error: "Prix invalide (entier ≥ 0 FCFA)." },
        { status: 400 }
      );
    }
    updatePayload.prix = prix;
  }

  if (body.duree_estimee !== undefined) {
    if (
      typeof body.duree_estimee === "string" &&
      body.duree_estimee.trim() !== ""
    ) {
      updatePayload.duree_estimee = body.duree_estimee.trim();
    } else {
      updatePayload.duree_estimee = null;
    }
  }

  if (body.actif !== undefined) {
    updatePayload.actif = Boolean(body.actif);
  }

  if (Object.keys(updatePayload).length === 0) {
    return NextResponse.json(
      { success: false, error: "Aucun champ à mettre à jour." },
      { status: 400 }
    );
  }

  // Update avec filtre pressing_id (double sécurité avec RLS)
  const { data: updated, error: updateErr } = await supabase
    .from("tarifs_articles")
    .update(updatePayload)
    .eq("id", id)
    .eq("pressing_id", me!.pressing_id)
    .select(
      `id, pressing_id, catalogue_article_id, type_service, prix, duree_estimee, actif, created_at, updated_at,
       catalogue_article:catalogue_articles(id, slug, nom, icone_url, categorie, ordre_affichage)`
    )
    .maybeSingle();

  if (updateErr) {
    console.error("[api/admin/tarifs-articles PATCH] Erreur UPDATE:", updateErr);
    return NextResponse.json(
      { success: false, error: "Erreur lors de la mise à jour." },
      { status: 500 }
    );
  }

  if (!updated) {
    return NextResponse.json(
      {
        success: false,
        error: "Tarif introuvable ou n'appartenant pas à votre pressing.",
      },
      { status: 404 }
    );
  }

  return NextResponse.json({ success: true, data: updated as unknown as any });
}

// ================================================================
//  DELETE
// ================================================================
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getManagerAndSupabase();
  if ("error" in auth) return auth.error;
  const { me, supabase } = auth;

  const { id } = await params;

  const { error: deleteErr, count } = await supabase
    .from("tarifs_articles")
    .delete({ count: "exact" })
    .eq("id", id)
    .eq("pressing_id", me!.pressing_id);

  if (deleteErr) {
    console.error("[api/admin/tarifs-articles DELETE] Erreur DELETE:", deleteErr);
    return NextResponse.json(
      { success: false, error: "Erreur lors de la suppression." },
      { status: 500 }
    );
  }

  if (count === 0) {
    return NextResponse.json(
      {
        success: false,
        error: "Tarif introuvable ou n'appartenant pas à votre pressing.",
      },
      { status: 404 }
    );
  }

  return NextResponse.json({ success: true });
}
