/**
 * OgPressing — Layout racine des pages SUPER ADMIN
 * -----------------------------------------------
 * Route group `(super-admin)` → /super-admin/*
 *
 * Accès : Super Admin uniquement (vérification session + rôle côté
 * middleware). En défense en profondeur, ce layout re-vérifie l'appartenance
 * au rôle et récupère les infos utilisateur à afficher dans la sidebar.
 *
 * Server Component : récupère l'utilisateur via Supabase (RLS) puis rend
 * le `SuperAdminShell` (client) en lui passant uniquement l'objet `user`
 * sérialisable. Les icônes de navigation sont définies côté client
 * (cf. super-admin-shell.tsx) car non-sériables.
 */
import { redirect } from "next/navigation";
import { SuperAdminShell } from "@/components/ogpressing/super-admin/super-admin-shell";
import { getSupabaseServer } from "@/lib/supabase/server";

export default async function SuperAdminLayout({
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
    redirect("/login?next=/super-admin/dashboard");
  }

  // Récupère la ligne super_admins (RLS : is_super_admin() = true).
  // Si l'utilisateur n'est pas super admin → redirection vers /login.
  const { data: superAdmin } = await supabase
    .from("super_admins")
    .select("nom_complet, email")
    .eq("user_id", user.id)
    .eq("actif", true)
    .maybeSingle();

  if (!superAdmin) {
    redirect("/login?next=/super-admin/dashboard&error=acces_refuse");
  }

  return (
    <SuperAdminShell
      user={{
        email: superAdmin.email ?? user.email,
        nom: superAdmin.nom_complet,
      }}
    >
      {children}
    </SuperAdminShell>
  );
}
