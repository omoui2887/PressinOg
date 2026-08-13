/**
 * e-pressing — /personnel/receptionniste/commandes (REC-1)
 * --------------------------------------------------------
 * Liste des commandes du pressing connecté — variante "réceptionniste" de
 * la page admin /admin/commandes.
 *
 * Server Component minimal qui rend le client orchestrator <CommandesPage />
 * (qui gère lui-même le fetch via /api/admin/commandes, les filtres, la
 * pagination, le scanner QR et la navigation vers le détail).
 *
 * `basePath="/personnel/receptionniste"` est transmis pour que :
 *   - les liens de détail pointent vers /personnel/receptionniste/commandes/{id}
 *   - le scanner QR redirige vers /personnel/receptionniste/commandes/{id}
 *
 * 🔒 SÉCURITÉ : le layout (personnel)/layout.tsx vérifie déjà l'auth + le
 *    rôle. L'API GET /api/admin/commandes accepte n'importe quel personnel
 *    actif du pressing (RLS isole par pressing_id).
 */
import { CommandesPage } from "@/components/ogpressing/admin/commandes/commandes-page";

export default function PersonnelReceptionnisteCommandesPage() {
  return <CommandesPage basePath="/personnel/receptionniste" />;
}
