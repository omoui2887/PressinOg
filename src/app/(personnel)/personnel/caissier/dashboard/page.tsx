/**
 * OgPressing — /personnel/caissier/dashboard (REC-1 placeholder)
 * --------------------------------------------------------------
 * Placeholder pour le tableau de bord du caissier.
 * Empêche le 404 lorsqu'un caissier clique sur "Tableau de bord" dans la nav.
 *
 * 🔒 SÉCURITÉ : le layout (personnel)/layout.tsx vérifie déjà l'auth + le
 *    rôle (caissier uniquement sur /personnel/caissier/*).
 */
import { DashboardPlaceholder } from "@/components/ogpressing/dashboard-placeholder";

export default function CaissierDashboardPage() {
  return (
    <DashboardPlaceholder
      title="Tableau de bord"
      roleLabel="Caissier"
      description="Espace caissier — gestion des encaissements et suivi des clients."
      accent="text-primary"
    />
  );
}
