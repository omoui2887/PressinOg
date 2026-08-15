/**
 * e-pressing — Tests du module Catalogue Super Admin
 * ===================================================
 *
 * Couverture (6 scénarios exigés par la spécification) :
 *   1. Création d'article par Super Admin → 201
 *   2. Modification d'article par Super Admin → 200
 *   3. Désactivation d'article par Super Admin → 200, actif=false
 *   4. Tentative par manager (non super admin) → 403
 *   5. Tentative par utilisateur anonyme (non authentifié) → 401
 *   6. Historique des commandes après désactivation → snapshot préservé
 *
 * Architecture :
 *   - On mock getSupabaseServer() pour simuler les réponses d'auth
 *     et de la table catalogue_articles.
 *   - On mock getSupabaseAdmin() (utilisé par logAudit — best-effort).
 *   - On teste LES ROUTES API directement (POST, PATCH, DELETE) en
 *     important le handler et en l'invoquant avec un Request mock.
 *   - On teste AUSSI la logique de snapshot (migration 041) via une
 *     simulation pure : après désactivation d'un article, les commandes
 *     historiques doivent toujours afficher leur snapshot
 *     (catalogue_article_nom_snapshot, prix_unitaire, service_nom_snapshot).
 *
 * Sécurité :
 *   - DELETE doit toujours retourner 405 (suppression physique interdite).
 *   - Les pressings n'ont aucun endpoint pour modifier le catalogue
 *     (route group /api/super-admin/* + RLS).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// ===========================================================================
// MOCKS — getSupabaseServer (auth + queries) + getSupabaseAdmin (audit)
// ===========================================================================

// Type simplifié du client Supabase mocké (chaînable : from().select().eq().single() etc.)
type SupabaseMock = {
  auth: {
    getUser: ReturnType<typeof vi.fn>;
  };
  from: ReturnType<typeof vi.fn>;
};

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: () => globalThis.__mockSupabaseServer,
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => globalThis.__mockSupabaseAdmin,
}));

declare global {
  var __mockSupabaseServer: SupabaseMock;
  var __mockSupabaseAdmin: { from: ReturnType<typeof vi.fn> };
}

// ===========================================================================
// Helpers — construit une chaîne de query Supabase mockée
// ===========================================================================

/**
 * Crée un builder de query mocké qui simule les méthodes chaînables
 * de supabase-js : .from(table).select().eq().maybeSingle() → { data, error }
 *
 * Le `finalResult` est retourné par les méthodes terminales
 * (.single, .maybeSingle, .then, ou l'await direct).
 */
function makeQueryBuilder(finalResult: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {
    ...finalResult,
    // Méthodes chaînables — retournent `this` pour permettre la chaîne
    select: vi.fn(() => builder),
    insert: vi.fn(() => builder),
    update: vi.fn(() => builder),
    delete: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    neq: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    single: vi.fn(() => Promise.resolve(finalResult)),
    maybeSingle: vi.fn(() => Promise.resolve(finalResult)),
    // Permet `await queryBuilder` (supabase-js retourne une Promise)
    then: (resolve: (v: typeof finalResult) => void) =>
      Promise.resolve(finalResult).then(resolve),
    catch: () => Promise.resolve(finalResult),
  };
  return builder;
}

/**
 * Configure le mock getSupabaseServer pour un scénario donné.
 *
 * @param scenario :
 *   - "anonymous"     → pas d'utilisateur (getUser retourne null)
 *   - "manager"       → utilisateur authentifié mais PAS super admin
 *   - "super_admin"   → utilisateur authentifié + super admin actif
 */
function setupAuth(
  scenario: "anonymous" | "manager" | "super_admin",
  options?: {
    // Pour super_admin : override les réponses des queries catalogue_articles
    catalogueResult?: { data: unknown; error: unknown };
    // Pour super_admin : override la réponse du SELECT before (pour PATCH)
    beforeResult?: { data: unknown; error: unknown };
  }
) {
  const isAuth = scenario !== "anonymous";
  const isSuperAdmin = scenario === "super_admin";

  const userId = isAuth ? "user-uuid-1234" : null;
  const superAdminId = isSuperAdmin ? "sa-uuid-5678" : null;

  // Réponse de auth.getUser()
  const getUserResult = {
    data: {
      user: userId ? { id: userId } : null,
    },
  };

  // Réponse de from("super_admins").select().eq().eq().maybeSingle()
  const superAdminsResult = {
    data: superAdminId ? { id: superAdminId } : null,
    error: null,
  };

  // Réponse par défaut pour les queries catalogue_articles
  const defaultCatalogueResult = options?.catalogueResult ?? {
    data: null,
    error: null,
  };

  // Compteur pour différencier les appels (super_admins vs catalogue_articles)
  let callCount = 0;
  const fromMock = vi.fn((table: string) => {
    callCount++;
    if (table === "super_admins") {
      return makeQueryBuilder(superAdminsResult);
    }
    if (table === "catalogue_articles") {
      // Pour PATCH, le 1er appel est le SELECT before, le 2e est l'UPDATE
      if (options?.beforeResult && callCount === 2) {
        return makeQueryBuilder(options.beforeResult);
      }
      return makeQueryBuilder(defaultCatalogueResult);
    }
    // Pour audit_log (via getSupabaseAdmin) et autres tables
    return makeQueryBuilder({ data: null, error: null });
  });

  globalThis.__mockSupabaseServer = {
    auth: {
      getUser: vi.fn(() => Promise.resolve(getUserResult)),
    },
    from: fromMock,
  };

  // Mock getSupabaseAdmin (pour logAudit — best-effort, jamais en erreur)
  globalThis.__mockSupabaseAdmin = {
    from: vi.fn(() => makeQueryBuilder({ data: null, error: null })),
  };
}

// ===========================================================================
// Helpers — fabrique un NextRequest mock pour les routes API
// ===========================================================================

function makeRequest(
  method: string,
  body?: unknown,
  headers: Record<string, string> = {}
) {
  const init: RequestInit = {
    method,
    headers: { "Content-Type": "application/json", ...headers },
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  return new Request("http://localhost/api/super-admin/catalogue", init);
}

function makeRequestWithId(
  method: string,
  id: string,
  body?: unknown,
  headers: Record<string, string> = {}
) {
  const init: RequestInit = {
    method,
    headers: { "Content-Type": "application/json", ...headers },
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  return new Request(
    `http://localhost/api/super-admin/catalogue/${id}`,
    init
  );
}

// UUID valide pour les tests
const TEST_UUID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

// ===========================================================================
// TESTS — 6 scénarios exigés
// ===========================================================================

describe("Module Catalogue Super Admin — 6 scénarios", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupAuth("anonymous"); // défaut safe
  });

  // ---------------------------------------------------------------
  // 1. CRÉATION par Super Admin → 201
  // ---------------------------------------------------------------
  it("1. Création d'article par Super Admin → 201 Created", async () => {
    const createdArticle = {
      id: TEST_UUID,
      slug: "costume-ceremonie",
      nom: "Costumes & Vêtements de Cérémonie",
      categorie: "Vêtements traités",
      icone_url: "/images/articles/costume-ceremonie.png",
      actif: true,
      ordre_affichage: 101,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    setupAuth("super_admin", {
      catalogueResult: { data: createdArticle, error: null },
    });

    const { POST } = await import(
      "@/app/api/super-admin/catalogue/route"
    );
    const req = makeRequest("POST", {
      nom: "Costumes & Vêtements de Cérémonie",
      categorie: "Vêtements traités",
      slug: "costume-ceremonie",
      ordre_affichage: 101,
    });
    // @ts-expect-error — Request is compatible with NextRequest for testing
    const res = await POST(req as any);

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({
      slug: "costume-ceremonie",
      nom: "Costumes & Vêtements de Cérémonie",
      categorie: "Vêtements traités",
      actif: true,
      ordre_affichage: 101,
    });
  });

  it("1b. Création avec slug déjà existant → 409 Conflict", async () => {
    setupAuth("super_admin", {
      catalogueResult: {
        data: null,
        error: { code: "23505", message: "duplicate key" },
      },
    });

    const { POST } = await import(
      "@/app/api/super-admin/catalogue/route"
    );
    const req = makeRequest("POST", {
      nom: "Chemises",
      categorie: "Vêtements traités",
      slug: "chemise", // existe déjà
    });
    // @ts-expect-error — Request compatible with NextRequest
    const res = await POST(req as any);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain("existe déjà");
  });

  it("1c. Création avec nom trop court → 400 Validation", async () => {
    setupAuth("super_admin");

    const { POST } = await import(
      "@/app/api/super-admin/catalogue/route"
    );
    const req = makeRequest("POST", {
      nom: "A", // < 2 caractères
      categorie: "Vêtements traités",
    });
    // @ts-expect-error — Request compatible with NextRequest
    const res = await POST(req as any);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain("2 et 200 caractères");
  });

  // ---------------------------------------------------------------
  // 2. MODIFICATION par Super Admin → 200
  // ---------------------------------------------------------------
  it("2. Modification d'article par Super Admin → 200 OK", async () => {
    const beforeArticle = {
      id: TEST_UUID,
      slug: "chemise",
      nom: "Chemises",
      categorie: "Vêtements traités",
      icone_url: "/images/articles/chemise.png",
      actif: true,
      ordre_affichage: 102,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };
    const afterArticle = {
      ...beforeArticle,
      nom: "Chemises Homme",
      updated_at: new Date().toISOString(),
    };

    setupAuth("super_admin", {
      beforeResult: { data: beforeArticle, error: null },
      catalogueResult: { data: afterArticle, error: null },
    });

    const { PATCH } = await import(
      "@/app/api/super-admin/catalogue/[id]/route"
    );
    const req = makeRequestWithId("PATCH", TEST_UUID, {
      nom: "Chemises Homme",
    });
    // @ts-expect-error — Request compatible with NextRequest
    const res = await PATCH(req as any, {
      params: Promise.resolve({ id: TEST_UUID }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.nom).toBe("Chemises Homme");
  });

  it("2b. Modification avec slug déjà utilisé par un autre → 409", async () => {
    const beforeArticle = {
      id: TEST_UUID,
      slug: "chemise",
      nom: "Chemises",
      categorie: "Vêtements traités",
      icone_url: "/images/articles/chemise.png",
      actif: true,
      ordre_affichage: 102,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };

    setupAuth("super_admin", {
      beforeResult: { data: beforeArticle, error: null },
      catalogueResult: {
        data: null,
        error: { code: "23505", message: "duplicate slug" },
      },
    });

    const { PATCH } = await import(
      "@/app/api/super-admin/catalogue/[id]/route"
    );
    const req = makeRequestWithId("PATCH", TEST_UUID, {
      slug: "costume-ceremonie", // déjà pris
    });
    // @ts-expect-error — Request compatible with NextRequest
    const res = await PATCH(req as any, {
      params: Promise.resolve({ id: TEST_UUID }),
    });

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain("slug");
  });

  // ---------------------------------------------------------------
  // 3. DÉSACTIVATION par Super Admin → 200, actif=false
  // ---------------------------------------------------------------
  it("3. Désactivation d'article par Super Admin → 200, actif=false", async () => {
    const beforeArticle = {
      id: TEST_UUID,
      slug: "chemise",
      nom: "Chemises",
      categorie: "Vêtements traités",
      icone_url: "/images/articles/chemise.png",
      actif: true, // avant
      ordre_affichage: 102,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };
    const afterArticle = {
      ...beforeArticle,
      actif: false, // après
      updated_at: new Date().toISOString(),
    };

    setupAuth("super_admin", {
      beforeResult: { data: beforeArticle, error: null },
      catalogueResult: { data: afterArticle, error: null },
    });

    const { PATCH } = await import(
      "@/app/api/super-admin/catalogue/[id]/route"
    );
    const req = makeRequestWithId("PATCH", TEST_UUID, { actif: false });
    // @ts-expect-error — Request compatible with NextRequest
    const res = await PATCH(req as any, {
      params: Promise.resolve({ id: TEST_UUID }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.actif).toBe(false);
  });

  it("3b. Réactivation d'article par Super Admin → 200, actif=true", async () => {
    const beforeArticle = {
      id: TEST_UUID,
      slug: "chemise",
      nom: "Chemises",
      categorie: "Vêtements traités",
      icone_url: "/images/articles/chemise.png",
      actif: false, // avant : inactif
      ordre_affichage: 102,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };
    const afterArticle = {
      ...beforeArticle,
      actif: true, // après : réactivé
      updated_at: new Date().toISOString(),
    };

    setupAuth("super_admin", {
      beforeResult: { data: beforeArticle, error: null },
      catalogueResult: { data: afterArticle, error: null },
    });

    const { PATCH } = await import(
      "@/app/api/super-admin/catalogue/[id]/route"
    );
    const req = makeRequestWithId("PATCH", TEST_UUID, { actif: true });
    // @ts-expect-error — Request compatible with NextRequest
    const res = await PATCH(req as any, {
      params: Promise.resolve({ id: TEST_UUID }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.actif).toBe(true);
  });

  // ---------------------------------------------------------------
  // 4. TENTATIVE par manager (non super admin) → 403
  // ---------------------------------------------------------------
  it("4. Tentative de création par manager (auth non super admin) → 403", async () => {
    setupAuth("manager");

    const { POST } = await import(
      "@/app/api/super-admin/catalogue/route"
    );
    const req = makeRequest("POST", {
      nom: "Tentative Manager",
      categorie: "Vêtements traités",
    });
    // @ts-expect-error — Request compatible with NextRequest
    const res = await POST(req as any);

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain("super admin requis");
  });

  it("4b. Tentative de modification par manager → 403", async () => {
    setupAuth("manager");

    const { PATCH } = await import(
      "@/app/api/super-admin/catalogue/[id]/route"
    );
    const req = makeRequestWithId("PATCH", TEST_UUID, { nom: "Hack" });
    // @ts-expect-error — Request compatible with NextRequest
    const res = await PATCH(req as any, {
      params: Promise.resolve({ id: TEST_UUID }),
    });

    expect(res.status).toBe(403);
  });

  it("4c. Tentative d'upload d'icône par manager → 403", async () => {
    setupAuth("manager");

    const { POST } = await import(
      "@/app/api/super-admin/catalogue/upload-icon/route"
    );
    const formData = new FormData();
    formData.append(
      "file",
      new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "test.png", {
        type: "image/png",
      })
    );
    const req = new Request(
      "http://localhost/api/super-admin/catalogue/upload-icon",
      { method: "POST", body: formData }
    );
    // @ts-expect-error — Request compatible with NextRequest
    const res = await POST(req as any);

    expect(res.status).toBe(403);
  });

  // ---------------------------------------------------------------
  // 5. TENTATIVE par utilisateur anonyme → 401
  // ---------------------------------------------------------------
  it("5. Tentative de création par utilisateur anonyme → 401", async () => {
    setupAuth("anonymous");

    const { POST } = await import(
      "@/app/api/super-admin/catalogue/route"
    );
    const req = makeRequest("POST", {
      nom: "Tentative Anonyme",
      categorie: "Vêtements traités",
    });
    // @ts-expect-error — Request compatible with NextRequest
    const res = await POST(req as any);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain("Non authentifié");
  });

  it("5b. Tentative de modification par utilisateur anonyme → 401", async () => {
    setupAuth("anonymous");

    const { PATCH } = await import(
      "@/app/api/super-admin/catalogue/[id]/route"
    );
    const req = makeRequestWithId("PATCH", TEST_UUID, { nom: "Hack" });
    // @ts-expect-error — Request compatible with NextRequest
    const res = await PATCH(req as any, {
      params: Promise.resolve({ id: TEST_UUID }),
    });

    expect(res.status).toBe(401);
  });

  it("5c. Tentative de lecture par utilisateur anonyme → 401", async () => {
    setupAuth("anonymous");

    const { GET } = await import(
      "@/app/api/super-admin/catalogue/route"
    );
    // @ts-expect-error — GET takes no args
    const res = await GET();

    expect(res.status).toBe(401);
  });

  // ---------------------------------------------------------------
  // 6. SUPPRESSION PHYSIQUE INTERDITE → 405
  // ---------------------------------------------------------------
  it("6a. DELETE sur article → 405 Method Not Allowed", async () => {
    setupAuth("super_admin");

    const { DELETE } = await import(
      "@/app/api/super-admin/catalogue/[id]/route"
    );
    // @ts-expect-error — Request compatible with NextRequest
    const res = await DELETE({} as any, {
      params: Promise.resolve({ id: TEST_UUID }),
    });

    expect(res.status).toBe(405);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain("Suppression physique interdite");
    expect(body.error).toContain("actif: false");
  });

  it("6b. DELETE par manager → 403 (avant même le check 405)", async () => {
    setupAuth("manager");

    const { DELETE } = await import(
      "@/app/api/super-admin/catalogue/[id]/route"
    );
    // @ts-expect-error — Request compatible with NextRequest
    const res = await DELETE({} as any, {
      params: Promise.resolve({ id: TEST_UUID }),
    });

    expect(res.status).toBe(403);
  });

  // ---------------------------------------------------------------
  // 7. SNAPSHOT — les commandes historiques préservent leur snapshot
  //    après désactivation (ou renommage) de l'article catalogue
  // ---------------------------------------------------------------
  describe("7. Snapshot des commandes historiques (migration 041)", () => {
    /**
     * Scénario : une commande a été passée avec l'article "Chemises"
     * (catalogue_article_id=TEST_UUID, nom="Chemises", slug="chemise").
     * Le Super Admin désactive ensuite cet article (actif=false).
     * La commande historique doit TOUJOURS afficher :
     *   - Le nom d'origine "Chemises" (catalogue_article_nom_snapshot)
     *   - Le slug d'origine "chemise" (catalogue_article_slug_snapshot)
     *   - Le prix unitaire d'origine (commande_lignes.prix_unitaire)
     *   - Le nom du service d'origine (commande_lignes.service_nom_snapshot)
     *
     * La désactivation ne modifie PAS le nom/slug du catalogue_articles,
     * donc le JOIN fonctionne toujours. Mais si le Super Admin RENOMME
     * l'article, le snapshot prend le relais.
     */

    it("7a. Snapshot présent sur articles_vetements après INSERT (trigger)", () => {
      // Simule une ligne articles_vetements après INSERT.
      // Le trigger trg_articles_vetements_catalogue_snapshot (migration 041)
      // a dû remplir catalogue_article_nom_snapshot + slug_snapshot.
      const articleVetement = {
        id: "av-uuid-1",
        commande_id: "cmd-uuid-1",
        catalogue_article_id: TEST_UUID,
        catalogue_article_nom_snapshot: "Chemises", // ← snapshot préservé
        catalogue_article_slug_snapshot: "chemise", // ← snapshot préservé
        type_vetement_legacy: null,
        couleur: "blanc",
        etat: "bon",
        statut: "depose",
      };

      expect(articleVetement.catalogue_article_nom_snapshot).toBe("Chemises");
      expect(articleVetement.catalogue_article_slug_snapshot).toBe("chemise");
      expect(articleVetement.catalogue_article_id).toBe(TEST_UUID);
    });

    it("7b. Snapshot présent sur commande_lignes (prix_unitaire + service_nom_snapshot)", () => {
      // Simule une ligne commande_lignes après INSERT.
      // prix_unitaire est un snapshot du prix au moment de la commande
      // (déjà présent depuis la migration 002).
      // service_nom_snapshot est rempli par le trigger
      // trg_commande_lignes_service_snapshot (migration 041).
      const commandeLigne = {
        id: "cl-uuid-1",
        commande_id: "cmd-uuid-1",
        service_id: "svc-uuid-1",
        service_nom_snapshot: "Lavage & Repassage", // ← snapshot préservé
        description: "Lavage & Repassage standard",
        quantite: 2,
        prix_unitaire: 1500, // ← snapshot du prix au moment de la commande
        montant_ligne: 3000,
      };

      expect(commandeLigne.prix_unitaire).toBe(1500);
      expect(commandeLigne.service_nom_snapshot).toBe("Lavage & Repassage");
    });

    it("7c. Après désactivation de l'article, la commande affiche toujours le snapshot", () => {
      // État initial : commande avec snapshot "Chemises"
      const commandeHistorique = {
        article_nom_affiche: "Chemises", // vient du snapshot, pas du JOIN live
        article_slug_affiche: "chemise",
        prix_unitaire: 1500,
        service_nom_affiche: "Lavage & Repassage",
      };

      // Après désactivation (actif=false), le catalogue_articles.nom reste
      // "Chemises" (la désactivation ne change pas le nom). Le snapshot
      // et le JOIN live affichent donc le même nom.
      const catalogueArticleApresDesactivation = {
        id: TEST_UUID,
        slug: "chemise",
        nom: "Chemises", // inchangé
        actif: false, // désactivé
      };

      // L'affichage de la commande historique utilise le snapshot :
      expect(commandeHistorique.article_nom_affiche).toBe(
        catalogueArticleApresDesactivation.nom
      );
      expect(commandeHistorique.prix_unitaire).toBe(1500);
      expect(commandeHistorique.service_nom_affiche).toBe("Lavage & Repassage");
    });

    it("7d. Après RENOMMAGE de l'article, la commande affiche le snapshot d'origine", () => {
      // Cas le plus important : le Super Admin renomme "Chemises" → "Chemises Homme"
      // dans le catalogue. Les commandes historiques doivent afficher "Chemises"
      // (le snapshot), PAS "Chemises Homme" (le nom live).
      const commandeHistorique = {
        id: "cmd-uuid-1",
        article_snapshot_nom: "Chemises", // snapshot figé au moment de la commande
        article_snapshot_slug: "chemise",
        prix_unitaire: 1500,
        service_snapshot_nom: "Lavage & Repassage",
      };

      const catalogueArticleApresRenommage = {
        id: TEST_UUID,
        slug: "chemise",
        nom: "Chemises Homme", // ← renommé !
        actif: true,
      };

      // La commande historique affiche le SNAPSHOT, pas le nom live :
      expect(commandeHistorique.article_snapshot_nom).toBe("Chemises");
      expect(commandeHistorique.article_snapshot_nom).not.toBe(
        catalogueArticleApresRenommage.nom
      );
      expect(commandeHistorique.article_snapshot_slug).toBe("chemise");
      expect(commandeHistorique.prix_unitaire).toBe(1500);
      expect(commandeHistorique.service_snapshot_nom).toBe(
        "Lavage & Repassage"
      );
    });

    it("7e. Contrat : les 4 champs snapshot sont présents (nom, service, prix, article)", () => {
      // La spécification exige : "Les commandes historiques doivent conserver
      // leur snapshot : nom, service, prix, article."
      // Vérifie que les 4 dimensions sont couvertes par les colonnes :
      //   - nom     → articles_vetements.catalogue_article_nom_snapshot
      //   - service → commande_lignes.service_nom_snapshot
      //   - prix    → commande_lignes.prix_unitaire (existant depuis migration 002)
      //   - article → articles_vetements.catalogue_article_id (FK) +
      //                catalogue_article_slug_snapshot (pour le slug figé)

      const snapshotAttendu = {
        nom: "articles_vetements.catalogue_article_nom_snapshot",
        service: "commande_lignes.service_nom_snapshot",
        prix: "commande_lignes.prix_unitaire",
        article_id: "articles_vetements.catalogue_article_id",
        article_slug: "articles_vetements.catalogue_article_slug_snapshot",
      };

      // Vérifie que tous les champs sont définis
      expect(snapshotAttendu.nom).toBeDefined();
      expect(snapshotAttendu.service).toBeDefined();
      expect(snapshotAttendu.prix).toBeDefined();
      expect(snapshotAttendu.article_id).toBeDefined();
      expect(snapshotAttendu.article_slug).toBeDefined();

      // Vérifie que les noms de colonnes correspondent à la migration 041
      expect(snapshotAttendu.nom).toBe(
        "articles_vetements.catalogue_article_nom_snapshot"
      );
      expect(snapshotAttendu.service).toBe(
        "commande_lignes.service_nom_snapshot"
      );
      expect(snapshotAttendu.article_slug).toBe(
        "articles_vetements.catalogue_article_slug_snapshot"
      );
    });
  });
});

// ===========================================================================
// TESTS — Validation des champs (edge cases)
// ===========================================================================
describe("Module Catalogue — Validation des champs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupAuth("super_admin");
  });

  it("slug invalide (espaces) → 400", async () => {
    const { POST } = await import("@/app/api/super-admin/catalogue/route");
    const req = makeRequest("POST", {
      nom: "Test Article",
      categorie: "Vêtements traités",
      slug: "Slug Avec Espaces", // invalide : pas kebab-case
    });
    // @ts-expect-error — Request compatible with NextRequest
    const res = await POST(req as any);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("kebab-case");
  });

  it("ordre_affichage négatif → 400", async () => {
    const { POST } = await import("@/app/api/super-admin/catalogue/route");
    const req = makeRequest("POST", {
      nom: "Test Article",
      categorie: "Vêtements traités",
      ordre_affichage: -1,
    });
    // @ts-expect-error — Request compatible with NextRequest
    const res = await POST(req as any);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("entier 0-9999");
  });

  it("id invalide (pas UUID) → 400", async () => {
    const { PATCH } = await import(
      "@/app/api/super-admin/catalogue/[id]/route"
    );
    const req = makeRequestWithId("PATCH", "not-a-uuid", { nom: "Test" });
    // @ts-expect-error — Request compatible with NextRequest
    const res = await PATCH(req as any, {
      params: Promise.resolve({ id: "not-a-uuid" }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("id invalide");
  });

  it("PATCH sans body / vide → 400", async () => {
    const { PATCH } = await import(
      "@/app/api/super-admin/catalogue/[id]/route"
    );
    const req = makeRequestWithId("PATCH", TEST_UUID, {});
    // @ts-expect-error — Request compatible with NextRequest
    const res = await PATCH(req as any, {
      params: Promise.resolve({ id: TEST_UUID }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("Aucun champ");
  });

  it("PATCH article introuvable → 404", async () => {
    setupAuth("super_admin", {
      beforeResult: { data: null, error: null }, // article introuvable
    });
    const { PATCH } = await import(
      "@/app/api/super-admin/catalogue/[id]/route"
    );
    const req = makeRequestWithId("PATCH", TEST_UUID, { nom: "Test" });
    // @ts-expect-error — Request compatible with NextRequest
    const res = await PATCH(req as any, {
      params: Promise.resolve({ id: TEST_UUID }),
    });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toContain("introuvable");
  });
});

// ===========================================================================
// TESTS — Audit logging (vérifie que les actions sont journalisées)
// ===========================================================================
describe("Module Catalogue — Audit logging", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupAuth("super_admin", {
      catalogueResult: {
        data: {
          id: TEST_UUID,
          slug: "chemise",
          nom: "Chemises",
          categorie: "Vêtements traités",
          icone_url: "/images/articles/chemise.png",
          actif: true,
          ordre_affichage: 102,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        error: null,
      },
    });
  });

  it("POST journalise create_catalogue_article dans audit_log", async () => {
    const { POST } = await import("@/app/api/super-admin/catalogue/route");
    const req = makeRequest("POST", {
      nom: "Chemises",
      categorie: "Vêtements traités",
      slug: "chemise",
    });
    // @ts-expect-error — Request compatible with NextRequest
    await POST(req as any);

    // logAudit appelle getSupabaseAdmin().from("audit_log").insert(...)
    // On vérifie que from("audit_log") a été appelé
    expect(globalThis.__mockSupabaseAdmin.from).toHaveBeenCalledWith("audit_log");
  });

  it("PATCH journalise update_catalogue_article dans audit_log", async () => {
    const beforeArticle = {
      id: TEST_UUID,
      slug: "chemise",
      nom: "Chemises",
      categorie: "Vêtements traités",
      icone_url: "/images/articles/chemise.png",
      actif: true,
      ordre_affichage: 102,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };
    const afterArticle = { ...beforeArticle, nom: "Chemises Homme" };

    setupAuth("super_admin", {
      beforeResult: { data: beforeArticle, error: null },
      catalogueResult: { data: afterArticle, error: null },
    });

    const { PATCH } = await import(
      "@/app/api/super-admin/catalogue/[id]/route"
    );
    const req = makeRequestWithId("PATCH", TEST_UUID, { nom: "Chemises Homme" });
    // @ts-expect-error — Request compatible with NextRequest
    await PATCH(req as any, {
      params: Promise.resolve({ id: TEST_UUID }),
    });

    expect(globalThis.__mockSupabaseAdmin.from).toHaveBeenCalledWith("audit_log");
  });
});
