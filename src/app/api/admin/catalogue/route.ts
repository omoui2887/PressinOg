/**
 * e-pressing — API /api/admin/catalogue (GET + POST)
 * ----------------------------------------------------
 * Permet au MANAGER d'un pressing d'ajouter de nouveaux types de
 * vêtements au catalogue global (catalogue_articles).
 *
 * GET : liste les articles actifs du catalogue
 * POST : crée un nouvel article dans le catalogue
 *
 * 🔒 SÉCURITÉ : manager actif du pressing uniquement.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getCurrentPersonnel, isPersonnelActive } from "@/lib/auth/roles";
import { iconeUrlForSlug } from "@/lib/catalogue/catalogue-articles";

export const dynamic = "force-dynamic";

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

// GET : liste les articles actifs du catalogue
export async function GET() {
  const supabase = await getSupabaseServer();
  const me = await getCurrentPersonnel(supabase);
  if (!me || !isPersonnelActive(me)) {
    return NextResponse.json(
      { success: false, error: "Non authentifié" },
      { status: 401 }
    );
  }

  const { data, error } = await supabase
    .from("catalogue_articles")
    .select("id, slug, nom, categorie, icone_url, actif, ordre_affichage")
    .eq("actif", true)
    .order("categorie")
    .order("ordre_affichage");

  if (error) {
    console.error("[api/admin/catalogue GET] Erreur:", error);
    return NextResponse.json(
      { success: false, error: "Erreur lors de la récupération du catalogue" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, data: data ?? [] });
}

// POST : crée un nouvel article dans le catalogue
export async function POST(request: NextRequest) {
  const supabase = await getSupabaseServer();
  const me = await getCurrentPersonnel(supabase);
  if (!me || !isPersonnelActive(me)) {
    return NextResponse.json(
      { success: false, error: "Non authentifié" },
      { status: 401 }
    );
  }
  if (me.role !== "manager") {
    return NextResponse.json(
      { success: false, error: "Accès refusé — manager requis" },
      { status: 403 }
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

  const nomRaw = typeof body.nom === "string" ? body.nom.trim() : "";
  if (nomRaw.length < 2 || nomRaw.length > 200) {
    return NextResponse.json(
      { success: false, error: "Le nom doit contenir entre 2 et 200 caractères" },
      { status: 400 }
    );
  }

  const categorieRaw =
    typeof body.categorie === "string" ? body.categorie.trim() : "";
  if (categorieRaw.length < 2 || categorieRaw.length > 100) {
    return NextResponse.json(
      { success: false, error: "La catégorie doit contenir entre 2 et 100 caractères" },
      { status: 400 }
    );
  }

  // Slug : utilise celui fourni ou dérive du nom
  let slug =
    typeof body.slug === "string" && body.slug.trim()
      ? body.slug.trim().toLowerCase()
      : slugify(nomRaw);

  if (!SLUG_REGEX.test(slug)) {
    return NextResponse.json(
      { success: false, error: "Slug invalide (kebab-case requis)" },
      { status: 400 }
    );
  }

  // Vérifie l'unicité du slug
  const { data: existing } = await supabase
    .from("catalogue_articles")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      { success: false, error: "Un article avec ce slug existe déjà" },
      { status: 409 }
    );
  }

  const icone_url =
    typeof body.icone_url === "string" && body.icone_url.trim()
      ? body.icone_url.trim()
      : iconeUrlForSlug(slug);

  const ordre_affichage =
    typeof body.ordre_affichage === "number" ? body.ordre_affichage : 0;

  const { data: inserted, error: insertErr } = await supabase
    .from("catalogue_articles")
    .insert({
      slug,
      nom: nomRaw,
      categorie: categorieRaw,
      icone_url,
      actif: true,
      ordre_affichage,
    })
    .select("id, slug, nom, categorie, icone_url, actif, ordre_affichage")
    .single();

  if (insertErr || !inserted) {
    console.error("[api/admin/catalogue POST] Erreur INSERT:", insertErr);
    return NextResponse.json(
      { success: false, error: "Erreur lors de la création de l'article" },
      { status: 500 }
    );
  }

  return NextResponse.json(
    { success: true, data: inserted },
    { status: 201 }
  );
}
