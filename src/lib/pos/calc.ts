/**
 * e-pressing — POS / Caisse : fonctions de calcul pures
 * =====================================================
 * Toute la logique financière (sous-total, remise, net, reste, statut) est
 * isolée ici dans des fonctions pures testables — jamais dispersée dans le JSX.
 *
 * Les montants sont manipulés en entiers FCFA — jamais de décimales, jamais
 * d'arrondi flottant.
 */
import type {
  PosCartLine,
  PosFinance,
  PosMethodePaiement,
  PosRemiseType,
  PosStatutPaiement,
} from "./types";

/** Majoration Express en % (configurable pressing — défaut 25 %). */
export const EXPRESS_MAJORATION_PCT = 25;

/**
 * Prix unitaire effectif d'une ligne (avec majoration Express si activée).
 * Le prix de base est entier ; la majoration est arrondie à l'entier le plus
 * proche (FCFA — pas de décimales).
 */
export function prixEffectifLine(line: PosCartLine): number {
  if (!line.express) return line.article.prix;
  const majoration = Math.round(
    (line.article.prix * EXPRESS_MAJORATION_PCT) / 100
  );
  return line.article.prix + majoration;
}

/** Total d'une ligne = prix effectif × quantité. */
export function totalLine(line: PosCartLine): number {
  return prixEffectifLine(line) * line.quantite;
}

/**
 * Sous-total = somme des totaux de lignes (avant remise).
 */
export function computeSousTotal(lines: PosCartLine[]): number {
  return lines.reduce((sum, l) => sum + totalLine(l), 0);
}

/**
 * Montant de la remise en FCFA à partir du type et de la valeur.
 *   - "aucune"       → 0
 *   - "pourcentage"  → round(sous_total × valeur / 100), plafonné au sous-total
 *   - "montant_fixe" → valeur, plafonnée au sous-total
 */
export function computeRemiseMontant(
  sousTotal: number,
  type: PosRemiseType,
  valeur: number
): number {
  if (type === "aucune" || !valeur || valeur <= 0) return 0;
  let montant: number;
  if (type === "pourcentage") {
    montant = Math.round((sousTotal * valeur) / 100);
  } else {
    montant = Math.trunc(valeur);
  }
  // Jamais plus que le sous-total, jamais négatif.
  return Math.max(0, Math.min(montant, sousTotal));
}

/**
 * Calcule l'ensemble des montants financiers à partir de l'état.
 *
 *   sous_total   = Σ(prix_effectif × qté)
 *   remise       = computeRemiseMontant(...)
 *   net_a_payer  = sous_total − remise
 *   paye         = montant payé saisi (plafonné au net à payer)
 *   reste        = net_a_payer − paye
 *   statut       = impaye | acompte | paye
 */
export function computeFinance(args: {
  lines: PosCartLine[];
  remiseType: PosRemiseType;
  remiseValeur: number;
  paye: number;
}): PosFinance {
  const { lines, remiseType, remiseValeur, paye } = args;
  const sous_total = computeSousTotal(lines);
  const remise_montant = computeRemiseMontant(
    sous_total,
    remiseType,
    remiseValeur
  );
  const net_a_payer = Math.max(0, sous_total - remise_montant);
  // Le montant payé ne peut jamais dépasser le net à payer.
  const payeSafe = Math.max(0, Math.min(Math.trunc(paye), net_a_payer));
  const reste = Math.max(0, net_a_payer - payeSafe);
  const statut: PosStatutPaiement =
    payeSafe <= 0
      ? "impaye"
      : payeSafe >= net_a_payer
        ? "paye"
        : "acompte";
  return {
    sous_total,
    remise_montant,
    net_a_payer,
    paye: payeSafe,
    reste,
    statut,
  };
}

/** Nombre total d'étiquettes QR à imprimer = Σ quantités. */
export function computeTotalEtiquettes(lines: PosCartLine[]): number {
  return lines.reduce((sum, l) => sum + l.quantite, 0);
}

// ============================================================
// REGROUPEMENT DES LIGNES PAR LINGE (facturation groupée)
// ============================================================
// PRINCIPE : un même linge (catalogue_article) avec plusieurs traitements
// (Lavage + Repassage + Nettoyage à sec) est affiché sur UNE SEULE ligne
// du tableau, avec les traitements listés en dessous du nom du linge.
// Le prix unitaire affiché = somme des prix des traitements.
//
// Le regroupement est purement visuel : le store garde une PosCartLine par
// traitement (pour le payload API), c'est l'UI qui agrège pour l'affichage.

/** Un groupe de lignes partageant le même linge (catalogue_article). */
export interface PosCartGroup {
  /** Clé de regroupement (catalogue_article_id pour les standards, custom::nom pour les personnalisés). */
  key: string;
  /** UUID du catalogue_articles (FK DB). */
  catalogue_article_id: string;
  /** Nom affiché du linge (ex: "Chemise", "Costumes & Vêtements de Cérémonie"). */
  catalogue_nom: string;
  /** Slug du catalogue (pour l'illustration). */
  catalogue_slug: string;
  /** URL de l'illustration. */
  icone_url: string;
  /** True si article personnalisé (Ajouter un linge / vêtement). */
  is_custom?: boolean;
  /** Lignes du panier (une par traitement) — ordre d'insertion. */
  lines: PosCartLine[];
}

/**
 * Regroupe les lignes du panier par linge (catalogue_article).
 *
 * - Articles standards : groupés par `catalogue_article_id` (UUID du catalogue).
 * - Articles personnalisés : groupés par `custom::${catalogue_nom}` car ils
 *   partagent tous le même `catalogue_article_id` (ancre "fourre-tout").
 *
 * Préserve l'ordre d'insertion (la 1ère ligne rencontrée détermine la position
 * du groupe dans le tableau).
 */
export function groupCartLines(lines: PosCartLine[]): PosCartGroup[] {
  const groups: PosCartGroup[] = [];
  const indexByKey = new Map<string, number>();

  for (const line of lines) {
    const key = line.article.is_custom
      ? `custom::${line.article.catalogue_nom}`
      : line.article.catalogue_article_id;

    let idx = indexByKey.get(key);
    if (idx === undefined) {
      idx = groups.length;
      indexByKey.set(key, idx);
      groups.push({
        key,
        catalogue_article_id: line.article.catalogue_article_id,
        catalogue_nom: line.article.catalogue_nom,
        catalogue_slug: line.article.catalogue_slug,
        icone_url: line.article.icone_url,
        is_custom: line.article.is_custom,
        lines: [],
      });
    }
    groups[idx].lines.push(line);
  }

  return groups;
}

/**
 * Prix unitaire du groupe = somme des prix de base des traitements
 * (SANS majoration Express — cohérent avec l'affichage P.U par ligne).
 */
export function groupPrixUnitaire(group: PosCartGroup): number {
  return group.lines.reduce((sum, l) => sum + l.article.prix, 0);
}

/**
 * Prix unitaire effectif du groupe = somme des prix effectifs des traitements
 * (AVEC majoration Express si activée sur la ligne).
 */
export function groupPrixEffectif(group: PosCartGroup): number {
  return group.lines.reduce((sum, l) => sum + prixEffectifLine(l), 0);
}

/**
 * Quantité du groupe = quantité de la 1ère ligne.
 * Toutes les lignes du groupe devraient partager la même quantité
 * (synchronisées via setGroupQty), mais on lit la 1ère par convention.
 */
export function groupQuantite(group: PosCartGroup): number {
  return group.lines[0]?.quantite ?? 1;
}

/**
 * Total du groupe = Σ(totalLine) pour chaque ligne du groupe.
 * = groupPrixEffectif × quantité (si toutes les lignes ont la même quantité).
 */
export function groupTotal(group: PosCartGroup): number {
  return group.lines.reduce((sum, l) => sum + totalLine(l), 0);
}

/**
 * Vrai si TOUTES les lignes du groupe sont en Express.
 * Sert à l'affichage du toggle Express au niveau du groupe.
 */
export function groupIsExpress(group: PosCartGroup): boolean {
  return group.lines.length > 0 && group.lines.every((l) => l.express);
}

/** Note partagée du groupe (1ère ligne non vide), ou undefined. */
export function groupNote(group: PosCartGroup): string | undefined {
  for (const l of group.lines) {
    if (l.note) return l.note;
  }
  return undefined;
}

/** Vrai si au moins une ligne est en Express (raccourcit la date de retrait). */
export function hasExpress(lines: PosCartLine[]): boolean {
  return lines.some((l) => l.express);
}

/**
 * Date de retrait calculée : J + délai standard (48 h par défaut).
 * Raccourcie à J+24h si au moins un article est Express.
 * Retourne une date ISO.
 */
export function computeDateRetrait(
  dateDepot: Date,
  express: boolean
): Date {
  const delaiHeures = express ? 24 : 48;
  return new Date(dateDepot.getTime() + delaiHeures * 3600 * 1000);
}

/** Génère une référence au format DEP + AAAAMMJJHHMMSSmmm. */
export function generateReference(date: Date = new Date()): string {
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  const s = String(date.getSeconds()).padStart(2, "0");
  const ms = String(date.getMilliseconds()).padStart(3, "0");
  return `DEP${y}${mo}${d}${h}${mi}${s}${ms}`;
}

/** UUID local (clé React) — crypto si dispo, fallback Math.random. */
export function localId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Label lisible d'une méthode de paiement. */
export function methodePaiementLabel(m: PosMethodePaiement): string {
  switch (m) {
    case "especes":
      return "Espèces";
    case "mobile_money":
      return "Mobile Money";
    case "carte_bancaire":
      return "Carte bancaire";
  }
}

/** Couleur de badge selon le statut de paiement. */
export function statutBadgeClass(statut: PosStatutPaiement): string {
  switch (statut) {
    case "paye":
      return "pos-badge pos-badge-paid";
    case "acompte":
      return "pos-badge pos-badge-acompte";
    case "impaye":
      return "pos-badge pos-badge-unpaid";
  }
}

/** Label du statut de paiement. */
export function statutLabel(statut: PosStatutPaiement): string {
  switch (statut) {
    case "paye":
      return "PAYÉ";
    case "acompte":
      return "ACOMPTE";
    case "impaye":
      return "IMPAYÉ";
  }
}
