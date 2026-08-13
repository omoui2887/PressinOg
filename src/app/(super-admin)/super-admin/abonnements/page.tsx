/**
 * e-pressing — Page /super-admin/abonnements
 * -------------------------------------------
 * Route : /super-admin/abonnements (groupe `(super-admin)`)
 *
 * Accès : Super Admin uniquement (vérifié côté middleware + layout).
 *
 * Server Component MINCE : délègue toute l'interactivité au client component
 * `<AbonnementsPage />` qui fetch la liste via /api/super-admin/abonnements.
 *
 * Le spec LOT 5.4 demande :
 *   - 3 cartes d'aperçu (nb abonnements actifs par plan)
 *   - Liste de tous les abonnements (tableau desktop / cards mobile)
 *   - Filtres par statut + plan + recherche
 *   - Actions par ligne : Renouveler / Changer de plan / Suspendre
 *   - Bannière d'alerte pour les abonnements expirant bientôt / expirés
 *
 * Toutes ces fonctionnalités sont gérées côté client pour permettre
 * l'interactivité (filtres en temps réel, dialogs, etc.).
 */
import { AbonnementsPage } from "@/components/ogpressing/super-admin/abonnements/abonnements-page";

export const dynamic = "force-dynamic";

export default function SuperAdminAbonnementsPage() {
  return <AbonnementsPage />;
}
