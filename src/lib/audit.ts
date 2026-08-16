/**
 * e-pressing — Utilitaire d'audit logging (AUDIT-B-13)
 * ------------------------------------------------------
 * Journalise les actions sensibles dans la table `public.audit_log`
 * (créée par la migration 027_audit_log.sql).
 *
 *   Schéma audit_log :
 *     id              BIGSERIAL PK
 *     pressing_id     UUID  → pressing(id) ON DELETE CASCADE
 *     user_id         UUID  → auth.users(id) ON DELETE SET NULL
 *     action          TEXT  NOT NULL  (ex: 'create_commande', 'cancel_commande')
 *     entity_type     TEXT            (ex: 'commande', 'personnel', 'abonnement')
 *     entity_id       TEXT            (UUID en TEXT — types variables)
 *     before_state    JSONB           (snapshot AVANT, NULL si création)
 *     after_state     JSONB           (snapshot APRÈS, NULL si suppression)
 *     ip_address      INET
 *     user_agent      TEXT
 *     created_at      TIMESTAMPTZ DEFAULT NOW()
 *
 *   RLS :
 *     - SELECT : Super Admin OU personnel du pressing.
 *     - INSERT : WITH CHECK (false) → bloque tout client. Seul
 *       service_role (bypass RLS) peut insérer. C'est pourquoi on
 *       utilise getSupabaseAdmin() ici.
 *     - UPDATE / DELETE : interdits (pas de policy → deny default).
 *
 *   Robustesse :
 *     logAudit() est BEST-EFFORT. Elle ne JAMAIS throw ni casser
 *     l'appelant. Si l'insert échoue (DB indisponible, RLS mal
 *     configurée, etc.), on log en console.error et on continue.
 *     Le flux métier (création commande, etc.) ne doit JAMAIS être
 *     bloqué par un échec d'audit.
 *
 *   Usage :
 *     import { logAudit } from "@/lib/audit";
 *     await logAudit({
 *       pressing_id: "uuid-pressing",
 *       user_id: "uuid-user",
 *       action: "create_commande",
 *       entity_type: "commande",
 *       entity_id: nouvelleCommande.id,
 *       after_state: { id: nouvelleCommande.id, montant_total: 5000, ... },
 *       req,  // pour extraire ip_address + user_agent automatiquement
 *     });
 */
import type { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Entrée d'audit à journaliser. Tous les champs marqués obligatoires. */
export interface AuditEntry {
  /** UUID du pressing concerné. NULL pour actions globales Super Admin. */
  pressing_id: string | null;
  /** UUID de l'utilisateur authentifié qui a déclenché l'action. */
  user_id: string | null;
  /** Code d'action normalisé (voir liste ci-dessous). */
  action: AuditAction;
  /** Type d'entité touchée. */
  entity_type?: AuditEntityType;
  /** UUID (en TEXT) de l'entité touchée. */
  entity_id?: string | null;
  /** Snapshot JSONB AVANT l'action (pour diff). NULL si création. */
  before_state?: Record<string, unknown> | null;
  /** Snapshot JSONB APRÈS l'action (pour diff). NULL si suppression. */
  after_state?: Record<string, unknown> | null;
  /** Requête Next.js — pour extraire ip_address + user_agent. */
  req?: NextRequest | null;
}

/** Codes d'action normalisés (alignés sur README_PHASE4.md + 027_audit_log.sql). */
export type AuditAction =
  // Commandes
  | "create_commande"
  | "cancel_commande"
  | "update_commande"
  // Personnel
  | "create_personnel"
  | "update_personnel"
  | "desactive_personnel"
  | "reactivate_personnel"
  | "role_change"
  // Pressing
  | "suspend_pressing"
  | "reactivate_pressing"
  // Abonnement
  | "renew_abonnement"
  | "suspend_abonnement"
  // Paiement
  | "encaisser_paiement"
  | "annuler_paiement"
  // Remise (moteur financier atomique — migration 035/036)
  | "appliquer_remise"
  | "appliquer_remise_exceptionnelle"
  // Assignation (moteur d'assignation — migration 037)
  | "assignment_created"
  | "assignment_changed"
  | "assignment_removed"
  // Casiers (système de casiers uniques — migration 039)
  | "casier_assign"
  | "casier_release"
  // Catalogue global (Super Admin — migration 041)
  | "create_catalogue_article"
  | "update_catalogue_article"
  | "desactive_catalogue_article"
  | "reactivate_catalogue_article"
  | "upload_catalogue_icon"
  // Authentification (Super Admin — reset password global)
  | "reset_password_user";

/** Types d'entité touchées. */
export type AuditEntityType =
  | "commande"
  | "personnel"
  | "pressing"
  | "abonnement"
  | "paiement"
  | "paiement_annulation"
  | "remise"
  | "article"
  | "catalogue_article"
  | "casier"
  | "auth_user";

// ---------------------------------------------------------------------------
// Implémentation
// ---------------------------------------------------------------------------

/**
 * Journalise une action sensible dans audit_log.
 *
 * BEST-EFFORT : n'escalade jamais d'exception. En cas d'échec, log en
 * console.error et retourne silently. L'appelant n'est pas impacté.
 *
 * @returns true si l'insert a réussi, false sinon (pour tests/observabilité).
 */
export async function logAudit(entry: AuditEntry): Promise<boolean> {
  try {
    const admin = getSupabaseAdmin();

    const ip_address = entry.req ? extractIpAddress(entry.req) : null;
    const user_agent = entry.req ? entry.req.headers.get("user-agent") : null;

    const { error } = await admin.from("audit_log").insert({
      pressing_id: entry.pressing_id,
      user_id: entry.user_id,
      action: entry.action,
      entity_type: entry.entity_type ?? null,
      entity_id: entry.entity_id ?? null,
      before_state: entry.before_state ?? null,
      after_state: entry.after_state ?? null,
      ip_address,
      user_agent,
    });

    if (error) {
      console.error(
        `[audit] Échec INSERT audit_log (action=${entry.action}):`,
        error.message,
        error.code
      );
      return false;
    }
    return true;
  } catch (err) {
    // Ne JAMAIS casser le flux métier — l'audit est best-effort.
    console.error(
      `[audit] Exception lors du logging (action=${entry.action}):`,
      err instanceof Error ? err.message : String(err)
    );
    return false;
  }
}

/**
 * Extrait l'adresse IP du client depuis une NextRequest.
 *
 * Priorité : X-Forwarded-For (proxy/Vercel) > x-real-ip > fallback null.
 * Pour X-Forwarded-For, on prend le premier IP de la liste (client original).
 */
function extractIpAddress(req: NextRequest): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return null;
}
