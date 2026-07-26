/**
 * OgPressing — API /api/admin/personnel/[id] (PATCH + POST)
 * ---------------------------------------------------------
 * Gestion du cycle de vie d'un compte employé (LOT 9.3).
 *
 * PATCH — actions sur le statut + modification des infos :
 *   Body { action: "desactiver" }   → statut='desactive', actif=false, date_desactivation=NOW()
 *   Body { action: "reactiver" }    → statut='actif', actif=true, date_desactivation=NULL
 *   Body { action: "modifier", nom, prenom, telephone, email, role }
 *                                   → UPDATE nom_complet, telephone, email, role
 *
 * POST — actions sur l'authentification (nécessitent service_role) :
 *   Body { action: "reset_password" }
 *       → Génère un nouveau mot de passe temporaire aléatoire
 *       → admin.auth.admin.updateUserById(id, { password })
 *       → UPDATE personnel SET mot_de_passe_temporaire = true
 *       → Retourne { credentials: { email, telephone, password } }
 *   Body { action: "resend_invitation" }
 *       → admin.auth.admin.inviteUserByEmail(email, { redirectTo })
 *       → UPDATE personnel SET date_invitation = NOW()
 *       → Retourne { invitedEmail }
 *
 * 🔒 SÉCURITÉ :
 *   - Manager authentifié + actif (vérifié au début de chaque handler).
 *   - RLS `isolation_pressing` (USING + WITH CHECK pressing_id) garantit qu'on
 *     ne peut modifier qu'un employé de SON propre pressing.
 *   - Verrou anti-lockout : un manager ne peut pas se désactiver lui-même.
 *   - Les opérations Auth (reset password, resend invitation) utilisent
 *     getSupabaseAdmin() (service_role) car ces opérations Admin Auth sont
 *     impossibles avec la clé anon.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const ROLES_VALID_SET = new Set([
  "manager",
  "receptionniste",
  "caissier",
  "laveur",
  "repassage",
  "livreur",
  "comptable",
]);

/** Génère un mot de passe aléatoire sécurisé de 10 caractères. */
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

/** Vérifie l'authentification + autorisation manager. Retourne [me, supabase] ou une Response d'erreur. */
async function checkManagerAuth(): Promise<
  | { ok: true; me: { id: string; pressing_id: string }; supabase: Awaited<ReturnType<typeof getSupabaseServer>> }
  | { ok: false; response: NextResponse }
> {
  const supabase = await getSupabaseServer();
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: "Non authentifié" },
        { status: 401 }
      ),
    };
  }

  const { data: me } = await supabase
    .from("personnel")
    .select("id, pressing_id, role, actif, statut_compte")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (
    !me ||
    me.role !== "manager" ||
    me.actif !== true ||
    me.statut_compte !== "actif"
  ) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: "Accès refusé — manager requis" },
        { status: 403 }
      ),
    };
  }

  return { ok: true, me: { id: me.id, pressing_id: me.pressing_id }, supabase };
}

/* ================================================================
 *  PATCH — Désactiver / Réactiver / Modifier
 * ================================================================ */

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await checkManagerAuth();
  if (!auth.ok) return auth.response;
  const { me, supabase } = auth;

  const { id: targetId } = await params;

  // Verrou anti-lockout : ne pas se désactiver soi-même
  if (targetId === me.id) {
    return NextResponse.json(
      {
        success: false,
        error: "Vous ne pouvez pas modifier votre propre compte via cette action.",
      },
      { status: 400 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Corps de requête invalide (JSON attendu)" },
      { status: 400 }
    );
  }

  const action = typeof body.action === "string" ? body.action : "";

  // ---- Action: désactiver / réactiver ----
  if (action === "desactiver" || action === "reactiver") {
    // Vérifie que la cible existe + appartient au même pressing (RLS le garantit)
    const { data: target } = await supabase
      .from("personnel")
      .select("id, nom_complet, statut_compte, pressing_id")
      .eq("id", targetId)
      .maybeSingle();

    if (!target) {
      return NextResponse.json(
        { success: false, error: "Employé introuvable" },
        { status: 404 }
      );
    }

    if (target.pressing_id !== me.pressing_id) {
      return NextResponse.json(
        { success: false, error: "Accès refusé" },
        { status: 403 }
      );
    }

    // Cohérence de l'action vs statut actuel
    if (action === "desactiver" && target.statut_compte === "desactive") {
      return NextResponse.json(
        { success: false, error: "Ce compte est déjà désactivé" },
        { status: 400 }
      );
    }
    if (action === "reactiver" && target.statut_compte === "actif") {
      return NextResponse.json(
        { success: false, error: "Ce compte est déjà actif" },
        { status: 400 }
      );
    }

    const updates =
      action === "desactiver"
        ? {
            statut_compte: "desactive" as const,
            actif: false,
            date_desactivation: new Date().toISOString(),
          }
        : {
            statut_compte: "actif" as const,
            actif: true,
            date_desactivation: null,
          };

    const { data: updated, error: updateErr } = await supabase
      .from("personnel")
      .update(updates)
      .eq("id", targetId)
      .select(
        "id, nom_complet, email, telephone, role, methode_creation, statut_compte, date_invitation, date_activation, date_desactivation, actif, created_at"
      )
      .maybeSingle();

    if (updateErr) {
      console.error("[api/admin/personnel/[id] PATCH] UPDATE error:", updateErr);
      return NextResponse.json(
        { success: false, error: "Erreur lors de la mise à jour" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: updated,
      action,
    });
  }

  // ---- Action: modifier (infos personnelles + rôle) ----
  if (action === "modifier") {
    const nom = typeof body.nom === "string" ? body.nom.trim() : "";
    const prenom = typeof body.prenom === "string" ? body.prenom.trim() : "";
    const telephone =
      typeof body.telephone === "string" ? body.telephone.trim() : "";
    const emailRaw =
      typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const role = typeof body.role === "string" ? body.role : "";

    if (!nom || !prenom || !telephone) {
      return NextResponse.json(
        { success: false, error: "Nom, prénom et téléphone sont obligatoires." },
        { status: 400 }
      );
    }

    if (!ROLES_VALID_SET.has(role)) {
      return NextResponse.json(
        { success: false, error: "Rôle invalide." },
        { status: 400 }
      );
    }

    const email = emailRaw || null;
    const nomComplet = `${prenom} ${nom}`;

    // Vérifie que la cible existe + appartient au même pressing
    const { data: target } = await supabase
      .from("personnel")
      .select("id, pressing_id, email, telephone")
      .eq("id", targetId)
      .maybeSingle();

    if (!target) {
      return NextResponse.json(
        { success: false, error: "Employé introuvable" },
        { status: 404 }
      );
    }

    if (target.pressing_id !== me.pressing_id) {
      return NextResponse.json(
        { success: false, error: "Accès refusé" },
        { status: 403 }
      );
    }

    // Anti-doublon (email/téléphone) — exclut l'employé courant
    if (email || telephone) {
      const orParts: string[] = [];
      if (email) orParts.push(`email.eq.${email}`);
      if (telephone) orParts.push(`telephone.eq.${telephone}`);
      const { data: duplicate } = await supabase
        .from("personnel")
        .select("id")
        .eq("pressing_id", me.pressing_id)
        .neq("id", targetId)
        .or(orParts.join(","))
        .limit(1)
        .maybeSingle();

      if (duplicate) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Un autre employé avec cet email ou ce téléphone existe déjà.",
          },
          { status: 409 }
        );
      }
    }

    const { data: updated, error: updateErr } = await supabase
      .from("personnel")
      .update({
        nom_complet: nomComplet,
        telephone,
        email,
        role,
      })
      .eq("id", targetId)
      .select(
        "id, nom_complet, email, telephone, role, methode_creation, statut_compte, date_invitation, date_activation, date_desactivation, actif, created_at"
      )
      .maybeSingle();

    if (updateErr) {
      console.error("[api/admin/personnel/[id] PATCH modifier] UPDATE error:", updateErr);
      return NextResponse.json(
        { success: false, error: "Erreur lors de la modification" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: updated,
      action: "modifier",
    });
  }

  return NextResponse.json(
    {
      success: false,
      error:
        "Action invalide. Valeurs attendues : 'desactiver', 'reactiver' ou 'modifier'.",
    },
    { status: 400 }
  );
}

/* ================================================================
 *  POST — Réinitialiser mot de passe / Renvoyer invitation
 * ================================================================ */

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await checkManagerAuth();
  if (!auth.ok) return auth.response;
  const { me, supabase } = auth;

  const { id: targetId } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Corps de requête invalide (JSON attendu)" },
      { status: 400 }
    );
  }

  const action = typeof body.action === "string" ? body.action : "";

  // Récupère l'employé cible (RLS isole par pressing)
  const { data: target } = await supabase
    .from("personnel")
    .select(
      "id, pressing_id, user_id, nom_complet, email, telephone, role, methode_creation, statut_compte"
    )
    .eq("id", targetId)
    .maybeSingle();

  if (!target) {
    return NextResponse.json(
      { success: false, error: "Employé introuvable" },
      { status: 404 }
    );
  }

  if (target.pressing_id !== me.pressing_id) {
    return NextResponse.json(
      { success: false, error: "Accès refusé" },
      { status: 403 }
    );
  }

  // ---- Action: reset_password (uniquement creation_directe) ----
  if (action === "reset_password") {
    if (target.methode_creation !== "creation_directe") {
      return NextResponse.json(
        {
          success: false,
          error:
            "La réinitialisation de mot de passe n'est possible que pour les comptes créés en création directe.",
        },
        { status: 400 }
      );
    }

    if (!target.user_id) {
      return NextResponse.json(
        { success: false, error: "Compte non lié à un utilisateur Auth." },
        { status: 400 }
      );
    }

    const admin = getSupabaseAdmin();
    const newPassword = generateRandomPassword();

    // 1. Met à jour le mot de passe côté Auth
    const { error: updateAuthErr } = await admin.auth.admin.updateUserById(
      target.user_id,
      {
        password: newPassword,
        // Forcer le changement au prochain login via notre flag personnel
      }
    );

    if (updateAuthErr) {
      console.error("[api/admin/personnel/[id] POST reset_password] Auth error:", updateAuthErr);
      return NextResponse.json(
        {
          success: false,
          error: `Erreur lors de la réinitialisation : ${updateAuthErr.message}`,
        },
        { status: 500 }
      );
    }

    // 2. Remet mot_de_passe_temporaire = true côté personnel
    const { error: updatePersErr } = await admin
      .from("personnel")
      .update({ mot_de_passe_temporaire: true })
      .eq("id", targetId);

    if (updatePersErr) {
      console.error("[api/admin/personnel/[id] POST reset_password] personnel error:", updatePersErr);
      // Le mot de passe a été changé côté Auth — on signale l'incohérence
      return NextResponse.json(
        {
          success: false,
          error:
            "Mot de passe réinitialisé côté Auth, mais erreur lors de la mise à jour du flag temporaire.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      action: "reset_password",
      credentials: {
        email: target.email ?? "",
        telephone: target.telephone ?? "",
        password: newPassword,
        nom_complet: target.nom_complet,
      },
    });
  }

  // ---- Action: resend_invitation (uniquement invite_en_attente + lien_invitation) ----
  if (action === "resend_invitation") {
    if (target.methode_creation !== "lien_invitation") {
      return NextResponse.json(
        {
          success: false,
          error:
            "Le renvoi d'invitation n'est possible que pour les comptes créés par lien d'invitation.",
        },
        { status: 400 }
      );
    }

    if (!target.email) {
      return NextResponse.json(
        { success: false, error: "Aucun email associé à cet employé." },
        { status: 400 }
      );
    }

    const admin = getSupabaseAdmin();

    const redirectTo =
      process.env.NEXT_PUBLIC_SITE_URL ??
      request.nextUrl.origin ??
      "http://localhost:3000";
    const inviteRedirect = `${redirectTo}/personnel/changer-mot-de-passe`;

    const { error: inviteErr } = await admin.auth.admin.inviteUserByEmail(
      target.email,
      { redirectTo: inviteRedirect }
    );

    if (inviteErr) {
      console.error("[api/admin/personnel/[id] POST resend_invitation] error:", inviteErr);
      return NextResponse.json(
        {
          success: false,
          error: `Erreur lors du renvoi : ${inviteErr.message}`,
        },
        { status: 500 }
      );
    }

    // Met à jour date_invitation
    await admin
      .from("personnel")
      .update({ date_invitation: new Date().toISOString() })
      .eq("id", targetId);

    return NextResponse.json({
      success: true,
      action: "resend_invitation",
      invitedEmail: target.email,
    });
  }

  return NextResponse.json(
    {
      success: false,
      error:
        "Action invalide. Valeurs attendues : 'reset_password' ou 'resend_invitation'.",
    },
    { status: 400 }
  );
}
