/**
 * e-pressing — API /api/super-admin/catalogue (GET + POST)
 * --------------------------------------------------------
 * LOT 15.4 + Migration 041 — Gestion du catalogue global d'articles
 * par le Super Admin.
 *
 * 1) GET /api/super-admin/catalogue
 *    Liste TOUS les articles du catalogue (actifs ET inactifs), triés
 *    par categorie + ordre_affichage. Utilisée par la page
 *    /super-admin/catalogue pour afficher la liste complète et basculer
 *    le statut actif/inactif.
 *
 * 2) POST /api/super-admin/catalogue
 *    Crée un nouvel article dans le catalogue. Body JSON :
 *      {
 *        slug: string,           // identifiant technique unique (kebab-case)
 *        nom: string,            // libellé affiché
 *        categorie: string,      // une des 9 catégories existantes OU nouvelle
 *        icone_url: string,      // URL ou chemin /images/articles/{slug}.png
 *        ordre_affichage?: number // défaut 0
 *      }
 *    Réponse : { success: true, data: CatalogueArticle }
 *    Audit : journalise l'action `create_catalogue_article` (entity_type:
 *    catalogue_article, pressing_id: NULL car global).
 *
 * 🔒 SÉCURITÉ :
 *   - Auth : Super Admin uniquement (vérification super_admins.actif=true).
 *   - RLS : policy `catalogue_articles_write_super_admin` restreint
 *     INSERT/UPDATE/DELETE à is_super_admin().
 *   - En défense en profondeur, l'API re-vérifie l'appartenance au rôle
 *     avant tout write.
 *
 * ⚠️ Le `slug` doit être unique (UNIQUE constraint côté DB). Si le slug
 *    existe déjà, on renvoie 409 Conflict. Le slug est aussi utilisé
 *    pour construire l'`icone_url` par défaut si non fournie.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { iconeUrlForSlug } from "@/lib/catalogue/catalogue-articles";
import type { CatalogueArticle } from "@/lib/catalogue/catalogue-articles";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

// Slug valide : kebab-case, minuscules + chiffres + tirets, 2-80 chars.
const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Normalise une chaîne libre en slug kebab-case :
 *   "Costumes & Vêtements de Cérémonie" → "costumes-vetements-de-ceremonie"
 *   "Pulls / Maille!" → "pulls-maille"
 *
 * Utilisé quand le Super Admin saisit un nom sans spécifier de slug :
 *   on dérive automatiquement le slug depuis le nom.
 */
function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // supprime les accents
    .replace(/[^a-z0-9]+/g, "-") // tout sauf a-z0-9 → tiret
    .replace(/^-+|-+$/g, "") // trim tirets début/fin
    .slice(0, 80);
}

/* ------------------------------------------------------------------ */
/*  Auth Super Admin (shared helper — retourne userId pour audit)     */
/* ------------------------------------------------------------------ */

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
/*  GET — Liste TOUS les articles (actifs + inactifs)                  */
/* ------------------------------------------------------------------ */

export async function GET() {
  const auth = await ensureSuperAdmin();
  if (auth.forbidden) return auth.forbidden;
  const { supabase } = auth;

  const { data, error } = await supabase
    .from("catalogue_articles")
    .select(
      "id, slug, nom, categorie, icone_url, actif, ordre_affichage, created_at, updated_at"
    )
    .order("categorie", { ascending: true })
    .order("ordre_affichage", { ascending: true });

  if (error) {
    console.error("[api/super-admin/catalogue] Erreur SELECT:", error);
    return NextResponse.json(
      { success: false, error: "Erreur lors de la récupération du catalogue" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    data: (data ?? []) as CatalogueArticle[],
  });
}

/* ------------------------------------------------------------------ */
/*  POST — Crée un nouvel article                                      */
/* ------------------------------------------------------------------ */

export async function POST(request: NextRequest) {
  const auth = await ensureSuperAdmin();
  if (auth.forbidden) return auth.forbidden;
  const { supabase, userId } = auth;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { success: false, error: "JSON invalide" },
      { status: 400 }
    );
  }

  // --- Validation des champs ---

  // nom (requis, 2-200 chars)
  const nomRaw = typeof body.nom === "string" ? body.nom.trim() : "";
  if (nomRaw.length < 2 || nomRaw.length > 200) {
    return NextResponse.json(
      { success: false, error: "Le nom doit contenir entre 2 et 200 caractères" },
      { status: 400 }
    );
  }

  // categorie (requise, 2-100 chars)
  const categorieRaw =
    typeof body.categorie === "string" ? body.categorie.trim() : "";
  if (categorieRaw.length < 2 || categorieRaw.length > 100) {
    return NextResponse.json(
      {
        success: false,
        error: "La catégorie doit contenir entre 2 et 100 caractères",
      },
      { status: 400 }
    );
  }

  // slug : soit fourni, soit dérivé du nom. Validation regex kebab-case.
  let slugRaw = typeof body.slug === "string" ? body.slug.trim() : "";
  if (!slugRaw) {
    slugRaw = slugify(nomRaw);
  }
  if (!SLUG_REGEX.test(slugRaw) || slugRaw.length > 80) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Le slug doit être en kebab-case (minuscules, chiffres, tirets), 2-80 caractères",
      },
      { status: 400 }
    );
  }

  // icone_url : soit fournie, soit dérivée du slug via la convention
  // /images/articles/{slug}.png
  let iconeUrl =
    typeof body.icone_url === "string" ? body.icone_url.trim() : "";
  if (!iconeUrl) {
    iconeUrl = iconeUrlForSlug(slugRaw);
  }
  if (iconeUrl.length > 500) {
    return NextResponse.json(
      { success: false, error: "icone_url trop longue (max 500 caractères)" },
      { status: 400 }
    );
  }

  // ordre_affichage (optionnel, défaut 0)
  let ordre = 0;
  if (body.ordre_affichage !== undefined && body.ordre_affichage !== null) {
    const n = Number(body.ordre_affichage);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0 || n > 9999) {
      return NextResponse.json(
        { success: false, error: "ordre_affichage doit être un entier 0-9999" },
        { status: 400 }
      );
    }
    ordre = n;
  }

  // actif (optionnel, défaut true)
  const actif = body.actif === false ? false : true;

  // --- INSERT ---
  const { data, error } = await supabase
    .from("catalogue_articles")
    .insert({
      slug: slugRaw,
      nom: nomRaw,
      categorie: categorieRaw,
      icone_url: iconeUrl,
      ordre_affichage: ordre,
      actif,
    })
    .select(
      "id, slug, nom, categorie, icone_url, actif, ordre_affichage, created_at, updated_at"
    )
    .single();

  if (error) {
    // 23505 = unique_violation (slug déjà existant)
    if (error.code === "23505") {
      return NextResponse.json(
        {
          success: false,
          error: `Un article avec le slug "${slugRaw}" existe déjà`,
        },
        { status: 409 }
      );
    }
    console.error("[api/super-admin/catalogue] Erreur INSERT:", error);
    return NextResponse.json(
      { success: false, error: "Erreur lors de la création de l'article" },
      { status: 500 }
    );
  }

  // --- Audit logging (best-effort) ---
  await logAudit({
    pressing_id: null, // catalogue global, pas rattaché à un pressing
    user_id: userId,
    action: "create_catalogue_article",
    entity_type: "catalogue_article",
    entity_id: data.id,
    before_state: null,
    after_state: {
      id: data.id,
      slug: data.slug,
      nom: data.nom,
      categorie: data.categorie,
      icone_url: data.icone_url,
      ordre_affichage: data.ordre_affichage,
      actif: data.actif,
    },
    req: request,
  });

  return NextResponse.json(
    { success: true, data: data as CatalogueArticle },
    { status: 201 }
  );
}
