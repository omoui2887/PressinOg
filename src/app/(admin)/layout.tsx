/**
 * OgPressing — Layout racine des pages ADMIN PRESSING
 * ---------------------------------------------------
 * Route group `(admin)` → /admin/*
 *
 * Accès : Manager (admin) du pressing connecté. La vérification du rôle
 * est faite côté middleware (cf. src/lib/supabase/middleware.ts). En
 * défense en profondeur, ce layout re-vérifie l'authentification et
 * récupère côté serveur :
 *   - Les infos du personnel connecté (nom_complet, email)
 *   - Les infos du pressing (nom, logo_url) → affichées dans la sidebar
 *     et le topbar
 *   - L'abonnement le plus récent du pressing (statut, date_fin) → pour
 *     afficher une bannière d'avertissement si expiré/suspendu
 *
 * Server Component : toutes les requêtes Supabase passent par RLS (client
 * anon + JWT utilisateur), ce qui garantit l'isolation multi-tenant. Les
 * objets non-sériables (icônes) restent côté client (cf. AdminShell).
 *
 * Bannière d'abonnement : NON bloquante pour le MVP. Purement visuelle.
 */
import { redirect } from "next/navigation";
import { AdminShell } from "@/components/ogpressing/admin/admin-shell";
import { SubscriptionBanner } from "@/components/ogpressing/admin/subscription-banner";
import { getSupabaseServer } from "@/lib/supabase/server";

export default async function AdminLayout({
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
    redirect("/login?next=/admin/dashboard");
  }

  // Récupère la ligne personnel du manager (RLS : get_pressing_id_utilisateur).
  // On vérifie role=manager + actif + statut_compte=actif (cf. middleware).
  const { data: personnel } = await supabase
    .from("personnel")
    .select("id, nom_complet, email, role, actif, statut_compte, pressing_id")
    .eq("user_id", user.id)
    .maybeSingle();

  // Si pas manager actif → redirection (le middleware devrait déjà l'avoir
  // fait, mais on reste prudent).
  if (
    !personnel ||
    personnel.role !== "manager" ||
    personnel.actif !== true ||
    personnel.statut_compte !== "actif"
  ) {
    redirect("/login?next=/admin/dashboard&error=acces_refuse");
  }

  // Récupère les infos du pressing connecté.
  const { data: pressing } = await supabase
    .from("pressing")
    .select("id, nom, logo_url, statut")
    .eq("id", personnel.pressing_id)
    .maybeSingle();

  if (!pressing) {
    redirect("/login?next=/admin/dashboard&error=acces_refuse");
  }

  // Récupère le dernier abonnement (le plus récent en date_debut) pour
  // déterminer si une bannière d'avertissement doit être affichée.
  // On lit statut + date_fin pour décider du message.
  const { data: latestAbonnement } = await supabase
    .from("abonnements")
    .select("statut, date_fin")
    .eq("pressing_id", pressing.id)
    .order("date_debut", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Calcul du statut d'avertissement (non bloquant).
  // - statut = 'suspendu' → bannière "suspendu"
  // - statut = 'expire' → bannière "expire"
  // - statut = 'essai' ou 'actif' + date_fin dépassée → bannière "expire"
  // - sinon → pas de bannière
  let abonnementWarning: "expire" | "suspendu" | null = null;
  if (latestAbonnement) {
    if (latestAbonnement.statut === "suspendu") {
      abonnementWarning = "suspendu";
    } else if (latestAbonnement.statut === "expire") {
      abonnementWarning = "expire";
    } else if (latestAbonnement.date_fin) {
      const now = new Date();
      const dateFin = new Date(latestAbonnement.date_fin);
      if (dateFin < now) {
        abonnementWarning = "expire";
      }
    }
  }

  return (
    <AdminShell
      user={{
        email: personnel.email ?? user.email,
        nom: personnel.nom_complet,
      }}
      brand={{
        name: pressing.nom,
        logoUrl: pressing.logo_url,
      }}
    >
      {/* Bannière d'avertissement abonnement (non bloquante) — affichée
          en haut de TOUTES les pages /admin/* si l'abonnement est
          expiré ou suspendu. */}
      {abonnementWarning && (
        <div className="mb-4 sm:mb-6">
          <SubscriptionBanner variant={abonnementWarning} />
        </div>
      )}
      {children}
    </AdminShell>
  );
}
