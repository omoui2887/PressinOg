/**
 * e-pressing — Redirection /super-admin → /super-admin/dashboard
 * -------------------------------------------------------------
 * L'ancien placeholder est remplacé par une redirection vers le vrai
 * dashboard. Route : /super-admin
 */
import { redirect } from "next/navigation";

export default function SuperAdminPage() {
  redirect("/super-admin/dashboard");
}
