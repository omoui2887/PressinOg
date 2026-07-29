/**
 * OgPressing — /personnel/repassage/commandes (REC-1 placeholder)
 * ---------------------------------------------------------------
 * Placeholder pour la liste des commandes assignées au poste repassage.
 * Empêche le 404 lorsqu'un opérateur repassage clique sur "Mes commandes
 * assignées".
 *
 * 🔒 SÉCURITÉ : le layout (personnel)/layout.tsx vérifie déjà l'auth + le
 *    rôle (repassage uniquement sur /personnel/repassage/*).
 */
import { DashboardPlaceholder } from "@/components/ogpressing/dashboard-placeholder";

export default function RepassageCommandesPage() {
  return (
    <DashboardPlaceholder
      title="Mes commandes assignées"
      roleLabel="Repassage"
      description="Espace repassage — liste des commandes à repasser (tri, statut des articles)."
      accent="text-primary"
    />
  );
}
