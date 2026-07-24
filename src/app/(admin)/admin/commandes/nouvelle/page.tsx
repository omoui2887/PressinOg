/**
 * OgPressing — /admin/commandes/nouvelle (placeholder)
 * ----------------------------------------------------
 * Création d'une nouvelle commande (POS) : sélection client, articles,
 * services, tarifs, mode de paiement, impression ticket QR Code.
 * Module complet à venir.
 */
import { PlusCircle } from "lucide-react";
import { AdminPagePlaceholder } from "@/components/ogpressing/admin/admin-page-placeholder";

export default function NouvelleCommandePage() {
  return (
    <AdminPagePlaceholder
      title="Nouvelle commande"
      description="Enregistrer une nouvelle commande client"
      icon={PlusCircle}
    />
  );
}
