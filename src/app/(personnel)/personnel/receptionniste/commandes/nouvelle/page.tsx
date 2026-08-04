/**
 * OgPressing — /personnel/receptionniste/commandes/nouvelle (REC-1)
 * ----------------------------------------------------------------
 * Wizard de création d'une nouvelle commande pressing — variante
 * "réceptionniste" du wizard admin.
 *
 * Server Component minimal qui rend le wizard client (<CommandeWizard />).
 * Le header (titre + retour), le stepper visuel, le contenu de l'étape
 * courante et les boutons de navigation sont gérés par le wizard.
 *
 * `basePath="/personnel/receptionniste"` est transmis au wizard pour que :
 *   - le bouton "Retour aux commandes" pointe vers
 *     /personnel/receptionniste/commandes
 *   - le lien "Retour au tableau de bord" (étape confirmation succès) pointe
 *     vers /personnel/receptionniste/dashboard
 *
 * 🔒 SÉCURITÉ : le layout (personnel)/layout.tsx vérifie déjà l'auth + le
 *    rôle. L'API POST /api/admin/commandes accepte n'importe quel personnel
 *    actif (actif=true, statut_compte='actif'), peu importe le rôle.
 */
import { PosCaisse } from "@/components/pos/pos-caisse";

export default function PersonnelNouvelleCommandePage() {
  return <PosCaisse basePath="/personnel/receptionniste" />;
}
