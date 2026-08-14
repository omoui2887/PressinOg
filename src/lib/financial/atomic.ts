/**
 * e-pressing — Helper financier (moteur atomique)
 * ===============================================
 * Centralise les appels aux RPC PostgreSQL atomiques pour les paiements
 * et remises. Le serveur est l'unique autorité financière — le frontend
 * ne fait jamais de SELECT + INSERT non atomique.
 *
 * Toutes les fonctions ici utilisent getSupabaseAdmin() (service_role)
 * pour bypasser la RLS, car les RPC sont SECURITY INVOKER et les
 * contrôles de pressing_id sont explicites dans le SQL.
 *
 * Sécurité :
 *   - idempotency_key (UUID) pour les paiements → anti double-clic/retry
 *   - SELECT FOR UPDATE côté SQL → anti concurrence (2 caissiers)
 *   - Calcul du reste réel côté SQL → anti manipulation frontend
 *   - Vérification rôle côté SQL (defense-in-depth)
 */
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { MethodePaiement } from "@/lib/types/database.types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EncaisserPaiementParams {
  commande_id: string;
  pressing_id: string;
  user_id: string; // auth.users.id
  personnel_id: string; // personnel.id
  montant: number;
  methode: MethodePaiement;
  reference?: string | null;
  notes?: string | null;
  idempotency_key?: string | null;
}

export interface EncaisserPaiementResult {
  success: boolean;
  code: string;
  error?: string;
  details?: Record<string, unknown>;
  data?: {
    paiement_id: string;
    commande_id: string;
    montant: number;
    methode: MethodePaiement;
    date_paiement: string;
    reference: string | null;
    est_acompte: boolean;
    nouveau_montant_paye: number;
    nouveau_statut_paiement: string;
    reste_a_payer: number;
    montant_total: number;
    points_gagnes: number;
    replay: boolean;
  };
}

export interface AnnulerPaiementParams {
  paiement_id: string;
  pressing_id: string;
  user_id: string;
  personnel_id: string;
  motif: string;
  role: string;
}

export interface AnnulerPaiementResult {
  success: boolean;
  code: string;
  error?: string;
  details?: Record<string, unknown>;
  data?: {
    paiement_id: string;
    commande_id: string;
    montant_annule: number;
    nouveau_montant_paye: number;
    nouveau_statut_paiement: string;
    reste_a_payer: number;
  };
}

// ---------------------------------------------------------------------------
// Paiement atomique
// ---------------------------------------------------------------------------

/**
 * Encaisse un paiement de manière atomique via la RPC PostgreSQL
 * `encaisser_paiement_atomic`. Toute la logique (verrou, vérif statut,
 * calcul reste, refus dépassement, INSERT, recalcul, points fidélité)
 * s'exécute en une seule transaction SQL.
 *
 * Idempotence : si `idempotency_key` est fournie et qu'un paiement
 * existe déjà avec cette clé pour cette commande, la RPC retourne
 * le paiement existant (success=true, code='IDEMPOTENT_REPLAY').
 *
 * @returns EncaisserPaiementResult — jamais de throw.
 */
export async function encaisserPaiementAtomique(
  params: EncaisserPaiementParams
): Promise<EncaisserPaiementResult> {
  try {
    const admin = getSupabaseAdmin();

    const { data, error } = await admin.rpc("encaisser_paiement_atomic", {
      p_commande_id: params.commande_id,
      p_pressing_id: params.pressing_id,
      p_user_id: params.user_id,
      p_personnel_id: params.personnel_id,
      p_montant: params.montant,
      p_methode: params.methode,
      p_reference: params.reference ?? null,
      p_notes: params.notes ?? null,
      p_idempotency_key: params.idempotency_key ?? null,
    });

    if (error) {
      console.error(
        "[financial/encaisserPaiementAtomique] RPC error:",
        error
      );
      return {
        success: false,
        code: "RPC_ERROR",
        error: "Erreur lors de l'appel à la RPC d'encaissement.",
        details: { pg_code: error.code, pg_message: error.message },
      };
    }

    // La RPC retourne toujours un JSONB avec success + code (+ data | error)
    return (data as EncaisserPaiementResult) ?? {
      success: false,
      code: "RPC_NO_DATA",
      error: "La RPC n'a retourné aucun résultat.",
    };
  } catch (err) {
    console.error(
      "[financial/encaisserPaiementAtomique] Exception:",
      err instanceof Error ? err.message : String(err)
    );
    return {
      success: false,
      code: "RPC_EXCEPTION",
      error: "Exception lors de l'appel à la RPC d'encaissement.",
    };
  }
}

// ---------------------------------------------------------------------------
// Annulation paiement (reversal)
// ---------------------------------------------------------------------------

/**
 * Annule un paiement de manière atomique. Le paiement n'est JAMAIS supprimé —
 * il est marqué `statut_row='annule'` et une écriture de reversal est créée
 * dans `paiement_annulations`. Seul le manager peut annuler (vérifié côté SQL).
 *
 * @returns AnnulerPaiementResult — jamais de throw.
 */
export async function annulerPaiementAtomique(
  params: AnnulerPaiementParams
): Promise<AnnulerPaiementResult> {
  try {
    const admin = getSupabaseAdmin();

    const { data, error } = await admin.rpc("annuler_paiement", {
      p_paiement_id: params.paiement_id,
      p_pressing_id: params.pressing_id,
      p_user_id: params.user_id,
      p_personnel_id: params.personnel_id,
      p_motif: params.motif,
      p_role: params.role,
    });

    if (error) {
      console.error("[financial/annulerPaiementAtomique] RPC error:", error);
      return {
        success: false,
        code: "RPC_ERROR",
        error: "Erreur lors de l'appel à la RPC d'annulation.",
        details: { pg_code: error.code, pg_message: error.message },
      };
    }

    return (data as AnnulerPaiementResult) ?? {
      success: false,
      code: "RPC_NO_DATA",
      error: "La RPC n'a retourné aucun résultat.",
    };
  } catch (err) {
    console.error(
      "[financial/annulerPaiementAtomique] Exception:",
      err instanceof Error ? err.message : String(err)
    );
    return {
      success: false,
      code: "RPC_EXCEPTION",
      error: "Exception lors de l'appel à la RPC d'annulation.",
    };
  }
}

// ---------------------------------------------------------------------------
// Remise atomique (calcul côté serveur)
// ---------------------------------------------------------------------------

export interface CalculerRemiseParams {
  pressing_id: string;
  montant_avant_remise: number;
  remise_type:
    | "aucune"
    | "pourcentage"
    | "montant_fixe"
    | "article_gratuit"
    | "fidelite";
  remise_valeur: number;
  role_utilisateur: string;
  articles_json?: Array<{
    prix_unitaire: number;
    quantite: number;
  }> | null;
}

export interface CalculerRemiseResult {
  success: boolean;
  code: string;
  error?: string;
  details?: Record<string, unknown>;
  montant_remise?: number;
  remise_type_appliquee?: string;
  remise_valeur_appliquee?: number;
}

/**
 * Calcule le montant de remise côté serveur via la RPC
 * `calculer_remise_atomique`. Valide le rôle, les seuils, le % max,
 * l'index article. Le frontend ne fait QUE fournir le type + la valeur
 * (ou rien pour fidelite — calculé séparément).
 *
 * @returns CalculerRemiseResult — jamais de throw.
 */
export async function calculerRemiseAtomique(
  params: CalculerRemiseParams
): Promise<CalculerRemiseResult> {
  try {
    const admin = getSupabaseAdmin();

    const { data, error } = await admin.rpc("calculer_remise_atomique", {
      p_pressing_id: params.pressing_id,
      p_montant_avant_remise: params.montant_avant_remise,
      p_remise_type: params.remise_type,
      p_remise_valeur: params.remise_valeur,
      p_role_utilisateur: params.role_utilisateur,
      p_articles_json: params.articles_json ?? null,
    });

    if (error) {
      console.error("[financial/calculerRemiseAtomique] RPC error:", error);
      return {
        success: false,
        code: "RPC_ERROR",
        error: "Erreur lors de l'appel à la RPC de remise.",
        details: { pg_code: error.code, pg_message: error.message },
      };
    }

    return (data as CalculerRemiseResult) ?? {
      success: false,
      code: "RPC_NO_DATA",
      error: "La RPC n'a retourné aucun résultat.",
    };
  } catch (err) {
    console.error(
      "[financial/calculerRemiseAtomique] Exception:",
      err instanceof Error ? err.message : String(err)
    );
    return {
      success: false,
      code: "RPC_EXCEPTION",
      error: "Exception lors de l'appel à la RPC de remise.",
    };
  }
}

// ---------------------------------------------------------------------------
// Remise fidélité automatique
// ---------------------------------------------------------------------------

/**
 * Calcule le % de remise fidélité automatique pour un client.
 * Règle (par défaut, configurable par pressing) :
 *   - >= 100 points → 5%
 *   - >= 50 points → 3%
 *   - sinon → 0%
 *
 * Le client ne choisit jamais la valeur — elle est déterminée par son
 * solde de points et la config du pressing.
 */
export async function calculerRemiseFideliteAuto(
  pressing_id: string,
  client_id: string
): Promise<number> {
  try {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin.rpc("calculer_remise_fidelite_auto", {
      p_pressing_id: pressing_id,
      p_client_id: client_id,
    });
    if (error) {
      console.error(
        "[financial/calculerRemiseFideliteAuto] RPC error:",
        error
      );
      return 0;
    }
    return typeof data === "number" ? data : 0;
  } catch (err) {
    console.error(
      "[financial/calculerRemiseFideliteAuto] Exception:",
      err instanceof Error ? err.message : String(err)
    );
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Helper : génère un UUID v4 pour l'idempotency_key
// ---------------------------------------------------------------------------

/**
 * Génère un UUID v4 pour l'idempotency_key côté client (frontend).
 * Le frontend génère la clé, l'envoie avec la requête, et en cas de
 * retry (double-clic, timeout réseau), la même clé est renvoyée →
 * la RPC retourne le paiement existant sans en créer un nouveau.
 *
 * Utilise crypto.randomUUID() (disponible dans tous les navigateurs
 * modernes et Node 19+). Fallback manuel si indisponible.
 */
export function generateIdempotencyKey(): string {
  try {
    if (
      typeof crypto !== "undefined" &&
      typeof crypto.randomUUID === "function"
    ) {
      return crypto.randomUUID();
    }
  } catch {
    // fallback ci-dessous
  }
  // Fallback manuel (navigateurs très anciens)
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
