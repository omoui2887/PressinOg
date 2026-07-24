/**
 * OgPressing — Dashboard Super Admin (placeholder)
 * -----------------------------------------------
 * Route : /super-admin
 *
 * Accès : Super Admin uniquement (1 compte unique, propriétaire plateforme).
 * Dashboard complet à venir : demandes inscription, codes activation, abonnements.
 */
import { DashboardPlaceholder } from "@/components/ogpressing";

export default function SuperAdminPage() {
  return (
    <DashboardPlaceholder
      title="Espace Super Admin"
      roleLabel="Super Admin"
      description="Gérez les demandes d'inscription, générez les codes d'activation et suivez les abonnements de tous les pressings OgPressing."
      accent="text-primary"
    />
  );
}
