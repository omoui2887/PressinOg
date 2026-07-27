/**
 * OgPressing — Super Admin → Catalogue (page)
 * --------------------------------------------
 * Route : /super-admin/catalogue (groupe `(super-admin)`)
 *
 * Accès : Super Admin uniquement (vérifié côté middleware + layout).
 *
 * Server Component fin : délègue toute l'interactivité (fetch, switch actif,
 * dialog d'ajout/édition, upload d'icône) au client component
 * `<CataloguePage />` qui consomme les routes API `/api/super-admin/catalogue`.
 *
 * `force-dynamic` car la liste du catalogue dépend de l'utilisateur connecté
 * (super admin) et que les articles peuvent être modifiés à tout moment.
 */
import { CataloguePage } from "@/components/ogpressing/super-admin/catalogue/catalogue-page";

export const dynamic = "force-dynamic";

export default function SuperAdminCataloguePage() {
  return <CataloguePage />;
}
