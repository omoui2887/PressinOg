/**
 * OgPressing — /personnel/caissier/encaisser (REC-1 placeholder)
 * --------------------------------------------------------------
 * Placeholder pour la page d'encaissement des paiements par le caissier.
 * Empêche le 404 lorsqu'un caissier clique sur "Encaisser un paiement" dans
 * la nav (et le bouton flottant central de la bottom nav mobile).
 *
 * 🔒 SÉCURITÉ : le layout (personnel)/layout.tsx vérifie déjà l'auth + le
 *    rôle (caissier uniquement sur /personnel/caissier/*).
 */
import { DashboardPlaceholder } from "@/components/ogpressing/dashboard-placeholder";

export default function CaissierEncaisserPage() {
  return (
    <DashboardPlaceholder
      title="Encaisser un paiement"
      roleLabel="Caissier"
      description="Espace caissier — enregistrement des paiements (espèces, mobile money, carte)."
      accent="text-primary"
    />
  );
}
