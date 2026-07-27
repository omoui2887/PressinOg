/**
 * OgPressing — API /api/super-admin/catalogue/[id] (PATCH + DELETE)
 * -----------------------------------------------------------------
 * LOT 15.4 — Gestion d'un article individuel du catalogue.
 *
 * 1) PATCH /api/super-admin/catalogue/[id]
 *    Met à jour un article existant. Body JSON (tous les champs optionnels) :
 *      {
 *        nom?: string,
 *        categorie?: string,
 *        icone_url?: string,
 *        ordre_affichage?: number,
 *        actif?: boolean,
 *        slug?: string    // ⚠️ déconseillé (utilisé pour construire icone_url)
 *      }
 *    Réponse : { success: true, data: CatalogueArticle }
 *
 * 2) DELETE /api/super-admin/catalogue/[id]
 *    Supprime un article. Refusé (409) si l'article est référencé par
 *    au moins une ligne dans `articles_vetements` (FK ON DELETE RESTRICT).
 *    Dans ce cas, le Super Admin doit d'abord désactiver l'article
 *    (actif=false) via PATCH plutôt que de le supprimer.
 *
 * 🔒 SÉCURITÉ : Super Admin uniquement (vérifié via requireSuperAdmin).
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { iconeUrlForSlug } from "@/lib/catalogue/catalogue-articles";
import type { CatalogueArticle } from "@/lib/catalogue/catalogue-articles";

export const dynamic = "force-dynamic";

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

async function requireSuperAdmin() {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      supabase,
      forbidden: NextResponse.json(
        { success: false, error: "Non authentifié" },
        { status: 401 }
      ),
    };
  }
  const { data: superAdminRow } = await supabase
    .from("super_admins")
    .select("id")
    .eq("user_id", user.id)
    .eq("actif", true)
    .maybeSingle();
  if (!superAdminRow) {
    return {
      supabase,
      forbidden: NextResponse.json(
        { success: false, error: "Accès refusé — super admin requis" },
        { status: 403 }
      ),
    };
  }
  return { supabase, forbidden: null };
}

/* ------------------------------------------------------------------ */
/*  PATCH — Met à jour un article                                      */
/* ------------------------------------------------------------------ */

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSuperAdmin();
  if (auth.forbidden) return auth.forbidden;
  const { supabase } = auth;

  const { id } = await params;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json(
      { success: false, error: "id invalide" },
      { status: 400 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { success: false, error: "JSON invalide" },
      { status: 400 }
    );
  }

  const update: Record<string, unknown> = {};

  // nom
  if (body.nom !== undefined) {
    const nomRaw = typeof body.nom === "string" ? body.nom.trim() : "";
    if (nomRaw.length < 2 || nomRaw.length > 200) {
      return NextResponse.json(
        {
          success: false,
          error: "Le nom doit contenir entre 2 et 200 caractères",
        },
        { status: 400 }
      );
    }
    update.nom = nomRaw;
  }

  // categorie
  if (body.categorie !== undefined) {
    const catRaw =
      typeof body.categorie === "string" ? body.categorie.trim() : "";
    if (catRaw.length < 2 || catRaw.length > 100) {
      return NextResponse.json(
        {
          success: false,
          error: "La catégorie doit contenir entre 2 et 100 caractères",
        },
        { status: 400 }
      );
    }
    update.categorie = catRaw;
  }

  // slug (optionnel — déconseillé mais autorisé)
  if (body.slug !== undefined) {
    const slugRaw = typeof body.slug === "string" ? body.slug.trim() : "";
    if (!slugRaw || !SLUG_REGEX.test(slugRaw) || slugRaw.length > 80) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Le slug doit être en kebab-case (minuscules, chiffres, tirets), 2-80 caractères",
        },
        { status: 400 }
      );
    }
    update.slug = slugRaw;
  }

  // icone_url
  if (body.icone_url !== undefined) {
    let iconeUrl =
      typeof body.icone_url === "string" ? body.icone_url.trim() : "";
    // Si vide, on dérive du slug actuel (ou du nouveau slug si fourni)
    if (!iconeUrl) {
      const fallbackSlug =
        (update.slug as string | undefined) ?? (body.current_slug as string);
      iconeUrl = iconeUrlForSlug(fallbackSlug ?? "");
    }
    if (iconeUrl.length > 500) {
      return NextResponse.json(
        { success: false, error: "icone_url trop longue (max 500 caractères)" },
        { status: 400 }
      );
    }
    update.icone_url = iconeUrl;
  }

  // ordre_affichage
  if (body.ordre_affichage !== undefined) {
    const n = Number(body.ordre_affichage);
    if (
      !Number.isFinite(n) ||
      !Number.isInteger(n) ||
      n < 0 ||
      n > 9999
    ) {
      return NextResponse.json(
        { success: false, error: "ordre_affichage doit être un entier 0-9999" },
        { status: 400 }
      );
    }
    update.ordre_affichage = n;
  }

  // actif
  if (body.actif !== undefined) {
    update.actif = body.actif === true;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json(
      { success: false, error: "Aucun champ à mettre à jour" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("catalogue_articles")
    .update(update)
    .eq("id", id)
    .select(
      "id, slug, nom, categorie, icone_url, actif, ordre_affichage, created_at, updated_at"
    )
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { success: false, error: "Ce slug est déjà utilisé par un autre article" },
        { status: 409 }
      );
    }
    console.error("[api/super-admin/catalogue/[id]] Erreur UPDATE:", error);
    return NextResponse.json(
      { success: false, error: "Erreur lors de la mise à jour de l'article" },
      { status: 500 }
    );
  }

  if (!data) {
    return NextResponse.json(
      { success: false, error: "Article introuvable" },
      { status: 404 }
    );
  }

  return NextResponse.json({
    success: true,
    data: data as CatalogueArticle,
  });
}

/* ------------------------------------------------------------------ */
/*  DELETE — Supprime un article                                       */
/* ------------------------------------------------------------------ */

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSuperAdmin();
  if (auth.forbidden) return auth.forbidden;
  const { supabase } = auth;

  const { id } = await params;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json(
      { success: false, error: "id invalide" },
      { status: 400 }
    );
  }

  // Vérifie qu'aucun article_vetement ne référence cet article du catalogue
  // (FK ON DELETE RESTRICT → la DB refuserait de toute façon, mais on
  // renvoie un message clair avant la tentative).
  const { count, error: countErr } = await supabase
    .from("articles_vetements")
    .select("id", { count: "exact", head: true })
    .eq("catalogue_article_id", id);

  if (countErr) {
    console.error(
      "[api/super-admin/catalogue/[id]] Erreur COUNT articles_vetements:",
      countErr
    );
    return NextResponse.json(
      { success: false, error: "Erreur lors de la vérification des références" },
      { status: 500 }
    );
  }

  if (count && count > 0) {
    return NextResponse.json(
      {
        success: false,
        error: `Cet article est référencé par ${count} article(s) de commande. Désactivez-le (actif=false) plutôt que de le supprimer.`,
      },
      { status: 409 }
    );
  }

  const { error: deleteErr } = await supabase
    .from("catalogue_articles")
    .delete()
    .eq("id", id);

  if (deleteErr) {
    console.error(
      "[api/super-admin/catalogue/[id]] Erreur DELETE:",
      deleteErr
    );
    return NextResponse.json(
      { success: false, error: "Erreur lors de la suppression de l'article" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
