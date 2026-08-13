/**
 * e-pressing — Super Admin → Catalogue (REDIRECT)
 * -----------------------------------------------
 * ⚠️ Cette route a été EXCLUE du compte Super Admin.
 *
 * Le catalogue global d'articles est désormais un référentiel en lecture
 * seule (seedé par la migration 014, 33 articles initiaux). Il est
 * consommé par les autres comptes (admin, réceptionniste, manager) via
 * le sélecteur visuel `ArticleCatalogPicker` dans l'Étape 2 du wizard
 * "Nouvelle commande".
 *
 * Le Super Admin n'a plus de page de gestion du catalogue : son rôle se
 * concentre sur la plateforme (pressings, demandes, abonnements).
 *
 * Redirige toute tentative d'accès direct vers le tableau de bord Super
 * Admin pour éviter une 404 et garder l'utilisateur dans son espace.
 */
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function SuperAdminCataloguePage() {
  redirect("/super-admin/dashboard");
}
