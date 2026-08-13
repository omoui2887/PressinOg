/**
 * e-pressing — /admin/commandes
 * ------------------------------
 * Liste des commandes du pressing connecté :
 *   - Recherche instantanée par n° ticket ou nom du client
 *   - Filtres par statut commande (7 valeurs) et statut paiement (3 valeurs)
 *   - Tableau (desktop) / cards (mobile) avec N° ticket, Client, Statut,
 *     Paiement, Montant total, Date création, Date retrait prévue, Actions
 *   - Bouton "Scanner QR" (QRScanner dialog → redirige vers le détail)
 *   - Pagination (20 commandes/page)
 *   - Clic sur une ligne → /admin/commandes/{id}
 *
 * Données récupérées via /api/admin/commandes (RLS isole par pressing).
 */
import { CommandesPage } from "@/components/ogpressing/admin/commandes/commandes-page";

export default function CommandesAdminPage() {
  return <CommandesPage />;
}
