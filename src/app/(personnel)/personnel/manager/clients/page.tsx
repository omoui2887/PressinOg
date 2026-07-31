/**
 * OgPressing — /personnel/manager/clients (MGR-1)
 * ----------------------------------------------
 * Liste des clients du pressing connecté — variante "manager" de la page
 * admin /admin/clients.
 *
 * Server Component minimal qui rend le client orchestrator <ClientsPage />
 * (qui gère lui-même le fetch via /api/admin/clients, la recherche, le filtre
 * impayés, la pagination, le dialog "Nouveau client" et l'export).
 *
 * `basePath="/personnel/manager"` est transmis pour que les liens de
 * détail pointent vers /personnel/manager/clients/{id}.
 *
 * 🔒 SÉCURITÉ : le layout (personnel)/layout.tsx vérifie déjà l'auth + le
 *    rôle. L'API GET /api/admin/clients accepte n'importe quel personnel
 *    actif du pressing (RLS isole par pressing_id).
 *
 *    ⚠️ PAS de readOnly — le manager peut créer/modifier des clients
 *       (POST /api/admin/clients et PATCH /api/admin/clients/[id] acceptent
 *       le manager via getConnectedPersonnel(allowWrite=true)).
 */
import { ClientsPage } from "@/components/ogpressing/admin/clients/clients-page";

export default function ManagerClientsPage() {
  return <ClientsPage basePath="/personnel/manager" />;
}
