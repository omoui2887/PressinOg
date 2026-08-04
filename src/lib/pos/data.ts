/**
 * OgPressing — POS / Caisse : couche d'accès aux données
 * ======================================================
 * Fonctions d'accès aux données derrière une interface stable :
 *   - getArticles()    → catalogue de prestations (services + illustrations)
 *   - getCategories()  → catégories POS
 *   - searchClients()  → recherche client (nom + téléphone)
 *   - createCommande() → POST /api/admin/commandes
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
  PosCategorie,
  PosClient,
  PosCommandeCree,
  PosCommandePayload,
} from "./types";
import { MOCK_ARTICLES, MOCK_CLIENTS, POS_CATEGORIES } from "./mock-data";
import { iconeUrlForSlug } from "@/lib/catalogue/catalogue-articles";

/** Mapping type de service DB → catégorie POS. */
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
      return "lavage";
    default:
      return "lavage";
  }
}

/** Choisit un slug de catalogue selon le nom du service (illustration). */
function slugForServiceName(nom: string): string {
  const n = (nom || "").toLowerCase();
  if (n.includes("chemise")) return "chemise";
  if (n.includes("costume")) return "costume-ceremonie";
  if (n.includes("pantalon") || n.includes("jean") || n.includes("culotte"))
    return "costume-medical";
  if (n.includes("drap") || n.includes("parure") || n.includes("lit"))
    return "parure-lit";
  if (n.includes("robe")) return "robe-textile-delicat";
  if (n.includes("manteau") || n.includes("blouson")) return "manteau-doudoune";
  if (n.includes("rideau") || n.includes("voilage")) return "rideau-voilage";
  if (n.includes("nappe") || n.includes("table")) return "nappe-chemin-table";
  if (n.includes("coussin")) return "houssse-coussin";
  if (n.includes("serviette") || n.includes("peignoir"))
    return "serviette-peignoir";
  if (n.includes("cravate") || n.includes("foulard")) return "cravate-foulard";
  if (n.includes("tapis")) return "tapis-bain";
  return "chemise"; // fallback propre (jamais d'image cassée)
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

/**
 * Charge le catalogue de prestations.
 *
 * 1. GET /api/admin/services (services actifs du pressing connecté).
 * 2. GET /api/public/catalogue-articles (catalogue global, pour les illustrations).
 * 3. Construit les PosArticle[] en associant chaque service à une illustration.
 *
 * Si l'une des requêtes échoue ou renvoie vide, on complète/bascule vers
 * les données fictives.
 */
export async function getArticles(): Promise<{
  articles: PosArticle[];
  source: "api" | "mock" | "mixed";
}> {
  try {
    const [servicesRes, catalogueRes] = await Promise.allSettled([
      fetch("/api/admin/services", { cache: "no-store" }),
      fetch("/api/public/catalogue-articles", { cache: "no-store" }),
    ]);

    const services: ServiceRow[] =
      servicesRes.status === "fulfilled" && servicesRes.value.ok
        ? ((await servicesRes.value.json())?.data as ServiceRow[] | undefined) ??
          []
        : [];
    const catalogue: CatalogueRow[] =
      catalogueRes.status === "fulfilled" && catalogueRes.value.ok
        ? ((await catalogueRes.value.json())?.data as
            | CatalogueRow[]
            | undefined) ?? []
        : [];

    if (!services.length) {
      // Aucun service configuré → données fictives.
      return { articles: MOCK_ARTICLES, source: "mock" };
    }

    const articles: PosArticle[] = services.map((svc) => {
      const slug = slugForServiceName(svc.nom);
      const cat = catalogue.find((c) => c.slug === slug);
      return {
        id: svc.id,
        service_id: svc.id,
        service_nom: svc.nom,
        categorie: typeToCategorie(svc.type, svc.nom),
        catalogue_slug: slug,
        catalogue_nom: cat?.nom ?? svc.nom,
        icone_url: cat?.icone_url ?? iconeUrlForSlug(slug),
        prix: Math.trunc(svc.prix ?? 0),
        duree_estimee_h: dureeToHours(svc.duree_estimee),
      };
    });

    return { articles, source: "api" };
  } catch {
    return { articles: MOCK_ARTICLES, source: "mock" };
  }
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
