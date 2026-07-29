/**
 * OgPressing — /personnel/comptable/dashboard (REC-1 placeholder)
 * ---------------------------------------------------------------
 * Placeholder pour le tableau de bord du comptable.
 * Empêche le 404 lorsqu'un comptable clique sur "Tableau de bord" dans la nav.
 *
 * 🔒 SÉCURITÉ : le layout (personnel)/layout.tsx vérifie déjà l'auth + le
 *    rôle (comptable uniquement sur /personnel/comptable/*).
 */
import { DashboardPlaceholder } from "@/components/ogpressing/dashboard-placeholder";

export default function ComptableDashboardPage() {
  return (
    <DashboardPlaceholder
      title="Tableau de bord"
      roleLabel="Comptable"
      description="Espace comptable — agrégats financiers, recettes, impayés et rapports."
      accent="text-primary"
    />
  );
}
