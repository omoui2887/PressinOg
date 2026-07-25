/**
 * OgPressing — /admin/stock (placeholder)
 * ---------------------------------------
 * Stock de biodétergents : entrées/sorties, seuils d'alerte, inventaire,
 * valorisation. Module complet à venir.
 */
import { Package } from "lucide-react";
import { AdminPagePlaceholder } from "@/components/ogpressing/admin/admin-page-placeholder";

export default function StockPage() {
  return (
    <AdminPagePlaceholder
      title="Stock"
      description="Biodétergents et consommables"
      icon={Package}
    />
  );
}
