/**
 * e-pressing — Helper création de commande atomique
 * ==================================================
 * Wrapper TypeScript autour de la RPC PostgreSQL `create_commande_atomic`.
 *
 * LE SERVEUR EST L'UNIQUE AUTORITÉ FINANCIÈRE :
 *   - Aucun montant (sous-total, remise, total, acompte) fourni par le
 *     frontend n'est trusté. La RPC recalcule TOUT à partir des
 *     services.prix / tarifs_articles / prix custom.
 *   - Le frontend fournit uniquement : liste d'articles (service_id +
 *     catalogue_article_id + couleur + etat + quantite + is_custom +
 *     prix_unitaire optionnel), remise (type + valeur), acompte
 *     (montant + methode + reference).
 *   - La RPC valide tout, insère tout en une transaction, et rollback
 *     automatiquement si une erreur se produit à n'importe quelle
 *     étape (RAISE EXCEPTION → PostgreSQL ROLLBACK).
 *
 * IDEMPOTENCE :
 *   - Si `idempotency_key` est fournie, la RPC fait un SELECT FOR UPDATE
 *     sur (pressing_id, idempotence_key). Si une commande existe déjà,
 *     elle est retournée avec code='IDEMPOTENT_REPLAY' (success=true).
 *   - Le SELECT FOR UPDATE verrouille la ligne pendant la durée de la
 *     transaction → 2 requêtes concurrentes avec la même clé se
 *     sérialisent (la 2e attend que la 1e commit, puis voit la ligne
 *     et la retourne en replay).
 *
 * SÉCURITÉ :
 *   - La RPC est SECURITY INVOKER + REVOKE EXECUTE FROM anon/authenticated.
 *     Elle ne peut être appelée que par service_role (via
 *     getSupabaseAdmin()) → bypass RLS. Les contrôles de pressing_id
 *     sont explicites dans le SQL (defense-in-depth).
 */
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type {
  CouleurVetement,
  EtatVetement,
  MethodePaiement,
  RemiseType,
} from "@/lib/types/database.types";

// ---------------------------------------------------------------------------
// Types — inputs (ce que le frontend fournit, validé par l'API route)
// ---------------------------------------------------------------------------

export interface ArticleInputRpc {
  service_id: string;
  /** Optionnel (colonne nullable en DB). Si absent, services.prix est utilisé. */
  catalogue_article_id?: string;
  /** Optionnel. Si absent, le nom du service est utilisé comme fallback. */
  catalogue_article_nom?: string;
  couleur: CouleurVetement;
  couleur_libre?: string | null;
  etat: EtatVetement;
  description_etat?: string | null;
  quantite: number;
  /** Article personnalisé (prix libre saisi par l'opérateur). */
  is_custom?: boolean;
  /** Prix unitaire forcé. Utilisé seulement si is_custom=true. */
  prix_unitaire?: number;
}

export interface RemiseInputRpc {
  type: RemiseType;
  valeur: number;
}

export interface AcompteInputRpc {
  montant: number;
  methode: MethodePaiement;
  reference?: string | null;
}

export interface CreateCommandeAtomiqueParams {
  pressing_id: string;
  user_id: string | null;
  personnel_id: string;
  role: string;
  client_id: string;
  date_pret_prevue: string; // ISO date
  notes?: string | null;
  priorite?: "normal" | "express";
  idempotence_key?: string | null;
  articles: ArticleInputRpc[];
  remise?: RemiseInputRpc | null;
  acompte?: AcompteInputRpc | null;
  ip_address?: string | null;
  user_agent?: string | null;
}

// ---------------------------------------------------------------------------
// Types — résultat (ce que la RPC retourne)
// ---------------------------------------------------------------------------

export interface CreateCommandeAtomiqueData {
  id: string;
  pressing_id: string;
  numero_commande: string;
  montant_total: number;
  montant_paye: number;
  montant_total_avant_remise: number;
  montant_remise: number;
  remise_type: RemiseType;
  remise_valeur: number;
  statut: string;
  statut_paiement: string;
  priorite: string;
  date_pret_prevue: string;
  date_retrait: string;
}

export interface CreateCommandeAtomiqueResult {
  success: boolean;
  code: string;
  error?: string;
  details?: Record<string, unknown>;
  data?: CreateCommandeAtomiqueData;
}

// ---------------------------------------------------------------------------
// Mapper : statut HTTP à partir du code RPC
// ---------------------------------------------------------------------------

/**
 * Mappe un code de retour RPC → statut HTTP approprié.
 * Permet à l'API route de rester un orchestreur mince.
 */
export function codeRpcToHttpStatus(code: string): number {
  switch (code) {
    // Success
    case "COMMANDE_CREEE":
      return 201;
    case "IDEMPOTENT_REPLAY":
      return 200;

    // 400 — Bad Request (validation input)
    case "ARTICLES_VIDES":
    case "CLIENT_ID_REQUIS":
    case "DATE_PRET_REQUISE":
    case "NOTES_TOO_LONG":
    case "PRIORITE_INVALIDE":
    case "IDEMPOTENCE_KEY_TOO_LONG":
    case "ARTICLE_INVALIDE":
    case "ACOMPTE_INVALIDE":
    case "ACOMPTE_DEPASSE_TOTAL":
    case "SERVICE_INTROUVABLE":
    case "SERVICE_INACTIF":
    case "CATALOGUE_INTROUVABLE":
    case "CATALOGUE_INACTIF":
      return 400;

    // 403 — Forbidden (rôle / cross-tenant)
    case "ROLE_INSUFFISANT":
    case "REMISE_EXCEPTIONNELLE_REQUIERT_MANAGER":
    case "FIDELITE_PCT_INVALIDE":
      return 403;

    // 404 — Not Found
    case "CLIENT_INTROUVABLE":
      return 404;

    // 409 — Conflict (concurrence)
    case "PRESSING_MISMATCH":
      return 409;

    // 400 — erreurs remise propagées depuis calculer_remise_atomique
    case "POURCENTAGE_INVALIDE":
    case "POURCENTAGE_100_REFUSE":
    case "POURCENTAGE_DEPASSE_MAX":
    case "MONTANT_FIXE_INVALIDE":
    case "INDEX_ARTICLE_INVALIDE":
    case "ARTICLES_MANQUANTS":
    case "TYPE_REMISE_INVALIDE":
    case "MONTANT_INVALIDE":
      return 400;

    // 500 — fallback
    case "RPC_ERROR":
    case "RPC_EXCEPTION":
    case "RPC_NO_DATA":
    default:
      return 500;
  }
}

// ---------------------------------------------------------------------------
// Wrapper — appelle la RPC et normalise le résultat
// ---------------------------------------------------------------------------

/**
 * Crée une commande de manière 100 % atomique via la RPC PostgreSQL
 * `create_commande_atomic`. Toute la logique (validation client,
 * services, catalogue, tarifs, calcul sous-total/remise/total, INSERT
 * commande + lignes + articles + acompte + audit_log) s'exécute en une
 * seule transaction SQL.
 *
 * En cas d'erreur à n'importe quelle étape, PostgreSQL ROLLBACK
 * automatiquement — aucune commande orpheline, aucun paiement sans
 * commande, aucun article sans ligne.
 *
 * @returns CreateCommandeAtomiqueResult — jamais de throw.
 */
export async function createCommandeAtomique(
  params: CreateCommandeAtomiqueParams
): Promise<CreateCommandeAtomiqueResult> {
  try {
    const admin = getSupabaseAdmin();

    // Construit le payload JSONB pour les articles (la RPC attend un
    // tableau JSONB, pas un type composite — PostgREST le convertit).
    const articlesJson = params.articles.map((a) => ({
      service_id: a.service_id,
      catalogue_article_id: a.catalogue_article_id,
      catalogue_article_nom: a.catalogue_article_nom,
      couleur: a.couleur,
      couleur_libre: a.couleur_libre ?? null,
      etat: a.etat,
      description_etat: a.description_etat ?? null,
      quantite: a.quantite,
      is_custom: a.is_custom ?? false,
      prix_unitaire: a.prix_unitaire ?? null,
    }));

    const remiseJson = params.remise
      ? {
          type: params.remise.type,
          valeur: params.remise.valeur,
        }
      : null;

    const acompteJson = params.acompte
      ? {
          montant: params.acompte.montant,
          methode: params.acompte.methode,
          reference: params.acompte.reference ?? null,
        }
      : null;

    const { data, error } = await admin.rpc("create_commande_atomic", {
      p_pressing_id: params.pressing_id,
      p_user_id: params.user_id,
      p_personnel_id: params.personnel_id,
      p_role: params.role,
      p_client_id: params.client_id,
      p_date_pret_prevue: params.date_pret_prevue,
      p_notes: params.notes ?? null,
      p_priorite: params.priorite ?? "normal",
      p_idempotence_key: params.idempotence_key ?? null,
      p_articles_json: articlesJson,
      p_remise: remiseJson,
      p_acompte: acompteJson,
      p_ip_address: params.ip_address ?? null,
      p_user_agent: params.user_agent ?? null,
    });

    if (error) {
      console.error(
        "[financial/createCommandeAtomique] RPC error:",
        error
      );
      // Si l'erreur est une unique_violation (23505) sur idempotence_key
      // → 2 requêtes concurrentes avec la même clé ont été tentées, la
      // 2e a perdu la course. L'appelant peut retry pour récupérer le
      // replay (la commande existe maintenant).
      if (error.code === "23505") {
        return {
          success: false,
          code: "IDEMPOTENCE_RACE_CONDITION",
          error:
            "Une commande avec cette clé d'idempotence vient d'être créée par une requête concurrente. Réessayez pour obtenir le replay.",
          details: { pg_code: error.code, pg_message: error.message },
        };
      }
      return {
        success: false,
        code: "RPC_ERROR",
        error: "Erreur lors de l'appel à la RPC de création de commande.",
        details: { pg_code: error.code, pg_message: error.message },
      };
    }

    return (data as CreateCommandeAtomiqueResult) ?? {
      success: false,
      code: "RPC_NO_DATA",
      error: "La RPC n'a retourné aucun résultat.",
    };
  } catch (err) {
    console.error(
      "[financial/createCommandeAtomique] Exception:",
      err instanceof Error ? err.message : String(err)
    );
    return {
      success: false,
      code: "RPC_EXCEPTION",
      error: "Exception lors de l'appel à la RPC de création de commande.",
    };
  }
}
