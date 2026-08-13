/**
 * e-pressing — API /api/public/catalogue-articles (GET)
 * -----------------------------------------------------
 * LOT 15.1 + 15.2 — Catalogue global d'articles illustré.
 *
 * Route PUBLIQUE (au sens : tout utilisateur authentifié, pas seulement
 * un rôle spécifique) qui renvoie la liste des articles actifs du
 * catalogue global, ordonnée par catégorie puis par ordre_affichage.
 *
 * Utilisée par :
 *   - `ArticleCatalogPicker` (composant de sélection visuelle du
 *     wizard de commande, PROMPT 15.2)
 *
 * 🔒 SÉCURITÉ :
 *   - Auth : tout utilisateur authentifié (RLS `catalogue_articles_select_authenticated`
 *     autorise SELECT à `authenticated`). Pas de filtrage par pressing_id
 *     car le catalogue est partagé.
 *   - Anonyme (non connecté) : refusé (pas de policy SELECT pour anon).
 *
 * Réponse :
 *   {
 *     success: true,
 *     data: CatalogueArticle[]   // articles actifs triés
 *   }
 *
 * Pas de pagination : le catalogue contient ~33 articles, on renvoie tout.
 * Si le catalogue grossit (> 200 articles), on pourra ajouter une
 * pagination par catégorie.
 */
import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import type { CatalogueArticle } from "@/lib/catalogue/catalogue-articles";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await getSupabaseServer();

  // Auth : tout utilisateur authentifié. Pas de vérification de rôle
  // spécifique (le catalogue est partagé et accessible à tout personnel
  // connecté pour la création de commande).
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { success: false, error: "Non authentifié" },
      { status: 401 }
    );
  }

  // SELECT : articles actifs uniquement, triés par catégorie puis
  // ordre_affichage. On récupère aussi created_at/updated_at pour
  // permettre un éventuel cache côté client (Last-Modified).
  const { data, error } = await supabase
    .from("catalogue_articles")
    .select(
      "id, slug, nom, categorie, icone_url, actif, ordre_affichage, created_at, updated_at"
    )
    .eq("actif", true)
    .order("categorie", { ascending: true })
    .order("ordre_affichage", { ascending: true });

  if (error) {
    console.error("[api/public/catalogue-articles] Erreur SELECT:", error);
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
