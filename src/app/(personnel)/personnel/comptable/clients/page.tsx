/**
 * e-pressing — /personnel/comptable/clients (COMPTA-1)
 * -----------------------------------------------------
 * Liste des clients du pressing connecté — variante "comptable" en lecture
 * seule (le comptable consulte les clients, leurs impayés et leur total
 * dépensé, mais ne peut ni créer ni modifier un client).
 *
 * Server Component minimal qui rend le client orchestrator <ClientsPage />
 * avec `basePath="/personnel/comptable"` et `readOnly` (masque le bouton
 * "Nouveau client" et les actions de modification).
 *
 * 🔒 SÉCURITÉ : le layout (personnel)/layout.tsx vérifie déjà l'auth + le
 *    rôle (comptable uniquement sur /personnel/comptable/*). L'API
 *    GET /api/admin/clients accepte n'importe quel personnel actif du
 *    pressing (RLS isole par pressing_id).
 *
 *    ⚠️ Le POST /api/admin/clients est réservé manager + receptionniste :
 *       le comptable ne peut pas créer de client. Le flag `readOnly` cache
 *       le bouton "Nouveau client" côté UI.
 *
 *    ✅ Les exports Excel (clients, impayés) restent accessibles au
 *       comptable (présents dans <ClientsPage>).
 */
import { ClientsPage } from "@/components/ogpressing/admin/clients/clients-page";

export default function ComptableClientsPage() {
  return <ClientsPage basePath="/personnel/comptable" readOnly />;
}
