/**
 * OgPressing — /personnel/comptable/rapports (REC-1 placeholder)
 * ---------------------------------------------------------------
 * Placeholder pour la page des rapports comptables.
 * Empêche le 404 lorsqu'un comptable clique sur "Rapports" dans la nav.
 *
 * 🔒 SÉCURITÉ : le layout (personnel)/layout.tsx vérifie déjà l'auth + le
 *    rôle (comptable uniquement sur /personnel/comptable/*).
 */
import { DashboardPlaceholder } from "@/components/ogpressing/dashboard-placeholder";

export default function ComptableRapportsPage() {
  return (
    <DashboardPlaceholder
      title="Rapports"
      roleLabel="Comptable"
      description="Espace comptable — rapports journalier, hebdomadaire, mensuel, paiements et impayés."
      accent="text-primary"
    />
  );
}
