/**
 * OgPressing — /admin/stock (LOT 10.1)
 * -------------------------------------
 * Gestion du stock de biodétergents du pressing :
 *   - Liste des produits avec statut visuel (🔴🟡✅)
 *   - Ajout d'un produit (Dialog : nom, catégorie, unité, quantité, seuil,
 *     expiration, FDS PDF upload)
 *   - Enregistrement de mouvements (entrée/sortie)
 *   - Voir la FDS (PDF nouvel onglet)
 *   - Modifier un produit
 *
 * Lien vers /admin/stock/mouvements (historique).
 */
import { StockPage } from "@/components/ogpressing/admin/stock/stock-page";

export default function StockAdminPage() {
  return <StockPage />;
}
