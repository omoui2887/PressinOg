/**
 * e-pressing — Moteur d'assignation du travail (migration 037)
 * ============================================================
 * Helpers TypeScript pour l'assignation des articles de production
 * aux employés (laveur / repassage / livreur / manager).
 *
 * 🔒 SÉCURITÉ — defense-in-depth :
 *   1. L'API route (TS) valide le rôle du manager (CAN_ASSIGNER_ARTICLES),
 *      la compatibilité rôle↔poste, et appelle la RPC SQL.
 *   2. La RPC SQL `assigner_article_atomic` (migration 037) re-vérifie
 *      TOUT côté DB (same-pressing, actif, rôle compatible, FOR UPDATE).
 *   3. RLS isole par pressing_id (un employé ne voit que son pressing).
 *
 * Le filtrage "laveur ne voit que SES tâches" se fait côté serveur
 * (API route + Server Component) — JAMAIS uniquement côté frontend.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { PersonnelRole } from "@/lib/auth/roles";

/* -------------------------------------------------------------------------- */
/*  Compatibilité rôle ↔ poste de production                                  */
/* -------------------------------------------------------------------------- */

/**
 * Mapping statut d'article → rôles compatibles pour l'assignation.
 * Aligné sur la fonction SQL `role_compatible_avec_statut` (migration 037).
 *
 *   recu, en_traitement → laveur (lavage à faire)
 *   lave                → repassage (repassage à faire)
 *   repasse             → repassage (rangement casier)
 *   pret                → livreur (livraison / retrait)
 *   en_livraison        → livreur
 *   retire, livre       → aucun (terminal — assignation refusée)
 *
 * Le manager est TOUJOURS compatible (override / intervention manuelle).
 */
export const COMPATIBILITE_ROLE_STATUT: Readonly<
  Record<string, ReadonlySet<PersonnelRole>>
> = {
  recu: new Set(["laveur", "manager"]),
  en_traitement: new Set(["laveur", "manager"]),
  lave: new Set(["repassage", "manager"]),
  repasse: new Set(["repassage", "manager"]),
  pret: new Set(["livreur", "manager"]),
  en_livraison: new Set(["livreur", "manager"]),
  retire: new Set(),
  livre: new Set(),
};

/**
 * Vérifie qu'un rôle est compatible avec l'assignation d'un article
 * au statut donné. Version TS (miroir de la fonction SQL).
 *
 * @param role      Rôle du personnel cible.
 * @param statutArticle  Statut actuel de l'article.
 * @returns         true si le rôle peut être assigné à cet article.
 */
export function roleCompatibleAvecStatut(
  role: PersonnelRole | string | null | undefined,
  statutArticle: string | null | undefined
): boolean {
  if (!role || !statutArticle) return false;
  const compat = COMPATIBILITE_ROLE_STATUT[statutArticle];
  if (!compat) return false;
  return compat.has(role as PersonnelRole);
}

/**
 * Retourne la liste des rôles compatibles avec un statut d'article.
 * Utilisé pour filtrer le dropdown du personnel dans l'UI d'assignation.
 */
export function getRolesCompatibles(
  statutArticle: string | null | undefined
): PersonnelRole[] {
  if (!statutArticle) return [];
  const compat = COMPATIBILITE_ROLE_STATUT[statutArticle];
  return compat ? [...compat] : [];
}

/**
 * Libellé lisible du "poste" associé à un statut d'article.
 * Utilisé dans les messages d'erreur et l'UI.
 */
export function getPosteLabelForStatut(
  statutArticle: string | null | undefined
): string {
  if (!statutArticle) return "inconnu";
  switch (statutArticle) {
    case "recu":
    case "en_traitement":
      return "lavage";
    case "lave":
    case "repasse":
      return "repassage";
    case "pret":
    case "en_livraison":
      return "livraison";
    case "retire":
    case "livre":
      return "terminal (aucune assignation possible)";
    default:
      return "inconnu";
  }
}

/* -------------------------------------------------------------------------- */
/*  Types de retour des RPC                                                   */
/* -------------------------------------------------------------------------- */

/** Réponse de la RPC assigner_article_atomic. */
export interface AssignerArticleResult {
  success: boolean;
  /** CREATED | CHANGED | IDEMPOTENT_REPLAY | code d'erreur */
  code: string;
  error?: string;
  details?: Record<string, unknown>;
  article_id?: string;
  commande_id?: string;
  personnel_id?: string;
  message?: string;
  avant?: Record<string, unknown> | null;
  apres?: Record<string, unknown> | null;
}

/** Réponse de la RPC desassigner_article_atomic. */
export interface DesassignerArticleResult {
  success: boolean;
  code: string;
  error?: string;
  details?: Record<string, unknown>;
  article_id?: string;
  commande_id?: string;
  message?: string;
  avant?: Record<string, unknown> | null;
  apres?: Record<string, unknown> | null;
}

/* -------------------------------------------------------------------------- */
/*  Wrappers TS pour les RPC SQL                                              */
/* -------------------------------------------------------------------------- */

/**
 * Assigne (ou réassigne) un article à un employé de production via la RPC
 * SQL atomique `assigner_article_atomic`.
 *
 * @returns Le résultat structuré de la RPC (success, code, avant, apres).
 */
export async function assignerArticleAtomique(params: {
  articleId: string;
  commandeId: string;
  pressingId: string;
  personnelIdCible: string;
  assignePar: string;
  userId?: string | null;
}): Promise<AssignerArticleResult> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.rpc("assigner_article_atomic", {
    p_article_id: params.articleId,
    p_commande_id: params.commandeId,
    p_pressing_id: params.pressingId,
    p_personnel_id_cible: params.personnelIdCible,
    p_assigne_par: params.assignePar,
    p_user_id: params.userId ?? null,
  });

  if (error) {
    console.error(
      "[assignment] Erreur RPC assigner_article_atomic:",
      error.message,
      error.code
    );
    return {
      success: false,
      code: "RPC_ERROR",
      error: error.message ?? "Erreur lors de l'assignation.",
    };
  }

  return (data ?? { success: false, code: "RPC_NO_DATA" }) as AssignerArticleResult;
}

/**
 * Désassigne un article (le remet dans la file non assignée) via la RPC
 * SQL atomique `desassigner_article_atomic`.
 */
export async function desassignerArticleAtomique(params: {
  articleId: string;
  commandeId: string;
  pressingId: string;
  par: string;
  userId?: string | null;
}): Promise<DesassignerArticleResult> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.rpc("desassigner_article_atomic", {
    p_article_id: params.articleId,
    p_commande_id: params.commandeId,
    p_pressing_id: params.pressingId,
    p_par: params.par,
    p_user_id: params.userId ?? null,
  });

  if (error) {
    console.error(
      "[assignment] Erreur RPC desassigner_article_atomic:",
      error.message,
      error.code
    );
    return {
      success: false,
      code: "RPC_ERROR",
      error: error.message ?? "Erreur lors de la désassignation.",
    };
  }

  return (data ?? { success: false, code: "RPC_NO_DATA" }) as DesassignerArticleResult;
}

/* -------------------------------------------------------------------------- */
/*  Helpers de requête (listes filtrées serveur-side)                         */
/* -------------------------------------------------------------------------- */

/**
 * Récupère les IDs de commandes qui ont au moins un article assigné au
 * personnel donné. Utilisé pour filtrer la liste des commandes du laveur/
 * repassage/livreur côté serveur.
 *
 * @returns Un Set d'UUIDs de commandes, ou null en cas d'erreur.
 */
export async function getCommandeIdsAvecArticlesAssignes(
  supabase: SupabaseClient,
  personnelId: string
): Promise<Set<string> | null> {
  const { data, error } = await supabase
    .from("articles_vetements")
    .select("commande_id")
    .eq("assigne_a", personnelId);

  if (error) {
    console.error(
      "[assignment] Erreur SELECT commande_ids assignés:",
      error.message
    );
    return null;
  }

  return new Set((data ?? []).map((r) => r.commande_id as string));
}

/**
 * Mappe un code de retour RPC vers une action d'audit.
 *
 * @param code  Code retourné par la RPC (CREATED, CHANGED, REMOVED,
 *              IDEMPOTENT_REPLAY, ou code d'erreur).
 * @returns     L'action d'audit correspondante, ou null si pas d'audit
 *              (replay idempotent ou erreur).
 */
export function codeRpcToAuditAction(
  code: string
):
  | "assignment_created"
  | "assignment_changed"
  | "assignment_removed"
  | null {
  switch (code) {
    case "CREATED":
      return "assignment_created";
    case "CHANGED":
      return "assignment_changed";
    case "REMOVED":
      return "assignment_removed";
    default:
      // IDEMPOTENT_REPLAY ou erreur → pas d'audit
      return null;
  }
}

/**
 * Mappe un code d'erreur RPC vers un statut HTTP approprié.
 */
export function codeRpcToHttpStatus(code: string): number {
  switch (code) {
    case "CREATED":
    case "REMOVED":
      return 201;
    case "CHANGED":
    case "IDEMPOTENT_REPLAY":
      return 200;
    case "PARAMETRES_MANQUANTS":
    case "ARTICLE_INTROUVABLE":
    case "PERSONNEL_INTROUVABLE":
      return 404;
    case "PRESSING_MISMATCH":
    case "PERSONNEL_AUTRE_PRESSING":
      return 403;
    case "PERSONNEL_INACTIF":
      return 403;
    case "ROLE_INCOMPATIBLE":
      return 422;
    case "ASSIGNEUR_NON_MANAGER":
    case "ASSIGNEUR_INVALIDE":
      return 403;
    case "ARTICLE_TERMINAL":
      return 409;
    default:
      return 500;
  }
}
