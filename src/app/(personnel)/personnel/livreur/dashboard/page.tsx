/**
 * OgPressing — /personnel/livreur/dashboard (REC-1 placeholder)
 * -------------------------------------------------------------
 * Placeholder pour le tableau de bord du livreur.
 * Empêche le 404 lorsqu'un livreur clique sur "Tableau de bord" dans la nav.
 *
 * 🔒 SÉCURITÉ : le layout (personnel)/layout.tsx vérifie déjà l'auth + le
 *    rôle (livreur uniquement sur /personnel/livreur/*).
 */
import { DashboardPlaceholder } from "@/components/ogpressing/dashboard-placeholder";

export default function LivreurDashboardPage() {
  return (
    <DashboardPlaceholder
      title="Tableau de bord"
      roleLabel="Livreur"
      description="Espace livreur — suivi des commandes à livrer et tournées."
      accent="text-primary"
    />
  );
}
