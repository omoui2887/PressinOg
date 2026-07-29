/**
 * OgPressing — /personnel/comptable/clients (REC-1 placeholder)
 * --------------------------------------------------------------
 * Placeholder pour la liste des clients (vue lecture pour le comptable).
 * Empêche le 404 lorsqu'un comptable clique sur "Clients" dans la nav.
 *
 * 🔒 SÉCURITÉ : le layout (personnel)/layout.tsx vérifie déjà l'auth + le
 *    rôle (comptable uniquement sur /personnel/comptable/*).
 */
import { DashboardPlaceholder } from "@/components/ogpressing/dashboard-placeholder";

export default function ComptableClientsPage() {
  return (
    <DashboardPlaceholder
      title="Clients"
      roleLabel="Comptable"
      description="Espace comptable — consultation du fichier clients (impayés, total dépensé)."
      accent="text-primary"
    />
  );
}
