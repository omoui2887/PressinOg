/**
 * e-pressing — API /api/admin/commandes/[id]/assign-bulk
 * -------------------------------------------------------
 * POST : Assigne plusieurs articles d'une même commande en une seule
 *        requête. Utile quand le manager veut répartir une commande
 *        entière entre plusieurs employés d'un coup.
 *
 * Body JSON :
 *   {
 *     "assignments": [
 *       { "article_id": "uuid", "personnel_id": "uuid" },
 *       { "article_id": "uuid", "personnel_id": "uuid" }
 *     ]
 *   }
 *
 * 🔒 SÉCURITÉ :
 *   - Manager only (CAN_ASSIGNER_ARTICLES).
 *   - Chaque assignation appelle la RPC atomique individuellement — la RPC
 *     vérifie same-pressing, actif, rôle compatible pour CHAQUE article.
 *   - Si une assignation échoue, les précédentes restent valides (pas de
 *     rollback global — on retourne le détail par article).
 *   - Audit log pour chaque assignation réussie (created/changed).
 *
 * Réponse :
 *   200 {
 *     success: true,
 *     results: [
 *       { article_id, success, code, personnel_id, error? },
 *       ...
 *     ],
 *     summary: { total, succeeded, failed, created, changed, idempotent }
 *   }
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
  codeRpcToAuditAction,
} from "@/lib/assignment/compatibilite";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

interface AssignmentInput {
  article_id: string;
  personnel_id: string;
}

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface ResultItem {
  article_id: string;
  personnel_id: string;
  success: boolean;
  code: string;
  error?: string;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
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
          "Accès refusé — seul un manager peut assigner des tâches de production.",
        code: "ROLE_INSUFFISANT",
      },
      { status: 403 }
    );
  }

  const { id: commandeId } = await params;

  // Parse + validate body
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Corps de requête invalide (JSON attendu)" },
      { status: 400 }
    );
  }

  const assignmentsRaw = body.assignments;
  if (!Array.isArray(assignmentsRaw) || assignmentsRaw.length === 0) {
    return NextResponse.json(
      {
        success: false,
        error:
          "assignments est requis et doit être un tableau non vide de { article_id, personnel_id }.",
      },
      { status: 400 }
    );
  }

  // Limite défensive : max 200 assignations par requête
  if (assignmentsRaw.length > 200) {
    return NextResponse.json(
      {
        success: false,
        error: "Trop d'assignations (max 200 par requête).",
      },
      { status: 413 }
    );
  }

  // Validation structurelle de chaque item
  const assignments: AssignmentInput[] = [];
  for (let i = 0; i < assignmentsRaw.length; i++) {
    const item = assignmentsRaw[i] as Record<string, unknown>;
    const articleId =
      typeof item.article_id === "string" ? item.article_id.trim() : "";
    const personnelId =
      typeof item.personnel_id === "string" ? item.personnel_id.trim() : "";
    if (!articleId || !personnelId) {
      return NextResponse.json(
        {
          success: false,
          error: `assignments[${i}] : article_id et personnel_id sont requis (UUID).`,
        },
        { status: 400 }
      );
    }
    assignments.push({ article_id: articleId, personnel_id: personnelId });
  }

  // Exécution : chaque assignation via la RPC atomique (séquentiel pour
  // éviter les conflits de verrou sur les mêmes lignes).
  const results: ResultItem[] = [];
  let succeeded = 0;
  let failed = 0;
  let created = 0;
  let changed = 0;
  let idempotent = 0;

  for (const a of assignments) {
    const result = await assignerArticleAtomique({
      articleId: a.article_id,
      commandeId,
      pressingId: me.pressing_id,
      personnelIdCible: a.personnel_id,
      assignePar: me.id,
      userId: null,
    });

    const item: ResultItem = {
      article_id: a.article_id,
      personnel_id: a.personnel_id,
      success: result.success,
      code: result.code,
    };
    if (!result.success) {
      item.error = result.error;
      failed++;
    } else {
      succeeded++;
      if (result.code === "CREATED") created++;
      else if (result.code === "CHANGED") changed++;
      else if (result.code === "IDEMPOTENT_REPLAY") idempotent++;

      // Audit log (best-effort)
      const auditAction = codeRpcToAuditAction(result.code);
      if (auditAction) {
        await logAudit({
          pressing_id: me.pressing_id,
          user_id: null,
          action: auditAction,
          entity_type: "article",
          entity_id: a.article_id,
          before_state: result.avant ?? null,
          after_state: result.apres ?? null,
          req: request,
        });
      }
    }
    results.push(item);
  }

  return NextResponse.json({
    success: true,
    results,
    summary: {
      total: assignments.length,
      succeeded,
      failed,
      created,
      changed,
      idempotent,
    },
  });
}
