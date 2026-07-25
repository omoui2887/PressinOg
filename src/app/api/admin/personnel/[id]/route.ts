/**
 * OgPressing — API /api/admin/personnel/[id] (PATCH)
 * ---------------------------------------------------
 * Met à jour le statut du compte d'un employé du pressing connecté.
 *
 * Actions supportées (via body.action) :
 *   - "desactiver"  → statut_compte='desactive', actif=false, date_desactivation=NOW()
 *   - "reactiver"   → statut_compte='actif', actif=true, date_desactivation=NULL
 *
 * 🔒 SÉCURITÉ :
 *   - Manager authentifié + actif (vérifié).
 *   - RLS `isolation_pressing` (USING + WITH CHECK pressing_id) garantit qu'on
 *     ne peut modifier qu'un employé de SON propre pressing.
 *   - Un manager ne peut pas se désactiver lui-même (verrou anti-lockout).
 *
 * ⚠️ La réinitialisation de mot de passe et le renvoi d'invitation sont des
 * opérations complexes (génération de token, envoi email/SMS) qui seront
 * implémentées ultérieurement. Pour l'instant, elles renvoient un 501.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await getSupabaseServer();
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) {
    return NextResponse.json(
      { success: false, error: "Non authentifié" },
      { status: 401 }
    );
  }

  // Vérifie que l'appelant est un manager actif
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
    return NextResponse.json(
      { success: false, error: "Accès refusé — manager requis" },
      { status: 403 }
    );
  }

  const { id: targetId } = await params;

  // Verrou anti-lockout : un manager ne peut pas se désactiver lui-même
  if (targetId === me.id) {
    return NextResponse.json(
      {
        success: false,
        error: "Vous ne pouvez pas désactiver votre propre compte",
      },
      { status: 400 }
    );
  }

  // Parse le body
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

  if (action !== "desactiver" && action !== "reactiver") {
    return NextResponse.json(
      {
        success: false,
        error: "Action invalide. Valeurs attendues : 'desactiver' ou 'reactiver'.",
      },
      { status: 400 }
    );
  }

  // Vérifie que la cible existe ET appartient au même pressing (RLS le garantit,
  // mais on récupère son statut actuel pour valider la cohérence de l'action)
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

  // RLS garantit pressing_id = me.pressing_id, double-check explicite
  if (target.pressing_id !== me.pressing_id) {
    return NextResponse.json(
      { success: false, error: "Accès refusé" },
      { status: 403 }
    );
  }

  // Vérifie la cohérence de l'action vs le statut actuel
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

  // Applique la mise à jour
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
    console.error("[api/admin/personnel/[id]] Erreur UPDATE:", updateErr);
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

/**
 * POST — placeholder pour "reset-password" et "resend-invitation".
 * Ces actions nécessitent une logique backend complexe (génération de token
 * sécurisé + envoi email/SMS via Supabase Auth) qui sera implémentée dans un
 * lot ultérieur. On renvoie 501 Not Implemented.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return NextResponse.json(
    {
      success: false,
      error: "Fonctionnalité à venir",
      detail:
        "La réinitialisation de mot de passe et le renvoi d'invitation seront implémentés ultérieurement.",
      targetId: id,
    },
    { status: 501 }
  );
}
