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

/** Catégories POS (barre du bas). Toujours 4 + "Tous". */
export const POS_CATEGORIES: PosCategorie[] = [
  { id: "lavage", label: "Lavage", icon: "washing" },
  { id: "repassage", label: "Repassage", icon: "iron" },
  { id: "laver-repasser", label: "Laver-Repasser", icon: "shirt" },
  { id: "sechage", label: "Séchage", icon: "sun" },
  { id: "nettoyage_sec", label: "Nettoyage à sec", icon: "sparkles" },
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
 */
export const MOCK_ARTICLES: PosArticle[] = [
  {
    id: "svc-lr-chemise",
    service_id: "svc-lr-chemise",
    service_nom: "Laver-Repasser Complet Tunique",
    categorie: "laver-repasser",
    catalogue_slug: SLUG_CHEMISE,
    catalogue_nom: "Chemise",
    icone_url: iconeUrlForSlug(SLUG_CHEMISE),
    prix: 1000,
    duree_estimee_h: 48,
  },
  {
    id: "svc-rep-pantalon",
    service_id: "svc-rep-pantalon",
    service_nom: "Repassage Pantalon Tissu",
    categorie: "repassage",
    catalogue_slug: SLUG_PANTALON,
    catalogue_nom: "Pantalon tissu",
    icone_url: iconeUrlForSlug(SLUG_PANTALON),
    prix: 500,
    duree_estimee_h: 48,
  },
  {
    id: "svc-lr-costume",
    service_id: "svc-lr-costume",
    service_nom: "Laver-Repasser Complet Costume",
    categorie: "laver-repasser",
    catalogue_slug: SLUG_COSTUME,
    catalogue_nom: "Costume",
    icone_url: iconeUrlForSlug(SLUG_COSTUME),
    prix: 2000,
    duree_estimee_h: 48,
  },
  {
    id: "svc-lav-drap",
    service_id: "svc-lav-drap",
    service_nom: "Lavage Drap 2 Places",
    categorie: "lavage",
    catalogue_slug: SLUG_DRAP,
    catalogue_nom: "Drap",
    icone_url: iconeUrlForSlug(SLUG_DRAP),
    prix: 1000,
    duree_estimee_h: 48,
  },
  {
    id: "svc-lr-pantalon",
    service_id: "svc-lr-pantalon",
    service_nom: "Laver-Repasser Pantalon Tissu",
    categorie: "laver-repasser",
    catalogue_slug: SLUG_PANTALON,
    catalogue_nom: "Pantalon tissu",
    icone_url: iconeUrlForSlug(SLUG_PANTALON),
    prix: 500,
    duree_estimee_h: 48,
  },
  {
    id: "svc-sec-drap",
    service_id: "svc-sec-drap",
    service_nom: "Séchage Drap 2 Places",
    categorie: "sechage",
    catalogue_slug: SLUG_DRAP,
    catalogue_nom: "Drap",
    icone_url: iconeUrlForSlug(SLUG_DRAP),
    prix: 1000,
    duree_estimee_h: 48,
  },
  {
    id: "svc-lav-culotte",
    service_id: "svc-lav-culotte",
    service_nom: "Lavage Culotte Jean",
    categorie: "lavage",
    catalogue_slug: SLUG_CULOTTE,
    catalogue_nom: "Culotte jean",
    icone_url: iconeUrlForSlug(SLUG_CULOTTE),
    prix: 500,
    duree_estimee_h: 48,
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
      article: find("svc-lr-chemise"),
      quantite: 1,
      express: false,
      couleur: "autre",
      etat: "correct",
    },
    {
      id: localId(),
      article: find("svc-rep-pantalon"),
      quantite: 1,
      express: false,
      couleur: "autre",
      etat: "correct",
    },
    {
      id: localId(),
      article: find("svc-lav-culotte"),
      quantite: 1,
      express: false,
      couleur: "autre",
      etat: "correct",
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
