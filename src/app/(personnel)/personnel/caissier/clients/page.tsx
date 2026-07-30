/**
 * OgPressing — /personnel/caissier/clients (CAIS-1)
 * --------------------------------------------------
 * Liste des clients du pressing connecté — variante "caissier" en lecture
 * seule (le caissier consulte les clients et leurs impayés, mais ne peut
 * ni créer ni modifier un client).
 *
 * Server Component minimal qui rend le client orchestrator <ClientsPage />
 * avec `basePath="/personnel/caissier"` et `readOnly` (masque le bouton
 * "Nouveau client" et les actions de modification).
 *
 * 🔒 SÉCURITÉ : le layout (personnel)/layout.tsx vérifie déjà l'auth + le
 *    rôle (caissier uniquement sur /personnel/caissier/*). L'API
 *    GET /api/admin/clients accepte n'importe quel personnel actif du
 *    pressing (RLS isole par pressing_id).
 *
 *    ⚠️ Le POST /api/admin/clients est réservé manager + receptionniste :
 *       le caissier ne peut pas créer de client. Le flag `readOnly` cache
 *       le bouton "Nouveau client" côté UI.
 */
import { ClientsPage } from "@/components/ogpressing/admin/clients/clients-page";

export default function PersonnelCaissierClientsPage() {
  return <ClientsPage basePath="/personnel/caissier" readOnly />;
}
