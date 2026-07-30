/**
 * OgPressing — /personnel/manager/stock (MGR-1)
 * --------------------------------------------
 * Gestion du stock de biodétergents — variante "manager" de la page
 * admin /admin/stock.
 *
 * Server Component minimal qui rend le client orchestrator <StockPage />
 * (qui gère lui-même le fetch via /api/admin/stock, la recherche, les
 * dialogs d'ajout/édition/mouvement).
 *
 * `basePath="/personnel/manager"` est transmis pour que le lien "Historique
 * des mouvements" (dans StockFilters) pointe vers
 * /personnel/manager/stock/mouvements.
 *
 * 🔒 SÉCURITÉ : le layout (personnel)/layout.tsx vérifie déjà l'auth + le
 *    rôle. Les APIs /api/admin/stock* acceptent le manager via
 *    getConnectedPersonnel(allowWrite=true). Le manager peut donc créer,
 *    éditer des produits et enregistrer des mouvements.
 */
import { StockPage } from "@/components/ogpressing/admin/stock/stock-page";

export default function ManagerStockPage() {
  return <StockPage basePath="/personnel/manager" />;
}
