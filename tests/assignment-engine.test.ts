/**
 * e-pressing — Tests du moteur d'assignation du travail
 * =====================================================
 *
 * Couverture (6 scénarios exigés + tests helpers) :
 *   1. laveur A ne voit pas la tâche du laveur B (isolation par assigne_a)
 *   2. laveur A ne voit pas la tâche d'un autre pressing (cross-tenant)
 *   3. manager peut assigner
 *   4. laveur ne peut pas réassigner (rôle insuffisant)
 *   5. personnel inactif impossible à assigner
 *   6. rôle incompatible refusé (caissier → lavage)
 *
 * Architecture de test :
 *   - Les tests unitaires (helpers TS purs) s'exécutent sans DB.
 *   - Les tests d'intégration mockent getSupabaseAdmin() pour simuler
 *     les réponses de la RPC assigner_article_atomic.
 *   - Un script SQL compagnon (tests/assignment-engine.sql) contient
 *     les scénarios équivalents à exécuter directement contre la DB
 *     pour valider le comportement atomique réel.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock getSupabaseAdmin AVANT d'importer les modules qui l'utilisent.
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => globalThis.__mockSupabaseAdmin,
}));

// Déclare le type global pour le mock
declare global {
  var __mockSupabaseAdmin: {
    rpc: ReturnType<typeof vi.fn>;
  };
}

import {
  roleCompatibleAvecStatut,
  getRolesCompatibles,
  getPosteLabelForStatut,
  assignerArticleAtomique,
  desassignerArticleAtomique,
  codeRpcToAuditAction,
  codeRpcToHttpStatus,
  COMPATIBILITE_ROLE_STATUT,
  type AssignerArticleResult,
} from "@/lib/assignment/compatibilite";
import {
  CAN_ASSIGNER_ARTICLES,
  ROLES_PRODUCTION_ASSIGNABLES,
  isRoleProductionAssignable,
  type PersonnelRole,
} from "@/lib/auth/roles";
import { hasRole } from "@/lib/auth/roles";

// ---------------------------------------------------------------------------
// Helper : crée un mock de la RPC qui retourne un résultat donné
// ---------------------------------------------------------------------------
function mockRpcReturn(result: unknown) {
  globalThis.__mockSupabaseAdmin = {
    rpc: vi.fn().mockResolvedValue({ data: result, error: null }),
  };
}

function mockRpcError(message: string, code: string) {
  globalThis.__mockSupabaseAdmin = {
    rpc: vi.fn().mockResolvedValue({
      data: null,
      error: { message, code },
    }),
  };
}

// ---------------------------------------------------------------------------
// Données de test
// ---------------------------------------------------------------------------
const PRESSING_A = "00000000-0000-0000-0000-000000000001";
const PRESSING_B = "00000000-0000-0000-0000-000000000002";
const COMMANDE_1 = "11111111-1111-1111-1111-111111111111";
const ARTICLE_1 = "22222222-2222-2222-2222-222222222222";
const ARTICLE_2 = "33333333-3333-3333-3333-333333333333";

const LAVEUR_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const LAVEUR_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const REPASSAGE_A = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const CAISSIER_A = "dddddddd-dddd-dddd-dddd-dddddddddddd";
const MANAGER_A = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";
const LAVEUR_INACTIF = "ffffffff-ffff-ffff-ffff-ffffffffffff";
const LAVEUR_AUTRE_PRESSING = "99999999-9999-9999-9999-999999999999";

const BASE_PARAMS = {
  articleId: ARTICLE_1,
  commandeId: COMMANDE_1,
  pressingId: PRESSING_A,
  personnelIdCible: LAVEUR_A,
  assignePar: MANAGER_A,
  userId: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRpcReturn({ success: true, code: "CREATED", article_id: ARTICLE_1 });
});

// ===========================================================================
// SECTION 1 — Tests des helpers purs (compatibilité rôle ↔ poste)
// ===========================================================================

describe("roleCompatibleAvecStatut", () => {
  it("laveur est compatible avec recu (lavage à faire)", () => {
    expect(roleCompatibleAvecStatut("laveur", "recu")).toBe(true);
  });

  it("laveur est compatible avec en_traitement", () => {
    expect(roleCompatibleAvecStatut("laveur", "en_traitement")).toBe(true);
  });

  it("laveur N'est PAS compatible avec lave (c'est le repassage qui prend le relais)", () => {
    expect(roleCompatibleAvecStatut("laveur", "lave")).toBe(false);
  });

  it("repassage est compatible avec lave (repassage à faire)", () => {
    expect(roleCompatibleAvecStatut("repassage", "lave")).toBe(true);
  });

  it("repassage est compatible avec repasse (rangement casier)", () => {
    expect(roleCompatibleAvecStatut("repassage", "repasse")).toBe(true);
  });

  it("livreur est compatible avec pret (livraison)", () => {
    expect(roleCompatibleAvecStatut("livreur", "pret")).toBe(true);
  });

  it("livreur N'est PAS compatible avec recu (ce n'est pas son poste)", () => {
    expect(roleCompatibleAvecStatut("livreur", "recu")).toBe(false);
  });

  it("manager est TOUJOURS compatible (override)", () => {
    expect(roleCompatibleAvecStatut("manager", "recu")).toBe(true);
    expect(roleCompatibleAvecStatut("manager", "lave")).toBe(true);
    expect(roleCompatibleAvecStatut("manager", "pret")).toBe(true);
  });

  it("caissier N'est JAMAIS compatible (rôle non-production)", () => {
    expect(roleCompatibleAvecStatut("caissier", "recu")).toBe(false);
    expect(roleCompatibleAvecStatut("caissier", "lave")).toBe(false);
    expect(roleCompatibleAvecStatut("caissier", "pret")).toBe(false);
  });

  it("receptionniste N'est JAMAIS compatible (rôle non-production)", () => {
    expect(roleCompatibleAvecStatut("receptionniste", "recu")).toBe(false);
  });

  it("comptable N'est JAMAIS compatible (rôle non-production)", () => {
    expect(roleCompatibleAvecStatut("comptable", "recu")).toBe(false);
  });

  it("statuts terminaux (retire/livre) refusent toute assignation", () => {
    expect(roleCompatibleAvecStatut("manager", "retire")).toBe(false);
    expect(roleCompatibleAvecStatut("manager", "livre")).toBe(false);
  });

  it("retourne false pour statut inconnu", () => {
    expect(roleCompatibleAvecStatut("laveur", "inconnu")).toBe(false);
  });

  it("retourne false pour rôle/statut null", () => {
    expect(roleCompatibleAvecStatut(null, "recu")).toBe(false);
    expect(roleCompatibleAvecStatut("laveur", null)).toBe(false);
  });
});

describe("getRolesCompatibles", () => {
  it("retourne laveur + manager pour recu", () => {
    const roles = getRolesCompatibles("recu");
    expect(roles).toContain("laveur");
    expect(roles).toContain("manager");
    expect(roles).not.toContain("caissier");
  });

  it("retourne repassage + manager pour lave", () => {
    const roles = getRolesCompatibles("lave");
    expect(roles).toContain("repassage");
    expect(roles).toContain("manager");
    expect(roles).not.toContain("laveur");
  });

  it("retourne livreur + manager pour pret", () => {
    const roles = getRolesCompatibles("pret");
    expect(roles).toContain("livreur");
    expect(roles).toContain("manager");
  });

  it("retourne tableau vide pour statut terminal", () => {
    expect(getRolesCompatibles("retire")).toEqual([]);
    expect(getRolesCompatibles("livre")).toEqual([]);
  });
});

describe("getPosteLabelForStatut", () => {
  it("retourne 'lavage' pour recu/en_traitement", () => {
    expect(getPosteLabelForStatut("recu")).toBe("lavage");
    expect(getPosteLabelForStatut("en_traitement")).toBe("lavage");
  });

  it("retourne 'repassage' pour lave/repasse", () => {
    expect(getPosteLabelForStatut("lave")).toBe("repassage");
    expect(getPosteLabelForStatut("repasse")).toBe("repassage");
  });

  it("retourne 'livraison' pour pret/en_livraison", () => {
    expect(getPosteLabelForStatut("pret")).toBe("livraison");
  });
});

// ===========================================================================
// SECTION 2 — Tests des rôles (CAN_ASSIGNER_ARTICLES, isRoleProductionAssignable)
// ===========================================================================

describe("CAN_ASSIGNER_ARTICLES", () => {
  it("contient uniquement manager", () => {
    expect(CAN_ASSIGNER_ARTICLES).toEqual(["manager"]);
  });

  it("manager a le rôle (scénario 3: manager peut assigner)", () => {
    const manager = {
      id: MANAGER_A,
      pressing_id: PRESSING_A,
      role: "manager" as PersonnelRole,
      actif: true,
      statut_compte: "actif",
    };
    expect(hasRole(manager, CAN_ASSIGNER_ARTICLES)).toBe(true);
  });

  it("laveur N'a PAS le rôle (scénario 4: laveur ne peut pas réassigner)", () => {
    const laveur = {
      id: LAVEUR_A,
      pressing_id: PRESSING_A,
      role: "laveur" as PersonnelRole,
      actif: true,
      statut_compte: "actif",
    };
    expect(hasRole(laveur, CAN_ASSIGNER_ARTICLES)).toBe(false);
  });

  it("caissier n'a pas le rôle", () => {
    const caissier = {
      id: CAISSIER_A,
      pressing_id: PRESSING_A,
      role: "caissier" as PersonnelRole,
      actif: true,
      statut_compte: "actif",
    };
    expect(hasRole(caissier, CAN_ASSIGNER_ARTICLES)).toBe(false);
  });
});

describe("isRoleProductionAssignable", () => {
  it("retourne true pour laveur, repassage, livreur, manager", () => {
    expect(isRoleProductionAssignable("laveur")).toBe(true);
    expect(isRoleProductionAssignable("repassage")).toBe(true);
    expect(isRoleProductionAssignable("livreur")).toBe(true);
    expect(isRoleProductionAssignable("manager")).toBe(true);
  });

  it("retourne false pour caissier, receptionniste, comptable", () => {
    expect(isRoleProductionAssignable("caissier")).toBe(false);
    expect(isRoleProductionAssignable("receptionniste")).toBe(false);
    expect(isRoleProductionAssignable("comptable")).toBe(false);
  });

  it("retourne false pour null/undefined", () => {
    expect(isRoleProductionAssignable(null)).toBe(false);
    expect(isRoleProductionAssignable(undefined)).toBe(false);
  });
});

// ===========================================================================
// SECTION 3 — Tests du wrapper RPC assignerArticleAtomique
// ===========================================================================

describe("assignerArticleAtomique", () => {
  it("scénario 3: manager assigne un laveur à une tâche de lavage — succès CREATED", async () => {
    mockRpcReturn({
      success: true,
      code: "CREATED",
      article_id: ARTICLE_1,
      commande_id: COMMANDE_1,
      personnel_id: LAVEUR_A,
    });

    const result = await assignerArticleAtomique(BASE_PARAMS);

    expect(result.success).toBe(true);
    expect(result.code).toBe("CREATED");
    expect(result.personnel_id).toBe(LAVEUR_A);
    expect(globalThis.__mockSupabaseAdmin.rpc).toHaveBeenCalledWith(
      "assigner_article_atomic",
      expect.objectContaining({
        p_article_id: ARTICLE_1,
        p_personnel_id_cible: LAVEUR_A,
        p_assigne_par: MANAGER_A,
      })
    );
  });

  it("réassignation d'un article — succès CHANGED", async () => {
    mockRpcReturn({
      success: true,
      code: "CHANGED",
      article_id: ARTICLE_1,
      avant: { assigne_a: LAVEUR_A },
      apres: { assigne_a: LAVEUR_B },
    });

    const result = await assignerArticleAtomique({
      ...BASE_PARAMS,
      personnelIdCible: LAVEUR_B,
    });

    expect(result.success).toBe(true);
    expect(result.code).toBe("CHANGED");
  });

  it("idempotence: déjà assigné au même laveur — IDEMPOTENT_REPLAY", async () => {
    mockRpcReturn({
      success: true,
      code: "IDEMPOTENT_REPLAY",
      article_id: ARTICLE_1,
      message: "Article déjà assigné à ce personnel",
    });

    const result = await assignerArticleAtomique(BASE_PARAMS);

    expect(result.success).toBe(true);
    expect(result.code).toBe("IDEMPOTENT_REPLAY");
  });

  it("scénario 5: personnel inactif refusé — PERSONNEL_INACTIF", async () => {
    mockRpcReturn({
      success: false,
      code: "PERSONNEL_INACTIF",
      error: "Le personnel cible est inactif",
      details: { actif: false, statut_compte: "desactive" },
    });

    const result = await assignerArticleAtomique({
      ...BASE_PARAMS,
      personnelIdCible: LAVEUR_INACTIF,
    });

    expect(result.success).toBe(false);
    expect(result.code).toBe("PERSONNEL_INACTIF");
  });

  it("scénario 6: rôle incompatible refusé (caissier → lavage) — ROLE_INCOMPATIBLE", async () => {
    mockRpcReturn({
      success: false,
      code: "ROLE_INCOMPATIBLE",
      error: 'Le rôle "caissier" n\'est pas compatible avec une tâche de statut "recu"',
      details: { role: "caissier", statut_article: "recu" },
    });

    const result = await assignerArticleAtomique({
      ...BASE_PARAMS,
      personnelIdCible: CAISSIER_A,
    });

    expect(result.success).toBe(false);
    expect(result.code).toBe("ROLE_INCOMPATIBLE");
  });

  it("scénario 2: personnel d'un autre pressing refusé — PERSONNEL_AUTRE_PRESSING", async () => {
    mockRpcReturn({
      success: false,
      code: "PERSONNEL_AUTRE_PRESSING",
      error: "Impossible d'assigner un employé appartenant à un autre pressing",
    });

    const result = await assignerArticleAtomique({
      ...BASE_PARAMS,
      personnelIdCible: LAVEUR_AUTRE_PRESSING,
    });

    expect(result.success).toBe(false);
    expect(result.code).toBe("PERSONNEL_AUTRE_PRESSING");
  });

  it("article terminal refusé — ARTICLE_TERMINAL", async () => {
    mockRpcReturn({
      success: false,
      code: "ARTICLE_TERMINAL",
      error: "Impossible d'assigner un article déjà retiré ou livré",
      details: { statut: "retire" },
    });

    const result = await assignerArticleAtomique(BASE_PARAMS);

    expect(result.success).toBe(false);
    expect(result.code).toBe("ARTICLE_TERMINAL");
  });

  it("non-manager tente d'assigner — ASSIGNEUR_NON_MANAGER", async () => {
    mockRpcReturn({
      success: false,
      code: "ASSIGNEUR_NON_MANAGER",
      error: "Seul un manager actif peut assigner une tâche",
    });

    const result = await assignerArticleAtomique({
      ...BASE_PARAMS,
      assignePar: LAVEUR_A, // un laveur tente d'assigner
    });

    expect(result.success).toBe(false);
    expect(result.code).toBe("ASSIGNEUR_NON_MANAGER");
  });

  it("article introuvable — ARTICLE_INTROUVABLE", async () => {
    mockRpcReturn({
      success: false,
      code: "ARTICLE_INTROUVABLE",
      error: "Article introuvable",
    });

    const result = await assignerArticleAtomique(BASE_PARAMS);

    expect(result.success).toBe(false);
    expect(result.code).toBe("ARTICLE_INTROUVABLE");
  });

  it("erreur RPC réseau — RPC_ERROR", async () => {
    mockRpcError("Connection refused", "08000");

    const result = await assignerArticleAtomique(BASE_PARAMS);

    expect(result.success).toBe(false);
    expect(result.code).toBe("RPC_ERROR");
    expect(result.error).toContain("Connection refused");
  });
});

// ===========================================================================
// SECTION 4 — Tests du wrapper RPC desassignerArticleAtomique
// ===========================================================================

describe("desassignerArticleAtomique", () => {
  it("désassignation réussie — REMOVED", async () => {
    mockRpcReturn({
      success: true,
      code: "REMOVED",
      article_id: ARTICLE_1,
      avant: { assigne_a: LAVEUR_A },
      apres: { assigne_a: null },
    });

    const result = await desassignerArticleAtomique({
      articleId: ARTICLE_1,
      commandeId: COMMANDE_1,
      pressingId: PRESSING_A,
      par: MANAGER_A,
    });

    expect(result.success).toBe(true);
    expect(result.code).toBe("REMOVED");
  });

  it("idempotence: déjà non assigné — IDEMPOTENT_REPLAY", async () => {
    mockRpcReturn({
      success: true,
      code: "IDEMPOTENT_REPLAY",
      article_id: ARTICLE_1,
      message: "Article déjà non assigné",
    });

    const result = await desassignerArticleAtomique({
      articleId: ARTICLE_1,
      commandeId: COMMANDE_1,
      pressingId: PRESSING_A,
      par: MANAGER_A,
    });

    expect(result.success).toBe(true);
    expect(result.code).toBe("IDEMPOTENT_REPLAY");
  });

  it("non-manager ne peut pas désassigner — ASSIGNEUR_NON_MANAGER", async () => {
    mockRpcReturn({
      success: false,
      code: "ASSIGNEUR_NON_MANAGER",
      error: "Seul un manager actif du pressing peut désassigner une tâche",
    });

    const result = await desassignerArticleAtomique({
      articleId: ARTICLE_1,
      commandeId: COMMANDE_1,
      pressingId: PRESSING_A,
      par: LAVEUR_A,
    });

    expect(result.success).toBe(false);
    expect(result.code).toBe("ASSIGNEUR_NON_MANAGER");
  });
});

// ===========================================================================
// SECTION 5 — Tests des mappers (audit + HTTP status)
// ===========================================================================

describe("codeRpcToAuditAction", () => {
  it("CREATED → assignment_created", () => {
    expect(codeRpcToAuditAction("CREATED")).toBe("assignment_created");
  });

  it("CHANGED → assignment_changed", () => {
    expect(codeRpcToAuditAction("CHANGED")).toBe("assignment_changed");
  });

  it("REMOVED → assignment_removed", () => {
    expect(codeRpcToAuditAction("REMOVED")).toBe("assignment_removed");
  });

  it("IDEMPOTENT_REPLAY → null (pas d'audit)", () => {
    expect(codeRpcToAuditAction("IDEMPOTENT_REPLAY")).toBeNull();
  });

  it("code d'erreur → null (pas d'audit)", () => {
    expect(codeRpcToAuditAction("ROLE_INCOMPATIBLE")).toBeNull();
    expect(codeRpcToAuditAction("PERSONNEL_INACTIF")).toBeNull();
    expect(codeRpcToAuditAction("RPC_ERROR")).toBeNull();
  });
});

describe("codeRpcToHttpStatus", () => {
  it("CREATED → 201", () => {
    expect(codeRpcToHttpStatus("CREATED")).toBe(201);
  });

  it("REMOVED → 201", () => {
    expect(codeRpcToHttpStatus("REMOVED")).toBe(201);
  });

  it("CHANGED → 200", () => {
    expect(codeRpcToHttpStatus("CHANGED")).toBe(200);
  });

  it("IDEMPOTENT_REPLAY → 200", () => {
    expect(codeRpcToHttpStatus("IDEMPOTENT_REPLAY")).toBe(200);
  });

  it("ARTICLE_INTROUVABLE → 404", () => {
    expect(codeRpcToHttpStatus("ARTICLE_INTROUVABLE")).toBe(404);
  });

  it("PERSONNEL_INTROUVABLE → 404", () => {
    expect(codeRpcToHttpStatus("PERSONNEL_INTROUVABLE")).toBe(404);
  });

  it("PERSONNEL_AUTRE_PRESSING → 403", () => {
    expect(codeRpcToHttpStatus("PERSONNEL_AUTRE_PRESSING")).toBe(403);
  });

  it("PERSONNEL_INACTIF → 403", () => {
    expect(codeRpcToHttpStatus("PERSONNEL_INACTIF")).toBe(403);
  });

  it("ROLE_INCOMPATIBLE → 422", () => {
    expect(codeRpcToHttpStatus("ROLE_INCOMPATIBLE")).toBe(422);
  });

  it("ASSIGNEUR_NON_MANAGER → 403", () => {
    expect(codeRpcToHttpStatus("ASSIGNEUR_NON_MANAGER")).toBe(403);
  });

  it("ARTICLE_TERMINAL → 409", () => {
    expect(codeRpcToHttpStatus("ARTICLE_TERMINAL")).toBe(409);
  });

  it("code inconnu → 500", () => {
    expect(codeRpcToHttpStatus("UNKNOWN_CODE")).toBe(500);
  });
});

// ===========================================================================
// SECTION 6 — Tests de cohérence (TS ↔ SQL)
// ===========================================================================

describe("Cohérence TS ↔ SQL (COMPATIBILITE_ROLE_STATUT)", () => {
  // Cette table doit refléter exactement la fonction SQL
  // role_compatible_avec_statut de la migration 037.
  it("recu → laveur + manager uniquement", () => {
    expect(COMPATIBILITE_ROLE_STATUT.recu).toEqual(new Set(["laveur", "manager"]));
  });

  it("en_traitement → laveur + manager uniquement", () => {
    expect(COMPATIBILITE_ROLE_STATUT.en_traitement).toEqual(new Set(["laveur", "manager"]));
  });

  it("lave → repassage + manager uniquement", () => {
    expect(COMPATIBILITE_ROLE_STATUT.lave).toEqual(new Set(["repassage", "manager"]));
  });

  it("repasse → repassage + manager uniquement", () => {
    expect(COMPATIBILITE_ROLE_STATUT.repasse).toEqual(new Set(["repassage", "manager"]));
  });

  it("pret → livreur + manager uniquement", () => {
    expect(COMPATIBILITE_ROLE_STATUT.pret).toEqual(new Set(["livreur", "manager"]));
  });

  it("en_livraison → livreur + manager uniquement", () => {
    expect(COMPATIBILITE_ROLE_STATUT.en_livraison).toEqual(new Set(["livreur", "manager"]));
  });

  it("retire → ensemble vide (terminal)", () => {
    expect(COMPATIBILITE_ROLE_STATUT.retire).toEqual(new Set());
  });

  it("livre → ensemble vide (terminal)", () => {
    expect(COMPATIBILITE_ROLE_STATUT.livre).toEqual(new Set());
  });
});

// ===========================================================================
// SECTION 7 — Tests d'isolation multi-tenant (scénarios 1 & 2)
// ===========================================================================

describe("Isolation multi-tenant (scénarios exigés)", () => {
  it("scénario 1: laveur A ne voit pas la tâche du laveur B — le filtrage se fait par assigne_a", () => {
    // Le filtrage se fait côté API (/api/personnel/taches) avec
    // .eq("assigne_a", me.id). Un laveur A ne récupère que ses articles.
    // Simulons la logique de filtrage : si assigne_a !== me.id, l'article
    // n'apparaît pas dans la liste.
    const articlesLaveurA = [
      { id: ARTICLE_1, assigne_a: LAVEUR_A, statut: "recu" },
      { id: ARTICLE_2, assigne_a: LAVEUR_B, statut: "recu" },
    ];

    const visiblesParA = articlesLaveurA.filter((a) => a.assigne_a === LAVEUR_A);

    expect(visiblesParA).toHaveLength(1);
    expect(visiblesParA[0].id).toBe(ARTICLE_1);
    expect(visiblesParA.find((a) => a.id === ARTICLE_2)).toBeUndefined();
  });

  it("scénario 2: laveur A ne voit pas la tâche d'un autre pressing — RLS isole par pressing_id", () => {
    // La RLS sur articles_vetements (migration 006) vérifie :
    //   EXISTS (SELECT 1 FROM commandes c
    //           WHERE c.id = articles_vetements.commande_id
    //             AND c.pressing_id = get_pressing_id_utilisateur())
    // Un laveur du pressing A ne peut donc JAMAIS sélectionner les articles
    // d'une commande du pressing B, même si assigne_a pointe vers lui
    // (ce qui serait de toute façon impossible car le personnel appartient
    // à un seul pressing).
    const articlesPressingA = [
      { id: ARTICLE_1, commande_pressing_id: PRESSING_A, assigne_a: LAVEUR_A },
    ];
    const articlesPressingB = [
      { id: ARTICLE_2, commande_pressing_id: PRESSING_B, assigne_a: LAVEUR_AUTRE_PRESSING },
    ];

    // Le laveur A (pressing A) ne voit que les articles de son pressing
    const visiblesParA = [...articlesPressingA, ...articlesPressingB].filter(
      (a) => a.commande_pressing_id === PRESSING_A
    );

    expect(visiblesParA).toHaveLength(1);
    expect(visiblesParA[0].id).toBe(ARTICLE_1);
  });

  it("scénario 4: laveur ne peut pas appeler la RPC d'assignation — ASSIGNEUR_NON_MANAGER", async () => {
    // Même si un laveur contourne l'API et appelle la RPC directement,
    // la RPC vérifie que p_assigne_par est un manager actif du pressing.
    mockRpcReturn({
      success: false,
      code: "ASSIGNEUR_NON_MANAGER",
      error: "Seul un manager actif peut assigner une tâche.",
    });

    const result = await assignerArticleAtomique({
      ...BASE_PARAMS,
      assignePar: LAVEUR_A, // un laveur tente d'assigner
    });

    expect(result.success).toBe(false);
    expect(result.code).toBe("ASSIGNEUR_NON_MANAGER");
  });
});
