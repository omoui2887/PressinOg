/**
 * OgPressing — /admin/dashboard (placeholder)
 * -------------------------------------------
 * Vue d'ensemble du pressing : KPIs, file de production, raccourcis.
 * Module complet à venir (POS + suivi de production + alertes).
 */
import { LayoutDashboard } from "lucide-react";
import { AdminPagePlaceholder } from "@/components/ogpressing/admin/admin-page-placeholder";

export default function AdminDashboardPage() {
  return (
    <AdminPagePlaceholder
      title="Tableau de bord"
      description="Vue d'ensemble de votre pressing"
      icon={LayoutDashboard}
    />
  );
}
