/**
 * OgPressing — /admin/personnel
 * ------------------------------
 * Gestion du personnel du pressing connecté :
 *   - Liste des employés (tableau desktop / cards mobile) : Nom, Rôle (badge
 *     coloré), Téléphone, Statut du compte (Actif/Invitation/Désactivé),
 *     Date de création, Actions
 *   - Filtres par rôle et par statut de compte
 *   - Compteur "X / Y employés" selon la limite du plan (Starter=3, Pro=8,
 *     Business=illimité) + alerte si limite atteinte
 *   - Bouton "+ Ajouter un employé" (désactivé si limite atteinte)
 *   - Menu d'actions par employé : Modifier, Réinitialiser mot de passe,
 *     Renvoyer invitation, Désactiver/Réactiver (avec confirmation)
 *
 * Données via /api/admin/personnel (RLS isole par pressing).
 */
import { PersonnelPage } from "@/components/ogpressing/admin/personnel/personnel-page";

export default function PersonnelAdminPage() {
  return <PersonnelPage />;
}
