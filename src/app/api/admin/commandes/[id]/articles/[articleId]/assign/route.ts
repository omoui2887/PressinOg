/**
 * e-pressing — API /api/admin/commandes/[id]/articles/[articleId]/assign
 * -----------------------------------------------------------------------
 * POST   : Assigne (ou réassigne) un article de production à un employé.
 * DELETE : Désassigne l'article (le remet dans la file non assignée).
 *
 * POST Body JSON : { "personnel_id": "uuid" }
 * DELETE         : pas de body.
 *
 * 🔒 SÉCURITÉ — defense-in-depth :
 *   1. Auth : seul un MANAGER actif peut assigner/désassigner
 *      (CAN_ASSIGNER_ARTICLES).
 *   2. La RPC SQL (migration 037) re-vérifie : same-pressing, personnel
 *      cible actif, rôle compatible, article non terminal. Le tout en
 *      transaction atomique avec SELECT FOR UPDATE.
 *   3. RLS isole par pressing_id.
 *   4. Audit log : assignment_created / assignment_changed / assignment_removed.
 *      Idempotent si déjà dans l'état cible (pas d'audit).
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  getCurrentPersonnel,
  isPersonnelActive,
  hasRole,
  CAN_ASSIGNER_ARTICLES,
} from "@/lib/auth/roles";
import {
  assignerArticleAtomique,
  desassignerArticleAtomique,
  codeRpcToAuditAction,
  codeRpcToHttpStatus,
} from "@/lib/assignment/compatibilite";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string; articleId: string }>;
}

/* -------------------------------------------------------------------------- */
/*  POST — Assigner / réassigner                                               */
/* -------------------------------------------------------------------------- */

export async function POST(request: NextRequest, { params }: RouteParams) {
  const supabase = await getSupabaseServer();
  const me = await getCurrentPersonnel(supabase);

  // 1. Authentification
  if (!me) {
    return NextResponse.json(
      { success: false, error: "Non authentifié" },
      { status: 401 }
    );
  }
  if (!isPersonnelActive(me)) {
    return NextResponse.json(
      { success: false, error: "Accès refusé — compte inactif" },
      { status: 403 }
    );
  }

  // 2. Autorisation : seul le manager peut assigner
  if (!hasRole(me, CAN_ASSIGNER_ARTICLES)) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Accès refusé — seul un manager peut assigner une tâche de production.",
        code: "ROLE_INSUFFISANT",
      },
      { status: 403 }
    );
  }

  const { id: commandeId, articleId } = await params;

  // 3. Parse + validate body
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Corps de requête invalide (JSON attendu)" },
      { status: 400 }
    );
  }

  const personnelIdCible =
    typeof body.personnel_id === "string" ? body.personnel_id.trim() : "";
  if (!personnelIdCible) {
    return NextResponse.json(
      { success: false, error: "personnel_id est requis (UUID)" },
      { status: 400 }
    );
  }

  // 4. Appel RPC atomique
  const result = await assignerArticleAtomique({
    articleId,
    commandeId,
    pressingId: me.pressing_id,
    personnelIdCible,
    assignePar: me.id,
    userId: null,
  });

  const status = codeRpcToHttpStatus(result.code);

  // 5. Audit log (best-effort)
  const auditAction = codeRpcToAuditAction(result.code);
  if (auditAction && result.success) {
    await logAudit({
      pressing_id: me.pressing_id,
      user_id: null,
      action: auditAction,
      entity_type: "article",
      entity_id: articleId,
      before_state: result.avant ?? null,
      after_state: result.apres ?? null,
      req: request,
    });
  }

  // 6. Réponse
  if (!result.success) {
    return NextResponse.json(
      {
        success: false,
        error: result.error ?? "Erreur lors de l'assignation.",
        code: result.code,
        details: result.details,
      },
      { status }
    );
  }

  return NextResponse.json(
    {
      success: true,
      code: result.code,
      article_id: result.article_id,
      commande_id: result.commande_id,
      personnel_id: result.personnel_id,
      message: result.message,
    },
    { status }
  );
}

/* -------------------------------------------------------------------------- */
/*  DELETE — Désassigner                                                       */
/* -------------------------------------------------------------------------- */

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const supabase = await getSupabaseServer();
  const me = await getCurrentPersonnel(supabase);

  if (!me) {
    return NextResponse.json(
      { success: false, error: "Non authentifié" },
      { status: 401 }
    );
  }
  if (!isPersonnelActive(me)) {
    return NextResponse.json(
      { success: false, error: "Accès refusé — compte inactif" },
      { status: 403 }
    );
  }

  if (!hasRole(me, CAN_ASSIGNER_ARTICLES)) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Accès refusé — seul un manager peut désassigner une tâche de production.",
        code: "ROLE_INSUFFISANT",
      },
      { status: 403 }
    );
  }

  const { id: commandeId, articleId } = await params;

  const result = await desassignerArticleAtomique({
    articleId,
    commandeId,
    pressingId: me.pressing_id,
    par: me.id,
    userId: null,
  });

  const status = codeRpcToHttpStatus(result.code);

  // Audit log si désassignation effective
  const auditAction = codeRpcToAuditAction(result.code);
  if (auditAction && result.success) {
    await logAudit({
      pressing_id: me.pressing_id,
      user_id: null,
      action: auditAction,
      entity_type: "article",
      entity_id: articleId,
      before_state: result.avant ?? null,
      after_state: result.apres ?? null,
      req: request,
    });
  }

  if (!result.success) {
    return NextResponse.json(
      {
        success: false,
        error: result.error ?? "Erreur lors de la désassignation.",
        code: result.code,
        details: result.details,
      },
      { status }
    );
  }

  return NextResponse.json(
    {
      success: true,
      code: result.code,
      article_id: result.article_id,
      commande_id: result.commande_id,
      message: result.message,
    },
    { status }
  );
}
