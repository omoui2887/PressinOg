/**
 * OgPressing — /admin/services (page wrapper) — LOT 11.1
 * -------------------------------------------------------
 * Page d'administration des services et tarifs du pressing.
 *
 * Toute la logique UI est encapsulée dans le composant client
 * <ServicesPage /> (src/components/ogpressing/admin/services/services-page.tsx)
 * — fetch, état, dialogs d'ajout/édition, toggle optimist.
 *
 * Auth + RLS : gérées par middleware (redirige vers /login si non authentifié)
 * et par les API routes (/api/admin/services, /api/admin/services/[id]).
 * Seul un manager actif peut écrire (POST/PATCH) ; tout personnel actif peut
 * lire (GET).
 */
import { ServicesPage } from "@/components/ogpressing/admin/services/services-page";

export default function Page() {
  return <ServicesPage />;
}
