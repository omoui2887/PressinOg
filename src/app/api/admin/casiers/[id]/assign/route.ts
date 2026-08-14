/**
 * e-pressing — API /api/admin/casiers/[id]/assign (POST + DELETE)
 * ----------------------------------------------------------------
 * Affectation / libération atomique d'un casier.
 *
 *   POST   /api/admin/casiers/[id]/assign   → assigne un article au casier
 *        Body: { article_id: string }
 *        [id] = code du casier (ex: "A1")
 *
 *   DELETE /api/admin/casiers/[id]/assign   → libère le casier
 *        [id] = code du casier (ex: "A1")
 *
 * LE BACKEND EST L'AUTORITÉ :
 *   - L'affectation/libération passe par la RPC PostgreSQL
 *     `assigner_casier_atomic` / `liberer_casier_atomic` qui s'exécute
 *     en UNE transaction avec SELECT FOR UPDATE + contrainte UNIQUE.
 *   - Le frontend ne fait qu'appeler cette API — il ne peut PAS
 *     écrire directement dans `casier_affectations` (RLS deny INSERT).
 *
 * CONCURRENCE :
 *   Deux POST simultanés sur le même casier A1 :
 *     - La RPC verrouille le casier (SELECT FOR UPDATE).
 *     - La 1re requête insère l'affectation et COMMIT.
 *     - La 2e requête (qui attendait le verrou) voit l'affectation active
 *       → retourne CASIER_OCCUPE (409).
 *   → Une seule réussit. C'est la garantie atomique.
 *
 * 🔒 SÉCURITÉ :
 *   - getSupabaseServer() (anon + JWT) → RLS isole par pressing.
 *   - Auth : CAN_GERER_CASIERS (manager, receptionniste, repassage).
 *   - La RPC re-vérifie pressing_id côté SQL (defense-in-depth).
 *   - Audit log : la RPC insère elle-même dans audit_log (casier_assign /
 *     casier_release). On log aussi côté TS pour capturer user_id.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  CAN_GERER_CASIERS,
  getCurrentPersonnel,
  hasRole,
  isPersonnelActive,
} from "@/lib/auth/roles";
import {
  assignerCasierAtomique,
  libererCasierAtomique,
  codeRpcToHttpStatus,
  getErrorMessage,
  extractIpAddressFromRequest,
} from "@/lib/casiers/service";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * Valide l'authentification et les permissions du personnel.
 * Retourne le personnel + le client Supabase, ou une réponse d'erreur.
 */
async function requireCasierManager(request: NextRequest) {
  const supabase = await getSupabaseServer();
  const me = await getCurrentPersonnel(supabase);
  if (!me) {
    return {
      error: NextResponse.json(
        { success: false, error: "Non authentifié" },
        { status: 401 }
      ),
    };
  }
  if (!isPersonnelActive(me)) {
    return {
      error: NextResponse.json(
        { success: false, error: "Accès refusé — compte inactif" },
        { status: 403 }
      ),
    };
  }
  if (!hasRole(me, CAN_GERER_CASIERS)) {
    return {
      error: NextResponse.json(
        {
          success: false,
          error:
            "Accès refusé — seuls le manager, le réceptionniste et le repassage peuvent gérer les casiers.",
        },
        { status: 403 }
      ),
    };
  }
  return { me, supabase };
}

// ---------------------------------------------------------------------------
// POST — assigner un article au casier
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest, { params }: RouteParams) {
  const auth = await requireCasierManager(request);
  if ("error" in auth) return auth.error;
  const { me } = auth;

  const { id: casierCode } = await params;

  // --- Parse body ---
  let body: { article_id?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Corps de requête invalide (JSON attendu)" },
      { status: 400 }
    );
  }

  const articleId =
    typeof body.article_id === "string" ? body.article_id.trim() : "";
  if (!articleId) {
    return NextResponse.json(
      { success: false, error: "L'identifiant de l'article est obligatoire." },
      { status: 400 }
    );
  }

  // UUID validation
  const UUID_REGEX =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!UUID_REGEX.test(articleId)) {
    return NextResponse.json(
      { success: false, error: "Identifiant d'article invalide." },
      { status: 400 }
    );
  }

  // --- Appel à la RPC atomique ---
  const ip = extractIpAddressFromRequest(request.headers);
  const userAgent = request.headers.get("user-agent");

  const result = await assignerCasierAtomique({
    pressing_id: me.pressing_id,
    casier_code: decodeURIComponent(casierCode),
    article_id: articleId,
    affecte_par: me.id,
    ip_address: ip,
    user_agent: userAgent,
  });

  if (!result.success) {
    return NextResponse.json(
      {
        success: false,
        code: result.code,
        error: result.error ?? getErrorMessage(result.code),
        details: result.details,
      },
      { status: codeRpcToHttpStatus(result.code) }
    );
  }

  // --- Audit log côté TS (capture user_id — la RPC ne l'a pas) ---
  await logAudit({
    pressing_id: me.pressing_id,
    user_id: null, // user_id n'est pas dans AuthPersonnel; la RPC log déjà
    action: "casier_assign",
    entity_type: "casier",
    entity_id: result.data?.casier_id,
    after_state: {
      casier_code: result.data?.casier_code,
      article_id: articleId,
      affectation_id: result.data?.affectation_id,
      affecte_par: me.id,
    },
    req: request,
  });

  return NextResponse.json(
    {
      success: true,
      code: result.code,
      data: result.data,
    },
    { status: codeRpcToHttpStatus(result.code) }
  );
}

// ---------------------------------------------------------------------------
// DELETE — libérer le casier
// ---------------------------------------------------------------------------

export async function DELETE(
  request: NextRequest,
  { params }: RouteParams
) {
  const auth = await requireCasierManager(request);
  if ("error" in auth) return auth.error;
  const { me } = auth;

  const { id: casierCode } = await params;

  // --- Appel à la RPC atomique ---
  const ip = extractIpAddressFromRequest(request.headers);
  const userAgent = request.headers.get("user-agent");

  const result = await libererCasierAtomique({
    pressing_id: me.pressing_id,
    casier_code: decodeURIComponent(casierCode),
    libere_par: me.id,
    motif: "Libération manuelle",
    ip_address: ip,
    user_agent: userAgent,
  });

  if (!result.success) {
    return NextResponse.json(
      {
        success: false,
        code: result.code,
        error: result.error ?? getErrorMessage(result.code),
        details: result.details,
      },
      { status: codeRpcToHttpStatus(result.code) }
    );
  }

  // --- Audit log côté TS ---
  await logAudit({
    pressing_id: me.pressing_id,
    user_id: null,
    action: "casier_release",
    entity_type: "casier",
    entity_id: result.data?.casier_id,
    after_state: {
      casier_code: result.data?.casier_code,
      article_id: result.data?.article_id,
      libere_par: me.id,
      libere_le: result.data?.libere_le,
    },
    req: request,
  });

  return NextResponse.json(
    {
      success: true,
      code: result.code,
      data: result.data,
    },
    { status: codeRpcToHttpStatus(result.code) }
  );
}
