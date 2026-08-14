/**
 * e-pressing — Service Casiers (système de casiers uniques — migration 039)
 * ========================================================================
 * Wrapper TypeScript autour des RPC PostgreSQL `assigner_casier_atomic`
 * et `liberer_casier_atomic`.
 *
 * LE BACKEND EST L'UNIQUE AUTORITÉ :
 *   - Le frontend ne fait qu'AFFICHER les disponibilités (GET /api/admin/casiers).
 *   - Toute affectation/libération DOIT passer par ces RPCs (POST/DELETE
 *     /api/admin/casiers/[code]/assign), qui s'exécutent en transaction
 *     atomique PostgreSQL avec SELECT FOR UPDATE + contrainte UNIQUE.
 *
 * GARANTIES D'UNICITÉ (niveau DB, inviolable par le frontend) :
 *   1. UNIQUE(pressing_id, code) sur `casiers` — un code est unique par pressing.
 *   2. Index partiel UNIQUE sur casier_id WHERE statut='actif' — un casier =
 *      UNE affectation active max.
 *   3. Index partiel UNIQUE sur article_id WHERE statut='actif' — un article =
 *      UNE affectation active max.
 *   4. SELECT FOR UPDATE dans la RPC — sérialise les requêtes concurrentes
 *      sur le même casier (la 2e attend le COMMIT de la 1re, puis voit
 *      l'affectation active → CASIER_OCCUPE).
 *
 * CONCURRENCE :
 *   Deux requêtes simultanées sur A1 :
 *     - La 1re obtient le verrou (SELECT FOR UPDATE), insère l'affectation, COMMIT.
 *     - La 2e est bloquée pendant le COMMIT de la 1re, puis voit l'affectation
 *       active → retourne CASIER_OCCUPE (success=false).
 *   → Une seule réussit. C'est la garantie atomique.
 *
 * AUTO-LIBÉRATION :
 *   Le trigger `trg_auto_liberer_casier` sur articles_vetements libère
 *   automatiquement le casier quand l'article passe à 'retire' ou 'livre'.
 *   Même si l'app oublie d'appeler libererCasierAtomique, le trigger le fait.
 *   Defense-in-depth.
 */
import { getSupabaseAdmin } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------------
// Types — inputs
// ---------------------------------------------------------------------------

export interface AssignerCasierParams {
  pressing_id: string;
  /** Code du casier (ex: "A1"). URL-safe car alphanumérique. */
  casier_code: string;
  /** UUID de l'article_vetement à ranger dans le casier. */
  article_id: string;
  /** UUID du personnel qui effectue l'affectation. */
  affecte_par: string | null;
  /** Zone optionnelle (si le casier doit être créé à la volée). Non utilisé
   *  par la RPC actuelle — le casier doit exister au préalable. */
  zone?: string | null;
  ip_address?: string | null;
  user_agent?: string | null;
}

export interface LibererCasierParams {
  pressing_id: string;
  /** Code du casier à libérer. */
  casier_code: string;
  /** UUID du personnel qui libère le casier. */
  libere_par: string | null;
  /** Motif de libération (optionnel). */
  motif?: string | null;
  ip_address?: string | null;
  user_agent?: string | null;
}

// ---------------------------------------------------------------------------
// Types — résultat (ce que la RPC retourne)
// ---------------------------------------------------------------------------

export interface CasierResultData {
  affectation_id?: string;
  casier_id: string;
  casier_code: string;
  article_id?: string;
  affecte_le?: string;
  libere_le?: string;
}

export interface CasierResult {
  success: boolean;
  code: string;
  error?: string;
  details?: Record<string, unknown>;
  data?: CasierResultData;
}

// ---------------------------------------------------------------------------
// Mapper : statut HTTP à partir du code RPC
// ---------------------------------------------------------------------------

/**
 * Mappe un code de retour RPC → statut HTTP approprié.
 * Permet à l'API route de rester un orchestrateur mince.
 */
export function codeRpcToHttpStatus(code: string): number {
  switch (code) {
    // Success
    case "CASIER_ASSIGNE":
      return 201;
    case "CASIER_LIBERE":
    case "CASIER_DEJA_LIBRE":
      return 200;

    // 400 — Bad Request (validation input)
    case "PRESSING_ID_REQUIS":
    case "CASIER_CODE_REQUIS":
    case "ARTICLE_ID_REQUIS":
    case "ARTICLE_STATUT_INVALIDE":
      return 400;

    // 403 — Forbidden (cross-tenant)
    case "CASIER_PRESSING_MISMATCH":
      return 403;

    // 404 — Not Found
    case "CASIER_INTROUVABLE":
    case "ARTICLE_INTROUVABLE":
      return 404;

    // 409 — Conflict (casier déjà occupé)
    case "CASIER_OCCUPE":
      return 409;

    // 410 — Casier inactif (désactivé par le manager)
    case "CASIER_INACTIF":
      return 410;

    // 500 — fallback
    case "RPC_ERROR":
    case "RPC_EXCEPTION":
    case "RPC_NO_DATA":
    default:
      return 500;
  }
}

// ---------------------------------------------------------------------------
// Messages d'erreur utilisateur (FR)
// ---------------------------------------------------------------------------

const ERROR_MESSAGES: Record<string, string> = {
  PRESSING_ID_REQUIS: "Identifiant de pressing manquant.",
  CASIER_CODE_REQUIS: "Code de casier manquant.",
  ARTICLE_ID_REQUIS: "Identifiant d'article manquant.",
  CASIER_INTROUVABLE: "Casier introuvable dans ce pressing.",
  ARTICLE_INTROUVABLE: "Article introuvable dans ce pressing.",
  CASIER_OCCUPE:
    "Ce casier est déjà occupé par un autre article. Libérez-le d'abord.",
  CASIER_INACTIF: "Ce casier a été désactivé et ne peut plus être utilisé.",
  CASIER_PRESSING_MISMATCH: "Ce casier n'appartient pas à votre pressing.",
  ARTICLE_STATUT_INVALIDE:
    "L'article doit être au statut 'pret' ou 'repasse' pour être rangé dans un casier.",
  RPC_ERROR: "Erreur lors de l'opération sur le casier.",
  RPC_EXCEPTION: "Exception lors de l'opération sur le casier.",
  RPC_NO_DATA: "La RPC n'a retourné aucun résultat.",
};

export function getErrorMessage(code: string, fallback?: string): string {
  return ERROR_MESSAGES[code] ?? fallback ?? "Erreur inconnue.";
}

// ---------------------------------------------------------------------------
// Wrapper — assignerCasierAtomique
// ---------------------------------------------------------------------------

/**
 * Assigne un article à un casier de manière 100 % atomique via la RPC
 * PostgreSQL `assigner_casier_atomic`.
 *
 * La RPC :
 *   1. Verrouille le casier (SELECT FOR UPDATE) — sérialise les concurrences.
 *   2. Vérifie pressing + casier actif + article valide.
 *   3. Vérifie pas d'affectation active sur le casier (sinon CASIER_OCCUPE).
 *   4. Auto-libère l'ancien casier de l'article si réaffectation.
 *   5. INSERT affectation + UPDATE zone_stockage + audit_log.
 *
 * @returns CasierResult — jamais de throw.
 */
export async function assignerCasierAtomique(
  params: AssignerCasierParams
): Promise<CasierResult> {
  try {
    const admin = getSupabaseAdmin();

    const { data, error } = await admin.rpc("assigner_casier_atomic", {
      p_pressing_id: params.pressing_id,
      p_casier_code: params.casier_code,
      p_article_id: params.article_id,
      p_affecte_par: params.affecte_par,
      p_zone: params.zone ?? null,
      p_ip_address: params.ip_address ?? null,
      p_user_agent: params.user_agent ?? null,
    });

    if (error) {
      console.error("[casiers/assignerCasierAtomique] RPC error:", error);
      // unique_violation (23505) sur l'index partiel — ne devrait pas
      // arriver car la RPC gère l'unicité via SELECT FOR UPDATE + check
      // explicite. Mais si elle arrive (race extrême), on la mappe.
      if (error.code === "23505") {
        return {
          success: false,
          code: "CASIER_OCCUPE",
          error: getErrorMessage("CASIER_OCCUPE"),
          details: {
            pg_code: error.code,
            pg_message: error.message,
            note: "Unique constraint violation — concurrent assignment won the race.",
          },
        };
      }
      return {
        success: false,
        code: "RPC_ERROR",
        error: getErrorMessage("RPC_ERROR"),
        details: { pg_code: error.code, pg_message: error.message },
      };
    }

    return (data as CasierResult) ?? {
      success: false,
      code: "RPC_NO_DATA",
      error: getErrorMessage("RPC_NO_DATA"),
    };
  } catch (err) {
    console.error(
      "[casiers/assignerCasierAtomique] Exception:",
      err instanceof Error ? err.message : String(err)
    );
    return {
      success: false,
      code: "RPC_EXCEPTION",
      error: getErrorMessage("RPC_EXCEPTION"),
    };
  }
}

// ---------------------------------------------------------------------------
// Wrapper — libererCasierAtomique
// ---------------------------------------------------------------------------

/**
 * Libère un casier de manière 100 % atomique via la RPC PostgreSQL
 * `liberer_casier_atomic`.
 *
 * Idempotente : si le casier est déjà libre, retourne CASIER_DEJA_LIBRE
 * (success=true).
 *
 * @returns CasierResult — jamais de throw.
 */
export async function libererCasierAtomique(
  params: LibererCasierParams
): Promise<CasierResult> {
  try {
    const admin = getSupabaseAdmin();

    const { data, error } = await admin.rpc("liberer_casier_atomic", {
      p_pressing_id: params.pressing_id,
      p_casier_code: params.casier_code,
      p_libere_par: params.libere_par,
      p_motif: params.motif ?? null,
      p_ip_address: params.ip_address ?? null,
      p_user_agent: params.user_agent ?? null,
    });

    if (error) {
      console.error("[casiers/libererCasierAtomique] RPC error:", error);
      return {
        success: false,
        code: "RPC_ERROR",
        error: getErrorMessage("RPC_ERROR"),
        details: { pg_code: error.code, pg_message: error.message },
      };
    }

    return (data as CasierResult) ?? {
      success: false,
      code: "RPC_NO_DATA",
      error: getErrorMessage("RPC_NO_DATA"),
    };
  } catch (err) {
    console.error(
      "[casiers/libererCasierAtomique] Exception:",
      err instanceof Error ? err.message : String(err)
    );
    return {
      success: false,
      code: "RPC_EXCEPTION",
      error: getErrorMessage("RPC_EXCEPTION"),
    };
  }
}

// ---------------------------------------------------------------------------
// Helper — extraction IP depuis NextRequest
// ---------------------------------------------------------------------------

/**
 * Extrait l'adresse IP du client depuis une NextRequest.
 * Priorité : X-Forwarded-For > x-real-ip > null.
 */
export function extractIpAddressFromRequest(
  headers: Headers
): string | null {
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return null;
}
