/**
 * e-pressing — /admin/clients
 * ----------------------------
 * Liste des clients du pressing connecté :
 *   - Recherche instantanée par nom ou téléphone
 *   - Filtre "uniquement clients avec impayés"
 *   - Tableau (desktop) / cards (mobile) avec Nom, Téléphone, Points fidélité,
 *     Solde impayé (badge rouge si > 0), Total dépensé, Nombre de commandes
 *   - Bouton "+ Nouveau client" (Dialog avec Nom, Téléphone, Email, Adresse)
 *   - Bouton "Exporter les impayés en .xlsx" (placeholder — Lot 12)
 *   - Pagination (20 clients/page)
 *   - Clic sur un client → /admin/clients/{id}
 *
 * Données récupérées via /api/admin/clients (RLS isole par pressing).
 */
import { ClientsPage } from "@/components/ogpressing/admin/clients/clients-page";

export default function ClientsAdminPage() {
  return <ClientsPage />;
}
