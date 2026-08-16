/**
 * e-pressing — /super-admin/utilisateurs
 * ---------------------------------------
 * Gestion des utilisateurs Supabase Auth (vue Super Admin).
 *
 * Accès : Super Admin uniquement (vérifié côté middleware + layout du route
 * group `(super-admin)` qui re-vérifie l'appartenance à `super_admins`).
 *
 * Server Component minimal — la page cliente `UtilisateursPage` fetch
 * elle-même les données via GET /api/super-admin/users.
 *
 * Fonctionnalités :
 *   - Recherche par email
 *   - Liste paginée (50/page) des utilisateurs Auth
 *   - Pour chaque user : email, rôle, nom, pressing, statut, dernière connexion
 *   - Bouton "Réinitialiser le mot de passe" → POST /api/super-admin/users/[id]/reset-password
 *     → Affiche ResetPasswordResultDialog avec les nouveaux identifiants
 */
import { UtilisateursPage } from "@/components/ogpressing/super-admin/utilisateurs/utilisateurs-page";

export const dynamic = "force-dynamic";

export default function UtilisateursSuperAdminPage() {
  return <UtilisateursPage />;
}
