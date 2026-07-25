/**
 * OgPressing — Super Admin → Pressings (page)
 * ---------------------------------------------
 * Route : /super-admin/pressings (groupe `(super-admin)`)
 *
 * Accès : Super Admin uniquement (vérifié côté middleware + layout).
 *
 * Server Component fin : délègue toute l'interactivité (recherche, pagination,
 * Sheet détails, suspend/reactivate) au client component `<PressingsPage />`
 * qui fetch les données via l'API route `/api/super-admin/pressings`.
 *
 * `force-dynamic` car la page dépend de l'utilisateur connecté et que les
 * données des pressings changent fréquemment (aucun cache statique).
 */
import { PressingsPage } from "@/components/ogpressing/super-admin/pressings/pressings-page";

export const dynamic = "force-dynamic";

export default function SuperAdminPressingsPage() {
  return <PressingsPage />;
}
