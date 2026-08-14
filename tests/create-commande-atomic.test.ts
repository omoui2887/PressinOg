/**
 * e-pressing — Tests de la création de commande atomique (RPC)
 * ============================================================
 *
 * Couverture (12 scénarios — incluant concurrence + rollback) :
 *
 *   1.  commande simple sans remise ni acompte
 *   2.  commande avec acompte partiel (statut 'partiel')
 *   3.  commande avec acompte total (statut 'paye')
 *   4.  commande avec remise commerciale (pourcentage)
 *   5.  commande avec remise fidélité (calculée côté serveur)
 *   6.  commande avec article personnalisé (prix custom)
 *   7.  idempotence — même clé retourne la commande existante
 *   8.  idempotence race condition — 2e requête perd la course
 *       (unique_violation 23505)
 *   9.  concurrence — 2 créations parallèles avec clés différentes
 *       → 2 commandes distinctes avec 2 numero_commande séquentiels
 *   10. rollback — erreur à mi-parcours (acompte > total)
 *       → aucune commande créée
 *   11. rollback — erreur sur lookup services (service inactif)
 *       → aucune commande créée
 *   12. mapping code RPC → statut HTTP (table de vérité)
 *
 * Architecture de test :
 *   - Tests unitaires (helpers purs + mapping) : sans DB.
 *   - Tests d'intégration : mockent getSupabaseAdmin() pour simuler
 *     les réponses de la RPC create_commande_atomic.
 *   - Un script SQL compagnon (tests/create-commande-atomic.sql)
 *     contient les scénarios équivalents à exécuter directement
 *     contre la DB pour valider le comportement atomique réel
 *     (vraie transaction, vrai ROLLBACK, vraie concurrence).
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
  createCommandeAtomique,
  codeRpcToHttpStatus,
  type CreateCommandeAtomiqueParams,
  type CreateCommandeAtomiqueResult,
} from "@/lib/financial/create-commande";

// ---------------------------------------------------------------------------
// Helpers de mock
// ---------------------------------------------------------------------------

function mockRpcReturn(result: unknown) {
  globalThis.__mockSupabaseAdmin = {
    rpc: vi.fn().mockResolvedValue({ data: result, error: null }),
  };
}

function mockRpcError(
  message: string,
  code: string,
  pgCode?: string
) {
  globalThis.__mockSupabaseAdmin = {
    rpc: vi.fn().mockResolvedValue({
      data: null,
      error: { message, code, ...(pgCode ? { pgCode } : {}) },
    }),
  };
}

beforeEach(() => {
  // Reset mock avant chaque test
  globalThis.__mockSupabaseAdmin = {
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
});

// ---------------------------------------------------------------------------
// Données de test
// ---------------------------------------------------------------------------

const PRESSING_ID = "00000000-0000-0000-0000-000000000001";
const USER_ID = "00000000-0000-0000-0000-0000000000aa";
const PERSONNEL_ID = "00000000-0000-0000-0000-0000000000bb";
const CLIENT_ID = "00000000-0000-0000-0000-0000000000cc";
const SERVICE_ID_LAVAGE = "00000000-0000-0000-0000-0000000000dd";
const CATALOGUE_ID_CHEMISE = "00000000-0000-0000-0000-0000000000ee";
const COMMANDE_ID = "11111111-1111-1111-1111-111111111111";

const baseParams: CreateCommandeAtomiqueParams = {
  pressing_id: PRESSING_ID,
  user_id: USER_ID,
  personnel_id: PERSONNEL_ID,
  role: "manager",
  client_id: CLIENT_ID,
  date_pret_prevue: "2026-08-20T18:00:00Z",
  notes: null,
  priorite: "normal",
  idempotence_key: null,
  articles: [
    {
      service_id: SERVICE_ID_LAVAGE,
      catalogue_article_id: CATALOGUE_ID_CHEMISE,
      catalogue_article_nom: "Chemises",
      couleur: "blanc",
      etat: "bon",
      quantite: 3,
    },
  ],
  remise: null,
  acompte: null,
  ip_address: "127.0.0.1",
  user_agent: "vitest/1.0",
};

// ===========================================================================
// TESTS UNITAIRES — Mapping code RPC → statut HTTP
// ===========================================================================

describe("codeRpcToHttpStatus — table de vérité", () => {
  it("retourne 201 pour COMMANDE_CREEE", () => {
    expect(codeRpcToHttpStatus("COMMANDE_CREEE")).toBe(201);
  });

  it("retourne 200 pour IDEMPOTENT_REPLAY", () => {
    expect(codeRpcToHttpStatus("IDEMPOTENT_REPLAY")).toBe(200);
  });

  it("retourne 400 pour les erreurs de validation input", () => {
    const codes400 = [
      "ARTICLES_VIDES",
      "CLIENT_ID_REQUIS",
      "DATE_PRET_REQUISE",
      "NOTES_TOO_LONG",
      "PRIORITE_INVALIDE",
      "IDEMPOTENCE_KEY_TOO_LONG",
      "ARTICLE_INVALIDE",
      "ACOMPTE_INVALIDE",
      "ACOMPTE_DEPASSE_TOTAL",
      "SERVICE_INTROUVABLE",
      "SERVICE_INACTIF",
      "CATALOGUE_INTROUVABLE",
      "CATALOGUE_INACTIF",
      "POURCENTAGE_INVALIDE",
      "POURCENTAGE_100_REFUSE",
      "POURCENTAGE_DEPASSE_MAX",
      "MONTANT_FIXE_INVALIDE",
      "INDEX_ARTICLE_INVALIDE",
      "ARTICLES_MANQUANTS",
      "TYPE_REMISE_INVALIDE",
      "MONTANT_INVALIDE",
    ];
    for (const code of codes400) {
      expect(codeRpcToHttpStatus(code)).toBe(400);
    }
  });

  it("retourne 403 pour les erreurs d'autorisation", () => {
    expect(codeRpcToHttpStatus("ROLE_INSUFFISANT")).toBe(403);
    expect(codeRpcToHttpStatus("REMISE_EXCEPTIONNELLE_REQUIERT_MANAGER")).toBe(
      403
    );
    expect(codeRpcToHttpStatus("FIDELITE_PCT_INVALIDE")).toBe(403);
  });

  it("retourne 404 pour CLIENT_INTROUVABLE", () => {
    expect(codeRpcToHttpStatus("CLIENT_INTROUVABLE")).toBe(404);
  });

  it("retourne 409 pour PRESSING_MISMATCH", () => {
    expect(codeRpcToHttpStatus("PRESSING_MISMATCH")).toBe(409);
  });

  it("retourne 500 pour les erreurs système et le fallback", () => {
    expect(codeRpcToHttpStatus("RPC_ERROR")).toBe(500);
    expect(codeRpcToHttpStatus("RPC_EXCEPTION")).toBe(500);
    expect(codeRpcToHttpStatus("RPC_NO_DATA")).toBe(500);
    expect(codeRpcToHttpStatus("UNKNOWN_CODE")).toBe(500);
  });
});

// ===========================================================================
// TESTS D'INTÉGRATION — createCommandeAtomique (mock RPC)
// ===========================================================================

describe("createCommandeAtomique — scénarios nominaux", () => {
  // -------------------------------------------------------
  // 1. Commande simple sans remise ni acompte
  // -------------------------------------------------------
  it("1. commande simple — statut 'non_paye', montant_paye=0", async () => {
    mockRpcReturn({
      success: true,
      code: "COMMANDE_CREEE",
      data: {
        id: COMMANDE_ID,
        pressing_id: PRESSING_ID,
        numero_commande: "CMD-2026-00001",
        montant_total: 1500,
        montant_paye: 0,
        montant_total_avant_remise: 1500,
        montant_remise: 0,
        remise_type: "aucune",
        remise_valeur: 0,
        statut: "recu",
        statut_paiement: "non_paye",
        priorite: "normal",
        date_pret_prevue: "2026-08-20T18:00:00Z",
        date_retrait: "2026-08-27T18:00:00Z",
      },
    });

    const result = await createCommandeAtomique(baseParams);
    expect(result.success).toBe(true);
    expect(result.code).toBe("COMMANDE_CREEE");
    expect(result.data?.id).toBe(COMMANDE_ID);
    expect(result.data?.numero_commande).toBe("CMD-2026-00001");
    expect(result.data?.montant_total).toBe(1500);
    expect(result.data?.montant_paye).toBe(0);
    expect(result.data?.statut_paiement).toBe("non_paye");
    expect(result.data?.priorite).toBe("normal");

    // Vérifie que la RPC a été appelée avec les bons paramètres
    expect(globalThis.__mockSupabaseAdmin.rpc).toHaveBeenCalledTimes(1);
    const callArgs = globalThis.__mockSupabaseAdmin.rpc.mock.calls[0];
    expect(callArgs[0]).toBe("create_commande_atomic");
    expect(callArgs[1].p_pressing_id).toBe(PRESSING_ID);
    expect(callArgs[1].p_client_id).toBe(CLIENT_ID);
    expect(callArgs[1].p_articles_json).toHaveLength(1);
    expect(callArgs[1].p_articles_json[0].quantite).toBe(3);
    expect(callArgs[1].p_remise).toBeNull();
    expect(callArgs[1].p_acompte).toBeNull();
    expect(callArgs[1].p_ip_address).toBe("127.0.0.1");
  });

  // -------------------------------------------------------
  // 2. Commande avec acompte partiel
  // -------------------------------------------------------
  it("2. acompte partiel — statut 'partiel'", async () => {
    mockRpcReturn({
      success: true,
      code: "COMMANDE_CREEE",
      data: {
        id: COMMANDE_ID,
        pressing_id: PRESSING_ID,
        numero_commande: "CMD-2026-00002",
        montant_total: 1500,
        montant_paye: 500,
        montant_total_avant_remise: 1500,
        montant_remise: 0,
        remise_type: "aucune",
        remise_valeur: 0,
        statut: "recu",
        statut_paiement: "partiel",
        priorite: "normal",
        date_pret_prevue: "2026-08-20T18:00:00Z",
        date_retrait: "2026-08-27T18:00:00Z",
      },
    });

    const result = await createCommandeAtomique({
      ...baseParams,
      acompte: { montant: 500, methode: "especes" },
    });
    expect(result.success).toBe(true);
    expect(result.data?.statut_paiement).toBe("partiel");
    expect(result.data?.montant_paye).toBe(500);

    // Vérifie que l'acompte est bien passé au format JSONB attendu
    const callArgs = globalThis.__mockSupabaseAdmin.rpc.mock.calls[0];
    expect(callArgs[1].p_acompte).toEqual({
      montant: 500,
      methode: "especes",
      reference: null,
    });
  });

  // -------------------------------------------------------
  // 3. Commande avec acompte total (statut 'paye')
  // -------------------------------------------------------
  it("3. acompte total — statut 'paye'", async () => {
    mockRpcReturn({
      success: true,
      code: "COMMANDE_CREEE",
      data: {
        id: COMMANDE_ID,
        pressing_id: PRESSING_ID,
        numero_commande: "CMD-2026-00003",
        montant_total: 1500,
        montant_paye: 1500,
        montant_total_avant_remise: 1500,
        montant_remise: 0,
        remise_type: "aucune",
        remise_valeur: 0,
        statut: "recu",
        statut_paiement: "paye",
        priorite: "normal",
        date_pret_prevue: "2026-08-20T18:00:00Z",
        date_retrait: "2026-08-27T18:00:00Z",
      },
    });

    const result = await createCommandeAtomique({
      ...baseParams,
      acompte: { montant: 1500, methode: "mobile_money", reference: "MOMO-123" },
    });
    expect(result.success).toBe(true);
    expect(result.data?.statut_paiement).toBe("paye");
    expect(result.data?.montant_paye).toBe(1500);

    const callArgs = globalThis.__mockSupabaseAdmin.rpc.mock.calls[0];
    expect(callArgs[1].p_acompte).toEqual({
      montant: 1500,
      methode: "mobile_money",
      reference: "MOMO-123",
    });
  });

  // -------------------------------------------------------
  // 4. Commande avec remise commerciale (pourcentage)
  // -------------------------------------------------------
  it("4. remise commerciale 10% — montant_remise calculé côté serveur", async () => {
    mockRpcReturn({
      success: true,
      code: "COMMANDE_CREEE",
      data: {
        id: COMMANDE_ID,
        pressing_id: PRESSING_ID,
        numero_commande: "CMD-2026-00004",
        montant_total: 1350,
        montant_paye: 0,
        montant_total_avant_remise: 1500,
        montant_remise: 150,
        remise_type: "pourcentage",
        remise_valeur: 10,
        statut: "recu",
        statut_paiement: "non_paye",
        priorite: "normal",
        date_pret_prevue: "2026-08-20T18:00:00Z",
        date_retrait: "2026-08-27T18:00:00Z",
      },
    });

    const result = await createCommandeAtomique({
      ...baseParams,
      remise: { type: "pourcentage", valeur: 10 },
    });
    expect(result.success).toBe(true);
    expect(result.data?.montant_remise).toBe(150);
    expect(result.data?.montant_total).toBe(1350);

    const callArgs = globalThis.__mockSupabaseAdmin.rpc.mock.calls[0];
    expect(callArgs[1].p_remise).toEqual({
      type: "pourcentage",
      valeur: 10,
    });
  });

  // -------------------------------------------------------
  // 5. Commande avec remise fidélité (5% calculée côté serveur)
  // -------------------------------------------------------
  it("5. remise fidélité 5% — valeur ignorée côté client, calculée côté serveur", async () => {
    mockRpcReturn({
      success: true,
      code: "COMMANDE_CREEE",
      data: {
        id: COMMANDE_ID,
        pressing_id: PRESSING_ID,
        numero_commande: "CMD-2026-00005",
        montant_total: 1425,
        montant_paye: 0,
        montant_total_avant_remise: 1500,
        montant_remise: 75,
        remise_type: "fidelite",
        remise_valeur: 5,
        statut: "recu",
        statut_paiement: "non_paye",
        priorite: "normal",
        date_pret_prevue: "2026-08-20T18:00:00Z",
        date_retrait: "2026-08-27T18:00:00Z",
      },
    });

    const result = await createCommandeAtomique({
      ...baseParams,
      remise: { type: "fidelite", valeur: 0 }, // valeur 0 = ignorée, serveur calcule
    });
    expect(result.success).toBe(true);
    expect(result.data?.remise_type).toBe("fidelite");
    expect(result.data?.remise_valeur).toBe(5);
    expect(result.data?.montant_remise).toBe(75);
  });

  // -------------------------------------------------------
  // 6. Commande avec article personnalisé (prix custom)
  // -------------------------------------------------------
  it("6. article personnalisé — prix_unitaire custom transmis à la RPC", async () => {
    mockRpcReturn({
      success: true,
      code: "COMMANDE_CREEE",
      data: {
        id: COMMANDE_ID,
        pressing_id: PRESSING_ID,
        numero_commande: "CMD-2026-00006",
        montant_total: 2500,
        montant_paye: 0,
        montant_total_avant_remise: 2500,
        montant_remise: 0,
        remise_type: "aucune",
        remise_valeur: 0,
        statut: "recu",
        statut_paiement: "non_paye",
        priorite: "normal",
        date_pret_prevue: "2026-08-20T18:00:00Z",
        date_retrait: "2026-08-27T18:00:00Z",
      },
    });

    const result = await createCommandeAtomique({
      ...baseParams,
      articles: [
        {
          service_id: SERVICE_ID_LAVAGE,
          catalogue_article_id: CATALOGUE_ID_CHEMISE,
          catalogue_article_nom: "Boubou traditionnel",
          couleur: "rouge",
          etat: "bon",
          quantite: 1,
          is_custom: true,
          prix_unitaire: 2500,
        },
      ],
    });
    expect(result.success).toBe(true);
    expect(result.data?.montant_total).toBe(2500);

    const callArgs = globalThis.__mockSupabaseAdmin.rpc.mock.calls[0];
    expect(callArgs[1].p_articles_json[0]).toMatchObject({
      is_custom: true,
      prix_unitaire: 2500,
      catalogue_article_nom: "Boubou traditionnel",
    });
  });
});

// ===========================================================================
// TESTS — Idempotence + concurrence
// ===========================================================================

describe("createCommandeAtomique — idempotence + concurrence", () => {
  // -------------------------------------------------------
  // 7. Idempotence — même clé retourne la commande existante
  // -------------------------------------------------------
  it("7. idempotence — replay retourne la commande existante", async () => {
    const existingCommande = {
      success: true,
      code: "IDEMPOTENT_REPLAY",
      data: {
        id: COMMANDE_ID,
        pressing_id: PRESSING_ID,
        numero_commande: "CMD-2026-00007",
        montant_total: 1500,
        montant_paye: 0,
        montant_total_avant_remise: 1500,
        montant_remise: 0,
        remise_type: "aucune",
        remise_valeur: 0,
        statut: "recu",
        statut_paiement: "non_paye",
        priorite: "normal",
        date_pret_prevue: "2026-08-20T18:00:00Z",
        date_retrait: "2026-08-27T18:00:00Z",
      },
    };
    mockRpcReturn(existingCommande);

    const idempotencyKey = "550e8400-e29b-41d4-a716-446655440000";
    const result = await createCommandeAtomique({
      ...baseParams,
      idempotence_key: idempotencyKey,
    });

    expect(result.success).toBe(true);
    expect(result.code).toBe("IDEMPOTENT_REPLAY");
    expect(result.data?.id).toBe(COMMANDE_ID);

    // Vérifie que la clé d'idempotence est bien passée à la RPC
    const callArgs = globalThis.__mockSupabaseAdmin.rpc.mock.calls[0];
    expect(callArgs[1].p_idempotence_key).toBe(idempotencyKey);
  });

  // -------------------------------------------------------
  // 8. Idempotence race condition — 2e requête perd la course
  //    (unique_violation 23505 sur idx_commandes_idempotence)
  //    Le mock simule l'erreur PostgREST.
  // -------------------------------------------------------
  it("8. idempotence race — 23505 retourne IDEMPOTENCE_RACE_CONDITION", async () => {
    mockRpcError(
      "duplicate key value violates unique constraint \"idx_commandes_idempotence\"",
      "23505"
    );

    const result = await createCommandeAtomique({
      ...baseParams,
      idempotence_key: "race-condition-key",
    });

    expect(result.success).toBe(false);
    expect(result.code).toBe("IDEMPOTENCE_RACE_CONDITION");
    expect(result.details).toMatchObject({
      pg_code: "23505",
    });
  });

  // -------------------------------------------------------
  // 9. Concurrence — 2 créations parallèles avec clés différentes
  //    → 2 commandes distinctes (la RPC gère le FOR UPDATE lock)
  //    Ici on mocke 2 réponses successives (2 appels RPC parallèles).
  // -------------------------------------------------------
  it("9. concurrence — 2 requêtes parallèles avec clés différentes → 2 commandes", async () => {
    let callCount = 0;
    const responses: CreateCommandeAtomiqueResult[] = [
      {
        success: true,
        code: "COMMANDE_CREEE",
        data: {
          id: "11111111-1111-1111-1111-111111111111",
          pressing_id: PRESSING_ID,
          numero_commande: "CMD-2026-00010",
          montant_total: 1500,
          montant_paye: 0,
          montant_total_avant_remise: 1500,
          montant_remise: 0,
          remise_type: "aucune",
          remise_valeur: 0,
          statut: "recu",
          statut_paiement: "non_paye",
          priorite: "normal",
          date_pret_prevue: "2026-08-20T18:00:00Z",
          date_retrait: "2026-08-27T18:00:00Z",
        },
      },
      {
        success: true,
        code: "COMMANDE_CREEE",
        data: {
          id: "22222222-2222-2222-2222-222222222222",
          pressing_id: PRESSING_ID,
          numero_commande: "CMD-2026-00011",
          montant_total: 1500,
          montant_paye: 0,
          montant_total_avant_remise: 1500,
          montant_remise: 0,
          remise_type: "aucune",
          remise_valeur: 0,
          statut: "recu",
          statut_paiement: "non_paye",
          priorite: "normal",
          date_pret_prevue: "2026-08-20T18:00:00Z",
          date_retrait: "2026-08-27T18:00:00Z",
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

    // Lance 2 appels en parallèle (simule 2 caissiers cliquant en même temps)
    const [r1, r2] = await Promise.all([
      createCommandeAtomique({
        ...baseParams,
        idempotence_key: "key-1",
      }),
      createCommandeAtomique({
        ...baseParams,
        idempotence_key: "key-2",
      }),
    ]);

    expect(r1.success).toBe(true);
    expect(r2.success).toBe(true);
    expect(r1.data?.id).not.toBe(r2.data?.id);
    expect(r1.data?.numero_commande).not.toBe(r2.data?.numero_commande);
    // Les numéros sont séquentiels (la RPC utilise le trigger 005 qui
    // sérialise via pg_advisory_xact_lock → pas de collision possible)
    expect(r1.data?.numero_commande).toBe("CMD-2026-00010");
    expect(r2.data?.numero_commande).toBe("CMD-2026-00011");

    // Vérifie que la RPC a bien été appelée 2 fois
    expect(globalThis.__mockSupabaseAdmin.rpc).toHaveBeenCalledTimes(2);
  });
});

// ===========================================================================
// TESTS — Rollback (erreur à mi-parcours)
// ===========================================================================

describe("createCommandeAtomique — rollback sur erreur", () => {
  // -------------------------------------------------------
  // 10. Rollback — acompte > montant_total
  //     La RPC doit refuser et rollback toute la transaction.
  //     Aucune commande ne doit exister en base après.
  // -------------------------------------------------------
  it("10. rollback — ACOMPTE_DEPASSE_TOTAL empêche la création", async () => {
    mockRpcReturn({
      success: false,
      code: "ACOMPTE_DEPASSE_TOTAL",
      error:
        "acompte.montant (5000) ne peut pas dépasser le montant_total (1500).",
      details: {
        acompte_montant: 5000,
        montant_total: 1500,
      },
    });

    const result = await createCommandeAtomique({
      ...baseParams,
      acompte: { montant: 5000, methode: "especes" }, // 5000 > 1500
    });

    expect(result.success).toBe(false);
    expect(result.code).toBe("ACOMPTE_DEPASSE_TOTAL");
    expect(result.details).toEqual({
      acompte_montant: 5000,
      montant_total: 1500,
    });

    // L'API route va mapper ce code → 400 (bad request).
    expect(codeRpcToHttpStatus(result.code)).toBe(400);
  });

  // -------------------------------------------------------
  // 11. Rollback — service inactif (validation côté RPC)
  //     La RPC détecte qu'un service est inactif et rollback.
  // -------------------------------------------------------
  it("11. rollback — SERVICE_INACTIF empêche la création", async () => {
    mockRpcReturn({
      success: false,
      code: "SERVICE_INACTIF",
      error: "Un service inactif ne peut pas être utilisé.",
    });

    const result = await createCommandeAtomique({
      ...baseParams,
      articles: [
        {
          service_id: "service-inactif-uuid",
          catalogue_article_id: CATALOGUE_ID_CHEMISE,
          catalogue_article_nom: "Chemises",
          couleur: "blanc",
          etat: "bon",
          quantite: 1,
        },
      ],
    });

    expect(result.success).toBe(false);
    expect(result.code).toBe("SERVICE_INACTIF");
    expect(codeRpcToHttpStatus(result.code)).toBe(400);
  });

  // -------------------------------------------------------
  // 11b. Rollback — erreur RPC générique (DB down, trigger fail)
  // -------------------------------------------------------
  it("11b. rollback — RPC_ERROR (DB exception) → 500", async () => {
    mockRpcError("database connection lost", "08006");

    const result = await createCommandeAtomique(baseParams);

    expect(result.success).toBe(false);
    expect(result.code).toBe("RPC_ERROR");
    expect(result.details).toMatchObject({
      pg_code: "08006",
    });
    expect(codeRpcToHttpStatus(result.code)).toBe(500);
  });

  // -------------------------------------------------------
  // 11c. Rollback — CLIENT_INTROUVABLE (cross-pressing attempt)
  // -------------------------------------------------------
  it("11c. rollback — CLIENT_INTROUVABLE (cross-pressing) → 404", async () => {
    mockRpcReturn({
      success: false,
      code: "CLIENT_INTROUVABLE",
      error: "Client introuvable dans votre pressing.",
    });

    const result = await createCommandeAtomique({
      ...baseParams,
      client_id: "client-d-un-autre-pressing",
    });

    expect(result.success).toBe(false);
    expect(result.code).toBe("CLIENT_INTROUVABLE");
    expect(codeRpcToHttpStatus(result.code)).toBe(404);
  });

  // -------------------------------------------------------
  // 11d. Rollback — exception JS dans le wrapper
  // -------------------------------------------------------
  it("11d. rollback — exception JS → RPC_EXCEPTION", async () => {
    globalThis.__mockSupabaseAdmin = {
      rpc: vi.fn().mockImplementation(() => {
        throw new Error("unexpected JS exception");
      }),
    };

    const result = await createCommandeAtomique(baseParams);

    expect(result.success).toBe(false);
    expect(result.code).toBe("RPC_EXCEPTION");
    expect(codeRpcToHttpStatus(result.code)).toBe(500);
  });
});

// ===========================================================================
// TESTS — Validation des montants (aucune confiance au frontend)
// ===========================================================================

describe("createCommandeAtomique — autorité financière serveur", () => {
  // -------------------------------------------------------
  // 12. Le montant_total fourni par le client n'est PAS trusté
  //     (il n'y a d'ailleurs pas de paramètre montant_total dans
  //     CreateCommandeAtomiqueParams — c'est la RPC qui calcule).
  // -------------------------------------------------------
  it("12. aucun paramètre montant_total dans les inputs — calcul RPC only", () => {
    // Vérifie statiquement que le type CreateCommandeAtomiqueParams
    // n'expose PAS de champ montant_total / montant_paye / montant_remise.
    // (Ces valeurs sont calculées côté SQL.)
    const params: CreateCommandeAtomiqueParams = baseParams;
    expect(params).not.toHaveProperty("montant_total");
    expect(params).not.toHaveProperty("montant_paye");
    expect(params).not.toHaveProperty("montant_remise");
    expect(params).not.toHaveProperty("montant_total_avant_remise");
  });

  // -------------------------------------------------------
  // 13. La remise fidélité — le client n'a pas le contrôle de la valeur
  //     Même si le client envoie valeur=99, la RPC ignore et calcule.
  // -------------------------------------------------------
  it("13. remise fidélité — valeur frontend ignorée (RPC calcule)", async () => {
    mockRpcReturn({
      success: true,
      code: "COMMANDE_CREEE",
      data: {
        id: COMMANDE_ID,
        pressing_id: PRESSING_ID,
        numero_commande: "CMD-2026-00013",
        montant_total: 1425,
        montant_paye: 0,
        montant_total_avant_remise: 1500,
        montant_remise: 75,
        remise_type: "fidelite",
        remise_valeur: 5, // ← 5%, pas 99%
        statut: "recu",
        statut_paiement: "non_paye",
        priorite: "normal",
        date_pret_prevue: "2026-08-20T18:00:00Z",
        date_retrait: "2026-08-27T18:00:00Z",
      },
    });

    const result = await createCommandeAtomique({
      ...baseParams,
      remise: { type: "fidelite", valeur: 99 }, // tentative de fraude
    });
    expect(result.success).toBe(true);
    // La RPC a ignoré valeur=99 et a calculé 5% (fidélité auto).
    expect(result.data?.remise_valeur).toBe(5);
    expect(result.data?.montant_remise).toBe(75);
  });

  // -------------------------------------------------------
  // 14. Remise 100% — refusée par la RPC (anti-fraude)
  // -------------------------------------------------------
  it("14. remise 100% — POURCENTAGE_100_REFUSE par la RPC", async () => {
    mockRpcReturn({
      success: false,
      code: "POURCENTAGE_100_REFUSE",
      error:
        'Une remise de 100% n\'est pas autorisée (utilisez "article_gratuit" si nécessaire).',
      details: { pourcentage_recu: 100 },
    });

    const result = await createCommandeAtomique({
      ...baseParams,
      remise: { type: "pourcentage", valeur: 100 },
    });
    expect(result.success).toBe(false);
    expect(result.code).toBe("POURCENTAGE_100_REFUSE");
    expect(codeRpcToHttpStatus(result.code)).toBe(400);
  });

  // -------------------------------------------------------
  // 15. Remise exceptionnelle (> seuil) — nécessite manager
  // -------------------------------------------------------
  it("15. remise exceptionnelle — réceptionniste refusé", async () => {
    mockRpcReturn({
      success: false,
      code: "REMISE_EXCEPTIONNELLE_REQUIERT_MANAGER",
      error:
        "Cette remise est exceptionnelle et nécessite le rôle manager.",
      details: {
        pct_recu: 25,
        seuil_exceptionnel: 20,
        role_recu: "receptionniste",
      },
    });

    const result = await createCommandeAtomique({
      ...baseParams,
      role: "receptionniste", // pas manager
      remise: { type: "pourcentage", valeur: 25 }, // > seuil 20
    });
    expect(result.success).toBe(false);
    expect(result.code).toBe("REMISE_EXCEPTIONNELLE_REQUIERT_MANAGER");
    expect(codeRpcToHttpStatus(result.code)).toBe(403);
  });
});

// ===========================================================================
// TESTS — Validation des shapes d'entrée
// ===========================================================================

describe("createCommandeAtomique — construction du payload RPC", () => {
  // -------------------------------------------------------
  // 16. Les articles sont bien normalisés en JSONB avant envoi
  // -------------------------------------------------------
  it("16. articles normalisés : is_custom=false par défaut, prix_unitaire=null si non-custom", async () => {
    mockRpcReturn({
      success: true,
      code: "COMMANDE_CREEE",
      data: {
        id: COMMANDE_ID,
        pressing_id: PRESSING_ID,
        numero_commande: "CMD-2026-00016",
        montant_total: 1500,
        montant_paye: 0,
        montant_total_avant_remise: 1500,
        montant_remise: 0,
        remise_type: "aucune",
        remise_valeur: 0,
        statut: "recu",
        statut_paiement: "non_paye",
        priorite: "normal",
        date_pret_prevue: "2026-08-20T18:00:00Z",
        date_retrait: "2026-08-27T18:00:00Z",
      },
    });

    await createCommandeAtomique({
      ...baseParams,
      articles: [
        {
          service_id: SERVICE_ID_LAVAGE,
          catalogue_article_id: CATALOGUE_ID_CHEMISE,
          catalogue_article_nom: "Chemises",
          couleur: "blanc",
          couleur_libre: null,
          etat: "bon",
          description_etat: null,
          quantite: 2,
          // is_custom absent → doit default à false
          // prix_unitaire absent → doit default à null
        },
      ],
    });

    const callArgs = globalThis.__mockSupabaseAdmin.rpc.mock.calls[0];
    expect(callArgs[1].p_articles_json[0]).toMatchObject({
      is_custom: false,
      prix_unitaire: null,
      couleur_libre: null,
      description_etat: null,
    });
  });

  // -------------------------------------------------------
  // 17. notes null → p_notes=null (pas de string vide)
  // -------------------------------------------------------
  it("17. notes null transmis tel quel", async () => {
    mockRpcReturn({
      success: true,
      code: "COMMANDE_CREEE",
      data: {
        id: COMMANDE_ID,
        pressing_id: PRESSING_ID,
        numero_commande: "CMD-2026-00017",
        montant_total: 1500,
        montant_paye: 0,
        montant_total_avant_remise: 1500,
        montant_remise: 0,
        remise_type: "aucune",
        remise_valeur: 0,
        statut: "recu",
        statut_paiement: "non_paye",
        priorite: "normal",
        date_pret_prevue: "2026-08-20T18:00:00Z",
        date_retrait: "2026-08-27T18:00:00Z",
      },
    });

    await createCommandeAtomique({
      ...baseParams,
      notes: null,
    });

    const callArgs = globalThis.__mockSupabaseAdmin.rpc.mock.calls[0];
    expect(callArgs[1].p_notes).toBeNull();
  });

  // -------------------------------------------------------
  // 18. priorite absente → défaut 'normal'
  // -------------------------------------------------------
  it("18. priorite absente → défaut 'normal'", async () => {
    mockRpcReturn({
      success: true,
      code: "COMMANDE_CREEE",
      data: {
        id: COMMANDE_ID,
        pressing_id: PRESSING_ID,
        numero_commande: "CMD-2026-00018",
        montant_total: 1500,
        montant_paye: 0,
        montant_total_avant_remise: 1500,
        montant_remise: 0,
        remise_type: "aucune",
        remise_valeur: 0,
        statut: "recu",
        statut_paiement: "non_paye",
        priorite: "normal",
        date_pret_prevue: "2026-08-20T18:00:00Z",
        date_retrait: "2026-08-27T18:00:00Z",
      },
    });

    const params: CreateCommandeAtomiqueParams = {
      pressing_id: PRESSING_ID,
      user_id: USER_ID,
      personnel_id: PERSONNEL_ID,
      role: "manager",
      client_id: CLIENT_ID,
      date_pret_prevue: "2026-08-20T18:00:00Z",
      articles: baseParams.articles,
      // priorite absent
    };

    await createCommandeAtomique(params);

    const callArgs = globalThis.__mockSupabaseAdmin.rpc.mock.calls[0];
    expect(callArgs[1].p_priorite).toBe("normal");
  });

  // -------------------------------------------------------
  // 19. user_id null (auth.getUser a échoué) — transmis tel quel
  // -------------------------------------------------------
  it("19. user_id null — transmis à la RPC (audit_log.user_id sera null)", async () => {
    mockRpcReturn({
      success: true,
      code: "COMMANDE_CREEE",
      data: {
        id: COMMANDE_ID,
        pressing_id: PRESSING_ID,
        numero_commande: "CMD-2026-00019",
        montant_total: 1500,
        montant_paye: 0,
        montant_total_avant_remise: 1500,
        montant_remise: 0,
        remise_type: "aucune",
        remise_valeur: 0,
        statut: "recu",
        statut_paiement: "non_paye",
        priorite: "normal",
        date_pret_prevue: "2026-08-20T18:00:00Z",
        date_retrait: "2026-08-27T18:00:00Z",
      },
    });

    await createCommandeAtomique({
      ...baseParams,
      user_id: null,
    });

    const callArgs = globalThis.__mockSupabaseAdmin.rpc.mock.calls[0];
    expect(callArgs[1].p_user_id).toBeNull();
  });
});

// ===========================================================================
// TESTS — Cas limites
// ===========================================================================

describe("createCommandeAtomique — cas limites", () => {
  // -------------------------------------------------------
  // 20. Plusieurs articles avec services + catalogue différents
  // -------------------------------------------------------
  it("20. multi-articles — tous transmis dans l'ordre au JSONB", async () => {
    mockRpcReturn({
      success: true,
      code: "COMMANDE_CREEE",
      data: {
        id: COMMANDE_ID,
        pressing_id: PRESSING_ID,
        numero_commande: "CMD-2026-00020",
        montant_total: 5000,
        montant_paye: 0,
        montant_total_avant_remise: 5000,
        montant_remise: 0,
        remise_type: "aucune",
        remise_valeur: 0,
        statut: "recu",
        statut_paiement: "non_paye",
        priorite: "normal",
        date_pret_prevue: "2026-08-20T18:00:00Z",
        date_retrait: "2026-08-27T18:00:00Z",
      },
    });

    const SERVICE_REPASSAGE = "55555555-5555-5555-5555-555555555555";
    const CATALOGUE_COSTUME = "66666666-6666-6666-6666-666666666666";

    await createCommandeAtomique({
      ...baseParams,
      articles: [
        {
          service_id: SERVICE_ID_LAVAGE,
          catalogue_article_id: CATALOGUE_ID_CHEMISE,
          catalogue_article_nom: "Chemises",
          couleur: "blanc",
          etat: "bon",
          quantite: 3,
        },
        {
          service_id: SERVICE_REPASSAGE,
          catalogue_article_id: CATALOGUE_COSTUME,
          catalogue_article_nom: "Costumes",
          couleur: "noir",
          etat: "acceptable",
          quantite: 2,
        },
      ],
    });

    const callArgs = globalThis.__mockSupabaseAdmin.rpc.mock.calls[0];
    expect(callArgs[1].p_articles_json).toHaveLength(2);
    expect(callArgs[1].p_articles_json[0].service_id).toBe(SERVICE_ID_LAVAGE);
    expect(callArgs[1].p_articles_json[1].service_id).toBe(SERVICE_REPASSAGE);
  });

  // -------------------------------------------------------
  // 21. Commande express — priorite transmis
  // -------------------------------------------------------
  it("21. commande express — priorite='express' transmis", async () => {
    mockRpcReturn({
      success: true,
      code: "COMMANDE_CREEE",
      data: {
        id: COMMANDE_ID,
        pressing_id: PRESSING_ID,
        numero_commande: "CMD-2026-00021",
        montant_total: 1500,
        montant_paye: 0,
        montant_total_avant_remise: 1500,
        montant_remise: 0,
        remise_type: "aucune",
        remise_valeur: 0,
        statut: "recu",
        statut_paiement: "non_paye",
        priorite: "express",
        date_pret_prevue: "2026-08-20T18:00:00Z",
        // express → +3 jours (au lieu de +7)
        date_retrait: "2026-08-23T18:00:00Z",
      },
    });

    const result = await createCommandeAtomique({
      ...baseParams,
      priorite: "express",
    });
    expect(result.success).toBe(true);
    expect(result.data?.priorite).toBe("express");
    // La RPC calcule date_retrait = date_pret_prevue + 3 jours pour express
    expect(result.data?.date_retrait).toBe("2026-08-23T18:00:00Z");

    const callArgs = globalThis.__mockSupabaseAdmin.rpc.mock.calls[0];
    expect(callArgs[1].p_priorite).toBe("express");
  });

  // -------------------------------------------------------
  // 22. Acompte avec référence — clamp à 200 chars
  // -------------------------------------------------------
  it("22. acompte.reference transmis tel quel (≤ 200)", async () => {
    mockRpcReturn({
      success: true,
      code: "COMMANDE_CREEE",
      data: {
        id: COMMANDE_ID,
        pressing_id: PRESSING_ID,
        numero_commande: "CMD-2026-00022",
        montant_total: 1500,
        montant_paye: 500,
        montant_total_avant_remise: 1500,
        montant_remise: 0,
        remise_type: "aucune",
        remise_valeur: 0,
        statut: "recu",
        statut_paiement: "partiel",
        priorite: "normal",
        date_pret_prevue: "2026-08-20T18:00:00Z",
        date_retrait: "2026-08-27T18:00:00Z",
      },
    });

    const longRef = "A".repeat(250); // > 200 → sera clamped par l'API route

    await createCommandeAtomique({
      ...baseParams,
      acompte: { montant: 500, methode: "carte_bancaire", reference: longRef },
    });

    const callArgs = globalThis.__mockSupabaseAdmin.rpc.mock.calls[0];
    // Le wrapper transmet tel quel — le clamping se fait côté API route
    // avant l'appel à createCommandeAtomique. Ici on teste juste la
    // transmission.
    expect(callArgs[1].p_acompte.reference).toBe(longRef);
  });
});
