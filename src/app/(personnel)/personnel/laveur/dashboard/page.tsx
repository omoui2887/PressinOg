/**
 * OgPressing — /personnel/laveur/dashboard (REC-1 placeholder)
 * ------------------------------------------------------------
 * Placeholder pour le tableau de bord du laveur.
 * Empêche le 404 lorsqu'un laveur clique sur "Tableau de bord" dans la nav.
 *
 * 🔒 SÉCURITÉ : le layout (personnel)/layout.tsx vérifie déjà l'auth + le
 *    rôle (laveur uniquement sur /personnel/laveur/*).
 */
import { DashboardPlaceholder } from "@/components/ogpressing/dashboard-placeholder";

export default function LaveurDashboardPage() {
  return (
    <DashboardPlaceholder
      title="Tableau de bord"
      roleLabel="Laveur"
      description="Espace laveur — suivi des commandes à laver et de leur avancement."
      accent="text-primary"
    />
  );
}
