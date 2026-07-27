/**
 * OgPressing — /admin/pressing (LOT 11.2)
 * --------------------------------------
 * Configuration générale du pressing, organisée en 3 onglets :
 *   1. Informations générales (nom, ville, adresse, téléphone, email, logo)
 *   2. Horaires d'ouverture (7 jours × switch Fermé + 2 inputs time)
 *   3. Mon abonnement (lecture seule : plan, statut, date_fin, montant + WhatsApp)
 *
 * Page client (PressingConfigPage) qui orchestre les 3 tabs et fetch les
 * données via GET /api/admin/pressing.
 *
 * Référence spec : LOT 11.2 — prompt 11.2.
 */
import { PressingConfigPage } from "@/components/ogpressing/admin/pressing/pressing-config-page";

export default function Page() {
  return <PressingConfigPage />;
}
