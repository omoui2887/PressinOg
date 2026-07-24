/**
 * OgPressing — /admin/personnel (placeholder)
 * -------------------------------------------
 * Gestion du personnel du pressing : 7 rôles (PRD §3.3), création directe
 * ou invitation, activation/désactivation, tracking heures. Module complet
 * à venir.
 */
import { UserCog } from "lucide-react";
import { AdminPagePlaceholder } from "@/components/ogpressing/admin/admin-page-placeholder";

export default function PersonnelPage() {
  return (
    <AdminPagePlaceholder
      title="Personnel"
      description="Gestion de l'équipe du pressing"
      icon={UserCog}
    />
  );
}
