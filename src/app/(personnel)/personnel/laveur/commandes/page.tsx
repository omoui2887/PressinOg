/**
 * OgPressing — /personnel/laveur/commandes (REC-1 placeholder)
 * ------------------------------------------------------------
 * Placeholder pour la liste des commandes assignées au laveur.
 * Empêche le 404 lorsqu'un laveur clique sur "Mes commandes assignées".
 *
 * 🔒 SÉCURITÉ : le layout (personnel)/layout.tsx vérifie déjà l'auth + le
 *    rôle (laveur uniquement sur /personnel/laveur/*).
 */
import { DashboardPlaceholder } from "@/components/ogpressing/dashboard-placeholder";

export default function LaveurCommandesPage() {
  return (
    <DashboardPlaceholder
      title="Mes commandes assignées"
      roleLabel="Laveur"
      description="Espace laveur — liste des commandes à traiter (tri, statut des articles)."
      accent="text-primary"
    />
  );
}
