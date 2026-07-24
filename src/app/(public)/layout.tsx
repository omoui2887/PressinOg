/**
 * Layout racine des pages PUBLIQUES OgPressing
 * --------------------------------------------
 * Route group `(public)` → landing, login, activation.
 * Aucune authentification requise.
 *
 * Ce layout est volontairement minimal pour l'instant (placeholder) — il sera
 * enrichi dans les prochains prompts (header/footer de la landing page, etc.).
 */
export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="min-h-screen flex flex-col">{children}</div>;
}
