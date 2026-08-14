/**
 * e-pressing — API /api/personnel/caissier/encaisser (POST) — CAIS-1
 * ----------------------------------------------------------------
 * Enregistre un paiement sur une commande existante.
 *
 * Body : { commande_id, montant, methode, reference?, notes?, idempotency_key? }
 *   - commande_id     : UUID de la commande (RLS isole par pressing_id)
 *   - montant         : entier > 0 en FCFA
 *   - methode         : "especes" | "mobile_money" | "carte_bancaire"
 *   - reference       : texte libre optionnel (numéro tx MOMO, 4 derniers chiffres)
 *   - notes           : texte libre optionnel (≤ 2000 chars)
 *   - idempotency_key : UUID optionnel généré côté client (anti double-clic/retry)
 *
 * 🔒 SÉCURITÉ (moteur financier atomique — migration 035) :
 *   - Auth Supabase (JWT) obligatoire
 *   - Rôle ∈ CAN_ENCAISSER_PAIEMENT (manager / réceptionniste / caissier)
 *   - RLS isole par pressing_id
 *   - RESTRICTION MODES PAIEMENT (AUDIT 9.11 / migration 019) :
 *     methode doit être (a) un enum valide ET (b) présent dans
 *     `me.modes_paiement_autorises` (JSONB par caissier).
 *
 * ⚙️ LOGIQUE ATOMIQUE (migration 035 — encaisser_paiement_atomic) :
 *   Toute la logique financière s'exécute en UNE SEULE transaction SQL :
 *     1. SELECT FOR UPDATE sur la commande (verrou pessimiste)
 *     2. Vérifie statut (pas annulée/terminée)
 *     3. Vérifie idempotency_key → si existe, retourne le paiement existant
 *     4. Calcule le reste réel = SUM(paiements actifs)
 *     5. Refuse si montant > reste + 1 (tolérance 1 FCFA)
 *     6. Vérifie règle acompte/solde (workflow)
 *     7. INSERT le paiement (statut_row='actif')
 *     8. Recalcule montant_paye + statut_paiement
 *     9. Incrémente atomiquement clients.points_fidelite
 *    10. Retourne le résultat complet
 *
 *   Protections assurées :
 *     - double clic (idempotency_key)
 *     - retry réseau (idempotency_key)
 *     - deux caissiers simultanés (SELECT FOR UPDATE)
 *     - deux onglets (idempotency_key)
 *     - timeout suivi d'un retry (idempotency_key)
 *     - manipulation frontend (calcul reste côté SQL)
 *
 * Réponse : { success: true, data: { paiement_id, commande_id, montant, methode,
 *           date_paiement, reference, nouveau_montant_paye,
 *           nouveau_statut_paiement, reste_a_payer, montant_total,
 *           points_gagnes, replay } }
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  CAN_ENCAISSER_PAIEMENT,
  type PersonnelRole,
} from "@/lib/auth/roles";
import type { MethodePaiement } from "@/lib/types/database.types";
import { logAudit } from "@/lib/audit";
import { encaisserPaiementAtomique } from "@/lib/financial/atomic";

export const dynamic = "force-dynamic";

const METHODES_VALID: readonly MethodePaiement[] = [
  "especes",
  "mobile_money",
  "carte_bancaire",
];

/**
 * Modes autorisés par défaut si le champ `modes_paiement_autorises` du
 * caissier est absent (par exemple, base pas encore migrée — migration 019).
 * On reste permissif par défaut pour ne pas bloquer l'encaissement sur une
 * base non migrée ; la migration 019 remplit explicitement cette valeur
 * pour tous les caissiers existants.
 *
 * Fix (FIX-WAVE1-A #8) — PRD §5.2 + §18.5 : seules 3 méthodes de paiement
 * sont conformes (especes, mobile_money, carte_bancaire). Avant ce fix,
 * MODES_AUTORISES_DEFAUT contenait aussi "carte", "cheque", "virement"
 * qui ne pouvaient JAMAIS passer la 1re validation `METHODES_VALID` (3
 * valeurs PRD) — dead values qui créaient de la confusion (manager pouvait
 * les proposer dans l'UI, caissier ne pouvait jamais encaisser). On les
 * retire donc de la valeur par défaut. La DB est nettoyée par la
 * migration 033_remove_dead_payment_modes.
 */
const MODES_AUTORISES_DEFAUT: readonly string[] = [
  "especes",
  "mobile_money",
  "carte_bancaire",
];

interface EncaisserBody {
  commande_id?: unknown;
  montant?: unknown;
  methode?: unknown;
  reference?: unknown;
  notes?: unknown;
  idempotency_key?: unknown;
}

/**
 * Normalise `modes_paiement_autorises` (JSONB renvoyé par Supabase).
 *
 * Le client Supabase retourne le JSONB soit :
 *   - déjà parsé en array JavaScript (cas normal),
 *   - sous forme de chaîne JSON si la conversion a échoué,
 *   - ou null/undefined si la colonne n'existe pas (pré-migration 019).
 *
 * On retourne toujours un `string[]` valide, en ignorant les éléments
 * non-string pour résister à une corruption JSONB éventuelle.
 */
function normaliserModesAutorises(raw: unknown): string[] {
  if (!raw) return [...MODES_AUTORISES_DEFAUT];
  let arr: unknown;
  if (typeof raw === "string") {
    try {
      arr = JSON.parse(raw);
    } catch {
      return [...MODES_AUTORISES_DEFAUT];
    }
  } else {
    arr = raw;
  }
  if (!Array.isArray(arr) || arr.length === 0) {
    return [...MODES_AUTORISES_DEFAUT];
  }
  const filtré = arr.filter((x): x is string => typeof x === "string");
  return filtré.length > 0 ? filtré : [...MODES_AUTORISES_DEFAUT];
}

/** Authentifie le caissier et retourne son row personnel + le client Supabase.
 *
 * ⚠️ RÉSILIENCE (FIX BUG-ENCAISSEMENT-P0) : On tente d'abord un SELECT incluant
 *    `modes_paiement_autorises` (colonne ajoutée par la migration 019). Si la
 *    colonne n'existe pas en base (base non migrée — code PGRST116/42703), on
 *    retombe sur un SELECT sans cette colonne et on utilise MODES_AUTORISES_DEFAUT.
 *    Sans cette protection, une base non migrée fait échouer SILENCIEUSEMENT le
 *    SELECT (data=null, error peuplé mais non vérifié) et l'API renvoie
 *    "Compte inactif ou désactivé" à tort, bloquant tout encaissement.
 */
type CaissierRow = {
  id: string;
  // user_id = UUID de l'auth.users du caissier. Récupéré pour le log audit
  // (table audit_log.user_id → auth.users.id). Toujours présent en base
  // (colonne NOT NULL dans personnel).
  user_id: string;
  pressing_id: string;
  role: string;
  actif: boolean | null;
  statut_compte: string;
  // AUDIT-B #14: validation modes_paiement_autorises
  // Champ optionnel car la colonne peut ne pas exister (base non migrée —
  // fallback géré par normaliserModesAutorises). Quand la migration 019 est
  // appliquée, le SELECT le renvoie en tant que `string[]` (JSONB parsé).
  modes_paiement_autorises?: string[] | string | null;
};

async function getConnectedCaissier() {
  const supabase = await getSupabaseServer();
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) {
    return {
      error: NextResponse.json(
        { success: false, error: "Non authentifié" },
        { status: 401 }
      ),
    };
  }
  // Tentative 1 : SELECT complet incluant modes_paiement_autorises (migration 019).
  let me: CaissierRow | null = null;
  let meErr: { code?: string; message?: string } | null = null;
  const primary = await supabase
    .from("personnel")
    .select(
      "id, user_id, pressing_id, role, actif, statut_compte, modes_paiement_autorises"
    )
    .eq("user_id", userData.user.id)
    .maybeSingle();
  me = (primary.data as CaissierRow | null) ?? null;
  meErr = (primary.error as { code?: string; message?: string } | null) ?? null;

  // Tentative 2 (fallback) : si la colonne modes_paiement_autorises n'existe pas
  // (base non migrée — erreur PGRST116 / code 42703), on retente sans cette
  // colonne. On utilisera MODES_AUTORISES_DEFAUT pour la validation des modes.
  if (meErr && (meErr.code === "42703" || meErr.code === "PGRST116")) {
    console.warn(
      "[api/personnel/caissier/encaisser] Colonne 'modes_paiement_autorises' absente — fallback sans modes_paiement_autorises. Exécutez la migration 019_champs_caissier.sql pour activer la restriction par caissier."
    );
    const fallback = await supabase
      .from("personnel")
      .select("id, user_id, pressing_id, role, actif, statut_compte")
      .eq("user_id", userData.user.id)
      .maybeSingle();
    me = (fallback.data as CaissierRow | null) ?? null;
    meErr = (fallback.error as { code?: string; message?: string } | null) ?? null;
    // On injecte la valeur par défaut pour que la suite du code fonctionne.
    if (me) {
      // null => normaliserModesAutorises retournera MODES_AUTORISES_DEFAUT
      me.modes_paiement_autorises = null;
    }
  }

  // Toute autre erreur SQL est logger et renvoie un 500 explicite.
  if (meErr && !(!me && (meErr.code === "PGRST116" || meErr.code === "42703"))) {
    console.error(
      "[api/personnel/caissier/encaisser] Erreur SELECT personnel:",
      meErr
    );
    return {
      error: NextResponse.json(
        { success: false, error: "Erreur lors de la vérification du compte." },
        { status: 500 }
      ),
    };
  }

  if (!me || me.actif !== true || me.statut_compte !== "actif") {
    return {
      error: NextResponse.json(
        { success: false, error: "Compte inactif ou désactivé" },
        { status: 403 }
      ),
    };
  }
  // FIX-ENCAISSE-ADMIN : avant, seul role="caissier" pouvait encaisser. On
  // accepte désormais tous les rôles listés dans CAN_ENCAISSER_PAIEMENT
  // (manager, réceptionniste, caissier) pour permettre au gérant de régler
  // le solde d'une commande partiellement payée directement depuis la page
  // détail (sans passer par l'interface caissier dédiée).
  if (!CAN_ENCAISSER_PAIEMENT.includes(me.role as PersonnelRole)) {
    return {
      error: NextResponse.json(
        {
          success: false,
          error:
            "Accès refusé — rôle insuffisant pour encaisser un paiement",
        },
        { status: 403 }
      ),
    };
  }
  return { me, supabase };
}

export async function POST(request: NextRequest) {
  const auth = await getConnectedCaissier();
  if ("error" in auth) return auth.error;
  const { me, supabase } = auth;

  let body: EncaisserBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Corps de requête invalide (JSON attendu)" },
      { status: 400 }
    );
  }

  // --- Validation des champs ---
  const commandeId =
    typeof body.commande_id === "string" ? body.commande_id.trim() : "";
  if (!commandeId) {
    return NextResponse.json(
      { success: false, error: "L'identifiant de la commande est obligatoire." },
      { status: 400 }
    );
  }

  const montant =
    typeof body.montant === "number"
      ? body.montant
      : parseInt(String(body.montant ?? "0"), 10);
  if (!Number.isFinite(montant) || !Number.isInteger(montant) || montant <= 0) {
    return NextResponse.json(
      { success: false, error: "Le montant doit être un entier positif (FCFA)." },
      { status: 400 }
    );
  }

  const methode = typeof body.methode === "string" ? body.methode : "";
  // 1re validation : format (la méthode est un enum connu).
  if (!(METHODES_VALID as readonly string[]).includes(methode)) {
    return NextResponse.json(
      { success: false, error: "Méthode de paiement invalide." },
      { status: 400 }
    );
  }

  // 2e validation (FIX AUDIT 9.11 / AUDIT-B #14: validation modes_paiement_autorises) :
  // Le caissier ne peut encaisser qu'avec un mode listé dans son champ
  // `modes_paiement_autorises` (JSONB, migration 019). Si la colonne
  // est absente/null/vide (pré-migration ou manager n'a pas encore configuré),
  // on retombe sur MODES_AUTORISES_DEFAUT (tous modes autorisés — backward
  // compatible, le manager peut restreindre plus tard).
  const modesAutorises = normaliserModesAutorises(me.modes_paiement_autorises);
  if (!modesAutorises.includes(methode)) {
    return NextResponse.json(
      {
        success: false,
        error: "Vous n'êtes pas autorisé à encaisser ce mode de paiement.",
        code: "MODE_PAIEMENT_NON_AUTORISE",
        details: {
          methode_demandee: methode,
          modes_autorises: modesAutorises,
        },
      },
      { status: 403 }
    );
  }

  const reference =
    typeof body.reference === "string" ? body.reference.trim() : null;
  const notes =
    typeof body.notes === "string" && body.notes.trim()
      ? body.notes.trim()
      : null;
  // FIX BUG-A1 (Task FIX-ENCAISSER-SUPERADMIN) : la migration 031 a posé un
  // CHECK `check_notes_max_length` sur paiements.notes (≤ 2000 caractères).
  // La RPC encaisser_paiement_atomic vérifie aussi côté SQL, mais on valide
  // en amont pour renvoyer un 400 explicite (avant l'appel SQL).
  if (notes && notes.length > 2000) {
    return NextResponse.json(
      {
        success: false,
        code: "NOTES_TOO_LONG",
        error:
          "Les notes de paiement ne peuvent pas dépasser 2000 caractères.",
      },
      { status: 400 }
    );
  }

  // --- idempotency_key (optionnelle, anti double-clic/retry) ---
  // UUID généré côté client. Si la même clé est re-soumise pour la même
  // commande, la RPC retourne le paiement existant (code='IDEMPOTENT_REPLAY').
  const idempotencyKey =
    typeof body.idempotency_key === "string" &&
    body.idempotency_key.trim()
      ? body.idempotency_key.trim().slice(0, 100)
      : null;

  // --- Récupération de l'auth.users.id pour la RPC + audit ---
  // me.user_id est déjà peuplé par getConnectedCaissier().
  const authUserId = me.user_id;

  // --- Appel à la RPC atomique encaisser_paiement_atomic ---
  // Toute la logique financière (verrou, vérif statut, calcul reste,
  // refus dépassement, INSERT, recalcul, points fidélité) s'exécute en
  // UNE SEULE transaction SQL côté PostgreSQL. Le frontend ne peut pas
  // manipuler le calcul du reste ou le statut.
  const result = await encaisserPaiementAtomique({
    commande_id: commandeId,
    pressing_id: me.pressing_id,
    user_id: authUserId,
    personnel_id: me.id,
    montant,
    methode: methode as MethodePaiement,
    reference,
    notes,
    idempotency_key: idempotencyKey,
  });

  if (!result.success || !result.data) {
    // Mappe les codes d'erreur de la RPC aux statuts HTTP appropriés.
    const code = result.code || "RPC_ERROR";
    const errorMessage = result.error || "Erreur lors de l'encaissement.";
    const details = result.details;

    // 404 : commande introuvable
    if (code === "COMMANDE_INTROUVABLE") {
      return NextResponse.json(
        { success: false, error: errorMessage, code, details },
        { status: 404 }
      );
    }
    // 403 : pressing mismatch, rôle insuffisant
    if (
      code === "PRESSING_MISMATCH" ||
      code === "ROLE_INSUFFISANT"
    ) {
      return NextResponse.json(
        { success: false, error: errorMessage, code, details },
        { status: 403 }
      );
    }
    // 409 : commande annulée, déjà payée, workflow refuse
    if (
      code === "COMMANDE_ANNULEE" ||
      code === "DEJA_PAYE" ||
      code === "WORKFLOW_PAIEMENT_REFUSE" ||
      code === "PAIEMENT_DEJAY_ANNULE"
    ) {
      return NextResponse.json(
        { success: false, error: errorMessage, code, details },
        { status: 409 }
      );
    }
    // 400 : montant invalide, dépassement, notes trop longues
    if (
      code === "MONTANT_INVALIDE" ||
      code === "MONTANT_DEPASSE_SOLDE" ||
      code === "NOTES_TOO_LONG"
    ) {
      return NextResponse.json(
        { success: false, error: errorMessage, code, details },
        { status: 400 }
      );
    }
    // Autre erreur RPC → 500
    console.error(
      "[api/personnel/caissier/encaisser] RPC error:",
      result
    );
    return NextResponse.json(
      { success: false, error: errorMessage, code, details },
      { status: 500 }
    );
  }

  const paiementData = result.data;

  // --- Audit log (AUDIT-B-13 / migration 035) ---
  // Best-effort : ne JAMAIS bloquer la réponse si l'audit échoue.
  // On log uniquement si ce n'est PAS un replay idempotent (sinon on
  // dupliquerait l'entrée audit pour le même paiement).
  if (!paiementData.replay) {
    await logAudit({
      pressing_id: me.pressing_id,
      user_id: authUserId,
      action: "encaisser_paiement",
      entity_type: "paiement",
      entity_id: paiementData.paiement_id,
      before_state: null,
      after_state: {
        paiement_id: paiementData.paiement_id,
        commande_id: paiementData.commande_id,
        montant: paiementData.montant,
        methode: paiementData.methode,
        notes,
        date_paiement: paiementData.date_paiement,
        est_acompte: paiementData.est_acompte,
        idempotency_key: idempotencyKey,
        points_gagnes: paiementData.points_gagnes,
      },
      req: request,
    });
  }

  // --- Réponse succès ---
  // Si replay (idempotent), on retourne 200 (pas 201 — pas de nouvelle ressource).
  // Sinon, 201 Created.
  return NextResponse.json(
    {
      success: true,
      data: paiementData,
    },
    { status: paiementData.replay ? 200 : 201 }
  );
}
