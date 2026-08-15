/**
 * e-pressing — Super Admin → Catalogue (page)
 * -------------------------------------------
 * Page /super-admin/catalogue : gestion du catalogue global d'articles.
 *
 * Fonctionnalités (cf. CataloguePage component) :
 *   - Liste de TOUS les articles (actifs + inactifs) regroupés par catégorie
 *   - Recherche texte (nom + slug)
 *   - Filtre par catégorie
 *   - Filtre par statut (actif / inactif)
 *   - Création / modification via dialog (CatalogueForm)
 *   - Bascule actif/inactif (Switch optimiste + PATCH)
 *   - Upload d'icône (PNG/JPG/WebP/SVG, max 5 MB)
 *   - Ordre d'affichage éditable
 *   - Slug auto-dérivé du nom (ou saisi manuellement)
 *
 * 🔒 SÉCURITÉ :
 *   - Le layout (super-admin)/layout.tsx vérifie déjà super_admins.actif=true
 *     avant de render cette page.
 *   - Le middleware bloque /super-admin/* aux non-super_admins.
 *   - Les routes API /api/super-admin/catalogue/* re-vérifient le rôle via
 *     ensureSuperAdmin() (defense-in-depth) + RLS côté DB.
 *
 * 📌 Aucune suppression physique possible :
 *   - La route DELETE renvoie 405 Method Not Allowed.
 *   - Pour "retirer" un article : PATCH { actif: false }.
 *   - Les commandes historiques conservent leur snapshot
 *     (migration 041 : catalogue_article_nom_snapshot,
 *      catalogue_article_slug_snapshot, service_nom_snapshot, prix_unitaire).
 */
import { CataloguePage } from "@/components/ogpressing/super-admin/catalogue/catalogue-page";

export const dynamic = "force-dynamic";

export default function SuperAdminCataloguePage() {
  return <CataloguePage />;
}
