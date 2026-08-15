/**
 * e-pressing — Tests du système financier immuable (types d'annulation)
 * ====================================================================
 *
 * Couverture (migration 043) :
 *   1.  TypeAnnulationPaiement type + TYPES_ANNULATION_VALIDES
 *   2.  isTypeAnnulationValid guard (valeurs valides + invalides)
 *   3.  annulerPaiementAtomique passe p_type à la RPC
 *   4.  Type par défaut 'autre' si non fourni (rétrocompatibilité)
 *   5.  Chaque type (erreur_saisie, doublon, remboursement, autre) est
 *       transmis correctement
 *   6.  Le résultat contient le type dans data
 *   7.  CAN_ANNULER_PAIEMENT inclut manager ET comptable
 *   8.  RPC refuse un rôle non autorisé (caissier, réceptionniste)
 *
 * Architecture :
 *   - Tests unitaires (helpers TS purs) — pas de DB.
 *   - Tests d'intégration mockent getSupabaseAdmin() pour vérifier que
 *     p_type est bien passé à la RPC.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock getSupabaseAdmin AVANT l'import.
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => globalThis.__mockSupabaseAdmin,
}));

declare global {
  var __mockSupabaseAdmin: {
    rpc: ReturnType<typeof vi.fn>;
  };
}

import {
  annulerPaiementAtomique,
  isTypeAnnulationValid,
  TYPES_ANNULATION_VALIDES,
  type TypeAnnulationPaiement,
} from "@/lib/financial/atomic";
import { CAN_ANNULER_PAIEMENT } from "@/lib/auth/roles";

// ---------------------------------------------------------------------------
// Helper : mock la RPC pour retourner un résultat donné
// ---------------------------------------------------------------------------
function mockRpcReturn(result: unknown) {
  globalThis.__mockSupabaseAdmin = {
    rpc: vi.fn().mockResolvedValue({ data: result, error: null }),
  };
}

function mockRpcError(pgError: { code: string; message: string }) {
  globalThis.__mockSupabaseAdmin = {
    rpc: vi.fn().mockResolvedValue({ data: null, error: pgError }),
  };
}

function getLastRpcCall() {
  return globalThis.__mockSupabaseAdmin.rpc.mock.calls[0];
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ===========================================================================
// 1. Types + guards
// ===========================================================================

describe("TypeAnnulationPaiement — types et guards", () => {
  it("TYPES_ANNULATION_VALIDES contient les 4 types", () => {
    expect(TYPES_ANNULATION_VALIDES).toEqual([
      "erreur_saisie",
      "doublon",
      "remboursement",
      "autre",
    ]);
  });

  it("isTypeAnnulationValid accepte les 4 types valides", () => {
    const valides: TypeAnnulationPaiement[] = [
      "erreur_saisie",
      "doublon",
      "remboursement",
      "autre",
    ];
    for (const t of valides) {
      expect(isTypeAnnulationValid(t)).toBe(true);
    }
  });

  it("isTypeAnnulationValid rejette les valeurs invalides", () => {
    expect(isTypeAnnulationValid("unknown")).toBe(false);
    expect(isTypeAnnulationValid("")).toBe(false);
    expect(isTypeAnnulationValid(null)).toBe(false);
    expect(isTypeAnnulationValid(undefined)).toBe(false);
    expect(isTypeAnnulationValid(123)).toBe(false);
    expect(isTypeAnnulationValid({})).toBe(false);
    // Sensibilité à la casse
    expect(isTypeAnnulationValid("Erreur_Saisie")).toBe(false);
    expect(isTypeAnnulationValid("REMBOURSEMENT")).toBe(false);
  });
});

// ===========================================================================
// 2. CAN_ANNULER_PAIEMENT — autorisations
// ===========================================================================

describe("CAN_ANNULER_PAIEMENT — rôles autorisés", () => {
  it("inclut manager ET comptable", () => {
    expect(CAN_ANNULER_PAIEMENT).toContain("manager");
    expect(CAN_ANNULER_PAIEMENT).toContain("comptable");
    expect(CAN_ANNULER_PAIEMENT).toHaveLength(2);
  });

  it("n'inclut pas caissier ni réceptionniste", () => {
    expect(CAN_ANNULER_PAIEMENT).not.toContain("caissier");
    expect(CAN_ANNULER_PAIEMENT).not.toContain("receptionniste");
    expect(CAN_ANNULER_PAIEMENT).not.toContain("laveur");
    expect(CAN_ANNULER_PAIEMENT).not.toContain("repassage");
  });
});

// ===========================================================================
// 3. annulerPaiementAtomique — passage du p_type à la RPC
// ===========================================================================

describe("annulerPaiementAtomique — passage du type à la RPC", () => {
  const baseParams = {
    paiement_id: "pay-1",
    pressing_id: "pressing-1",
    user_id: "user-1",
    personnel_id: "pers-1",
    motif: "Erreur de saisie du montant",
    role: "manager",
  };

  it("passe p_type='erreur_saisie' quand type est fourni", async () => {
    mockRpcReturn({
      success: true,
      code: "ANNULATION_OK",
      data: {
        paiement_id: "pay-1",
        commande_id: "cmd-1",
        montant_annule: 5000,
        nouveau_montant_paye: 0,
        nouveau_statut_paiement: "non_paye",
        reste_a_payer: 10000,
        type: "erreur_saisie",
      },
    });

    const result = await annulerPaiementAtomique({
      ...baseParams,
      type: "erreur_saisie",
    });

    expect(result.success).toBe(true);
    const call = getLastRpcCall();
    expect(call[0]).toBe("annuler_paiement");
    expect(call[1]).toMatchObject({
      p_paiement_id: "pay-1",
      p_type: "erreur_saisie",
      p_motif: "Erreur de saisie du montant",
      p_role: "manager",
    });
  });

  it("passe p_type='doublon' pour un doublon", async () => {
    mockRpcReturn({
      success: true,
      code: "ANNULATION_OK",
      data: {
        paiement_id: "pay-1",
        commande_id: "cmd-1",
        montant_annule: 3000,
        nouveau_montant_paye: 3000,
        nouveau_statut_paiement: "partiel",
        reste_a_payer: 7000,
        type: "doublon",
      },
    });

    await annulerPaiementAtomique({
      ...baseParams,
      type: "doublon",
    });

    const call = getLastRpcCall();
    expect(call[1]).toMatchObject({ p_type: "doublon" });
  });

  it("passe p_type='remboursement' pour un remboursement", async () => {
    mockRpcReturn({
      success: true,
      code: "ANNULATION_OK",
      data: {
        paiement_id: "pay-1",
        commande_id: "cmd-1",
        montant_annule: 10000,
        nouveau_montant_paye: 0,
        nouveau_statut_paiement: "non_paye",
        reste_a_payer: 10000,
        type: "remboursement",
      },
    });

    await annulerPaiementAtomique({
      ...baseParams,
      type: "remboursement",
    });

    const call = getLastRpcCall();
    expect(call[1]).toMatchObject({ p_type: "remboursement" });
  });

  it("passe p_type='autre' par défaut si type non fourni (rétrocompat)", async () => {
    mockRpcReturn({
      success: true,
      code: "ANNULATION_OK",
      data: {
        paiement_id: "pay-1",
        commande_id: "cmd-1",
        montant_annule: 5000,
        nouveau_montant_paye: 0,
        nouveau_statut_paiement: "non_paye",
        reste_a_payer: 10000,
        type: "autre",
      },
    });

    // Pas de champ type dans les params → doit défaut à 'autre'
    await annulerPaiementAtomique(baseParams);

    const call = getLastRpcCall();
    expect(call[1]).toMatchObject({ p_type: "autre" });
  });

  it("passe p_type='autre' si type est undefined explicite", async () => {
    mockRpcReturn({
      success: true,
      code: "ANNULATION_OK",
      data: {
        paiement_id: "pay-1",
        commande_id: "cmd-1",
        montant_annule: 5000,
        nouveau_montant_paye: 0,
        nouveau_statut_paiement: "non_paye",
        reste_a_payer: 10000,
        type: "autre",
      },
    });

    await annulerPaiementAtomique({
      ...baseParams,
      type: undefined,
    });

    const call = getLastRpcCall();
    expect(call[1]).toMatchObject({ p_type: "autre" });
  });
});

// ===========================================================================
// 4. annulerPaiementAtomique — résultat contient le type
// ===========================================================================

describe("annulerPaiementAtomique — résultat avec type", () => {
  const baseParams = {
    paiement_id: "pay-1",
    pressing_id: "pressing-1",
    user_id: "user-1",
    personnel_id: "pers-1",
    motif: "Doublon — double clic",
    role: "comptable",
    type: "doublon" as const,
  };

  it("retourne le type dans data quand la RPC le fournit", async () => {
    mockRpcReturn({
      success: true,
      code: "ANNULATION_OK",
      data: {
        paiement_id: "pay-1",
        commande_id: "cmd-1",
        montant_annule: 5000,
        nouveau_montant_paye: 0,
        nouveau_statut_paiement: "non_paye",
        reste_a_payer: 10000,
        type: "doublon",
      },
    });

    const result = await annulerPaiementAtomique(baseParams);
    expect(result.success).toBe(true);
    expect(result.data?.type).toBe("doublon");
  });

  it("le comptable peut annuler (role='comptable' accepté)", async () => {
    mockRpcReturn({
      success: true,
      code: "ANNULATION_OK",
      data: {
        paiement_id: "pay-1",
        commande_id: "cmd-1",
        montant_annule: 5000,
        nouveau_montant_paye: 0,
        nouveau_statut_paiement: "non_paye",
        reste_a_payer: 10000,
        type: "remboursement",
      },
    });

    const result = await annulerPaiementAtomique({
      ...baseParams,
      role: "comptable",
      type: "remboursement",
    });

    expect(result.success).toBe(true);
    const call = getLastRpcCall();
    expect(call[1]).toMatchObject({
      p_role: "comptable",
      p_type: "remboursement",
    });
  });
});

// ===========================================================================
// 5. annulerPaiementAtomique — gestion d'erreurs RPC
// ===========================================================================

describe("annulerPaiementAtomique — erreurs RPC avec type", () => {
  const baseParams = {
    paiement_id: "pay-1",
    pressing_id: "pressing-1",
    user_id: "user-1",
    personnel_id: "pers-1",
    motif: "Test erreur",
    role: "manager",
    type: "erreur_saisie" as const,
  };

  it("ROLE_INSUFFISANT — la RPC refuse un caissier même avec type valide", async () => {
    mockRpcReturn({
      success: false,
      code: "ROLE_INSUFFISANT",
      error: "Seul le manager ou le comptable peut annuler un paiement.",
      details: {
        role_recu: "caissier",
        roles_autorises: ["manager", "comptable"],
      },
    });

    const result = await annulerPaiementAtomique({
      ...baseParams,
      role: "caissier",
    });

    expect(result.success).toBe(false);
    expect(result.code).toBe("ROLE_INSUFFISANT");
    expect(result.details).toEqual({
      role_recu: "caissier",
      roles_autorises: ["manager", "comptable"],
    });
  });

  it("PAIEMENT_DÉJÀ_ANNULE — refusé même avec type valide", async () => {
    mockRpcReturn({
      success: false,
      code: "PAIEMENT_DÉJÀ_ANNULE",
      error: "Ce paiement est déjà annulé.",
    });

    const result = await annulerPaiementAtomique(baseParams);
    expect(result.success).toBe(false);
    expect(result.code).toBe("PAIEMENT_DÉJÀ_ANNULE");
  });

  it("RPC error PostgreSQL — gérée gracieusement", async () => {
    mockRpcError({ code: "P0001", message: "Raise exception" });

    const result = await annulerPaiementAtomique(baseParams);
    expect(result.success).toBe(false);
    expect(result.code).toBe("RPC_ERROR");
    expect(result.details).toMatchObject({ pg_code: "P0001" });
  });

  it("RPC exception — gérée gracieusement", async () => {
    globalThis.__mockSupabaseAdmin = {
      rpc: vi.fn().mockRejectedValue(new Error("Network failure")),
    };

    const result = await annulerPaiementAtomique(baseParams);
    expect(result.success).toBe(false);
    expect(result.code).toBe("RPC_EXCEPTION");
  });
});

// ===========================================================================
// 6. Vérification que tous les paramètres sont passés à la RPC
// ===========================================================================

describe("annulerPaiementAtomique — tous les params RPC", () => {
  it("passe TOUS les paramètres attendus (incluant p_type)", async () => {
    mockRpcReturn({
      success: true,
      code: "ANNULATION_OK",
      data: {
        paiement_id: "pay-1",
        commande_id: "cmd-1",
        montant_annule: 5000,
        nouveau_montant_paye: 0,
        nouveau_statut_paiement: "non_paye",
        reste_a_payer: 10000,
        type: "erreur_saisie",
      },
    });

    await annulerPaiementAtomique({
      paiement_id: "pay-1",
      pressing_id: "pressing-1",
      user_id: "user-1",
      personnel_id: "pers-1",
      motif: "Mauvais montant",
      role: "manager",
      type: "erreur_saisie",
    });

    const call = getLastRpcCall();
    expect(call[1]).toEqual({
      p_paiement_id: "pay-1",
      p_pressing_id: "pressing-1",
      p_user_id: "user-1",
      p_personnel_id: "pers-1",
      p_motif: "Mauvais montant",
      p_role: "manager",
      p_type: "erreur_saisie",
    });
  });
});
