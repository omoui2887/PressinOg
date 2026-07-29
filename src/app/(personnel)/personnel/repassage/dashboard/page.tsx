/**
 * OgPressing — /personnel/repassage/dashboard (REC-1 placeholder)
 * ---------------------------------------------------------------
 * Placeholder pour le tableau de bord du poste repassage.
 * Empêche le 404 lorsqu'un opérateur repassage clique sur "Tableau de bord".
 *
 * 🔒 SÉCURITÉ : le layout (personnel)/layout.tsx vérifie déjà l'auth + le
 *    rôle (repassage uniquement sur /personnel/repassage/*).
 */
import { DashboardPlaceholder } from "@/components/ogpressing/dashboard-placeholder";

export default function RepassageDashboardPage() {
  return (
    <DashboardPlaceholder
      title="Tableau de bord"
      roleLabel="Repassage"
      description="Espace repassage — suivi des commandes à repasser et de leur avancement."
      accent="text-primary"
    />
  );
}
