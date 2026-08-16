/**
 * e-pressing — API /api/super-admin/users/[id]/reset-password (POST)
 * ------------------------------------------------------------------
 * Permet à un Super Admin de réinitialiser le mot de passe de N'IMPORTE QUEL
 * utilisateur Supabase Auth (manager, employé, ou même un autre super admin).
 *
 * Body JSON :
 *   {} (aucun paramètre requis — génère un mot de passe aléatoire)
 *
 * Logique :
 *   1. Vérifie super admin actif → ensureSuperAdmin()
 *   2. Récupère l'utilisateur cible via admin.auth.admin.getUserById()
 *   3. Génère un nouveau mot de passe aléatoire robuste (10 chars, mixed)
 *   4. Met à jour le mot de passe via admin.auth.admin.updateUserById()
 *   5. Si l'utilisateur est lié au personnel, met mot_de_passe_temporaire=true
 *      pour forcer le changement au prochain login
 *   6. Log dans audit_log (action=reset_password_user, entity_type=auth_user)
 *   7. Retourne les credentials (email + nouveau password + nom_complet)
 *
 * 🔒 SÉCURITÉ :
 *   - ensureSuperAdmin() vérifie session + super_admins.actif=true
 *   - Service role key (admin) pour bypass RLS sur auth.users
 *   - Anti-lockout : un super admin peut réinitialiser son PROPRE mot de passe
 *     (il a déjà sa session, mais en cas de besoin, c'est OK)
 *   - Audit log systématique
 *   - Le mot de passe est renvoyé en clair UNE SEULE FOIS au super admin
 *     (qui doit le communiquer hors-bande au client)
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { ensureSuperAdmin } from "@/lib/auth/super-admin";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/** Génère un mot de passe aléatoire robuste (10 chars : majuscules + minuscules + chiffres + symboles). */
function generateRandomPassword(): string {
  const chars =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  let pwd = "";
  const array = new Uint8Array(10);
  crypto.getRandomValues(array);
  for (let i = 0; i < 10; i++) {
    pwd += chars[array[i] % chars.length];
  }
  return pwd;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: targetUserId } = await params;

  if (!targetUserId) {
    return NextResponse.json(
      { success: false, error: "ID utilisateur manquant." },
      { status: 400 }
    );
  }

  // ---- 1. Vérification super admin ----
  const supabase = await getSupabaseServer();
  const guard = await ensureSuperAdmin(supabase);
  if ("error" in guard) return guard.error;
  const superAdmin = guard.superAdmin;

  const admin = getSupabaseAdmin();

  // ---- 2. Récupère l'utilisateur cible ----
  const { data: targetUser, error: getUserErr } =
    await admin.auth.admin.getUserById(targetUserId);

  if (getUserErr || !targetUser.user) {
    console.error(
      "[api/super-admin/users/[id]/reset-password POST] getUserById error:",
      getUserErr
    );
    return NextResponse.json(
      { success: false, error: "Utilisateur introuvable." },
      { status: 404 }
    );
  }

  // ---- 3. Génère et applique le nouveau mot de passe ----
  const newPassword = generateRandomPassword();

  const { error: updateErr } = await admin.auth.admin.updateUserById(
    targetUserId,
    { password: newPassword }
  );

  if (updateErr) {
    console.error(
      "[api/super-admin/users/[id]/reset-password POST] updateUserById error:",
      updateErr
    );
    // Sécurité (audit #8) : masque le message Supabase brut.
    return NextResponse.json(
      { success: false, error: "Erreur lors de la réinitialisation du mot de passe." },
      { status: 500 }
    );
  }

  // ---- 4. Si lié au personnel, force le flag mot_de_passe_temporaire ----
  let personnelInfo: {
    nom_complet?: string;
    telephone?: string;
    pressing_id?: string | null;
  } = {};

  const { data: personnelRow } = await admin
    .from("personnel")
    .select("id, nom_complet, telephone, pressing_id")
    .eq("user_id", targetUserId)
    .maybeSingle();

  if (personnelRow) {
    personnelInfo = {
      nom_complet: personnelRow.nom_complet,
      telephone: personnelRow.telephone ?? "",
      pressing_id: personnelRow.pressing_id,
    };

    await admin
      .from("personnel")
      .update({ mot_de_passe_temporaire: true })
      .eq("user_id", targetUserId);
  } else {
    // Vérifie si c'est un super admin
    const { data: saRow } = await admin
      .from("super_admins")
      .select("nom_complet, email")
      .eq("user_id", targetUserId)
      .maybeSingle();

    if (saRow) {
      personnelInfo = {
        nom_complet: saRow.nom_complet,
        telephone: "",
        pressing_id: null,
      };
    }
  }

  // ---- 5. Audit log ----
  await logAudit({
    pressing_id: personnelInfo.pressing_id ?? null,
    user_id: superAdmin.user_id,
    action: "reset_password_user",
    entity_type: "auth_user",
    entity_id: targetUserId,
    before_state: { email: targetUser.user.email },
    after_state: { email: targetUser.user.email, password_reset: true },
    req: request,
  });

  // ---- 6. Réponse ----
  const nomComplet =
    targetUser.user.user_metadata?.nom_complet ??
    personnelInfo.nom_complet ??
    targetUser.user.email ??
    "Utilisateur";

  return NextResponse.json({
    success: true,
    credentials: {
      email: targetUser.user.email ?? "",
      telephone: personnelInfo.telephone ?? "",
      password: newPassword,
      nom_complet: nomComplet,
    },
  });
}
