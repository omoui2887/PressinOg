/**
 * OgPressing — /personnel/caissier/clients (REC-1 placeholder)
 * -------------------------------------------------------------
 * Placeholder pour la liste des clients (vue lecture pour le caissier).
 * Empêche le 404 lorsqu'un caissier clique sur "Clients" dans la nav.
 *
 * 🔒 SÉCURITÉ : le layout (personnel)/layout.tsx vérifie déjà l'auth + le
 *    rôle (caissier uniquement sur /personnel/caissier/*).
 */
import { DashboardPlaceholder } from "@/components/ogpressing/dashboard-placeholder";

export default function CaissierClientsPage() {
  return (
    <DashboardPlaceholder
      title="Clients"
      roleLabel="Caissier"
      description="Espace caissier — consultation du fichier clients (solde impayé, historique)."
      accent="text-primary"
    />
  );
}
