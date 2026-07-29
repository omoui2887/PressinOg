/**
 * OgPressing — /personnel/receptionniste/clients (REC-1)
 * ------------------------------------------------------
 * Liste des clients du pressing connecté — variante "réceptionniste" de la
 * page admin /admin/clients.
 *
 * Server Component minimal qui rend le client orchestrator <ClientsPage />
 * (qui gère lui-même le fetch via /api/admin/clients, la recherche, le filtre
 * impayés, la pagination, le dialog "Nouveau client" et l'export).
 *
 * `basePath="/personnel/receptionniste"` est transmis pour que les liens de
 * détail pointent vers /personnel/receptionniste/clients/{id}.
 *
 * 🔒 SÉCURITÉ : le layout (personnel)/layout.tsx vérifie déjà l'auth + le
 *    rôle. L'API GET /api/admin/clients accepte n'importe quel personnel
 *    actif du pressing (RLS isole par pressing_id).
 *
 *    ⚠️ Création de client (POST /api/admin/clients) : ouverte aux managers
 *       ET réceptionnistes (alignée sur le PRD — cf. PATCH /api/admin/clients/[id]
 *       qui autorise déjà manager OU receptionniste).
 */
import { ClientsPage } from "@/components/ogpressing/admin/clients/clients-page";

export default function PersonnelReceptionnisteClientsPage() {
  return <ClientsPage basePath="/personnel/receptionniste" />;
}
