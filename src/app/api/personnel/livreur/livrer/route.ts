/**
 * e-pressing — API /api/personnel/livreur/livrer (POST) — LIV-1
 * ----------------------------------------------------------------
 * Permet au livreur de faire évoluer une commande dans son workflow
 * de livraison :
 *
 *   action="demarrer" : pret     → en_livraison
 *   action="livrer"   : en_livraison → livre + date_livraison=NOW()
 *                                     + tous les articles_vetements → "livre"
 *
 * Body : { commande_id: string, action: "demarrer" | "livrer" }
 *
 * 🔒 SÉCURITÉ :
 *   - Auth Supabase (JWT) obligatoire
 *   - Le personnel connecté doit avoir role="livreur", actif=true,
 *     statut_compte="actif"
 *   - RLS isole automatiquement par pressing_id : le livreur ne peut
 *     toucher que les commandes de son propre pressing
 *
 * ⚙️ LOGIQUE :
 *   1. Fetch la commande par id (RLS filtre par pressing)
 *   2. Vérifie le statut courant attendu :
 *        - "demarrer" → commande.statut doit être "pret"
 *        - "livrer"   → commande.statut doit être "en_livraison"
 *   3. UPDATE commandes (statut, et date_livraison si "livrer")
 *   4. Si "livrer" : UPDATE tous les articles_vetements de la commande
 *      SET statut="livre" (cascade via commande_id FK)
 *   5. Re-fetch la commande pour retourner le nouveau statut
 *
 * Réponse : { success: true, data: { id, statut, date_livraison } }
 *
 * Codes d'erreur :
 *   400 — Body invalide / commande_id manquant / action invalide
 *   401 — Non authentifié
 *   403 — Accès refusé (rôle livreur requis / compte inactif)
 *   404 — Commande introuvable (ou hors pressing via RLS)
 *   409 — La commande n'est pas dans le statut attendu pour l'action
 *   500 — Erreur serveur (Supabase)
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/* ------------------------------------------------------------------ */
/*  Constantes & helpers                                              */
/* ------------------------------------------------------------------ */

/** Actions autorisées par le livreur sur une commande. */
type LivreurAction = "demarrer" | "livrer";

const ACTIONS_VALID: readonly LivreurAction[] = ["demarrer", "livrer"];

/**
 * Regex de validation d'un UUID v4 (case-insensitive).
 * On accepte aussi les UUID générés par Supabase (gen_random_uuid()).
 */
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface LivrerBody {
  commande_id?: unknown;
  action?: unknown;
}

/** Authentifie le livreur et retourne son row personnel + le client Supabase. */
async function getConnectedLivreur() {
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
  const { data: me } = await supabase
    .from("personnel")
    .select("id, pressing_id, role, actif, statut_compte")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (!me || me.actif !== true || me.statut_compte !== "actif") {
    return {
      error: NextResponse.json(
        { success: false, error: "Compte inactif ou désactivé" },
        { status: 403 }
      ),
    };
  }
  if (me.role !== "livreur") {
    return {
      error: NextResponse.json(
        { success: false, error: "Réservé au livreur" },
        { status: 403 }
      ),
    };
  }
  return { me, supabase };
}

/* ------------------------------------------------------------------ */
/*  POST                                                              */
/* ------------------------------------------------------------------ */

export async function POST(request: NextRequest) {
  const auth = await getConnectedLivreur();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  // --- Parse + validation du body ---
  let body: LivrerBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Corps de requête invalide (JSON attendu)" },
      { status: 400 }
    );
  }

  const commandeId =
    typeof body.commande_id === "string" ? body.commande_id.trim() : "";
  if (!commandeId) {
    return NextResponse.json(
      { success: false, error: "L'identifiant de la commande est obligatoire." },
      { status: 400 }
    );
  }
  if (!UUID_REGEX.test(commandeId)) {
    return NextResponse.json(
      { success: false, error: "Identifiant de commande invalide." },
      { status: 400 }
    );
  }

  const action =
    typeof body.action === "string" ? (body.action as LivreurAction) : null;
  if (!action || !(ACTIONS_VALID as readonly string[]).includes(action)) {
    return NextResponse.json(
      {
        success: false,
        error: "Action invalide. Valeurs attendues : \"demarrer\" ou \"livrer\".",
      },
      { status: 400 }
    );
  }

  // --- Fetch de la commande (RLS isole par pressing_id) ---
  const { data: commande, error: cmdErr } = await supabase
    .from("commandes")
    .select("id, statut, livraison, date_livraison")
    .eq("id", commandeId)
    .maybeSingle();

  if (cmdErr) {
    console.error("[api/personnel/livreur/livrer] Erreur SELECT commande:", cmdErr);
    return NextResponse.json(
      { success: false, error: "Erreur lors de la récupération de la commande." },
      { status: 500 }
    );
  }
  if (!commande) {
    // RLS a filtré la commande (hors pressing) OU elle n'existe pas.
    // On renvoie 404 sans distinguer les deux cas (sécurité).
    return NextResponse.json(
      { success: false, error: "Commande introuvable ou accès refusé." },
      { status: 404 }
    );
  }

  // --- Validation du statut attendu ---
  if (action === "demarrer") {
    if (commande.statut !== "pret") {
      return NextResponse.json(
        {
          success: false,
          error: "La commande n'est pas prête pour la livraison.",
        },
        { status: 409 }
      );
    }
  } else {
    // action === "livrer"
    if (commande.statut !== "en_livraison") {
      return NextResponse.json(
        {
          success: false,
          error: "La commande n'est pas en cours de livraison.",
        },
        { status: 409 }
      );
    }
  }

  // --- UPDATE commande ---
  const nowIso = new Date().toISOString();
  const updatePayload: Record<string, unknown> =
    action === "demarrer"
      ? { statut: "en_livraison", updated_at: nowIso }
      : { statut: "livre", date_livraison: nowIso, updated_at: nowIso };

  const { data: cmdUpdated, error: updateErr } = await supabase
    .from("commandes")
    .update(updatePayload)
    .eq("id", commandeId)
    .select("id, statut, date_livraison")
    .maybeSingle();

  if (updateErr || !cmdUpdated) {
    console.error(
      "[api/personnel/livreur/livrer] Erreur UPDATE commande:",
      updateErr
    );
    return NextResponse.json(
      { success: false, error: "Erreur lors de la mise à jour de la commande." },
      { status: 500 }
    );
  }

  // --- Si "livrer" : passer tous les articles_vetements à "livre" ---
  if (action === "livrer") {
    const { error: artsErr } = await supabase
      .from("articles_vetements")
      .update({ statut: "livre", updated_at: nowIso })
      .eq("commande_id", commandeId)
      .neq("statut", "livre"); // on évite l'UPDATE inutile des articles déjà livre

    if (artsErr) {
      // Non bloquant : la commande est déjà marquée "livre", on logue
      // l'erreur mais on renvoie le succès (la commande est livrée).
      console.error(
        "[api/personnel/livreur/livrer] Erreur UPDATE articles_vetements:",
        artsErr
      );
    }
  }

  return NextResponse.json({
    success: true,
    data: {
      id: cmdUpdated.id,
      statut: cmdUpdated.statut,
      date_livraison: cmdUpdated.date_livraison,
    },
  });
}
