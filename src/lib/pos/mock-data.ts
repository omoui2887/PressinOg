/**
 * OgPressing — POS / Caisse : données fictives (démo)
 * ===================================================
 * Données de démonstration isolées, correspondant fidèlement à l'interface
 * de référence (catalogue de 6 prestations + 3 lignes de panier + clients).
 *
 * Ces données ne sont JAMAIS écrites en dur dans les composants : elles ne
 * servent que de repli quand les API Supabase ne renvoient rien (projet
 * fraîchement configuré, pressing sans services, ou erreur réseau).
 *
 * Le branchement Supabase se fait en remplaçant l'implémentation de
 * `data.ts` — les composants n'ont pas besoin d'être modifiés.
 */
import type { PosArticle, PosCartLine, PosCategorie, PosClient } from "./types";
import { iconeUrlForSlug } from "@/lib/catalogue/catalogue-articles";
import { localId } from "./calc";

/** Catégories POS — 6 services possibles (Lavage, Repassage, Laver-Repasser, Nettoyage à sec, Détachage, Blanchisserie). */
export const POS_CATEGORIES: PosCategorie[] = [
  { id: "lavage", label: "Lavage", icon: "droplets" },
  { id: "repassage", label: "Repassage", icon: "iron" },
  { id: "laver-repasser", label: "Laver-Repasser", icon: "shirt" },
  { id: "nettoyage_sec", label: "Nettoyage à sec", icon: "sparkles" },
  { id: "detachage", label: "Détachage", icon: "spray" },
  { id: "blanchisserie", label: "Blanchisserie", icon: "washing-machine" },
];

/** Slug du catalogue par défaut (pour associer un article mock à une illustration). */
const SLUG_CHEMISE = "chemise";
const SLUG_COSTUME = "costume-ceremonie";
const SLUG_DRAP = "parure-lit";
const SLUG_PANTALON = "costume-medical"; // fallback visuel pantalon
const SLUG_CULOTTE = "sacs-bagages"; // fallback visuel

/**
 * Catalogue de démonstration — 6 prestations (cf. interface de référence).
 * Chaque entrée combine un service (type + nom + prix) et un article du
 * catalogue (slug → illustration).
 *
 * ⚠️ Format des `id` : `${service_id}::${catalogue_slug}` (composite) —
 *    permet au panier de distinguer la même carte article entre plusieurs
 *    types de service. Les `catalogue_article_id` sont fictifs (préfixe
 *    `mock-`) : les mocks ne doivent pas être utilisés pour créer de
 *    vraies commandes (l'API exige un UUID réel de catalogue_articles).
 */
export const MOCK_ARTICLES: PosArticle[] = [
  {
    id: "svc-lr-chemise::chemise",
    service_id: "svc-lr-chemise",
    service_nom: "Laver-Repasser Complet Tunique",
    categorie: "laver-repasser",
    catalogue_slug: SLUG_CHEMISE,
    catalogue_article_id: "mock-chemise",
    catalogue_nom: "Chemise",
    catalogue_categorie: "Vêtements traités",
    icone_url: iconeUrlForSlug(SLUG_CHEMISE),
    prix: 1000,
    duree_estimee_h: 48,
    tarifConfigure: true,
  },
  {
    id: "svc-rep-pantalon::costume-medical",
    service_id: "svc-rep-pantalon",
    service_nom: "Repassage Pantalon Tissu",
    categorie: "repassage",
    catalogue_slug: SLUG_PANTALON,
    catalogue_article_id: "mock-pantalon",
    catalogue_nom: "Pantalon tissu",
    catalogue_categorie: "Vêtements traités",
    icone_url: iconeUrlForSlug(SLUG_PANTALON),
    prix: 500,
    duree_estimee_h: 48,
    tarifConfigure: true,
  },
  {
    id: "svc-lr-costume::costume-ceremonie",
    service_id: "svc-lr-costume",
    service_nom: "Laver-Repasser Complet Costume",
    categorie: "laver-repasser",
    catalogue_slug: SLUG_COSTUME,
    catalogue_article_id: "mock-costume",
    catalogue_nom: "Costume",
    catalogue_categorie: "Vêtements traités",
    icone_url: iconeUrlForSlug(SLUG_COSTUME),
    prix: 2000,
    duree_estimee_h: 48,
    tarifConfigure: true,
  },
  {
    id: "svc-lav-drap::parure-lit",
    service_id: "svc-lav-drap",
    service_nom: "Lavage Drap 2 Places",
    categorie: "lavage",
    catalogue_slug: SLUG_DRAP,
    catalogue_article_id: "mock-drap",
    catalogue_nom: "Drap",
    catalogue_categorie: "Linge de maison",
    icone_url: iconeUrlForSlug(SLUG_DRAP),
    prix: 1000,
    duree_estimee_h: 48,
    tarifConfigure: true,
  },
  {
    id: "svc-lr-pantalon::costume-medical",
    service_id: "svc-lr-pantalon",
    service_nom: "Laver-Repasser Pantalon Tissu",
    categorie: "laver-repasser",
    catalogue_slug: SLUG_PANTALON,
    catalogue_article_id: "mock-pantalon",
    catalogue_nom: "Pantalon tissu",
    catalogue_categorie: "Vêtements traités",
    icone_url: iconeUrlForSlug(SLUG_PANTALON),
    prix: 500,
    duree_estimee_h: 48,
    tarifConfigure: true,
  },
  {
    id: "svc-bla-drap::parure-lit",
    service_id: "svc-bla-drap",
    service_nom: "Blanchisserie Drap 2 Places",
    categorie: "blanchisserie",
    catalogue_slug: SLUG_DRAP,
    catalogue_article_id: "mock-drap",
    catalogue_nom: "Drap",
    catalogue_categorie: "Linge de maison",
    icone_url: iconeUrlForSlug(SLUG_DRAP),
    prix: 1500,
    duree_estimee_h: 48,
    tarifConfigure: true,
  },
  {
    id: "svc-lav-culotte::sacs-bagages",
    service_id: "svc-lav-culotte",
    service_nom: "Lavage Culotte Jean",
    categorie: "lavage",
    catalogue_slug: SLUG_CULOTTE,
    catalogue_article_id: "mock-culotte",
    catalogue_nom: "Culotte jean",
    catalogue_categorie: "Vêtements traités",
    icone_url: iconeUrlForSlug(SLUG_CULOTTE),
    prix: 500,
    duree_estimee_h: 48,
    tarifConfigure: true,
  },
];

/**
 * Lignes de panier de démonstration (3 lignes — cf. interface de référence).
 * Utilisées pour le rendu initial afin que l'écran corresponde visuellement
 * à la référence. L'opérateur peut les vider via « Annuler ».
 */
export function buildMockCartLines(): PosCartLine[] {
  const find = (id: string) => MOCK_ARTICLES.find((a) => a.id === id)!;
  return [
    {
      id: localId(),
      article: find("svc-lr-chemise::chemise"),
      quantite: 1,
      express: false,
      // Défauts valides (enum DB). Voir note dans store.ts addArticle.
      couleur: "blanc",
      etat: "bon",
    },
    {
      id: localId(),
      article: find("svc-rep-pantalon::costume-medical"),
      quantite: 1,
      express: false,
      couleur: "bleu",
      etat: "bon",
    },
    {
      id: localId(),
      article: find("svc-lav-culotte::sacs-bagages"),
      quantite: 1,
      express: false,
      couleur: "noir",
      etat: "acceptable",
    },
  ];
}

/** Clients de démonstration (recherche). */
export const MOCK_CLIENTS: PosClient[] = [
  {
    id: "cli-demo-1",
    nom: "Awa Koné",
    telephone: "07 07 07 07 07",
    email: "awa.kone@example.ci",
    commune: "Cocody",
    solde_impaye: 0,
  },
  {
    id: "cli-demo-2",
    nom: "Mamadou Traoré",
    telephone: "05 05 05 05 05",
    email: null,
    commune: "Yopougon",
    solde_impaye: 3500,
  },
  {
    id: "cli-demo-3",
    nom: "Fatou Bamba",
    telephone: "01 02 03 04 05",
    email: null,
    commune: "Plateau",
    solde_impaye: 0,
  },
];
