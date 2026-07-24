/**
 * Layout racine des pages ADMIN PRESSING OgPressing
 * -------------------------------------------------
 * Route group `(admin)` → dashboard Admin (1 par pressing client).
 *
 * Accès : Admin du pressing (vérification session + rôle côté middleware).
 * Isolation : toutes les données sont filtrées par `pressing_id` via RLS.
 */
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header admin + sidebar seront ajoutés dans les prochains prompts */}
      <main className="flex-1">{children}</main>
    </div>
  );
}
