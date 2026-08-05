/**
 * OgPressing — POS / Caisse : fonctions de calcul pures
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
