/**
 * OgPressing — /personnel/manager/casiers (CASIER-FIX-V1)
 * -------------------------------------------------------
 * Vue grille des casiers de stockage du pressing pour le Manager.
 * Affiche tous les casiers du plan (A1-A20, B1-B20, C1-C20, D1-D20 = 80)
 * + les casiers personnalisés occupés (hors plan).
 *
 * Délègue tout le rendu au composant partagé <CasiersGrid /> qui gère :
 *   - le fetch GET /api/admin/casiers,
 *   - les StatCards (occupés, libres, taux d'occupation, plan total),
 *   - la bannière d'avertissement si la migration 015 n'est pas appliquée,
 *   - la recherche + le filtre par statut,
 *   - la grille groupée par rangée avec popover au clic sur un casier occupé.
 *
 * `basePath="/personnel/manager"` est transmis pour que le lien "Voir la
 * commande" dans le popover pointe vers /personnel/manager/commandes/{id}.
 *
 * 🔒 SÉCURITÉ : le layout (personnel)/layout.tsx vérifie déjà l'auth + le
 *    rôle. L'API /api/admin/casiers est accessible à n'importe quel personnel
 *    actif. La RLS isole par pressing_id.
 */
import { CasiersGrid } from "@/components/ogpressing/casiers/casiers-grid";

export default function ManagerCasiersPage() {
  return <CasiersGrid basePath="/personnel/manager" roleLabel="Manager" />;
}
