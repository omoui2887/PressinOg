/**
 * Layout racine des pages SUPER ADMIN OgPressing
 * ----------------------------------------------
 * Route group `(super-admin)` → dashboard Super Admin (1 compte unique,
 * propriétaire de la plateforme).
 *
 * Accès : Super Admin uniquement (vérification session + rôle côté middleware).
 */
export default function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header super admin + sidebar seront ajoutés dans les prochains prompts */}
      <main className="flex-1">{children}</main>
    </div>
  );
}
