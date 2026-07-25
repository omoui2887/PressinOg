/**
 * OgPressing — /admin/services (placeholder)
 * ------------------------------------------
 * Catalogue des services proposés par le pressing (lavage, repassage,
 * secs, délicate, etc.) avec tarifs par catégorie d'article. Module
 * complet à venir.
 */
import { Tag } from "lucide-react";
import { AdminPagePlaceholder } from "@/components/ogpressing/admin/admin-page-placeholder";

export default function ServicesPage() {
  return (
    <AdminPagePlaceholder
      title="Services"
      description="Catalogue des services et tarifs"
      icon={Tag}
    />
  );
}
