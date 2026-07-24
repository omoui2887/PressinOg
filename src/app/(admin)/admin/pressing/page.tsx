/**
 * OgPressing — /admin/pressing (placeholder)
 * ------------------------------------------
 * Configuration du pressing : informations (nom, adresse, téléphone,
 * logo), horaires, préférences (devise, format ticket), abonnement.
 * Module complet à venir.
 */
import { Settings } from "lucide-react";
import { AdminPagePlaceholder } from "@/components/ogpressing/admin/admin-page-placeholder";

export default function PressingConfigPage() {
  return (
    <AdminPagePlaceholder
      title="Mon pressing"
      description="Configuration et préférences"
      icon={Settings}
    />
  );
}
