/**
 * e-pressing — API /api/admin/commandes/[id]/retirer (POST) — FIX-WAVE1-A #2
 * -----------------------------------------------------------------------
 * Marque une commande comme "retire" (client a récupéré sa commande au
 * pressing). Action en masse (bulk) : tous les articles_vetements de la
 * commande passent à statut='retire', et la commande passe à 'retire'.
 *
 * PRD §6.4 — "retire — Récept./Caissier — Client retiré au pressing".
 *
 * Rôles autorisés (CAN_RETIRER_COMMANDES) : manager / receptionniste /
 * caissier. Le manager (admin pressing) est inclus pour override.
 *
 * Statuts sources autorisés : {pret, en_livraison}.
 *   - pret → retire : le client vient retirer au pressing au lieu de la
 *     faire livrer (le workflow classique).
 *   - en_livraison → retire : le client change d'avis en cours de livraison
 *     et vient retirer au pressing (cas spécial géré par ce endpoint —
 *     sans lui, la transition était impossible car le trigger
 *     `deriver_statut_commande` ignore les changements d'article quand la
 *     commande est déjà 'en_livraison'/'livre'/'retire').
 *
 * ⚙️ LOGIQUE :
 *   1. Auth + role check (CAN_RETIRER_COMMANDES).
 *   2. Fetch la commande (RLS isole par pressing_id).
 *   3. Vérifie le statut courant ∈ {pret, en_livraison} (workflow guard
 *      via `canTransitionCommande`).
 *   4. Bulk UPDATE articles_vetements SET statut='retire', zone_stockage
 *      NULL, date_rangeement NULL, rangee_par NULL (libération casiers)
 *      WHERE commande_id = :commandeId.
 *      → Le trigger `deriver_statut_commande` se déclenche MAIS ne fait
 *        rien si cmd.statut ∈ ('en_livraison','livre','retire'). Donc :
 *   5. UPDATE commandes SET statut='retire', date_retrait=NOW() WHERE id =
 *      :commandeId. (Le trigger DB-level `check_commande_statut_transition`
 *      validera que la transition pret→retire ou en_livraison→retire est
 *      autorisée — sinon il lèvera une exception.)
 *   6. Re-fetch la commande pour retourner l'état final.
 *
 * Réponse : { success: true, data: { id, statut, date_retrait, updated_at } }
 *
 * Codes d'erreur :
 *   400 — Corps invalide (JSON attendu)
 *   401 — Non authentifié
 *   403 — Accès refusé (rôle insuffisant / compte inactif)
 *   404 — Commande introuvable (ou hors pressing via RLS)
 *   409 — La commande n'est pas dans un statut permettant le retrait
 *   500 — Erreur serveur (Supabase)
 *
 * 🔒 SÉCURITÉ :
 *   - getSupabaseServer() (anon + JWT) → RLS `isolation_pressing`.
 *   - Le personnel ne peut retirer que les commandes de son pressing.
 *   - Audit #8 : les erreurs Supabase sont masquées au client (log serveur).
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  CAN_RETIRER_COMMANDES,
  getCurrentPersonnel,
  hasRole,
  isPersonnelActive,
} from "@/lib/auth/roles";
import { canTransitionCommande } from "@/lib/workflow/commande-statut";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * Statuts à partir desquels une commande peut être marquée comme retirée.
 * Per PRD §6.4 + matrice `TRANSITIONS_COMMANDE_AUTORISEES` :
 *   - pret         → retire ✅ (workflow classique)
 *   - en_livraison → retire ✅ (client change d'avis en cours de livraison)
 * Les autres transitions vers 'retire' sont déjà couvertes par la matrice
 * (recu/en_traitement/lave/repasse → retire), mais PRD §6.4 restreint
 * sémantiquement le retrait au client aux statuts "pret" (commande finie)
 * ou "en_livraison" (commande en cours de livraison, client vient l'annuler
 * et retirer sur place).
 */
const STATUTS_SOURCES_RETRAIT_AUTORISES = new Set<string>([
  "pret",
  "en_livraison",
]);

export async function POST(_request: NextRequest, { params }: RouteParams) {
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

  // Role guard (PRD §6.4) — caissier / réceptionniste / manager uniquement.
  if (!hasRole(me, CAN_RETIRER_COMMANDES)) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Accès refusé — rôle insuffisant pour marquer une commande comme retirée (Caissier/Réceptionniste/Manager requis).",
      },
      { status: 403 }
    );
  }

  const { id: commandeId } = await params;

  // ---------- 1. Fetch la commande (RLS isole par pressing) ----------
  const { data: cmd, error: cmdErr } = await supabase
    .from("commandes")
    .select("id, statut")
    .eq("id", commandeId)
    .maybeSingle();

  if (cmdErr) {
    console.error(
      "[api/admin/commandes/[id]/retirer] Erreur SELECT commande:",
      cmdErr
    );
    // Sécurité (audit #8) : masque le message Supabase au client.
    return NextResponse.json(
      { success: false, error: "Erreur interne du serveur" },
      { status: 500 }
    );
  }
  if (!cmd) {
    // RLS a filtré la commande (hors pressing) OU elle n'existe pas.
    // On renvoie 404 sans distinguer les deux cas (sécurité).
    return NextResponse.json(
      { success: false, error: "Commande introuvable ou accès refusé." },
      { status: 404 }
    );
  }

  // ---------- 2. Vérification du statut courant (PRD §6.4) ----------
  if (!STATUTS_SOURCES_RETRAIT_AUTORISES.has(cmd.statut)) {
    return NextResponse.json(
      {
        success: false,
        error: `Retrait impossible : la commande est au statut '${cmd.statut}'. Seules les commandes 'pret' ou 'en_livraison' peuvent être retirées par le client.`,
        code: "INVALID_RETRAIT_STATUT",
        details: { statut_actuel: cmd.statut },
      },
      { status: 409 }
    );
  }

  // Defense-in-depth : vérifie aussi via la matrice canonique (utile si la
  // matrice évolue — par exemple si 'pret' → 'retire' est retiré).
  if (!canTransitionCommande(cmd.statut, "retire")) {
    return NextResponse.json(
      {
        success: false,
        code: "INVALID_TRANSITION",
        error: `Transition de statut non autorisée: ${cmd.statut} → retire`,
      },
      { status: 409 }
    );
  }

  // ---------- 3. Bulk UPDATE articles_vetements.statut = 'retire' ----------
  // On vide aussi zone_stockage/date_rangeement/rangee_par pour libérer les
  // casiers physiques (cohérent avec PATCH article unique). La DB accepte
  // ces colonnes si la migration 015 est appliquée (sinon PostgREST remonte
  // une erreur 4D03 — on la logue mais on continue car le statut article est
  // le champ critique).
  const nowIso = new Date().toISOString();

  const { error: artsErr } = await supabase
    .from("articles_vetements")
    .update({
      statut: "retire",
      zone_stockage: null,
      date_rangeement: null,
      rangee_par: null,
      updated_at: nowIso,
    })
    .eq("commande_id", commandeId)
    .neq("statut", "retire"); // on évite l'UPDATE inutile des articles déjà retire

  if (artsErr) {
    // La colonne zone_stockage n'existe peut-être pas (migration 015 non
    // appliquée) → on retente avec un UPDATE simple (statut uniquement).
    const { error: artsErrMin } = await supabase
      .from("articles_vetements")
      .update({ statut: "retire", updated_at: nowIso })
      .eq("commande_id", commandeId)
      .neq("statut", "retire");

    if (artsErrMin) {
      console.error(
        "[api/admin/commandes/[id]/retirer] Erreur UPDATE articles_vetements:",
        artsErrMin
      );
      return NextResponse.json(
        { success: false, error: "Erreur interne du serveur" },
        { status: 500 }
      );
    }
  }

  // ---------- 4. UPDATE commandes.statut = 'retire' ----------
  // Le trigger `deriver_statut_commande` (qui écoute sur articles_vetements)
  // ne recalculera PAS le statut de la commande si cmd.statut ∈
  // ('en_livraison','livre','retire') (cf. migration 005 ligne 285). Donc
  // pour le cas 'en_livraison → retire', on DOIT mettre à jour
  // explicitement commandes.statut.
  // Pour le cas 'pret → retire', le trigger se déclenche (statut='pret' pas
  // dans la liste ignorée) et dérive automatiquement 'retire'. On fait quand
  // même l'UPDATE pour la cohérence (le trigger DB-level
  // `check_commande_statut_transition` vérifiera que la transition est
  // autorisée — elle l'est, cf. matrice 029). En cas de no-op (statut déjà
  // 'retire'), l'UPDATE ne fait rien.
  const { data: cmdUpdated, error: updateErr } = await supabase
    .from("commandes")
    .update({
      statut: "retire",
      date_retrait: nowIso,
      updated_at: nowIso,
    })
    .eq("id", commandeId)
    .select("id, statut, date_retrait, updated_at")
    .maybeSingle();

  if (updateErr || !cmdUpdated) {
    console.error(
      "[api/admin/commandes/[id]/retirer] Erreur UPDATE commandes:",
      updateErr
    );
    return NextResponse.json(
      { success: false, error: "Erreur interne du serveur" },
      { status: 500 }
    );
  }

  // ---------- 5. Réponse succès ----------
  return NextResponse.json({
    success: true,
    data: cmdUpdated,
  });
}
