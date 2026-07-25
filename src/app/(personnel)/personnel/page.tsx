/**
 * OgPressing — Dashboard Personnel (placeholder)
 * ----------------------------------------------
 * Route : /personnel
 *
 * Accès : employé rattaché à un pressing (réceptionniste, caissier, laveur,
 * repassage, livreur, comptable). Le dashboard s'adaptera au rôle.
 */
import { DashboardPlaceholder } from "@/components/ogpressing";

export default function PersonnelPage() {
  return (
    <DashboardPlaceholder
      title="Mon espace"
      roleLabel="Personnel"
      description="Accédez à vos tâches du jour : commandes à traiter, encaissements, suivi de production. Le contenu s'adaptera à votre rôle (réceptionniste, caissier, laveur, etc.)."
      accent="text-secondary"
    />
  );
}
