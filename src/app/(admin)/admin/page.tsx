/**
 * /admin → /admin/dashboard
 * Redirection pour éviter une page racine vide.
 */
import { redirect } from "next/navigation";

export default function AdminRootPage() {
  redirect("/admin/dashboard");
}
