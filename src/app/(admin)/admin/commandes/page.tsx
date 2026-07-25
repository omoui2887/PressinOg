/**
 * OgPressing — /admin/commandes (placeholder)
 * -------------------------------------------
 * Liste des commandes du pressing avec filtres par statut, date, client.
 * Suivi de production par article (recu → ... → retire/livre).
 * Module complet à venir.
 */
import { List } from "lucide-react";
import { AdminPagePlaceholder } from "@/components/ogpressing/admin/admin-page-placeholder";

export default function CommandesPage() {
  return (
    <AdminPagePlaceholder
      title="Commandes"
      description="Liste et suivi des commandes"
      icon={List}
    />
  );
}
