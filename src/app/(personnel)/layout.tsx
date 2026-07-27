/**
 * OgPressing — Layout racine des pages PERSONNEL (LOT 13)
 * -------------------------------------------------------
 * Route group `(personnel)` → dashboards des 7 rôles :
 *   - Manager (redirigé vers /admin/* par le middleware)
 *   - Réceptionniste, Caissier, Laveur, Repassage, Livreur, Comptable
 *
 * Server Component : fetch côté serveur les infos du personnel connecté
 * (nom_complet, email, role) + les infos du pressing (nom, logo_url).
 * Passe le tout au `PersonnelShell` (client) qui sélectionne la navigation
 * appropriée selon le rôle.
 *
 * 🔒 SÉCURITÉ :
 *   - Le middleware (src/lib/supabase/middleware.ts) vérifie déjà que
 *     l'utilisateur est authentifié, que sa ligne personnel existe, qu'il
 *     est actif + statut_compte='actif', et que le segment de rôle dans
 *     l'URL (/personnel/{role}/*) correspond à son rôle réel. Ce layout
 *     est une défense en profondeur : il re-vérifie l'auth et redirige
 *     vers /login si l'utilisateur n'est pas connecté.
 *   - RLS isole par pressing_id automatiquement (client anon + JWT).
 *   - Un Manager (role='manager') n'a pas accès aux routes /personnel/* —
 *     le middleware le redirige vers /admin/dashboard. Si on arrive ici
 *     avec role='manager', on redirige aussi par sécurité.
 */
import { redirect } from "next/navigation";
import { PersonnelShell } from "@/components/ogpressing/personnel/personnel-shell";
import { getSupabaseServer } from "@/lib/supabase/server";
import { isPersonnelRole } from "@/components/ogpressing/personnel/personnel-nav-config";

export default async function PersonnelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Défense en profondeur : si pas d'utilisateur (le middleware aurait dû
  // rediriger), on redirige vers /login.
  if (!user) {
    redirect("/login?next=/personnel");
  }

  // Récupère la ligne personnel (RLS : self via get_pressing_id_utilisateur).
  const { data: personnel } = await supabase
    .from("personnel")
    .select("id, nom_complet, email, role, actif, statut_compte, pressing_id")
    .eq("user_id", user.id)
    .maybeSingle();

  // Si pas de ligne personnel ou compte inactif → /login (le middleware
  // devrait déjà l'avoir fait, mais on reste prudent).
  if (
    !personnel ||
    personnel.actif !== true ||
    personnel.statut_compte !== "actif"
  ) {
    redirect("/login?next=/personnel&error=acces_refuse");
  }

  // Un Manager n'a pas accès aux routes /personnel/* — il est redirigé vers
  // /admin/dashboard (le middleware le fait aussi, mais on reste prudent).
  if (personnel.role === "manager") {
    redirect("/admin/dashboard");
  }

  // Valide que le rôle est bien l'un des 6 rôles attendus (hors manager).
  if (!isPersonnelRole(personnel.role) || personnel.role === "manager") {
    redirect("/login?next=/personnel&error=acces_refuse");
  }

  // Récupère les infos du pressing connecté (nom + logo pour la sidebar).
  const { data: pressing } = await supabase
    .from("pressing")
    .select("id, nom, logo_url, statut")
    .eq("id", personnel.pressing_id)
    .maybeSingle();

  if (!pressing) {
    redirect("/login?next=/personnel&error=acces_refuse");
  }

  return (
    <PersonnelShell
      role={personnel.role}
      user={{
        email: personnel.email ?? user.email,
        nom: personnel.nom_complet,
      }}
      brand={{
        name: pressing.nom,
        logoUrl: pressing.logo_url,
      }}
    >
      {children}
    </PersonnelShell>
  );
}
