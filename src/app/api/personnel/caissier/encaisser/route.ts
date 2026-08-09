/**
 * OgPressing — API /api/personnel/caissier/encaisser (POST) — CAIS-1
 * ----------------------------------------------------------------
 * Enregistre un paiement sur une commande existante.
 *
 * Body : { commande_id, montant, methode, reference?, notes? }
 *   - commande_id : UUID de la commande (RLS isole par pressing_id)
 *   - montant     : entier > 0 en FCFA
 *   - methode     : "especes" | "mobile_money" | "carte_bancaire"
 *   - reference   : texte libre optionnel (numéro tx MOMO, 4 derniers chiffres)
 *   - notes       : texte libre optionnel
 *
 * 🔒 SÉCURITÉ :
 *   - Auth Supabase (JWT) obligatoire
 *   - Le personnel connecté doit avoir role="caissier", actif=true,
 *     statut_compte="actif"
 *   - RLS isole automatiquement par pressing_id : le caissier ne peut
 *     encaisser que les commandes de son propre pressing
 *   - RESTRICTION MODES PAIEMENT (AUDIT 9.11 — fix migration 019) :
 *     la méthode de paiement doit être (a) un enum valide (METHODES_VALID)
 *     ET (b) présent dans `me.modes_paiement_autorises` (JSONB array
 *     propre à chaque caissier). Un caissier peut ainsi être restreint
 *     à 'especes' + 'mobile_money' uniquement, par exemple.
 *
 * ⚙️ LOGIQUE :
 *   1. Fetch la commande par id (RLS filtre par pressing) — inclut client_id
 *   2. Valide montant > 0 et montant + montant_paye ≤ montant_total + 1
 *      (tolérance de 1 FCFA pour les arrondis, alignée sur la CHECK
 *      constraint de la table commandes)
 *   3. Calcule est_acompte = (montant + montant_paye) < montant_total
 *   4. INSERT dans `paiements` avec enregistre_par = me.id
 *   5. ⚡ Le trigger `trigger_recalculer_paiement_commande` (migration 005)
 *      recalcule AUTOMATIQUEMENT commandes.montant_paye et statut_paiement
 *      → on n'a PAS à mettre à jour la commande manuellement
 *   6. Re-fetch la commande pour retourner le nouveau solde
 *   7. FIX-HIGH-1 (GAP 2 — PRD §7.5) : incrément auto des points fidélité
 *      du client — `Math.floor(montant / 100)` points crédités sur
 *      `clients.points_fidelite`. Non-bloquant si l'UPDATE échoue.
 *
 * Réponse : { success: true, data: { paiement_id, commande_id, montant, methode,
 *           date_paiement, reference, nouveau_montant_paye,
 *           nouveau_statut_paiement, reste_a_payer, montant_total,
 *           points_gagnes } }
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import type { MethodePaiement } from "@/lib/types/database.types";
import {
  peutEncaisserAcompte,
  peutEncaisserSoldeFinal,
  paiementFermeCommande,
  STATUT_COMMANDE_LABELS,
} from "@/lib/workflow/commande-statut";

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
 */
const MODES_AUTORISES_DEFAUT: readonly string[] = [
  "especes",
  "mobile_money",
  "carte",
  "carte_bancaire",
  "cheque",
  "virement",
];

interface EncaisserBody {
  commande_id?: unknown;
  montant?: unknown;
  methode?: unknown;
  reference?: unknown;
  notes?: unknown;
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
      "id, pressing_id, role, actif, statut_compte, modes_paiement_autorises"
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
      .select("id, pressing_id, role, actif, statut_compte")
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
  if (me.role !== "caissier") {
    return {
      error: NextResponse.json(
        { success: false, error: "Accès refusé — rôle caissier requis" },
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

  // --- Fetch de la commande (RLS isole par pressing_id) ---
  // FIX-HIGH-1 (GAP 2) : on sélectionne aussi `client_id` pour pouvoir
  // incrémenter les points fidélité du client après l'INSERT du paiement.
  const { data: commande, error: cmdErr } = await supabase
    .from("commandes")
    .select(
      "id, montant_total, montant_paye, statut_paiement, statut, client_id"
    )
    .eq("id", commandeId)
    .maybeSingle();

  if (cmdErr) {
    console.error("[api/personnel/caissier/encaisser] Erreur SELECT commande:", cmdErr);
    return NextResponse.json(
      { success: false, error: "Erreur lors de la récupération de la commande." },
      { status: 500 }
    );
  }
  if (!commande) {
    return NextResponse.json(
      {
        success: false,
        error: "Commande introuvable ou accès refusé.",
      },
      { status: 404 }
    );
  }

  // --- Validation du solde ---
  const resteAPayer = commande.montant_total - commande.montant_paye;
  if (resteAPayer <= 0) {
    return NextResponse.json(
      {
        success: false,
        error: "Cette commande est déjà entièrement payée.",
      },
      { status: 409 }
    );
  }
  // Tolérance de 1 FCFA (alignée sur la CHECK constraint commandes:
  // montant_paye ≤ montant_total + 1)
  if (montant > resteAPayer + 1) {
    return NextResponse.json(
      {
        success: false,
        error: `Le montant saisi (${montant} FCFA) dépasse le reste à payer (${resteAPayer} FCFA).`,
      },
      { status: 400 }
    );
  }

  // --- Guard workflow (WORKFLOW-FIX-V1) ---
  // Le SOLDE FINAL (paiement qui ferme la commande → statut_paiement="paye")
  // n'est autorisé que si la commande est au moins "repasse" (traitement fait).
  // Les ACOMPTES (paiement partiel qui laisse un reste) sont autorisés dès
  // la création, tant que la commande n'est pas terminée.
  const fermeCommande = paiementFermeCommande(
    commande.montant_paye,
    commande.montant_total,
    montant
  );
  const statutCourant = commande.statut as string;
  const statutLabel = STATUT_COMMANDE_LABELS[statutCourant] ?? statutCourant;

  if (fermeCommande) {
    // Paiement du solde final → exige commande au moins "repasse"
    if (!peutEncaisserSoldeFinal(statutCourant)) {
      return NextResponse.json(
        {
          success: false,
          error: `Encaissement du solde final refusé : la commande est au statut "${statutLabel}" mais doit être au moins "Repassé" (lavé + repassé) avant d'être entièrement payée. Encaissez un acompte partiel, ou faites avancer la commande dans le workflow (lavage → repassage → prêt).`,
          code: "WORKFLOW_PAIEMENT_REFUSE",
          details: {
            statut_commande: statutCourant,
            montant_paye_actuel: commande.montant_paye,
            montant_total: commande.montant_total,
            montant_paiement_propose: montant,
            reste_a_payer: resteAPayer,
            statut_requis_minimum: "repasse",
          },
        },
        { status: 409 }
      );
    }
  } else {
    // Acompte partiel → autorisé tant que la commande n'est pas terminée
    if (!peutEncaisserAcompte(statutCourant)) {
      return NextResponse.json(
        {
          success: false,
          error: `Encaissement refusé : la commande est au statut terminal "${statutLabel}". Aucun paiement supplémentaire n'est possible.`,
          code: "WORKFLOW_PAIEMENT_REFUSE",
        },
        { status: 409 }
      );
    }
  }

  const estAcompte = !fermeCommande;

  // --- INSERT paiement ---
  // Le trigger `trigger_recalculer_paiement_commande` met à jour
  // automatiquement commandes.montant_paye + statut_paiement.
  // #12 — date_paiement est un timestamp serveur (UTC). On pourrait aussi
  // déléguer à la DB DEFAULT NOW() (002_tables.sql:325), mais on garde la
  // valeur explicite pour cohérence avec les autres INSERT de paiements.
  const insertPayload: Record<string, unknown> = {
    commande_id: commandeId,
    montant,
    methode,
    date_paiement: new Date().toISOString(),
    est_acompte: estAcompte,
    enregistre_par: me.id,
  };
  if (reference) insertPayload.reference = reference;
  if (notes) insertPayload.notes = notes;

  const { data: paiement, error: insertErr } = await supabase
    .from("paiements")
    .insert(insertPayload)
    .select("id, commande_id, montant, methode, date_paiement, reference")
    .maybeSingle();

  if (insertErr || !paiement) {
    console.error("[api/personnel/caissier/encaisser] Erreur INSERT paiement:", insertErr);
    // 23514 = CHECK violation (montant > 0, date_paiement ≤ NOW()+5min)
    if (insertErr && insertErr.code === "23514") {
      return NextResponse.json(
        {
          success: false,
          error: "Le paiement ne respecte pas les contraintes (montant ou date).",
        },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: "Erreur lors de l'enregistrement du paiement." },
      { status: 500 }
    );
  }

  // --- Re-fetch de la commande pour retourner le nouveau solde ---
  // (le trigger a déjà mis à jour montant_paye + statut_paiement)
  const { data: cmdUpdated } = await supabase
    .from("commandes")
    .select("montant_paye, statut_paiement, montant_total")
    .eq("id", commandeId)
    .maybeSingle();

  const nouveauMontantPaye = cmdUpdated?.montant_paye ?? commande.montant_paye + montant;
  const nouveauStatut = cmdUpdated?.statut_paiement ?? commande.statut_paiement;
  const nouveauReste = (cmdUpdated?.montant_total ?? commande.montant_total) - nouveauMontantPaye;

  // --- Incrément auto points fidélité (PRD §7.5 — 1 point = 100 FCFA payés) ---
  // FIX-HIGH-1 (GAP 2) : après l'INSERT du paiement, on crédite les points
  // fidélité du client. On fetch d'abord la valeur courante (SELECT) puis on
  // UPDATE — l'atomicité parfaite nécessiterait une RPC SQL, mais le SELECT +
  // UPDATE reste sûr ici car cette route est la seule à créditer les points
  // fidélité (pas de concurrence réaliste en pressing). RLS isole par
  // pressing_id, donc on ne peut créditer qu'un client de son propre pressing.
  // Si la mise à jour échoue (ex : RLS bloque, colonne absente), on n'échoue
  // pas le paiement — on logge juste l'erreur et on renvoie points_gagnes=0.
  let pointsGagnes = 0;
  const clientId: string | null =
    typeof commande.client_id === "string" ? commande.client_id : null;
  if (clientId) {
    pointsGagnes = Math.floor(montant / 100);
    if (pointsGagnes > 0) {
      const { data: clientRow, error: clientErr } = await supabase
        .from("clients")
        .select("id, points_fidelite")
        .eq("id", clientId)
        .maybeSingle();

      if (clientErr) {
        console.error(
          "[api/personnel/caissier/encaisser] Erreur SELECT clients (points_fidelite) — le paiement reste valide mais les points ne sont pas crédités:",
          clientErr
        );
        pointsGagnes = 0;
      } else if (clientRow) {
        const pointsActuels = (clientRow.points_fidelite as number) ?? 0;
        const { error: updateErr } = await supabase
          .from("clients")
          .update({
            points_fidelite: pointsActuels + pointsGagnes,
          })
          .eq("id", clientId);

        if (updateErr) {
          console.error(
            "[api/personnel/caissier/encaisser] Erreur UPDATE clients.points_fidelite — le paiement reste valide mais les points ne sont pas crédités:",
            updateErr
          );
          pointsGagnes = 0;
        }
      } else {
        // Client introuvable (RLS ou soft delete) — on ne crédite pas.
        pointsGagnes = 0;
      }
    }
  } else {
    // commande.client_id null (commande sans client rattaché) — pas de points.
    pointsGagnes = 0;
  }

  return NextResponse.json(
    {
      success: true,
      data: {
        paiement_id: paiement.id,
        commande_id: paiement.commande_id,
        montant: paiement.montant,
        methode: paiement.methode,
        date_paiement: paiement.date_paiement,
        reference: paiement.reference ?? null,
        nouveau_montant_paye: nouveauMontantPaye,
        nouveau_statut_paiement: nouveauStatut,
        reste_a_payer: Math.max(0, nouveauReste),
        montant_total: cmdUpdated?.montant_total ?? commande.montant_total,
        points_gagnes: pointsGagnes,
      },
    },
    { status: 201 }
  );
}
