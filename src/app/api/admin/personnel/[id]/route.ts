/**
 * OgPressing — API /api/admin/personnel/[id] (PATCH + POST)
 * ---------------------------------------------------------
 * Gestion du cycle de vie d'un compte employé (LOT 9.3).
 *
 * PATCH — actions sur le statut + modification des infos :
 *   Body { action: "desactiver" }   → statut='desactive', actif=false, date_desactivation=NOW()
 *   Body { action: "reactiver" }    → statut='actif', actif=true, date_desactivation=NULL
 *   Body { action: "modifier", nom, prenom, telephone, email, role,
 *          modes_paiement_autorises?, nom_affiche_recu?, seuil_alerte_impaye?,
 *          expected_updated_at? }
 *                                   → UPDATE nom_complet, telephone, email, role
 *                                     + champs caissier si la cible est/become caissier
 *                                     (AUDIT 9.7 — fix migration 019)
 *                                   → #6 : verrou optimiste via `expected_updated_at`
 *                                     (comparé à personnel.updated_at courant ; 409 si mismatch).
 *                                     Rétro-compatible : champ absent = pas de check.
 *
 * POST — actions sur l'authentification (nécessitent service_role) :
 *   Body { action: "reset_password" }
 *       → Génère un nouveau mot de passe temporaire aléatoire
 *       → admin.auth.admin.updateUserById(id, { password })
 *       → UPDATE personnel SET mot_de_passe_temporaire = true
 *       → Retourne { credentials: { email, telephone, password } }
 *   Body { action: "resend_invitation" }
 *       → admin.auth.admin.inviteUserByEmail(email, { redirectTo })
 *       → UPDATE personnel SET date_invitation = NOW()
 *       → Retourne { invitedEmail }
 *
 * 🔒 SÉCURITÉ :
 *   - Manager authentifié + actif (vérifié au début de chaque handler).
 *   - RLS `isolation_pressing` (USING + WITH CHECK pressing_id) garantit qu'on
 *     ne peut modifier qu'un employé de SON propre pressing.
 *   - Verrou anti-lockout : un manager ne peut pas se désactiver lui-même.
 *   - Les opérations Auth (reset password, resend invitation) utilisent
 *     getSupabaseAdmin() (service_role) car ces opérations Admin Auth sont
 *     impossibles avec la clé anon.
 *   - FIX AUDIT 9.7 : les champs caissier (modes_paiement_autorises,
 *     nom_affiche_recu, seuil_alerte_impaye) ne sont acceptés QUE si la
 *     cible est caissier (role courant OU nouveau role transmis dans le
 *     body). Sinon → 400 "Ces champs ne s'appliquent qu'aux caissiers".
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isValidCIPhone, normalizeCIPhone } from "@/lib/validations/phone";

export const dynamic = "force-dynamic";

const ROLES_VALID_SET = new Set([
  "manager",
  "receptionniste",
  "caissier",
  "laveur",
  "repassage",
  "livreur",
  "comptable",
]);

/**
 * Modes de paiement autorisés dans le champ JSONB du même nom
 * (AUDIT 9.7 — migration 019). L'enum `methode_paiement` (migration 001)
 * ne contient que 3 valeurs (especes, mobile_money, carte_bancaire),
 * mais le champ `modes_paiement_autorises` accepte un sur-ensemble
 * pour permettre une extension future sans casser la base.
 */
const MODES_PAIEMENT_VALIDES = new Set([
  "especes",
  "mobile_money",
  "carte",
  "cheque",
  "virement",
]);

/** Sélecteur de colonnes renvoyé après un UPDATE (commun à plusieurs actions). */
const PERSONNEL_SELECT_AFTER_UPDATE =
  "id, nom_complet, email, telephone, role, methode_creation, statut_compte, " +
  "date_invitation, date_activation, date_desactivation, actif, created_at, " +
  "modes_paiement_autorises, nom_affiche_recu, seuil_alerte_impaye";

/** Génère un mot de passe aléatoire sécurisé de 10 caractères. */
function generateRandomPassword(): string {
  const chars =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  let pwd = "";
  const array = new Uint8Array(10);
  crypto.getRandomValues(array);
  for (let i = 0; i < 10; i++) {
    pwd += chars[array[i] % chars.length];
  }
  return pwd;
}

/** Vérifie l'authentification + autorisation manager. Retourne [me, supabase] ou une Response d'erreur. */
async function checkManagerAuth(): Promise<
  | { ok: true; me: { id: string; pressing_id: string }; supabase: Awaited<ReturnType<typeof getSupabaseServer>> }
  | { ok: false; response: NextResponse }
> {
  const supabase = await getSupabaseServer();
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: "Non authentifié" },
        { status: 401 }
      ),
    };
  }

  const { data: me } = await supabase
    .from("personnel")
    .select("id, pressing_id, role, actif, statut_compte")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (
    !me ||
    me.role !== "manager" ||
    me.actif !== true ||
    me.statut_compte !== "actif"
  ) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: "Accès refusé — manager requis" },
        { status: 403 }
      ),
    };
  }

  return { ok: true, me: { id: me.id, pressing_id: me.pressing_id }, supabase };
}

/**
 * AUDIT-B-07 — Compte les managers actifs d'un pressing.
 *
 * Un "manager actif" est défini par : `role='manager' AND actif=true AND
 * statut_compte='actif'`. Cette fonction est utilisée par le garde-fou
 * anti-lockout pour empêcher qu'un pressing se retrouve sans aucun manager
 * actif (soit par désactivation, soit par changement de rôle).
 *
 * @returns le nombre de managers actifs (0 si la requête échoue).
 */
async function countActiveManagers(
  supabase: Awaited<ReturnType<typeof getSupabaseServer>>,
  pressingId: string
): Promise<number> {
  const { count } = await supabase
    .from("personnel")
    .select("id", { count: "exact", head: true })
    .eq("pressing_id", pressingId)
    .eq("role", "manager")
    .eq("actif", true)
    .eq("statut_compte", "actif");
  return count ?? 0;
}

/* ================================================================
 *  PATCH — Désactiver / Réactiver / Modifier
 * ================================================================ */

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await checkManagerAuth();
  if (!auth.ok) return auth.response;
  const { me, supabase } = auth;

  const { id: targetId } = await params;

  // Verrou anti-lockout : ne pas se désactiver soi-même
  if (targetId === me.id) {
    return NextResponse.json(
      {
        success: false,
        error: "Vous ne pouvez pas modifier votre propre compte via cette action.",
      },
      { status: 400 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Corps de requête invalide (JSON attendu)" },
      { status: 400 }
    );
  }

  const action = typeof body.action === "string" ? body.action : "";

  // ---- Action: désactiver / réactiver ----
  if (action === "desactiver" || action === "reactiver") {
    // Vérifie que la cible existe + appartient au même pressing (RLS le garantit).
    // On récupère aussi `role` pour AUDIT-B-07 (last manager protection).
    const { data: target } = await supabase
      .from("personnel")
      .select("id, nom_complet, statut_compte, pressing_id, role")
      .eq("id", targetId)
      .maybeSingle();

    if (!target) {
      return NextResponse.json(
        { success: false, error: "Employé introuvable" },
        { status: 404 }
      );
    }

    if (target.pressing_id !== me.pressing_id) {
      return NextResponse.json(
        { success: false, error: "Accès refusé" },
        { status: 403 }
      );
    }

    // Cohérence de l'action vs statut actuel
    if (action === "desactiver" && target.statut_compte === "desactive") {
      return NextResponse.json(
        { success: false, error: "Ce compte est déjà désactivé" },
        { status: 400 }
      );
    }
    if (action === "reactiver" && target.statut_compte === "actif") {
      return NextResponse.json(
        { success: false, error: "Ce compte est déjà actif" },
        { status: 400 }
      );
    }

    // AUDIT-B-07 — Last manager protection.
    // Si on désactive un manager, on vérifie qu'il reste au moins un autre
    // manager actif dans le pressing. Sans ce garde, un manager pouvait
    // désactiver le dernier manager actif → lockout complet du pressing
    // (plus personne ne peut gérer le personnel, les commandes, etc.).
    // NB : on ne déclenche le garde QUE si la cible est un manager ACTIF
    // (statut_compte='actif'). Désactiver un manager déjà 'invite_en_attente'
    // ou 'desactive' ne réduit pas le nombre de managers actifs, donc pas
    // de risque de lockout.
    if (
      action === "desactiver" &&
      target.role === "manager" &&
      target.statut_compte === "actif"
    ) {
      const activeManagers = await countActiveManagers(supabase, me.pressing_id);
      if (activeManagers <= 1) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Impossible de désactiver le dernier manager du pressing. Désignez d'abord un autre manager.",
            code: "DERNIER_MANAGER",
          },
          { status: 409 }
        );
      }
    }

    const updates =
      action === "desactiver"
        ? {
            statut_compte: "desactive" as const,
            actif: false,
            // #12 — date_desactivation : timestamp serveur (UTC). La colonne
            // n'a pas de DEFAULT NOW() (002_tables.sql:190 — nullable).
            date_desactivation: new Date().toISOString(),
          }
        : {
            statut_compte: "actif" as const,
            actif: true,
            date_desactivation: null,
          };

    const { data: updated, error: updateErr } = await supabase
      .from("personnel")
      .update(updates)
      .eq("id", targetId)
      .select(
        "id, nom_complet, email, telephone, role, methode_creation, statut_compte, date_invitation, date_activation, date_desactivation, actif, created_at"
      )
      .maybeSingle();

    if (updateErr) {
      console.error("[api/admin/personnel/[id] PATCH] UPDATE error:", updateErr);
      return NextResponse.json(
        { success: false, error: "Erreur lors de la mise à jour" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: updated,
      action,
    });
  }

  // ---- Action: modifier (infos personnelles + rôle + champs caissier) ----
  if (action === "modifier") {
    const nom = typeof body.nom === "string" ? body.nom.trim() : "";
    const prenom = typeof body.prenom === "string" ? body.prenom.trim() : "";
    const telephone =
      typeof body.telephone === "string" ? body.telephone.trim() : "";
    const emailRaw =
      typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const role = typeof body.role === "string" ? body.role : "";

    // #6 — Verrou optimiste (optionnel). Si `expected_updated_at` est fourni,
    // on comparera sa valeur à personnel.updated_at avant l'UPDATE. Rétro-
    // compatible : si absent ou non parsable, aucun check n'est effectué.
    const expectedUpdatedAtRaw =
      typeof body.expected_updated_at === "string"
        ? body.expected_updated_at.trim()
        : "";
    let expectedUpdatedAt: Date | null = null;
    if (expectedUpdatedAtRaw) {
      const d = new Date(expectedUpdatedAtRaw);
      if (!Number.isNaN(d.getTime())) {
        expectedUpdatedAt = d;
      }
    }

    if (!nom || !prenom || !telephone) {
      return NextResponse.json(
        { success: false, error: "Nom, prénom et téléphone sont obligatoires." },
        { status: 400 }
      );
    }

    // AUDIT-B-03 — Validation du téléphone ivoirien (centralisée dans
    // `isValidCIPhone`). Avant ce fix, seul le non-vide était vérifié.
    if (!isValidCIPhone(telephone)) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Le téléphone doit être un numéro ivoirien valide (ex : 07 00 00 00 00 ou +225 07 00 00 00 00).",
        },
        { status: 400 }
      );
    }

    // AUDIT-B-03 — Normalisation vers +225XXXXXXXXXX pour cohérence avec
    // les autres routes (activation, inscription, personnel POST).
    const telephoneNorm = normalizeCIPhone(telephone);

    if (!ROLES_VALID_SET.has(role)) {
      return NextResponse.json(
        { success: false, error: "Rôle invalide." },
        { status: 400 }
      );
    }

    // ---- Champs caissier optionnels (AUDIT 9.7 — migration 019) ----
    // Trois champs dédiés : modes_paiement_autorises, nom_affiche_recu,
    // seuil_alerte_impaye. Ils ne sont acceptés QUE si la cible est
    // caissier (role courant) ou DEVIENT caissier (nouveau role).
    const aChampsCaissier =
      body.modes_paiement_autorises !== undefined ||
      body.nom_affiche_recu !== undefined ||
      body.seuil_alerte_impaye !== undefined;

    // Vérifie que la cible existe + appartient au même pressing.
    // On récupère aussi :
    //   - `role` + `statut_compte` pour AUDIT-B-07 (last manager protection)
    //     et AUDIT-B-11 (role change notification).
    //   - `nom_complet` pour le log AUDIT-B-11.
    //   - `updated_at` pour le verrou optimiste (#6).
    const { data: target } = await supabase
      .from("personnel")
      .select(
        "id, pressing_id, email, telephone, role, statut_compte, nom_complet, updated_at"
      )
      .eq("id", targetId)
      .maybeSingle();

    if (!target) {
      return NextResponse.json(
        { success: false, error: "Employé introuvable" },
        { status: 404 }
      );
    }

    if (target.pressing_id !== me.pressing_id) {
      return NextResponse.json(
        { success: false, error: "Accès refusé" },
        { status: 403 }
      );
    }

    // #6 — Verrou optimiste : si `expected_updated_at` est fourni, on compare
    // sa valeur à target.updated_at. En cas de mismatch, on renvoie 409 pour
    // inviter le client à recharger. Le trigger `set_updated_at` (migration
    // 005) auto-met à jour updated_at = NOW() sur chaque UPDATE, donc toute
    // modification concurrente aura inévitablement changé cette valeur.
    if (expectedUpdatedAt && target.updated_at) {
      const currentUpdatedAt = new Date(target.updated_at);
      if (
        !Number.isNaN(currentUpdatedAt.getTime()) &&
        currentUpdatedAt.getTime() !== expectedUpdatedAt.getTime()
      ) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Cet employé a été modifié par un autre utilisateur. Veuillez recharger et réessayer.",
            code: "CONCURRENT_MODIFICATION",
          },
          { status: 409 }
        );
      }
    }

    // AUDIT-B-07 — Last manager protection (changement de rôle).
    // Si la cible est un manager actif ET le nouveau rôle n'est pas "manager",
    // on vérifie qu'il reste au moins un autre manager actif après ce
    // changement. Sans ce garde, un manager pouvait rétrograder le dernier
    // manager actif → lockout complet du pressing.
    // NB : on ne déclenche le garde QUE si la cible est un manager ACTIF
    // (statut_compte='actif'). Changer le rôle d'un manager déjà désactivé
    // ou en attente d'invitation ne réduit pas le nombre de managers actifs.
    const previousRole = target.role as string;
    const roleChanged = previousRole !== role;
    if (
      roleChanged &&
      previousRole === "manager" &&
      target.statut_compte === "actif"
    ) {
      const activeManagers = await countActiveManagers(supabase, me.pressing_id);
      if (activeManagers <= 1) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Impossible de changer le rôle du dernier manager du pressing. Désignez d'abord un autre manager.",
            code: "DERNIER_MANAGER",
          },
          { status: 409 }
        );
      }
    }

    // Condition caissier : role courant OU nouveau role
    const estOuDevientCaissier =
      target.role === "caissier" || role === "caissier";
    if (aChampsCaissier && !estOuDevientCaissier) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Ces champs ne s'appliquent qu'aux caissiers. L'employé ciblé n'est pas caissier et ne le devient pas via cette modification.",
          code: "CHAMPS_CAISSIER_SUR_NON_CAISSIER",
        },
        { status: 400 }
      );
    }

    // ---- Validation des champs caissier fournis ----
    const updateCaissier: Record<string, unknown> = {};

    if (body.modes_paiement_autorises !== undefined) {
      const rawModes = body.modes_paiement_autorises;
      if (!Array.isArray(rawModes)) {
        return NextResponse.json(
          {
            success: false,
            error:
              "modes_paiement_autorises doit être un tableau de chaînes.",
          },
          { status: 400 }
        );
      }
      // Filtre les éléments non-string (sécurité)
      const modes = rawModes.filter(
        (m): m is string => typeof m === "string" && m.length > 0
      );
      if (modes.length === 0) {
        return NextResponse.json(
          {
            success: false,
            error:
              "modes_paiement_autorises doit contenir au moins un mode de paiement.",
          },
          { status: 400 }
        );
      }
      const invalides = modes.filter((m) => !MODES_PAIEMENT_VALIDES.has(m));
      if (invalides.length > 0) {
        return NextResponse.json(
          {
            success: false,
            error: `modes_paiement_autorises contient des valeurs invalides : ${invalides.join(", ")}. Valeurs attendues : especes, mobile_money, carte, cheque, virement.`,
          },
          { status: 400 }
        );
      }
      // Doublon : on déduplique pour éviter les entrées répétées.
      const modesUniques = Array.from(new Set(modes));
      updateCaissier.modes_paiement_autorises = modesUniques;
    }

    if (body.nom_affiche_recu !== undefined) {
      const nomAffiche =
        typeof body.nom_affiche_recu === "string"
          ? body.nom_affiche_recu.trim()
          : "";
      // Autorise la chaîne vide → on la convertit en NULL pour retomber
      // sur nom_complet côté affichage reçu.
      if (nomAffiche.length > 100) {
        return NextResponse.json(
          {
            success: false,
            error:
              "nom_affiche_recu ne peut pas dépasser 100 caractères.",
          },
          { status: 400 }
        );
      }
      updateCaissier.nom_affiche_recu = nomAffiche || null;
    }

    if (body.seuil_alerte_impaye !== undefined) {
      const seuilRaw = body.seuil_alerte_impaye;
      const seuil =
        typeof seuilRaw === "number"
          ? seuilRaw
          : parseInt(String(seuilRaw ?? ""), 10);
      if (
        !Number.isFinite(seuil) ||
        !Number.isInteger(seuil) ||
        seuil < 0 ||
        seuil > 1_000_000
      ) {
        return NextResponse.json(
          {
            success: false,
            error:
              "seuil_alerte_impaye doit être un entier entre 0 et 1 000 000 FCFA.",
          },
          { status: 400 }
        );
      }
      updateCaissier.seuil_alerte_impaye = seuil;
    }

    const email = emailRaw || null;
    const nomComplet = `${prenom} ${nom}`;

    // Anti-doublon (email/téléphone) — exclut l'employé courant.
    // AUDIT-B-03 : on utilise le numéro normalisé pour la comparaison.
    if (email || telephoneNorm) {
      const orParts: string[] = [];
      if (email) orParts.push(`email.eq.${email}`);
      if (telephoneNorm) orParts.push(`telephone.eq.${telephoneNorm}`);
      const { data: duplicate } = await supabase
        .from("personnel")
        .select("id")
        .eq("pressing_id", me.pressing_id)
        .neq("id", targetId)
        .or(orParts.join(","))
        .limit(1)
        .maybeSingle();

      if (duplicate) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Un autre employé avec cet email ou ce téléphone existe déjà.",
          },
          { status: 409 }
        );
      }
    }

    // AUDIT-B-11 — Role change notification.
    // Si le rôle change, on ajoute les colonnes `dernier_changement_role`
    // (TIMESTAMPTZ) et `notes_changement_role` (TEXT) à l'UPDATE pour garder
    // un audit trail côté DB (migration 025_notifications_role_change.sql).
    // On logge aussi côté serveur pour permettre à un admin de retrouver
    // l'historique dans les logs.
    const updatePayload: Record<string, unknown> = {
      nom_complet: nomComplet,
      telephone: telephoneNorm,
      email,
      role,
      ...updateCaissier,
    };

    if (roleChanged) {
      const nowIso = new Date().toISOString();
      const noteRole = `Rôle changé de "${previousRole}" à "${role}" par le manager ${me.id} le ${nowIso}`;
      updatePayload.dernier_changement_role = nowIso;
      updatePayload.notes_changement_role = noteRole;
      // Audit trail serveur (visible dans les logs Vercel / Docker).
      console.log(
        `[personnel] Role change: ${target.nom_complet} ` +
          `${previousRole} → ${role} by ${me.id}`
      );
    }

    const { data: updated, error: updateErr } = await supabase
      .from("personnel")
      .update(updatePayload)
      .eq("id", targetId)
      .select(PERSONNEL_SELECT_AFTER_UPDATE)
      .maybeSingle();

    if (updateErr) {
      console.error("[api/admin/personnel/[id] PATCH modifier] UPDATE error:", updateErr);
      return NextResponse.json(
        { success: false, error: "Erreur lors de la modification" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: updated,
      action: "modifier",
      // AUDIT-B-11 — Indicateurs de changement de rôle pour le UI.
      roleChanged,
      previousRole: roleChanged ? previousRole : null,
    });
  }

  return NextResponse.json(
    {
      success: false,
      error:
        "Action invalide. Valeurs attendues : 'desactiver', 'reactiver' ou 'modifier'.",
    },
    { status: 400 }
  );
}

/* ================================================================
 *  POST — Réinitialiser mot de passe / Renvoyer invitation
 * ================================================================ */

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await checkManagerAuth();
  if (!auth.ok) return auth.response;
  const { me, supabase } = auth;

  const { id: targetId } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Corps de requête invalide (JSON attendu)" },
      { status: 400 }
    );
  }

  const action = typeof body.action === "string" ? body.action : "";

  // Récupère l'employé cible (RLS isole par pressing)
  const { data: target } = await supabase
    .from("personnel")
    .select(
      "id, pressing_id, user_id, nom_complet, email, telephone, role, methode_creation, statut_compte"
    )
    .eq("id", targetId)
    .maybeSingle();

  if (!target) {
    return NextResponse.json(
      { success: false, error: "Employé introuvable" },
      { status: 404 }
    );
  }

  if (target.pressing_id !== me.pressing_id) {
    return NextResponse.json(
      { success: false, error: "Accès refusé" },
      { status: 403 }
    );
  }

  // ---- Action: reset_password (uniquement creation_directe) ----
  if (action === "reset_password") {
    if (target.methode_creation !== "creation_directe") {
      return NextResponse.json(
        {
          success: false,
          error:
            "La réinitialisation de mot de passe n'est possible que pour les comptes créés en création directe.",
        },
        { status: 400 }
      );
    }

    if (!target.user_id) {
      return NextResponse.json(
        { success: false, error: "Compte non lié à un utilisateur Auth." },
        { status: 400 }
      );
    }

    const admin = getSupabaseAdmin();
    const newPassword = generateRandomPassword();

    // 1. Met à jour le mot de passe côté Auth
    const { error: updateAuthErr } = await admin.auth.admin.updateUserById(
      target.user_id,
      {
        password: newPassword,
        // Forcer le changement au prochain login via notre flag personnel
      }
    );

    if (updateAuthErr) {
      console.error("[api/admin/personnel/[id] POST reset_password] Auth error:", updateAuthErr);
      // Sécurité (audit #8) : masque le message Supabase brut.
      return NextResponse.json(
        {
          success: false,
          error: "Erreur interne du serveur",
        },
        { status: 500 }
      );
    }

    // 2. Remet mot_de_passe_temporaire = true côté personnel
    const { error: updatePersErr } = await admin
      .from("personnel")
      .update({ mot_de_passe_temporaire: true })
      .eq("id", targetId);

    if (updatePersErr) {
      console.error("[api/admin/personnel/[id] POST reset_password] personnel error:", updatePersErr);
      // Le mot de passe a été changé côté Auth — on signale l'incohérence
      return NextResponse.json(
        {
          success: false,
          error:
            "Mot de passe réinitialisé côté Auth, mais erreur lors de la mise à jour du flag temporaire.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      action: "reset_password",
      credentials: {
        email: target.email ?? "",
        telephone: target.telephone ?? "",
        password: newPassword,
        nom_complet: target.nom_complet,
      },
    });
  }

  // ---- Action: resend_invitation (uniquement invite_en_attente + lien_invitation) ----
  if (action === "resend_invitation") {
    if (target.methode_creation !== "lien_invitation") {
      return NextResponse.json(
        {
          success: false,
          error:
            "Le renvoi d'invitation n'est possible que pour les comptes créés par lien d'invitation.",
        },
        { status: 400 }
      );
    }

    if (!target.email) {
      return NextResponse.json(
        { success: false, error: "Aucun email associé à cet employé." },
        { status: 400 }
      );
    }

    const admin = getSupabaseAdmin();

    const redirectTo =
      process.env.NEXT_PUBLIC_SITE_URL ??
      request.nextUrl.origin ??
      "http://localhost:3000";
    // ⚠️ FIX BUG-AUDIT-RUNTIME #2 (P1) : on passe par /auth/callback?next=
    // pour que la session PKCE soit posée AVANT d'accéder à la page protégée
    // /personnel/changer-mot-de-passe. Sinon le middleware redirige vers
    // /login et le code PKCE est perdu (régression vs personnel/route.ts:495).
    const inviteRedirect = `${redirectTo}/auth/callback?next=/personnel/changer-mot-de-passe`;

    const { error: inviteErr } = await admin.auth.admin.inviteUserByEmail(
      target.email,
      { redirectTo: inviteRedirect }
    );

    if (inviteErr) {
      console.error("[api/admin/personnel/[id] POST resend_invitation] error:", inviteErr);
      // Sécurité (audit #8) : masque le message Supabase brut.
      return NextResponse.json(
        {
          success: false,
          error: "Erreur interne du serveur",
        },
        { status: 500 }
      );
    }

    // Met à jour date_invitation
    // ⚠️ FIX BUG-AUDIT-RUNTIME #6 (P2) : on vérifie l'erreur UPDATE pour ne
    // pas renvoyer `success: true` si la mise à jour a échoué en base.
    // #12 — date_invitation : timestamp serveur (UTC). La colonne n'a pas
    // de DEFAULT NOW() (002_tables.sql:188 — nullable).
    const { error: updInvErr } = await admin
      .from("personnel")
      .update({ date_invitation: new Date().toISOString() })
      .eq("id", targetId);

    if (updInvErr) {
      console.error(
        "[api/admin/personnel/[id] POST resend_invitation] UPDATE date_invitation error:",
        updInvErr
      );
      return NextResponse.json(
        { success: false, error: "Erreur interne du serveur" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      action: "resend_invitation",
      invitedEmail: target.email,
    });
  }

  return NextResponse.json(
    {
      success: false,
      error:
        "Action invalide. Valeurs attendues : 'reset_password' ou 'resend_invitation'.",
    },
    { status: 400 }
  );
}
