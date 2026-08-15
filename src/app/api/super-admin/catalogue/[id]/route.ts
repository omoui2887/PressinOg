/**
 * e-pressing — API /api/super-admin/catalogue/[id] (PATCH + DELETE)
 * -----------------------------------------------------------------
 * LOT 15.4 + Migration 041 — Gestion d'un article individuel du catalogue.
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
 *    Audit : journalise `update_catalogue_article` avec before_state + after_state.
 *      Si l'update change `actif` :
 *        - true → false  → action `desactive_catalogue_article`
 *        - false → true  → action `reactivate_catalogue_article`
 *
 * 2) DELETE /api/super-admin/catalogue/[id]
 *    ⛔ REFUSÉ — 405 Method Not Allowed.
 *    Un article du catalogue ne peut JAMAIS être supprimé physiquement
 *    (spécification utilisateur : "Un article déjà utilisé dans des
 *    commandes historiques ne doit jamais être supprimé physiquement.
 *    Utiliser actif=false."). Les commandes historiques conservent leur
 *    snapshot (migration 041 : catalogue_article_nom_snapshot,
 *    catalogue_article_slug_snapshot, service_nom_snapshot, prix_unitaire).
 *    Pour "retirer" un article du catalogue, le Super Admin doit le
 *    désactiver via PATCH { actif: false }.
 *
 * 🔒 SÉCURITÉ : Super Admin uniquement (vérifié via ensureSuperAdmin).
 *    Les pressings n'ont aucun endpoint pour modifier le catalogue —
 *    l'isolation est garantie par le route group /api/super-admin/* +
 *    la policy RLS `catalogue_articles_write_super_admin`.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { iconeUrlForSlug } from "@/lib/catalogue/catalogue-articles";
import type { CatalogueArticle } from "@/lib/catalogue/catalogue-articles";
import { logAudit, type AuditAction } from "@/lib/audit";

export const dynamic = "force-dynamic";

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

interface EnsureSuperAdminOk {
  supabase: Awaited<ReturnType<typeof getSupabaseServer>>;
  userId: string;
  forbidden: null;
}
interface EnsureSuperAdminForbidden {
  supabase: Awaited<ReturnType<typeof getSupabaseServer>>;
  userId: null;
  forbidden: NextResponse;
}

async function ensureSuperAdmin(): Promise<
  EnsureSuperAdminOk | EnsureSuperAdminForbidden
> {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      supabase,
      userId: null,
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
      userId: null,
      forbidden: NextResponse.json(
        { success: false, error: "Accès refusé — super admin requis" },
        { status: 403 }
      ),
    };
  }
  return { supabase, userId: user.id, forbidden: null };
}

/* ------------------------------------------------------------------ */
/*  PATCH — Met à jour un article                                      */
/* ------------------------------------------------------------------ */

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await ensureSuperAdmin();
  if (auth.forbidden) return auth.forbidden;
  const { supabase, userId } = auth;

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

  // Récupère l'état AVANT pour audit + détection changement actif.
  const { data: beforeRow } = await supabase
    .from("catalogue_articles")
    .select(
      "id, slug, nom, categorie, icone_url, actif, ordre_affichage, created_at, updated_at"
    )
    .eq("id", id)
    .maybeSingle();

  if (!beforeRow) {
    return NextResponse.json(
      { success: false, error: "Article introuvable" },
      { status: 404 }
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

  // --- Audit logging ---
  // Détermine l'action : si `actif` change, on journalise une action
  // spécifique (desactive/reactivate) EN PLUS de update_catalogue_article
  // pour faciliter le filtrage dans l'UI audit.
  const actifChanged =
    body.actif !== undefined && Boolean(beforeRow.actif) !== Boolean(data.actif);

  const auditActions: AuditAction[] = ["update_catalogue_article"];
  if (actifChanged) {
    auditActions.push(
      data.actif ? "reactivate_catalogue_article" : "desactive_catalogue_article"
    );
  }

  await Promise.all(
    auditActions.map((action) =>
      logAudit({
        pressing_id: null,
        user_id: userId,
        action,
        entity_type: "catalogue_article",
        entity_id: id,
        before_state: beforeRow as Record<string, unknown>,
        after_state: data as unknown as Record<string, unknown>,
        req: request,
      })
    )
  );

  return NextResponse.json({
    success: true,
    data: data as CatalogueArticle,
  });
}

/* ------------------------------------------------------------------ */
/*  DELETE — ⛔ INTERDIT (405 Method Not Allowed)                     */
/* ------------------------------------------------------------------ */
// Un article du catalogue ne peut JAMAIS être supprimé physiquement.
// Les commandes historiques référencent l'article via la FK
// articles_vetements.catalogue_article_id (ON DELETE RESTRICT), et la
// spécification exige la conservation du snapshot (nom, service, prix,
// article). Pour "retirer" un article : PATCH { actif: false }.
//
// On vérifie quand même l'auth AVANT de renvoyer 405 — un manager ou un
// anonyme ne doit pas savoir que l'endpoint existe (on renvoie 403/401
// comme les autres méthodes, pour ne pas révéler la politique 405).
export async function DELETE(
  _request: NextRequest,
  _ctx: { params: Promise<{ id: string }> }
) {
  const auth = await ensureSuperAdmin();
  if (auth.forbidden) return auth.forbidden;

  return NextResponse.json(
    {
      success: false,
      error:
        "Suppression physique interdite. Utilisez PATCH { actif: false } pour désactiver l'article. Les commandes historiques conservent leur snapshot (migration 041).",
    },
    { status: 405 }
  );
}
