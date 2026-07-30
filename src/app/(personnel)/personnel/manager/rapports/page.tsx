/**
 * OgPressing — /personnel/manager/rapports (MGR-1)
 * -----------------------------------------------
 * Rapports du pressing — variante "manager" de la page admin /admin/rapports.
 *
 * Server Component minimal qui rend le client orchestrator <RapportsPage />
 * (qui gère lui-même le fetch via /api/admin/rapports, le sélecteur de
 * période, les graphiques, et les exports Excel).
 *
 * `basePath="/personnel/manager"` est transmis pour homogénéité avec les
 * autres pages admin réutilisées. Les exports Excel font des appels API
 * relatifs (/api/admin/rapports/...) — la prop `basePath` est réservée aux
 * futurs liens de navigation interne.
 *
 * 🔒 SÉCURITÉ : le layout (personnel)/layout.tsx vérifie déjà l'auth + le
 *    rôle. Les APIs /api/admin/rapports* acceptent n'importe quel personnel
 *    actif du pressing (RLS isole par pressing_id).
 *
 *    ⚠️ PAS de readOnly sur les exports — le manager a accès aux exports
 *       Excel (showExports=true par défaut), comme l'admin.
 */
import { RapportsPage } from "@/components/ogpressing/admin/rapports/rapports-page";

export default function ManagerRapportsPage() {
  return <RapportsPage basePath="/personnel/manager" />;
}
