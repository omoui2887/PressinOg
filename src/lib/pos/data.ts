/**
 * e-pressing — POS / Caisse : couche d'accès aux données
 * ======================================================
 * Fonctions d'accès aux données derrière une interface stable :
 *   - getArticles()             → catalogue de prestations (articles × tarifs)
 *   - getCatalogueCategories()  → 9 catégories du catalogue global
 *   - getCategories()           → catégories POS (barre service-type)
 *   - searchClients()           → recherche client (nom + téléphone)
 *   - createCommande()          → POST /api/admin/commandes
 *
 * STRATÉGIE — PRODUIT CARTÉSIEN CATALOGUE × SERVICES :
 *   Le catalogue POS est construit à partir du PRODUIT CARTÉSIEN des
 *   articles du catalogue global (33 articles) × des services actifs du
 *   pressing (ex : 5 services). Chaque combinaison (article × service)
 *   devient une variante PosArticle — le composant <ProductGrid /> regroupe
 *   ces variantes par article pour n'afficher qu'une carte par article
 *   (33 max) et ouvrir un dialogue d'action au clic.
 *
 *   PRIX — RÉSOLUTION :
 *     1. Si un tarif spécifique existe pour (article × type_service) dans
 *        /admin/tarifs → utiliser `tarif.prix` (et `tarif.duree_estimee`).
 *     2. Sinon → fallback sur `service.prix` (et `service.duree_estimee`).
 *
 *   Les 6 types possibles sont :
 *     1. Lavage
 *     2. Repassage
 *     3. Laver-Repasser  (nécessite la migration DB 021)
 *     4. Nettoyage à sec
 *     5. Détachage
 *     6. Blanchisserie
 *
 *   Ainsi, un pressing peut utiliser le POS immédiatement après avoir
 *   configuré ses services — sans avoir à définir 165 tarifs spécifiques.
 *
 * Si les API Supabase échouent ou renvoient un catalogue/tarifs vide,
 * on bascule sur les données fictives de `mock-data.ts`.
 */
import type {
  PosArticle,
  PosCatalogueCategorie,
  PosCategorie,
  PosClient,
  PosCommandeCree,
  PosCommandePayload,
} from "./types";
import { MOCK_ARTICLES, MOCK_CLIENTS, POS_CATEGORIES } from "./mock-data";
import {
  CATALOGUE_CATEGORIES,
  iconeUrlForSlug,
} from "@/lib/catalogue/catalogue-articles";

/**
 * Les 6 types de service possibles (alignés sur l'enum DB `type_service` +
 * la valeur `laver_repasser` ajoutée par la migration 021).
 *
 * L'ordre définit la priorité d'affichage dans le dialogue d'action au clic
 * sur un article du catalogue POS.
 */
const ACTION_TYPES = [
  "lavage",
  "repassage",
  "laver_repasser",
  "nettoyage_sec",
  "detachage",
  "blanchisserie",
] as const;

/**
 * Slug du catalogue utilisé comme « fourre-tout » pour les articles
 * personnalisés ajoutés via le dialogue « Ajouter un linge / vêtement » du POS.
 *
 * L'UUID de cet article sert de `catalogue_article_id` pour satisfaire la
 * contrainte FK NOT NULL côté `articles_vetements`. Le nom saisi par
 * l'opérateur est conservé tel quel (l'API ne l'écrase PAS quand
 * `is_custom=true`).
 *
 * Cet article existe dans le catalogue initial (migration 014, catégorie
 * « Articles spéciaux »). Si pour une raison quelconque il n'existe pas
 * (Super Admin l'a supprimé), on fallback sur le 1er article du catalogue.
 */
const CUSTOM_ARTICLE_SLUG = "houssse-vetement-perso";

/**
 * Mapping type_service DB → catégorie POS.
 *
 * `laver_repasser` (DB) → `laver-repasser` (POS) : la valeur DB utilise un
 * underscore, la catégorie POS utilise un tiret (convention historique).
 *
 * `blanchisserie` → `blanchisserie` : identique des deux côtés.
 */
function typeToCategorie(type: string): PosArticle["categorie"] {
  switch (type) {
    case "lavage":
      return "lavage";
    case "repassage":
      return "repassage";
    case "laver_repasser":
      return "laver-repasser";
    case "nettoyage_sec":
      return "nettoyage_sec";
    case "detachage":
      return "detachage";
    case "blanchisserie":
      return "blanchisserie";
    default:
      return "lavage";
  }
}

/** Convertit une durée PostgreSQL (ex : "2 days", "48 hours") en heures. */
function dureeToHours(duree: unknown): number | undefined {
  if (typeof duree !== "string" || !duree) return undefined;
  const s = duree.toLowerCase();
  const days = s.match(/(\d+)\s*day/);
  const hours = s.match(/(\d+)\s*(hour|hr|h)\b/);
  const mins = s.match(/(\d+)\s*(min|minute)/);
  if (days) return parseInt(days[1], 10) * 24;
  if (hours) return parseInt(hours[1], 10);
  if (mins) return Math.round(parseInt(mins[1], 10) / 60);
  return undefined;
}

interface ServiceRow {
  id: string;
  type: string;
  nom: string;
  prix: number;
  duree_estimee?: string | null;
  actif?: boolean;
}

interface CatalogueRow {
  id: string;
  slug: string;
  nom: string;
  categorie?: string;
  icone_url?: string;
}

interface TarifRow {
  id: string;
  catalogue_article_id: string;
  type_service: string;
  prix: number;
  duree_estimee?: string | null;
  actif?: boolean;
}

/**
 * Charge le catalogue de prestations — VERSION SYNERGIE TARIFS.
 *
 * 1. GET /api/public/catalogue-articles → 33 articles du catalogue global.
 * 2. GET /api/admin/tarifs-articles     → tarifs spécifiques (actifs) par
 *    couple (article × type_service) pour le pressing connecté.
 * 3. GET /api/admin/services            → services actifs (pour récupérer
 *    le service_id à utiliser lors de la création de commande).
 *
 * Construit une `PosArticle[]` basée sur les TARIFS :
 *   - Seuls les articles avec au moins un tarif apparaissent.
 *   - Pour chaque article, une variante par type_service qui a un tarif.
 *   - Le service_id est résolu en cherchant un service du même type.
 *
 * Si le catalogue ou les tarifs sont vides, on bascule sur les données
 * fictives (mock) afin que l'écran ne soit jamais vide en démo.
 */
export async function getArticles(): Promise<{
  articles: PosArticle[];
  source: "api" | "mock" | "mixed";
}> {
  try {
    const [catalogueRes, tarifsRes, servicesRes] = await Promise.allSettled([
      fetch("/api/public/catalogue-articles", { cache: "no-store" }),
      fetch("/api/admin/tarifs-articles", { cache: "no-store" }),
      fetch("/api/admin/services", { cache: "no-store" }),
    ]);

    const catalogue: CatalogueRow[] =
      catalogueRes.status === "fulfilled" && catalogueRes.value.ok
        ? ((await catalogueRes.value.json())?.data as
            | CatalogueRow[]
            | undefined) ?? []
        : [];
    const tarifs: TarifRow[] =
      tarifsRes.status === "fulfilled" && tarifsRes.value.ok
        ? ((await tarifsRes.value.json())?.data as
            | TarifRow[]
            | undefined) ?? []
        : [];
    const services: ServiceRow[] =
      servicesRes.status === "fulfilled" && servicesRes.value.ok
        ? ((await servicesRes.value.json())?.data as
            | ServiceRow[]
            | undefined) ?? []
        : [];

    // Bascule mock si le catalogue est vide (les tarifs sont optionnels :
    // en leur absence, on fallback sur service.prix pour toutes les variantes).
    if (!catalogue.length) {
      return { articles: MOCK_ARTICLES, source: "mock" };
    }
    // Bascule mock si aucun service actif n'est configuré pour le pressing
    // (sans service, impossible de créer une commande — service_id obligatoire).
    if (!services.length) {
      return { articles: MOCK_ARTICLES, source: "mock" };
    }

    // Index du catalogue : Map<catalogue_article_id, CatalogueRow>
    const catalogueById = new Map<string, CatalogueRow>();
    for (const art of catalogue) {
      catalogueById.set(art.id, art);
    }

    // Index des services par type : Map<type_service, ServiceRow>
    // (pour résoudre le service_id lors de la création de commande)
    const serviceByType = new Map<string, ServiceRow>();
    for (const svc of services) {
      if (svc.actif === false) continue;
      // Ne pas écraser si déjà présent (on garde le 1er service de chaque type)
      if (!serviceByType.has(svc.type)) {
        serviceByType.set(svc.type, svc);
      }
    }

    // Index des tarifs : Map<catalogue_article_id, Map<type_service, TarifRow>>
    const tarifsByArticle = new Map<
      string,
      Map<string, TarifRow>
    >();
    for (const t of tarifs) {
      if (!t.catalogue_article_id) continue;
      if (t.actif === false) continue;
      let inner = tarifsByArticle.get(t.catalogue_article_id);
      if (!inner) {
        inner = new Map();
        tarifsByArticle.set(t.catalogue_article_id, inner);
      }
      inner.set(t.type_service, t);
    }

    // Construction des PosArticle : produit cartésien (article × service).
    // Pour chaque article du catalogue et chaque service actif du pressing,
    // on crée une variante. Le prix est résolu depuis le tarif spécifique si
    // présent, sinon depuis service.prix (fallback).
    const articles: PosArticle[] = [];
    for (const [articleId, art] of catalogueById) {
      const tarifsForArticle =
        tarifsByArticle.get(articleId) ?? new Map<string, TarifRow>();

      for (const typeService of ACTION_TYPES) {
        const svc = serviceByType.get(typeService);

        // Si le pressing n'offre pas ce type de service, on saute la variante.
        // L'action ne s'affichera pas dans le dialogue. L'admin doit créer
        // le service dans /admin/services.
        if (!svc) {
          continue;
        }

        const tarif = tarifsForArticle.get(typeService);
        const prix = tarif
          ? Math.trunc(tarif.prix ?? 0)
          : Math.trunc(svc.prix ?? 0);
        const duree = tarif
          ? dureeToHours(tarif.duree_estimee)
          : dureeToHours(svc.duree_estimee);

        const cat = typeToCategorie(typeService);
        articles.push({
          id: `${svc.id}::${art.slug}::${typeService}`,
          service_id: svc.id,
          service_nom: svc.nom,
          categorie: cat,
          catalogue_article_id: art.id,
          catalogue_slug: art.slug,
          catalogue_nom: art.nom,
          catalogue_categorie:
            art.categorie && art.categorie.trim()
              ? art.categorie
              : "Articles spéciaux",
          icone_url: art.icone_url ?? iconeUrlForSlug(art.slug),
          prix,
          duree_estimee_h: duree,
          tarifConfigure: !!tarif,
        });
      }
    }

    // Si aucun article n'a pu être construit (catalogue vide ou aucun service
    // actif), bascule mock.
    if (!articles.length) {
      return { articles: MOCK_ARTICLES, source: "mock" };
    }

    return {
      articles,
      source: tarifs.length ? "api" : "mixed",
    };
  } catch {
    return { articles: MOCK_ARTICLES, source: "mock" };
  }
}

/**
 * Les 9 catégories du catalogue global (Vêtements traités, Linge de maison,
 * Cuir et fourrure, etc.). Repris de `CATALOGUE_CATEGORIES` avec mapping
 * des icônes lucide-react vers le type string `PosCatalogueCategorie["icon"]`.
 *
 * L'ordre est identique à celui de `CATALOGUE_CATEGORIES` (défini côté
 * `@/lib/catalogue/catalogue-articles`).
 */
const CATALOGUE_ICON_BY_NOM: Record<string, PosCatalogueCategorie["icon"]> = {
  "Vêtements traités": "shirt",
  "Linge de maison": "bed",
  "Cuir et fourrure": "sparkles",
  "Travail et uniformes": "briefcase",
  "Textiles spéciaux": "trophy",
  "Accessoires de mode": "link",
  "Petits textiles & linge de table": "utensils",
  "Maison et décoration": "sofa",
  "Articles spéciaux": "package",
};

export async function getCatalogueCategories(): Promise<
  PosCatalogueCategorie[]
> {
  return CATALOGUE_CATEGORIES.map((c) => ({
    id: c.nom,
    label: c.nom,
    icon: CATALOGUE_ICON_BY_NOM[c.nom] ?? "package",
  }));
}

/** Catégories POS (statiques — pourrait être dérivé de la config pressing). */
export async function getCategories(): Promise<PosCategorie[]> {
  return POS_CATEGORIES;
}

/**
 * Recherche un client par nom OU téléphone.
 * Tente l'API /api/admin/clients ; bascule sur les données fictives filtrées
 * en cas d'échec ou de résultat vide.
 */
export async function searchClients(q: string): Promise<PosClient[]> {
  const query = (q || "").trim();
  if (!query) return [];

  try {
    const res = await fetch(
      `/api/admin/clients?q=${encodeURIComponent(query)}&pageSize=20`,
      { cache: "no-store" }
    );
    if (!res.ok) throw new Error("clients api failed");
    const json = await res.json();
    const rows = (json?.data ?? []) as Array<Record<string, unknown>>;
    if (!rows.length) {
      // API OK mais aucun résultat → repli mock filtré (démo).
      return filterMockClients(query);
    }
    const clients: PosClient[] = rows.map((r) => ({
      id: String(r.id ?? ""),
      nom: String(r.nom_complet ?? r.nom ?? ""),
      telephone: String(r.telephone ?? ""),
      email: (r.email as string | null) ?? null,
      commune: (r.commune as string | null) ?? null,
      solde_impaye: Math.trunc(Number(r.solde_impaye ?? 0)) || 0,
    }));
    return clients;
  } catch {
    return filterMockClients(query);
  }
}

function filterMockClients(q: string): PosClient[] {
  const n = q.toLowerCase().replace(/\s/g, "");
  return MOCK_CLIENTS.filter(
    (c) =>
      c.nom.toLowerCase().replace(/\s/g, "").includes(n) ||
      c.telephone.replace(/\s/g, "").includes(n)
  );
}

/**
 * Service actif du pressing (pour le dialogue « Ajouter un linge / vêtement »).
 * On expose le type DB (lavage, repassage, …), le nom affichable, l'UUID et
 * le prix par défaut (qui pré-remplit le champ prix du dialogue custom).
 */
export interface PosService {
  id: string;
  type: string;
  nom: string;
  prix: number;
  duree_estimee_h?: number;
}

/**
 * Charge les services actifs du pressing connecté (GET /api/admin/services).
 *
 * Utilisé par le dialogue « Ajouter un linge / vêtement » pour :
 *   - savoir quels types de service sont proposés par le pressing
 *   - pré-remplir le champ prix de chaque action avec service.prix
 *   - récupérer le service_id (nécessaire pour créer la commande)
 *
 * Retourne un tableau vide en cas d'échec (le dialogue custom affichera
 * « Non configuré » sur toutes les actions).
 */
export async function getActiveServices(): Promise<PosService[]> {
  try {
    const res = await fetch("/api/admin/services", { cache: "no-store" });
    if (!res.ok) return [];
    const json = await res.json();
    const rows = (json?.data ?? []) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      id: String(r.id ?? ""),
      type: String(r.type ?? ""),
      nom: String(r.nom ?? ""),
      prix: Math.trunc(Number(r.prix ?? 0)) || 0,
      duree_estimee_h: dureeToHours(r.duree_estimee),
    }));
  } catch {
    return [];
  }
}

/**
 * Article du catalogue global utilisé comme « fourre-tout » pour les articles
 * personnalisés (slug `houssse-vetement-perso`).
 *
 * Récupère l'UUID + le nom + l'icône via /api/public/catalogue-articles.
 * Fallback : si l'article n'existe pas, prend le 1er article du catalogue
 * (pour ne jamais bloquer la création d'articles personnalisés).
 */
export interface CustomCatalogueAnchor {
  id: string;
  nom: string;
  icone_url: string;
  slug: string;
}

export async function getCustomCatalogueAnchor(): Promise<CustomCatalogueAnchor | null> {
  try {
    const res = await fetch("/api/public/catalogue-articles", {
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = await res.json();
    const rows = (json?.data ?? []) as Array<{
      id: string;
      slug: string;
      nom: string;
      icone_url?: string;
    }>;
    if (!rows.length) return null;
    const found =
      rows.find((r) => r.slug === CUSTOM_ARTICLE_SLUG) ?? rows[0];
    return {
      id: found.id,
      nom: found.nom,
      icone_url: found.icone_url ?? iconeUrlForSlug(found.slug),
      slug: found.slug,
    };
  } catch {
    return null;
  }
}

/**
 * Crée la commande via POST /api/admin/commandes (Supabase, RLS).
 * Lance une erreur explicite en cas d'échec réseau — le panier n'est pas
 * perdu (l'appelant garde l'état).
 */
export async function createCommande(
  payload: PosCommandePayload
): Promise<PosCommandeCree> {
  const res = await fetch("/api/admin/commandes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.success) {
    throw new Error(
      typeof json?.error === "string"
        ? json.error
        : "Échec de la création de la commande."
    );
  }
  return json.data as PosCommandeCree;
}
