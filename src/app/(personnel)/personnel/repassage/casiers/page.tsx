/**
 * e-pressing — /personnel/repassage/casiers (CASIER-FIX-V1)
 * ---------------------------------------------------------
 * Vue grille des casiers de stockage du pressing pour le poste Repassage.
 * Miroir de la page /personnel/manager/casiers — seul le basePath change
 * ("/personnel/repassage" au lieu de "/personnel/manager").
 *
 * Pourquoi une page séparée ? Le middleware (src/lib/supabase/middleware.ts)
 * vérifie que le segment /personnel/{role}/* correspond au rôle de
 * l'utilisateur connecté. Chaque rôle a donc besoin de sa propre route,
 * même si le rendu est identique (composant partagé <CasiersGrid />).
 *
 * 🔒 SÉCURITÉ : le layout (personnel)/layout.tsx vérifie déjà l'auth + le
 *    rôle (repassage uniquement sur /personnel/repassage/*). L'API
 *    /api/admin/casiers est accessible à n'importe quel personnel actif. La
 *    RLS isole par pressing_id.
 */
import { CasiersGrid } from "@/components/ogpressing/casiers/casiers-grid";

export default function RepassageCasiersPage() {
  return <CasiersGrid basePath="/personnel/repassage" roleLabel="Repassage" />;
}
