/**
 * Layout racine des pages PERSONNEL OgPressing
 * --------------------------------------------
 * Route group `(personnel)` → dashboards des 7 rôles :
 *   - Manager
 *   - Réceptionniste
 *   - Caissier
 *   - Laveur
 *   - Repassage
 *   - Livreur
 *   - Comptable
 *
 * Accès : employé rattaché à un pressing (vérification session + rôle côté
 * middleware). Isolation stricte par `pressing_id` via RLS.
 */
export default function PersonnelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header personnel + bottom nav (mobile-first) seront ajoutés dans les prochains prompts */}
      <main className="flex-1 pb-16 md:pb-0">{children}</main>
    </div>
  );
}
