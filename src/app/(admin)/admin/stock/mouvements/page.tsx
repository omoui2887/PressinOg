/**
 * e-pressing — /admin/stock/mouvements (LOT 10.2)
 * ------------------------------------------------
 * Historique des mouvements de stock du pressing :
 *   - Liste triée par date décroissante
 *   - Filtres : par produit, par type (entrée/sortie), par plage de dates
 *   - Pagination (20/page)
 *   - Export .xlsx (rapport Stock mouvements — PRD §14 + §15)
 */
import { MouvementsPage } from "@/components/ogpressing/admin/stock/mouvements-page";

export default function StockMouvementsPage() {
  return <MouvementsPage />;
}
