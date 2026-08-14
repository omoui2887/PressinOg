/**
 * e-pressing — API /api/admin/paiements/[id]/annuler (POST)
 * ---------------------------------------------------------
 * Annule un paiement financier (reversal entry).
 *
 * ⚠️ PRINCIPE FONDAMENTAL : on ne supprime JAMAIS un paiement financier.
 * Pour corriger une erreur, on crée une écriture de reversal :
 *   1. Le paiement est marqué `statut_row='annule'` (PAS de DELETE)
 *   2. Une ligne est créée dans `paiement_annulations` (motif, auteur, date)
 *   3. `commandes.montant_paye` + `statut_paiement` sont recalculés
 *   4. Une entrée `audit_log` (action='annuler_paiement') trace l'action
 *
 * 🔒 AUTORISATION : seul le manager peut annuler un paiement.
 *   - Vérifié côté API (CAN_ANNULER_PAIEMENT)
 *   - Vérifié côté SQL (RPC annuler_paiement vérifie p_role='manager')
 *   Defense-in-depth : même si un caissier bypass l'API, la RPC refuse.
 *
 * Body : { motif }
 *   - motif : texte obligatoire (≤ 1000 chars) expliquant la raison de
 *             l'annulation (ex: "erreur de saisie du montant", "doublon").
 *
 * Réponse : { success: true, data: { paiement_id, commande_id, montant_annule,
 *           nouveau_montant_paye, nouveau_statut_paiement, reste_a_payer } }
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  CAN_ANNULER_PAIEMENT,
  type PersonnelRole,
} from "@/lib/auth/roles";
import { logAudit } from "@/lib/audit";
import { annulerPaiementAtomique } from "@/lib/financial/atomic";

export const dynamic = "force-dynamic";

interface AnnulerBody {
  motif?: unknown;
}

/**
 * Authentifie le manager et retourne son row personnel + le client Supabase.
 * Seul le manager peut annuler un paiement (CAN_ANNULER_PAIEMENT).
 */
type ManagerRow = {
  id: string;
  user_id: string;
  pressing_id: string;
  role: string;
  actif: boolean | null;
  statut_compte: string;
};

async function getConnectedManager() {
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
  const { data: me, error: meErr } = await supabase
    .from("personnel")
    .select(
      "id, user_id, pressing_id, role, actif, statut_compte"
    )
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (meErr) {
    console.error(
      "[api/admin/paiements/[id]/annuler] Erreur SELECT personnel:",
      meErr
    );
    return {
      error: NextResponse.json(
        { success: false, error: "Erreur lors de la vérification du compte." },
        { status: 500 }
      ),
    };
  }

  const meRow = me as ManagerRow | null;
  if (!meRow || meRow.actif !== true || meRow.statut_compte !== "actif") {
    return {
      error: NextResponse.json(
        { success: false, error: "Compte inactif ou désactivé" },
        { status: 403 }
      ),
    };
  }
  if (!CAN_ANNULER_PAIEMENT.includes(meRow.role as PersonnelRole)) {
    return {
      error: NextResponse.json(
        {
          success: false,
          error:
            "Accès refusé — seul le manager peut annuler un paiement.",
          code: "ROLE_INSUFFISANT",
        },
        { status: 403 }
      ),
    };
  }
  return { me: meRow, supabase };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getConnectedManager();
  if ("error" in auth) return auth.error;
  const { me } = auth;

  const { id: paiementId } = await params;
  if (!paiementId) {
    return NextResponse.json(
      { success: false, error: "ID paiement manquant." },
      { status: 400 }
    );
  }

  let body: AnnulerBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Corps de requête invalide (JSON attendu)" },
      { status: 400 }
    );
  }

  const motif =
    typeof body.motif === "string" ? body.motif.trim() : "";
  if (!motif) {
    return NextResponse.json(
      {
        success: false,
        error: "Un motif d'annulation est obligatoire.",
        code: "MOTIF_REQUIS",
      },
      { status: 400 }
    );
  }
  if (motif.length > 1000) {
    return NextResponse.json(
      {
        success: false,
        error: "Le motif ne peut pas dépasser 1000 caractères.",
        code: "MOTIF_TOO_LONG",
      },
      { status: 400 }
    );
  }

  // --- Appel à la RPC atomique annuler_paiement ---
  // La RPC vérifie (côté SQL) :
  //   - que le paiement existe et appartient au pressing
  //   - que le paiement n'est pas déjà annulé
  //   - que la commande n'est pas annulée
  //   - que p_role='manager' (defense-in-depth)
  // Puis :
  //   - marque le paiement statut_row='annule' (PAS de DELETE)
  //   - crée l'écriture dans paiement_annulations
  //   - recalcule montant_paye + statut_paiement
  const result = await annulerPaiementAtomique({
    paiement_id: paiementId,
    pressing_id: me.pressing_id,
    user_id: me.user_id,
    personnel_id: me.id,
    motif,
    role: me.role,
  });

  if (!result.success || !result.data) {
    const code = result.code || "RPC_ERROR";
    const errorMessage = result.error || "Erreur lors de l'annulation.";
    const details = result.details;

    if (code === "PAIEMENT_INTROUVABLE") {
      return NextResponse.json(
        { success: false, error: errorMessage, code, details },
        { status: 404 }
      );
    }
    if (
      code === "ROLE_INSUFFISANT" ||
      code === "PRESSING_MISMATCH"
    ) {
      return NextResponse.json(
        { success: false, error: errorMessage, code, details },
        { status: 403 }
      );
    }
    if (
      code === "PAIEMENT_DÉJÀ_ANNULE" ||
      code === "COMMANDE_ANNULEE"
    ) {
      return NextResponse.json(
        { success: false, error: errorMessage, code, details },
        { status: 409 }
      );
    }
    if (
      code === "MOTIF_REQUIS" ||
      code === "MOTIF_TOO_LONG"
    ) {
      return NextResponse.json(
        { success: false, error: errorMessage, code, details },
        { status: 400 }
      );
    }
    console.error(
      "[api/admin/paiements/[id]/annuler] RPC error:",
      result
    );
    return NextResponse.json(
      { success: false, error: errorMessage, code, details },
      { status: 500 }
    );
  }

  const annulationData = result.data;

  // --- Audit log (action='annuler_paiement') ---
  // Best-effort : ne bloque jamais la réponse.
  await logAudit({
    pressing_id: me.pressing_id,
    user_id: me.user_id,
    action: "annuler_paiement",
    entity_type: "paiement_annulation",
    entity_id: paiementId,
    before_state: {
      paiement_id: paiementId,
      commande_id: annulationData.commande_id,
      montant_annule: annulationData.montant_annule,
    },
    after_state: {
      paiement_id: paiementId,
      commande_id: annulationData.commande_id,
      motif,
      annule_par: me.id,
      nouveau_montant_paye: annulationData.nouveau_montant_paye,
      nouveau_statut_paiement: annulationData.nouveau_statut_paiement,
    },
    req: request,
  });

  return NextResponse.json({
    success: true,
    data: annulationData,
  });
}
