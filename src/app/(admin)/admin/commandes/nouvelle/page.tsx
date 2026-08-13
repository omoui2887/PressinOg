/**
 * e-pressing — /admin/commandes/nouvelle
 * --------------------------------------
 * Wizard de création d'une nouvelle commande pressing (4 étapes).
 *
 * Server Component minimal qui rend le wizard client (useReducer).
 * Le header (titre + retour), le stepper visuel, le contenu de l'étape
 * courante et les boutons de navigation sont gérés par <CommandeWizard />.
 */
import { PosCaisse } from "@/components/pos/pos-caisse";

export default function NouvelleCommandePage() {
  return <PosCaisse />;
}
