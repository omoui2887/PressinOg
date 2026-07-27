/**
 * OgPressing — /admin/stock/mouvements (LOT 10.2)
 * ------------------------------------------------
 * Historique des mouvements de stock du pressing :
 *   - Liste triée par date décroissante
 *   - Filtres : par produit, par type (entrée/sortie), par plage de dates
 *   - Pagination (20/page)
 *   - Export .xlsx (placeholder — développé en LOT 12)
 */
import { MouvementsPage } from "@/components/ogpressing/admin/stock/mouvements-page";

export default function StockMouvementsPage() {
  return <MouvementsPage />;
}
