/**
 * e-pressing — Tests du système de casiers uniques (migration 039)
 * =================================================================
 *
 * Couverture (15 scénarios — incluant concurrence + rollback) :
 *
 *   1.  assignation simple — casier libre → CASIER_ASSIGNE
 *   2.  libération simple — casier occupé → CASIER_LIBERE
 *   3.  libération idempotente — casier déjà libre → CASIER_DEJA_LIBRE
 *   4.  casier introuvable → CASIER_INTROUVABLE
 *   5.  article introuvable → ARTICLE_INTROUVABLE
 *   6.  article statut invalide (non 'pret') → ARTICLE_STATUT_INVALIDE
 *   7.  casier inactif → CASIER_INACTIF
 *   8.  CONCURRENCE — 2 requêtes simultanées sur A1 → UNE seule réussit
 *       (CASIER_OCCUPE pour la 2e)
 *   9.  CONCURRENCE — unique_violation 23505 → mappée en CASIER_OCCUPE
 *   10. réaffectation — article déjà dans un casier → auto-libère l'ancien
 *   11. mapping code RPC → statut HTTP (table de vérité)
 *   12. validation params — pressing_id/code/article_id manquants
 *   13. RPC error générique → RPC_ERROR
 *   14. RPC exception → RPC_EXCEPTION
 *   15. messages d'erreur FR (table de vérité)
 *
 * Architecture de test :
 *   - Tests unitaires (helpers purs + mapping) : sans DB.
 *   - Tests d'intégration : mockent getSupabaseAdmin() pour simuler
 *     les réponses de la RPC assigner_casier_atomic.
 *   - Un script SQL compagnon (tests/casiers-engine.sql) contient les
 *     scénarios équivalents à exécuter directement contre la DB pour
 *     valider le comportement atomique réel (vraie transaction, vrai
 *     ROLLBACK, vraie concurrence via pg_advisory_xact_lock).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock getSupabaseAdmin AVANT d'importer les modules qui l'utilisent.
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => globalThis.__mockSupabaseAdmin,
}));

declare global {
  var __mockSupabaseAdmin: {
    rpc: ReturnType<typeof vi.fn>;
  };
}

import {
  assignerCasierAtomique,
  libererCasierAtomique,
  codeRpcToHttpStatus,
  getErrorMessage,
  type AssignerCasierParams,
  type LibererCasierParams,
} from "@/lib/casiers/service";

// ---------------------------------------------------------------------------
// Helpers de mock
// ---------------------------------------------------------------------------

function mockRpcReturn(result: unknown) {
  globalThis.__mockSupabaseAdmin = {
    rpc: vi.fn().mockResolvedValue({ data: result, error: null }),
  };
}

function mockRpcError(message: string, code: string, pgCode?: string) {
  globalThis.__mockSupabaseAdmin = {
    rpc: vi.fn().mockResolvedValue({
      data: null,
      error: { message, code, ...(pgCode ? { pgCode } : {}) },
    }),
  };
}

function mockRpcException(err: unknown) {
  globalThis.__mockSupabaseAdmin = {
    rpc: vi.fn().mockRejectedValue(err),
  };
}

beforeEach(() => {
  globalThis.__mockSupabaseAdmin = {
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
});

// ---------------------------------------------------------------------------
// Données de test
// ---------------------------------------------------------------------------

const PRESSING_ID = "00000000-0000-0000-0000-000000000001";
const PERSONNEL_ID = "00000000-0000-0000-0000-0000000000bb";
const ARTICLE_ID_1 = "00000000-0000-0000-0000-0000000000a1";
const ARTICLE_ID_2 = "00000000-0000-0000-0000-0000000000a2";
const CASIER_ID_A1 = "00000000-0000-0000-0000-0000000000c1";
const AFFECTATION_ID = "00000000-0000-0000-0000-0000000000d1";

const baseAssignParams: AssignerCasierParams = {
  pressing_id: PRESSING_ID,
  casier_code: "A1",
  article_id: ARTICLE_ID_1,
  affecte_par: PERSONNEL_ID,
  ip_address: "127.0.0.1",
  user_agent: "vitest/1.0",
};

const baseLibererParams: LibererCasierParams = {
  pressing_id: PRESSING_ID,
  casier_code: "A1",
  libere_par: PERSONNEL_ID,
  motif: "Libération manuelle",
  ip_address: "127.0.0.1",
  user_agent: "vitest/1.0",
};

// ===========================================================================
// TESTS — Assignation
// ===========================================================================

describe("assignerCasierAtomique", () => {
  // -------------------------------------------------------
  // 1. Assignation simple — casier libre
  // -------------------------------------------------------
  it("1. casier libre → CASIER_ASSIGNE", async () => {
    mockRpcReturn({
      success: true,
      code: "CASIER_ASSIGNE",
      data: {
        affectation_id: AFFECTATION_ID,
        casier_id: CASIER_ID_A1,
        casier_code: "A1",
        article_id: ARTICLE_ID_1,
        affecte_le: "2026-08-14T12:00:00Z",
      },
    });

    const result = await assignerCasierAtomique(baseAssignParams);

    expect(result.success).toBe(true);
    expect(result.code).toBe("CASIER_ASSIGNE");
    expect(result.data?.casier_code).toBe("A1");
    expect(result.data?.affectation_id).toBe(AFFECTATION_ID);
    expect(globalThis.__mockSupabaseAdmin.rpc).toHaveBeenCalledWith(
      "assigner_casier_atomic",
      expect.objectContaining({
        p_casier_code: "A1",
        p_article_id: ARTICLE_ID_1,
        p_affecte_par: PERSONNEL_ID,
      })
    );
  });

  // -------------------------------------------------------
  // 4. Casier introuvable
  // -------------------------------------------------------
  it("4. casier introuvable → CASIER_INTROUVABLE", async () => {
    mockRpcReturn({
      success: false,
      code: "CASIER_INTROUVABLE",
      details: { casier_code: "Z99" },
    });

    const result = await assignerCasierAtomique({
      ...baseAssignParams,
      casier_code: "Z99",
    });

    expect(result.success).toBe(false);
    expect(result.code).toBe("CASIER_INTROUVABLE");
    expect(result.details).toMatchObject({ casier_code: "Z99" });
  });

  // -------------------------------------------------------
  // 5. Article introuvable
  // -------------------------------------------------------
  it("5. article introuvable → ARTICLE_INTROUVABLE", async () => {
    mockRpcReturn({
      success: false,
      code: "ARTICLE_INTROUVABLE",
      details: { article_id: ARTICLE_ID_2 },
    });

    const result = await assignerCasierAtomique({
      ...baseAssignParams,
      article_id: ARTICLE_ID_2,
    });

    expect(result.success).toBe(false);
    expect(result.code).toBe("ARTICLE_INTROUVABLE");
  });

  // -------------------------------------------------------
  // 6. Article statut invalide
  // -------------------------------------------------------
  it("6. article statut invalide → ARTICLE_STATUT_INVALIDE", async () => {
    mockRpcReturn({
      success: false,
      code: "ARTICLE_STATUT_INVALIDE",
      details: { statut: "recu", statuts_valides: ["pret", "repasse"] },
    });

    const result = await assignerCasierAtomique(baseAssignParams);

    expect(result.success).toBe(false);
    expect(result.code).toBe("ARTICLE_STATUT_INVALIDE");
  });

  // -------------------------------------------------------
  // 7. Casier inactif
  // -------------------------------------------------------
  it("7. casier inactif → CASIER_INACTIF", async () => {
    mockRpcReturn({
      success: false,
      code: "CASIER_INACTIF",
      details: { casier_id: CASIER_ID_A1, code: "A1" },
    });

    const result = await assignerCasierAtomique(baseAssignParams);

    expect(result.success).toBe(false);
    expect(result.code).toBe("CASIER_INACTIF");
  });

  // -------------------------------------------------------
  // 8. CONCURRENCE — 2 requêtes simultanées sur A1
  //    La 1re réussit, la 2e obtient CASIER_OCCUPE.
  //    On mocke 2 réponses séquentielles (la RPC sérialise via
  //    SELECT FOR UPDATE — la 2e requête attend le COMMIT de la 1re,
  //    puis voit l'affectation active → CASIER_OCCUPE).
  // -------------------------------------------------------
  it("8. concurrence — 2 requêtes simultanées sur A1 → une seule réussit", async () => {
    let callCount = 0;
    const responses = [
      // 1re requête — réussit
      {
        success: true,
        code: "CASIER_ASSIGNE",
        data: {
          affectation_id: AFFECTATION_ID,
          casier_id: CASIER_ID_A1,
          casier_code: "A1",
          article_id: ARTICLE_ID_1,
          affecte_le: "2026-08-14T12:00:00Z",
        },
      },
      // 2e requête — casier occupé par la 1re
      {
        success: false,
        code: "CASIER_OCCUPE",
        details: {
          casier_id: CASIER_ID_A1,
          casier_code: "A1",
          article_occupe_id: ARTICLE_ID_1,
          affectation_id: AFFECTATION_ID,
        },
      },
    ];

    globalThis.__mockSupabaseAdmin = {
      rpc: vi.fn().mockImplementation(() => {
        const response = responses[callCount];
        callCount++;
        return Promise.resolve({ data: response, error: null });
      }),
    };

    // Lance 2 assignations en parallèle (2 employés cliquent en même temps)
    const [r1, r2] = await Promise.all([
      assignerCasierAtomique({
        ...baseAssignParams,
        article_id: ARTICLE_ID_1,
      }),
      assignerCasierAtomique({
        ...baseAssignParams,
        article_id: ARTICLE_ID_2,
      }),
    ]);

    // Une seule réussit
    expect(r1.success).toBe(true);
    expect(r1.code).toBe("CASIER_ASSIGNE");
    expect(r2.success).toBe(false);
    expect(r2.code).toBe("CASIER_OCCUPE");
    expect(r2.details).toMatchObject({
      article_occupe_id: ARTICLE_ID_1,
    });

    // La RPC a bien été appelée 2 fois
    expect(globalThis.__mockSupabaseAdmin.rpc).toHaveBeenCalledTimes(2);
  });

  // -------------------------------------------------------
  // 9. CONCURRENCE — unique_violation 23505 → CASIER_OCCUPE
  //    Cas extrême : la race condition est si serrée que le SELECT FOR
  //    UPDATE ne sérialise pas à temps et l'INSERT échoue sur l'index
  //    partiel UNIQUE. Le wrapper TS mappe 23505 → CASIER_OCCUPE.
  // -------------------------------------------------------
  it("9. concurrence — 23505 unique_violation → CASIER_OCCUPE", async () => {
    mockRpcError(
      'duplicate key value violates unique constraint "idx_casier_affectations_unique_active_casier"',
      "23505"
    );

    const result = await assignerCasierAtomique(baseAssignParams);

    expect(result.success).toBe(false);
    expect(result.code).toBe("CASIER_OCCUPE");
    expect(result.details).toMatchObject({ pg_code: "23505" });
  });

  // -------------------------------------------------------
  // 10. Réaffectation — article déjà dans un casier
  //     La RPC auto-libère l'ancien casier et assigne le nouveau.
  // -------------------------------------------------------
  it("10. réaffectation — RPC auto-libère l'ancien casier", async () => {
    mockRpcReturn({
      success: true,
      code: "CASIER_ASSIGNE",
      data: {
        affectation_id: AFFECTATION_ID,
        casier_id: "00000000-0000-0000-0000-0000000000c2",
        casier_code: "B1",
        article_id: ARTICLE_ID_1,
        affecte_le: "2026-08-14T12:30:00Z",
      },
    });

    const result = await assignerCasierAtomique({
      ...baseAssignParams,
      casier_code: "B1", // nouvel casier
      article_id: ARTICLE_ID_1, // article déjà dans A1
    });

    expect(result.success).toBe(true);
    expect(result.code).toBe("CASIER_ASSIGNE");
    expect(result.data?.casier_code).toBe("B1");
    // La RPC a géré l'auto-libération en interne (le mock ne vérifie
    // pas cela — c'est testé dans le SQL compagnon).
  });

  // -------------------------------------------------------
  // 13. RPC error générique
  // -------------------------------------------------------
  it("13. RPC error générique → RPC_ERROR", async () => {
    mockRpcError("connection refused", "08006");

    const result = await assignerCasierAtomique(baseAssignParams);

    expect(result.success).toBe(false);
    expect(result.code).toBe("RPC_ERROR");
    expect(result.details).toMatchObject({ pg_code: "08006" });
  });

  // -------------------------------------------------------
  // 14. RPC exception → RPC_EXCEPTION
  // -------------------------------------------------------
  it("14. RPC exception → RPC_EXCEPTION", async () => {
    mockRpcException(new Error("Network error"));

    const result = await assignerCasierAtomique(baseAssignParams);

    expect(result.success).toBe(false);
    expect(result.code).toBe("RPC_EXCEPTION");
  });
});

// ===========================================================================
// TESTS — Libération
// ===========================================================================

describe("libererCasierAtomique", () => {
  // -------------------------------------------------------
  // 2. Libération simple — casier occupé
  // -------------------------------------------------------
  it("2. casier occupé → CASIER_LIBERE", async () => {
    mockRpcReturn({
      success: true,
      code: "CASIER_LIBERE",
      data: {
        casier_id: CASIER_ID_A1,
        casier_code: "A1",
        article_id: ARTICLE_ID_1,
        libere_le: "2026-08-14T14:00:00Z",
      },
    });

    const result = await libererCasierAtomique(baseLibererParams);

    expect(result.success).toBe(true);
    expect(result.code).toBe("CASIER_LIBERE");
    expect(result.data?.casier_code).toBe("A1");
    expect(result.data?.libere_le).toBe("2026-08-14T14:00:00Z");
    expect(globalThis.__mockSupabaseAdmin.rpc).toHaveBeenCalledWith(
      "liberer_casier_atomic",
      expect.objectContaining({
        p_casier_code: "A1",
        p_libere_par: PERSONNEL_ID,
        p_motif: "Libération manuelle",
      })
    );
  });

  // -------------------------------------------------------
  // 3. Libération idempotente — casier déjà libre
  // -------------------------------------------------------
  it("3. casier déjà libre → CASIER_DEJA_LIBRE (idempotent)", async () => {
    mockRpcReturn({
      success: true,
      code: "CASIER_DEJA_LIBRE",
      data: {
        casier_id: CASIER_ID_A1,
        casier_code: "A1",
      },
    });

    const result = await libererCasierAtomique(baseLibererParams);

    expect(result.success).toBe(true);
    expect(result.code).toBe("CASIER_DEJA_LIBRE");
  });

  // -------------------------------------------------------
  // 4b. Libération — casier introuvable
  // -------------------------------------------------------
  it("4b. libérer casier introuvable → CASIER_INTROUVABLE", async () => {
    mockRpcReturn({
      success: false,
      code: "CASIER_INTROUVABLE",
      details: { casier_code: "Z99" },
    });

    const result = await libererCasierAtomique({
      ...baseLibererParams,
      casier_code: "Z99",
    });

    expect(result.success).toBe(false);
    expect(result.code).toBe("CASIER_INTROUVABLE");
  });
});

// ===========================================================================
// TESTS — Mapping code RPC → HTTP
// ===========================================================================

describe("codeRpcToHttpStatus — table de vérité", () => {
  it("11. mappe chaque code RPC au bon statut HTTP", () => {
    const cases: Array<[string, number]> = [
      // Success
      ["CASIER_ASSIGNE", 201],
      ["CASIER_LIBERE", 200],
      ["CASIER_DEJA_LIBRE", 200],
      // 400 — Bad Request
      ["PRESSING_ID_REQUIS", 400],
      ["CASIER_CODE_REQUIS", 400],
      ["ARTICLE_ID_REQUIS", 400],
      ["ARTICLE_STATUT_INVALIDE", 400],
      // 403 — Forbidden
      ["CASIER_PRESSING_MISMATCH", 403],
      // 404 — Not Found
      ["CASIER_INTROUVABLE", 404],
      ["ARTICLE_INTROUVABLE", 404],
      // 409 — Conflict
      ["CASIER_OCCUPE", 409],
      // 410 — Gone (casier inactif)
      ["CASIER_INACTIF", 410],
      // 500 — fallback
      ["RPC_ERROR", 500],
      ["RPC_EXCEPTION", 500],
      ["RPC_NO_DATA", 500],
      // Unknown → 500
      ["UNKNOWN_CODE", 500],
    ];

    for (const [code, expected] of cases) {
      expect(codeRpcToHttpStatus(code)).toBe(expected);
    }
  });
});

// ===========================================================================
// TESTS — Messages d'erreur FR
// ===========================================================================

describe("getErrorMessage — messages FR", () => {
  it("15. retourne un message FR pour chaque code connu", () => {
    const cases: Array<[string, RegExp]> = [
      ["CASIER_OCCUPE", /déjà occupé/],
      ["CASIER_INTROUVABLE", /introuvable/],
      ["CASIER_INACTIF", /désactivé/],
      ["ARTICLE_INTROUVABLE", /Article introuvable/],
      ["ARTICLE_STATUT_INVALIDE", /pret.*repasse/],
      ["CASIER_PRESSING_MISMATCH", /pressing/],
    ];

    for (const [code, pattern] of cases) {
      expect(getErrorMessage(code)).toMatch(pattern);
    }
  });

  it("15b. fallback pour code inconnu", () => {
    expect(getErrorMessage("UNKNOWN", "Custom fallback")).toBe("Custom fallback");
    expect(getErrorMessage("UNKNOWN")).toBe("Erreur inconnue.");
  });
});

// ===========================================================================
// TESTS — Validation des paramètres (côté RPC)
// ===========================================================================

describe("assignerCasierAtomique — validation params", () => {
  it("12a. pressing_id manquant → PRESSING_ID_REQUIS (de la RPC)", async () => {
    mockRpcReturn({
      success: false,
      code: "PRESSING_ID_REQUIS",
    });

    const result = await assignerCasierAtomique({
      ...baseAssignParams,
      pressing_id: "",
    });

    expect(result.success).toBe(false);
    expect(result.code).toBe("PRESSING_ID_REQUIS");
  });

  it("12b. casier_code manquant → CASIER_CODE_REQUIS", async () => {
    mockRpcReturn({
      success: false,
      code: "CASIER_CODE_REQUIS",
    });

    const result = await assignerCasierAtomique({
      ...baseAssignParams,
      casier_code: "",
    });

    expect(result.success).toBe(false);
    expect(result.code).toBe("CASIER_CODE_REQUIS");
  });

  it("12c. article_id manquant → ARTICLE_ID_REQUIS", async () => {
    mockRpcReturn({
      success: false,
      code: "ARTICLE_ID_REQUIS",
    });

    const result = await assignerCasierAtomique({
      ...baseAssignParams,
      article_id: "",
    });

    expect(result.success).toBe(false);
    expect(result.code).toBe("ARTICLE_ID_REQUIS");
  });
});
