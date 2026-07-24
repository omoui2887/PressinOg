/**
 * OgPressing — /admin/clients (placeholder)
 * -----------------------------------------
 * CRM clients du pressing : fichier clients, historique commandes,
 * fidélité, recherche par téléphone. Module complet à venir.
 */
import { Users } from "lucide-react";
import { AdminPagePlaceholder } from "@/components/ogpressing/admin/admin-page-placeholder";

export default function ClientsPage() {
  return (
    <AdminPagePlaceholder
      title="Clients"
      description="Fichier clients et historique"
      icon={Users}
    />
  );
}
