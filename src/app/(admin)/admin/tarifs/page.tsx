/**
 * OgPressing — /admin/tarifs (page wrapper) — LOT 16
 * ---------------------------------------------------
 * Page d'administration des tarifs spécifiques par article du catalogue.
 *
 * Toute la logique UI est encapsulée dans le composant client
 * <TarifsPage /> (src/components/ogpressing/admin/tarifs/tarifs-page.tsx)
 * — fetch catalogue + tarifs, état, édition inline des prix, suppression
 * optimiste, toasts sonner.
 *
 * Auth + RLS : gérées par middleware (redirige vers /login si non
 * authentifié) et par les API routes
 * (/api/admin/tarifs-articles, /api/admin/tarifs-articles/[id]).
 * Seul un manager actif peut écrire (POST/PATCH/DELETE) ; tout personnel
 * actif peut lire (GET).
 */
import { TarifsPage } from "@/components/ogpressing/admin/tarifs/tarifs-page";

export default function Page() {
  return <TarifsPage />;
}
