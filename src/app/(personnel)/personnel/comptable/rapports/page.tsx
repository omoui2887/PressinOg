/**
 * OgPressing — /personnel/comptable/rapports (COMPTA-1)
 * ------------------------------------------------------
 * Page des rapports — variante "comptable" de la page admin /admin/rapports.
 *
 * Server Component minimal qui rend le client orchestrator <RapportsPage />
 * avec `basePath="/personnel/comptable"`. Le comptable a accès à toutes les
 * fonctionnalités : sélecteur de période, 4 StatCards, graphiques, sections
 * "Clients avec impayés" et "Remises appliquées", et exports Excel (.xlsx)
 * pour les 10 rapports (journalier, hebdomadaire, mensuel, paiements, impayés,
 * clients, commandes, remises, personnel, stock).
 *
 * 🔒 SÉCURITÉ : le layout (personnel)/layout.tsx vérifie déjà l'auth + le
 *    rôle (comptable uniquement sur /personnel/comptable/*). Les endpoints
 *    /api/admin/rapports/* acceptent n'importe quel personnel actif du
 *    pressing (RLS isole par pressing_id).
 */
import { RapportsPage } from "@/components/ogpressing/admin/rapports/rapports-page";

export default function ComptableRapportsPage() {
  return <RapportsPage basePath="/personnel/comptable" />;
}
