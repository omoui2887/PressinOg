/**
 * OgPressing — API /api/admin/commandes/[id] (GET detail + PATCH update)
 * ---------------------------------------------------------------------
 * LOT 7 — détail complet d'une commande pour la page de suivi/détail :
 *   - champs de la commande
 *   - client (clients) imbriqué
 *   - cree_par_personnel (personnel!commandes_cree_par_fkey)
 *   - lignes (commande_lignes) avec service imbriqué, ordonnées par created_at ASC
 *   - articles (articles_vetements) avec assigne imbriqué, ordonnés par created_at ASC
 *   - paiements ordonnés par date_paiement DESC
 *
 * PATCH (Phase-1) :
 *   - Annulation d'une commande (#5) : `statut: "annule"` — réservé aux
 *     rôles CAN_CANCEL_COMMANDES (manager / réceptionniste / caissier).
 *     Refusée si la commande est déjà dans un statut terminal
 *     ('pret', 'livre', 'retire', 'en_livraison', 'annule') → 409.
 *   - Changement de priorité (#2) : `priorite: "normal" | "express"` —
 *     réservé aux rôles CAN_CHANGE_PRIORITE (manager / réceptionniste).
 *     Refusé si la commande n'est plus en statut 'recu' → 409.
 *   - Mise à jour des notes : `notes: string | null`.
 *   - Tous les champs fournis sont combinés en un seul UPDATE.
 *   - Verrou optimiste (#6) : le body peut contenir `expected_updated_at`
 *     (ISO string). Si fourni, on compare à `commandes.updated_at` courant ;
 *     en cas de mismatch → 409 "modifiée par un autre utilisateur". Rétro-
 *     compatible : si le champ est absent, aucun check n'est effectué.
 *
 * Réponse GET :
 *   { success: true, data: CommandeDetail }
 * Réponse PATCH :
 *   { success: true, data: { id, statut, priorite, notes, updated_at } }
 *
 * 🔒 SÉCURITÉ :
 *   - getSupabaseServer() (client anon + JWT) → RLS `isolation_pressing`
 *     isole par pressing_id. Si la commande n'existe pas ou n'appartient pas
 *     au pressing, la SELECT renvoie null → 404.
 *   - pressing_id n'est jamais trusté du client (RLS gère l'isolation).
 *   - Auth : n'importe quel personnel actif pour GET ; rôle dépendant de
 *     l'opération pour PATCH.
 *   - 401 si non authentifié, 403 si personnel inactif ou rôle insuffisant,
 *     404 si commande introuvable, 409 si l'opération n'est pas applicable.
 *   - Audit #8 : les erreurs Supabase sont masquées au client (log serveur).
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { fetchCommandeDetail } from "@/lib/queries/commande-detail";
import {
  CAN_CANCEL_COMMANDES,
  CAN_CHANGE_PRIORITE,
  getCurrentPersonnel,
  hasRole,
  isPersonnelActive,
} from "@/lib/auth/roles";
import { canTransitionCommande } from "@/lib/workflow/commande-statut";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
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

  const { id: commandeId } = await params;

  // Récupère la commande via la fonction partagée (avec fallback robuste).
  // RLS isole par pressing : si la commande n'existe pas ou n'appartient
  // pas au pressing, `commande` sera null sans `error`.
  const { commande, error } = await fetchCommandeDetail(supabase, commandeId);

  if (error) {
    console.error("[api/admin/commandes/[id]] Erreur SELECT:", error);
    // Sécurité (audit #8) : masque le message Supabase brut au client.
    return NextResponse.json(
      { success: false, error: "Erreur lors de la récupération de la commande" },
      { status: 500 }
    );
  }

  if (!commande) {
    return NextResponse.json(
      { success: false, error: "Commande introuvable" },
      { status: 404 }
    );
  }

  // Trie les relations imbriquées (PostgREST ne peut pas toujours appliquer
  // .order sur les nested tables via le select string, on trie côté JS).
  type ArticleRow = {
    id: string;
    ligne_id: string | null;
    code_qr: string | null;
    catalogue_article_id: string | null;
    couleur: string | null;
    couleur_libre: string | null;
    etat: string | null;
    description_etat: string | null;
    statut: string;
    photo_url: string | null;
    assigne_a: string | null;
    /** Colonnes de casier (migration 015). Optionnelles : absentes si
     *  la migration n'est pas appliquée (fallback ultra-minimal). */
    zone_stockage?: string | null;
    date_rangeement?: string | null;
    rangee_par?: string | null;
    range_par?: { id: string; nom_complet: string } | null;
    created_at: string;
    catalogue_article?: {
      id: string;
      nom: string;
      slug: string;
      icone_url: string | null;
    } | null;
    assigne: { id: string; nom_complet: string } | null;
  };

  type LigneRow = {
    id: string;
    service_id: string | null;
    description: string | null;
    quantite: number;
    prix_unitaire: number;
    montant_ligne: number;
    created_at: string;
    service: { id: string; nom: string; type: string | null } | null;
  };

  type PaiementRow = {
    id: string;
    montant: number;
    methode: string;
    reference: string | null;
    date_paiement: string;
    est_acompte: boolean;
    enregistre_par: string | null;
    notes: string | null;
    created_at: string;
  };

  const lignes = (commande.lignes as unknown as LigneRow[] | null) ?? [];
  const articles = (commande.articles as unknown as ArticleRow[] | null) ?? [];
  const paiements =
    (commande.paiements as unknown as PaiementRow[] | null) ?? [];

  // Tri : lignes/articles par created_at ASC, paiements par date_paiement DESC
  lignes.sort((a, b) => {
    return (
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
  });
  articles.sort((a, b) => {
    return (
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
  });
  paiements.sort((a, b) => {
    return (
      new Date(b.date_paiement).getTime() -
      new Date(a.date_paiement).getTime()
    );
  });

  return NextResponse.json({
    success: true,
    data: {
      ...commande,
      lignes,
      articles,
      paiements,
    },
  });
}

/* -------------------------------------------------------------------------- */
/*  PATCH — MISE À JOUR PARTIELLE (annulation, priorité, notes)               */
/* -------------------------------------------------------------------------- */

/**
 * Statuts à partir desquels une commande ne peut plus être annulée.
 * Une commande ne peut être annulée que si elle est en 'recu' ou
 * 'en_traitement' (cf. cahier des charges #5).
 */
const STATUTS_NON_ANNULABLE = new Set([
  "pret",
  "en_livraison",
  "livre",
  "retire",
  "annule",
]);

export async function PATCH(request: NextRequest, { params }: RouteParams) {
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

  const { id: commandeId } = await params;

  // ---------- 1. Parse body ----------
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Corps de requête invalide (JSON attendu)" },
      { status: 400 }
    );
  }

  // ---------- 2. Extraction + validation des champs ----------
  const statutRaw =
    typeof body.statut === "string" ? body.statut.trim() : "";
  const prioriteRaw =
    typeof body.priorite === "string" ? body.priorite.trim() : "";
  // `notes` peut être absent (undefined), null (effacer), ou une string.
  const notesProvided = Object.prototype.hasOwnProperty.call(body, "notes");

  // #6 — Verrou optimiste (optional) : si `expected_updated_at` est fourni,
  // on comparera sa valeur à commandes.updated_at avant l'UPDATE. Permet
  // au client de détecter une modification concurrente et de proposer à
  // l'utilisateur de recharger. Rétro-compatible : champ absent = pas de check.
  const expectedUpdatedAtRaw =
    typeof body.expected_updated_at === "string"
      ? body.expected_updated_at.trim()
      : "";
  // Valide le format (ISO string parsable). Si invalide, on ignore le check
  // plutôt que de renvoyer 400 — le client ancien pourrait envoyer du n'importe
  // quoi sans casser la rétro-compatibilité.
  let expectedUpdatedAt: Date | null = null;
  if (expectedUpdatedAtRaw) {
    const d = new Date(expectedUpdatedAtRaw);
    if (!Number.isNaN(d.getTime())) {
      expectedUpdatedAt = d;
    }
  }

  // Validation priorite (si fournie)
  let priorite: "normal" | "express" | null = null;
  if (prioriteRaw) {
    if (prioriteRaw !== "normal" && prioriteRaw !== "express") {
      return NextResponse.json(
        {
          success: false,
          error: "priorite invalide (valeurs attendues : 'normal' ou 'express')",
        },
        { status: 400 }
      );
    }
    priorite = prioriteRaw;
  }

  // Validation statut : seul "annule" est géré par PATCH en Phase-1.
  // Les autres transitions de statut passent par les endpoints métier dédiés
  // (workflow laveur/repasseur, etc.) pour éviter un PATCH trop générique.
  if (statutRaw && statutRaw !== "annule") {
    return NextResponse.json(
      {
        success: false,
        error: "Changement de statut non supporté via PATCH (seul 'annule' est géré).",
      },
      { status: 400 }
    );
  }
  const wantCancel = statutRaw === "annule";

  // Validation notes (si fournie) : string <= 2000 chars ou null.
  // AUDIT #19 + migration 031 — Avant ce fix, le code faisait `.slice(0, 2000)`
  // (troncation silencieuse) → perte de données côté client sans warning.
  // On renvoie désormais un 400 propre pour que le client sache qu'il doit
  // raccourcir ses notes. Le CHECK DB `check_notes_max_length` (migration 031)
  // ferait de toute façon échouer l'UPDATE avec une 23514 → 500 générique.
  let notesValue: string | null | undefined = undefined;
  if (notesProvided) {
    if (body.notes === null) {
      notesValue = null;
    } else if (typeof body.notes === "string") {
      const trimmed = body.notes.trim();
      if (trimmed.length > 2000) {
        return NextResponse.json(
          {
            success: false,
            code: "NOTES_TOO_LONG",
            error: "Les notes ne peuvent pas dépasser 2000 caractères.",
          },
          { status: 400 }
        );
      }
      notesValue = trimmed ? trimmed : null;
    } else {
      return NextResponse.json(
        { success: false, error: "notes doit être une chaîne ou null" },
        { status: 400 }
      );
    }
  }

  // Aucun champ à mettre à jour → on retourne la commande courante.
  if (!wantCancel && !priorite && !notesProvided) {
    const { data: current, error: curErr } = await supabase
      .from("commandes")
      .select("id, statut, priorite, notes, updated_at")
      .eq("id", commandeId)
      .maybeSingle();
    if (curErr) {
      console.error("[api/admin/commandes/[id]] Erreur SELECT:", curErr);
      return NextResponse.json(
        { success: false, error: "Erreur interne du serveur" },
        { status: 500 }
      );
    }
    if (!current) {
      return NextResponse.json(
        { success: false, error: "Commande introuvable" },
        { status: 404 }
      );
    }
    // #6 — Verrou optimiste : même sans champ à modifier, on vérifie
    // expected_updated_at si fourni (permet au client de détecter un changement
    // concurrent même sur un PATCH "no-op").
    if (expectedUpdatedAt && current.updated_at) {
      const currentUpdatedAt = new Date(current.updated_at);
      if (
        !Number.isNaN(currentUpdatedAt.getTime()) &&
        currentUpdatedAt.getTime() !== expectedUpdatedAt.getTime()
      ) {
        return NextResponse.json(
          {
            success: false,
            error:
              "La commande a été modifiée par un autre utilisateur. Veuillez recharger et réessayer.",
            code: "CONCURRENT_MODIFICATION",
          },
          { status: 409 }
        );
      }
    }
    return NextResponse.json({ success: true, data: current });
  }

  // ---------- 3. Vérification des rôles ----------
  // Annulation : manager / réceptionniste / caissier.
  if (wantCancel && !hasRole(me, CAN_CANCEL_COMMANDES)) {
    return NextResponse.json(
      {
        success: false,
        error: "Accès refusé — rôle insuffisant pour annuler une commande",
      },
      { status: 403 }
    );
  }
  // Priorité : manager / réceptionniste.
  if (priorite && !hasRole(me, CAN_CHANGE_PRIORITE)) {
    return NextResponse.json(
      {
        success: false,
        error: "Accès refusé — rôle insuffisant pour changer la priorité",
      },
      { status: 403 }
    );
  }

  // ---------- 4. Fetch la commande (RLS isole par pressing) ----------
  const { data: cmd, error: cmdErr } = await supabase
    .from("commandes")
    .select("id, statut, priorite, updated_at")
    .eq("id", commandeId)
    .maybeSingle();

  if (cmdErr) {
    console.error("[api/admin/commandes/[id]] Erreur SELECT commande:", cmdErr);
    // Sécurité (audit #8) : masque le message Supabase au client.
    return NextResponse.json(
      { success: false, error: "Erreur interne du serveur" },
      { status: 500 }
    );
  }
  if (!cmd) {
    return NextResponse.json(
      { success: false, error: "Commande introuvable" },
      { status: 404 }
    );
  }

  // #6 — Verrou optimiste : si `expected_updated_at` est fourni (et a pu être
  // parsé), on compare sa valeur à cmd.updated_at courant. En cas de mismatch,
  // on renvoie 409 pour inviter le client à recharger la commande avant de
  // retenter la modification. Le trigger `set_updated_at` (migration 005)
  // garantit que updated_at est auto-mis à jour à NOW() sur chaque UPDATE,
  // donc toute modification concurrente aura inévitablement changé cette valeur.
  if (expectedUpdatedAt && cmd.updated_at) {
    const currentUpdatedAt = new Date(cmd.updated_at);
    if (
      !Number.isNaN(currentUpdatedAt.getTime()) &&
      currentUpdatedAt.getTime() !== expectedUpdatedAt.getTime()
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "La commande a été modifiée par un autre utilisateur. Veuillez recharger et réessayer.",
          code: "CONCURRENT_MODIFICATION",
        },
        { status: 409 }
      );
    }
  }

  // ---------- 5. Vérifications métier ----------

  // AUDIT-B-08: workflow status transition guard
  // Vérifie que la transition de statut demandée est autorisée par la matrice
  // canonique du workflow (`canTransitionCommande` dans
  // `@/lib/workflow/commande-statut`). Ce guard s'applique à TOUT changement
  // de statut via PATCH (actuellement seul 'annule' est supporté en Phase-1,
  // mais le guard reste future-proof si d'autres transitions sont ajoutées).
  //
  // Rationale : avant ce fix, le PATCH ne validait que l'annulation (via
  // STATUTS_NON_ANNULABLE). Si on avait ajouté un PATCH "statut='pret'" sans
  // contrôle, on aurait pu faire reculer une commande "livre" → "pret" par
  // erreur de saisie, perdant l'historique métier (la commande a déjà quitté
  // la pressing). La matrice `TRANSITIONS_COMMANDE_AUTORISEES` garantit que
  // seules les transitions "vers l'avant" + l'annulation des statuts
  // pré-livraison sont autorisées.
  //
  // Cas spécial : 'annule' depuis 'livre', 'retire' ou 'annule' est interdit
  // (post-livraison / terminal) — géré par la matrice (livre/retire/annule
  // ont une liste vide de cibles autorisées).
  if (statutRaw && !canTransitionCommande(cmd.statut, statutRaw)) {
    return NextResponse.json(
      {
        success: false,
        code: "INVALID_TRANSITION",
        error: `Transition de statut non autorisée: ${cmd.statut} → ${statutRaw}`,
      },
      { status: 409 }
    );
  }

  if (wantCancel) {
    // Annulation possible seulement si statut ∈ {recu, en_traitement, lave,
    // repasse} (i.e. la commande n'est pas encore livrée/retirée). Ce check
    // est désormais redondant avec canTransitionCommande ci-dessus, mais on
    // le conserve comme seconde couche défensive + pour le message plus
    // spécifique (l'utilisateur comprend mieux "Annulation impossible" que
    // "Transition non autorisée").
    if (STATUTS_NON_ANNULABLE.has(cmd.statut)) {
      return NextResponse.json(
        {
          success: false,
          error: `Annulation impossible : la commande est déjà au statut '${cmd.statut}'. Seules les commandes 'recu', 'en_traitement', 'lave' ou 'repasse' peuvent être annulées.`,
        },
        { status: 409 }
      );
    }
  }
  if (priorite) {
    // Changement de priorité possible seulement si statut === 'recu'.
    // (Une fois le traitement en cours, la priorité n'a plus de sens.)
    if (cmd.statut !== "recu") {
      return NextResponse.json(
        {
          success: false,
          error: `Changement de priorité impossible : la commande est au statut '${cmd.statut}' (seul le statut 'recu' permet de changer la priorité).`,
        },
        { status: 409 }
      );
    }
  }

  // ---------- 6. Construction du payload UPDATE ----------
  const updatePayload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (wantCancel) {
    updatePayload.statut = "annule";
    // NB : le `statut_article` enum (articles_vetements.statut) ne contient
    // pas la valeur 'annule' (cf. migration 001_enums.sql). On ne met donc
    // pas à jour les articles_vetements individuels — seule la commande est
    // annulée. Le statut global 'annule' de la commande prime côté UI.
  }
  if (priorite) {
    updatePayload.priorite = priorite;
  }
  if (notesValue !== undefined) {
    updatePayload.notes = notesValue;
  }

  // ---------- 7. UPDATE ----------
  const { data: updated, error: updateErr } = await supabase
    .from("commandes")
    .update(updatePayload)
    .eq("id", commandeId)
    .select("id, statut, priorite, notes, updated_at")
    .single();

  if (updateErr || !updated) {
    // 23514 = check_violation (ex: trigger workflow migration 029).
    // Le guard TS `canTransitionCommande` (étape 5) capture la plupart des
    // transitions invalides AVANT l'UPDATE, mais une race condition (statut
    // changé entre le SELECT cmd et l'UPDATE) ferait lever le trigger DB
    // `trg_check_commande_statut_transition` (migration 029) avec ERRCODE
    // 'check_violation' (SQLSTATE 23514). On renvoie un 409 propre au lieu
    // d'un 500 générique.
    if (
      updateErr &&
      typeof updateErr === "object" &&
      "code" in updateErr &&
      (updateErr as { code?: string }).code === "23514"
    ) {
      return NextResponse.json(
        {
          success: false,
          code: "INVALID_TRANSITION",
          error:
            "Transition de statut refusée par la base de données (peut être due à une modification concurrente).",
        },
        { status: 409 }
      );
    }
    // 22P02 = invalid_input_value_for_enum (ex: statut 'annule' non encore
    // ajouté à l'enum statut_commande si la migration 024/024b n'est pas
    // appliquée). On renvoie un 501 clair invitant à appliquer la migration,
    // plutôt qu'un 500 générique.
    if (
      updateErr &&
      typeof updateErr === "object" &&
      "code" in updateErr &&
      (updateErr as { code?: string }).code === "22P02"
    ) {
      return NextResponse.json(
        {
          success: false,
          code: "ENUM_VALUE_MISSING",
          error:
            "Valeur de statut non supportée par la base de données. Vérifiez que la migration 024b (ajout de la valeur 'annule' à l'enum statut_commande) a été appliquée.",
        },
        { status: 501 }
      );
    }
    console.error(
      "[api/admin/commandes/[id]] Erreur UPDATE commandes:",
      updateErr
    );
    // Sécurité (audit #8) : masque le message Supabase au client.
    return NextResponse.json(
      { success: false, error: "Erreur interne du serveur" },
      { status: 500 }
    );
  }

  // ---------- 8. AUDIT-B-13 — Journalisation (cancel_commande | update_commande) ----------
  // Best-effort : ne bloque jamais le flux. logAudit catch toutes les erreurs.
  //
  // Récupère l'auth.users.id pour audit_log.user_id (FK → auth.users(id)).
  // `getCurrentPersonnel` ne l'expose pas dans AuthPersonnel (seulement
  // personnel.id), on le récupère ici via getUser(). On le fait EN FIN de
  // handler pour éviter l'appel réseau sur les chemins d'erreur (400/404/409).
  let authUserId: string | null = null;
  try {
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    authUserId = authUser?.id ?? null;
  } catch {
    authUserId = null;
  }

  await logAudit({
    pressing_id: me.pressing_id,
    user_id: authUserId,
    action: wantCancel ? "cancel_commande" : "update_commande",
    entity_type: "commande",
    entity_id: commandeId,
    before_state: cmd
      ? {
          id: cmd.id,
          statut: cmd.statut,
          priorite: cmd.priorite,
          updated_at: cmd.updated_at,
        }
      : null,
    after_state: updated as Record<string, unknown>,
    req: request,
  });

  // ---------- 9. Réponse succès ----------
  return NextResponse.json({ success: true, data: updated });
}
