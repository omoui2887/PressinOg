/**
 * OgPressing — POS / Caisse : couche d'accès aux données
 * ======================================================
 * Fonctions d'accès aux données derrière une interface stable :
 *   - getArticles()             → catalogue de prestations (services × articles)
 *   - getCatalogueCategories()  → 9 catégories du catalogue global
 *   - getCategories()           → catégories POS (barre service-type)
 *   - searchClients()           → recherche client (nom + téléphone)
 *   - createCommande()          → POST /api/admin/commandes
 *
 * STRATÉGIE : on tente d'abord les API Supabase réelles (déjà configurées).
 * Si elles échouent ou renvoient un catalogue vide (pressing fraîchement
 * configuré sans services), on bascule sur les données fictives de
 * `mock-data.ts` afin que l'écran ne soit jamais vide.
 *
 * Brancher/débrancher Supabase = ne modifier que ce fichier ; les composants
 * n'ont pas besoin d'être touchés.
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
 * Mapping type de service DB → catégorie POS.
 *
 * Détecte d'abord les cas ambigus via le nom du service (ex : "Laver-Repasser"
 * contient à la fois "laver" et "repasser" → catégorie "laver-repasser",
 * même si le type DB est "lavage"). Sinon, mappe directement le type DB.
 *
 * Le type "detachage" est maintenant mappé à sa propre catégorie (et non
 * fusionné avec "lavage") afin que le dialogue d'action puisse l'afficher
 * distinctement avec son prix spécifique.
 */
function typeToCategorie(
  type: string,
  nom: string
): PosArticle["categorie"] {
  const n = (nom || "").toLowerCase();
  if (n.includes("repasser") || n.includes("repassage")) {
    if (n.includes("laver")) return "laver-repasser";
    return "repassage";
  }
  if (n.includes("séchage") || n.includes("sechage")) return "sechage";
  if (n.includes("detachage") || n.includes("détachage")) return "detachage";
  switch (type) {
    case "lavage":
      return "lavage";
    case "repassage":
      return "repassage";
    case "nettoyage_sec":
      return "nettoyage_sec";
    case "blanchisserie":
      return "lavage";
    case "detachage":
      return "detachage";
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
 * Charge le catalogue de prestations — VERSION ARTICLE-CENTRIC.
 *
 * 1. GET /api/admin/services            → services actifs du pressing connecté.
 * 2. GET /api/public/catalogue-articles → 33 articles du catalogue global.
 * 3. GET /api/admin/tarifs-articles     → tarifs spécifiques (actifs) par
 *    couple (article × type_service) pour le pressing connecté.
 *
 * Construit une `PosArticle[]` cartésienne : 1 entrée par (service × article
 * du catalogue). Avec N services et 33 articles, on obtient N×33 cartes au
 * maximum. Chaque carte hérite :
 *   - du service  → `service_id`, `service_nom`, `categorie` (type POS)
 *   - de l'article→ `catalogue_article_id`, `catalogue_slug`, `catalogue_nom`,
 *                   `catalogue_categorie`, `icone_url`
 *   - du tarif    → `prix` + `duree_estimee_h` si un tarif spécifique existe
 *                   pour (article, type_service) ; sinon fallback sur le
 *                   prix/durée générique du service.
 *
 * Si l'une des requêtes critiques (services OU catalogue) échoue ou renvoie
 * vide, on bascule sur les données fictives.
 *
 * Le fetch des tarifs est non bloquant : s'il échoue (401, réseau), on
 * utilise simplement le prix du service pour toutes les cartes.
 */
export async function getArticles(): Promise<{
  articles: PosArticle[];
  source: "api" | "mock" | "mixed";
}> {
  try {
    const [servicesRes, catalogueRes, tarifsRes] = await Promise.allSettled([
      fetch("/api/admin/services", { cache: "no-store" }),
      fetch("/api/public/catalogue-articles", { cache: "no-store" }),
      fetch("/api/admin/tarifs-articles", { cache: "no-store" }),
    ]);

    const services: ServiceRow[] =
      servicesRes.status === "fulfilled" && servicesRes.value.ok
        ? ((await servicesRes.value.json())?.data as
            | ServiceRow[]
            | undefined) ?? []
        : [];
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

    // Bascule mock si l'une des deux sources critiques est vide.
    if (!services.length || !catalogue.length) {
      return { articles: MOCK_ARTICLES, source: "mock" };
    }

    // Index des tarifs : Map<catalogue_article_id, Map<type_service, {prix, duree_h}>>
    // Permet une résolution O(1) lors de la construction des cartes.
    const tarifsByArticle = new Map<
      string,
      Map<string, { prix: number; duree_h?: number }>
    >();
    for (const t of tarifs) {
      if (!t.catalogue_article_id) continue;
      let inner = tarifsByArticle.get(t.catalogue_article_id);
      if (!inner) {
        inner = new Map();
        tarifsByArticle.set(t.catalogue_article_id, inner);
      }
      inner.set(t.type_service, {
        prix: Math.trunc(t.prix ?? 0),
        duree_h: dureeToHours(t.duree_estimee),
      });
    }

    // Construction du produit cartésien service × article.
    const articles: PosArticle[] = [];
    for (const svc of services) {
      const cat = typeToCategorie(svc.type, svc.nom);
      const svcDureeH = dureeToHours(svc.duree_estimee);
      const svcPrix = Math.trunc(svc.prix ?? 0);
      for (const art of catalogue) {
        const tarif = tarifsByArticle.get(art.id)?.get(svc.type);
        articles.push({
          id: `${svc.id}::${art.slug}`,
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
          prix: tarif?.prix ?? svcPrix,
          duree_estimee_h: tarif?.duree_h ?? svcDureeH,
        });
      }
    }

    // `mixed` signale qu'on a chargé l'API mais sans tarifs spécifiques
    // (permet à l'UI d'afficher un indicateur éventuel — non requis ici).
    const source: "api" | "mixed" = tarifs.length > 0 ? "api" : "mixed";
    return { articles, source };
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
