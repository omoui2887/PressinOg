/**
 * OgPressing — /admin/rapports (placeholder)
 * ------------------------------------------
 * Rapports et statistiques : CA, panier moyen, taux de retard, top
 * clients, top services. Exports Excel (plan Pro/Business). Module
 * complet à venir.
 */
import { BarChart3 } from "lucide-react";
import { AdminPagePlaceholder } from "@/components/ogpressing/admin/admin-page-placeholder";

export default function RapportsPage() {
  return (
    <AdminPagePlaceholder
      title="Rapports"
      description="Statistiques et exports"
      icon={BarChart3}
    />
  );
}
