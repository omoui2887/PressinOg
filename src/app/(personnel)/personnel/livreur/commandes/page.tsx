/**
 * OgPressing — /personnel/livreur/commandes (REC-1 placeholder)
 * -------------------------------------------------------------
 * Placeholder pour la liste des commandes à livrer.
 * Empêche le 404 lorsqu'un livreur clique sur "Commandes à livrer".
 *
 * 🔒 SÉCURITÉ : le layout (personnel)/layout.tsx vérifie déjà l'auth + le
 *    rôle (livreur uniquement sur /personnel/livreur/*).
 */
import { DashboardPlaceholder } from "@/components/ogpressing/dashboard-placeholder";

export default function LivreurCommandesPage() {
  return (
    <DashboardPlaceholder
      title="Commandes à livrer"
      roleLabel="Livreur"
      description="Espace livreur — liste des commandes en attente de livraison."
      accent="text-primary"
    />
  );
}
