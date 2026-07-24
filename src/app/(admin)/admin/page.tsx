/**
 * OgPressing — Dashboard Admin Pressing (placeholder)
 * ---------------------------------------------------
 * Route : /admin
 *
 * Accès : Manager (admin) du pressing connecté.
 * Dashboard complet à venir : POS, personnel, tarifs, CRM, configuration.
 */
import { DashboardPlaceholder } from "@/components/ogpressing";

export default function AdminPage() {
  return (
    <DashboardPlaceholder
      title="Dashboard Admin"
      roleLabel="Administrateur"
      description="Gérez votre pressing : personnel, tarifs, CRM clients, remises et configuration. Le point de vente et le suivi de production arrivent bientôt."
      accent="text-primary"
    />
  );
}
