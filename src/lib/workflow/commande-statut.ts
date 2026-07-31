/**
 * OgPressing — Machine à états centralisée du workflow des commandes
 * -------------------------------------------------------------------
 * WORKFLOW-FIX-V1 — Source unique de vérité pour :
 *   - Les statuts possibles d'une commande et d'un article (enum SQL)
 *   - L'ordre logique du workflow métier
 *   - Les transitions autorisées entre statuts (matrice)
 *   - Les guards de paiement (acompte vs solde final)
 *
 * Workflow canonique (PRD §3.3 + trigger deriver_statut_commande) :
 *
 *   recu → en_traitement → lave → repasse → pret → en_livraison → livre
 *                                                      ↘ retire (retrait sur place)
 *
 * Règles de paiement :
 *   - Un ACOMPTE (paiement partiel qui laisse un reste > 0) est autorisé
 *     à TOUT moment, dès la création, même si statut = "recu".
 *   - Le SOLDE FINAL (paiement qui fait passer montant_paye ≥ montant_total
 *     et donc statut_paiement à "paye") n'est autorisé que si la commande
 *     est au moins "repasse" (lavé + repassé). Cela évite qu'une commande
 *     soit entièrement payée alors qu'elle n'a pas encore été traitée.
 *
 * Exceptions :
 *   - À la CRÉATION de la commande (POST /api/admin/commandes), un acompte
 *     total (couvrant le montant total) est autorisé. La commande naît
 *     "recu + paye" (acompte total). C'est légitime (client paie comptant
 *     à la réception). Le guard caissier empêche ensuite tout nouveau
 *     encaissement, et la commande DOIT suivre le workflow normal
 *     (recu → en_traitement → lave → repasse → pret → retire/livre).
 *   - Le rôle "manager" et "admin" peuvent forcer une transition d'article
 *     arbitraire (intervention manuelle). Le guard serveur l'autorise mais
 *     l'événement est journalisé.
 *
 * Utilisé par :
 *   - src/app/api/personnel/caissier/encaisser/route.ts (guard paiement)
 *   - src/app/api/admin/commandes/[id]/articles/[articleId]/route.ts (guard transition)
 *   - src/components/ogpressing/admin/commandes/commande-detail.tsx (UI Select filtré)
 *   - src/app/(admin)/admin/dashboard/page.tsx (KPI "payées non prêtes")
 *   - src/app/(personnel)/personnel/caissier/dashboard/page.tsx (KPI surveillance)
 */
import type { RolePersonnel } from "@/lib/types";

/* -------------------------------------------------------------------------- */
/*  Statuts canoniques (alignés sur les enums SQL migration 001_enums.sql)    */
/* -------------------------------------------------------------------------- */

/** 7 statuts valides pour un article (enum SQL `statut_article`). */
export const STATUTS_ARTICLE = [
  "recu",
  "en_traitement",
  "lave",
  "repasse",
  "pret",
  "retire",
  "livre",
] as const;

export type StatutArticleValue = (typeof STATUTS_ARTICLE)[number];

/** 8 statuts valides pour une commande (enum SQL `statut_commande`). */
export const STATUTS_COMMANDE = [
  "recu",
  "en_traitement",
  "lave",
  "repasse",
  "pret",
  "en_livraison",
  "livre",
  "retire",
] as const;

export type StatutCommandeValue = (typeof STATUTS_COMMANDE)[number];

/** Statuts considérés comme "traités" (≥ repasse dans le workflow). */
export const STATUTS_TRAITES: ReadonlySet<string> = new Set([
  "repasse",
  "pret",
  "en_livraison",
  "livre",
  "retire",
]);

/** Statuts terminaux (plus rien à faire). */
export const STATUTS_TERMINAUX: ReadonlySet<string> = new Set([
  "retire",
  "livre",
]);

/* -------------------------------------------------------------------------- */
/*  Matrice des transitions autorisées (articles_vetements.statut)            */
/* -------------------------------------------------------------------------- */

/**
 * Matrice des transitions autorisées pour `articles_vetements.statut`.
 * Clé = statut source, valeur = liste des statuts cibles autorisés.
 *
 * Règles :
 *   - On peut toujours rester dans le même statut (no-op).
 *   - On peut avancer d'un cran dans le workflow canonique.
 *   - On peut sauter des étapes vers l'avant (ex: recu → pret si l'article
 *     n'a pas besoin de lavage/repassage — ex: article "déposé prêt").
 *   - On NE peut JAMAIS reculer (ex: pret → recu interdit).
 *   - `retire` et `livre` sont terminaux (aucune transition sortante
 *     sauf no-op).
 *
 * Sauf : les rôles "manager" et "admin" peuvent forcer n'importe quelle
 * transition (override manual). Le guard serveur l'autorise mais logge.
 */
export const TRANSITIONS_ARTICLE_AUTORISEES: Readonly<
  Record<string, ReadonlySet<string>>
> = {
  recu: new Set(["recu", "en_traitement", "lave", "repasse", "pret"]),
  en_traitement: new Set(["en_traitement", "lave", "repasse", "pret"]),
  lave: new Set(["lave", "repasse", "pret"]),
  repasse: new Set(["repasse", "pret"]),
  pret: new Set(["pret", "retire", "livre"]),
  retire: new Set(["retire"]),
  livre: new Set(["livre"]),
};

/** Rôles pouvant forcer une transition d'article arbitraire (override). */
export const ROLES_OVERRIDE_TRANSITION: ReadonlySet<RolePersonnel> = new Set([
  "manager",
]);

/**
 * Vérifie si une transition de statut article est autorisée.
 *
 * @param from      Statut actuel de l'article.
 * @param to        Statut cible voulu.
 * @param role      Rôle du personnel qui demande la transition (optionnel).
 *                  Si "manager" (ou admin via le role "manager" côté personnel),
 *                  toutes les transitions sont autorisées.
 * @returns         true si la transition est autorisée.
 */
export function canTransitionArticle(
  from: string | null | undefined,
  to: string,
  role?: RolePersonnel | string | null
): boolean {
  // Rôles override : manager (l'admin pressing a le rôle "manager" côté personnel)
  if (role && ROLES_OVERRIDE_TRANSITION.has(role as RolePersonnel)) {
    return true;
  }
  if (!from) {
    // Pas de statut source connu (cas anormal) — on refuse par défaut
    return false;
  }
  const allowed = TRANSITIONS_ARTICLE_AUTORISEES[from];
  if (!allowed) {
    // Statut source inconnu — refus défensif
    return false;
  }
  return allowed.has(to);
}

/**
 * Pour un statut article donné, retourne la liste des statuts cibles
 * autorisés (pour filtrer un <Select> côté UI).
 *
 * @param from   Statut actuel.
 * @param role   Rôle du personnel (si manager, retourne TOUS les statuts).
 */
export function getAllowedNextStatutsArticle(
  from: string | null | undefined,
  role?: RolePersonnel | string | null
): StatutArticleValue[] {
  if (role && ROLES_OVERRIDE_TRANSITION.has(role as RolePersonnel)) {
    return [...STATUTS_ARTICLE];
  }
  if (!from) return [];
  const allowed = TRANSITIONS_ARTICLE_AUTORISEES[from];
  if (!allowed) return [];
  return STATUTS_ARTICLE.filter((s) => allowed.has(s));
}

/* -------------------------------------------------------------------------- */
/*  Guards de paiement                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Détermine si on peut encaisser un ACOMPTE (paiement partiel) sur une
 * commande. Un acompte est autorisé dès la création, tant que la commande
 * n'est pas terminée.
 *
 * @param statutCommande  Statut actuel de la commande.
 * @returns               true si l'acompte est autorisé.
 */
export function peutEncaisserAcompte(
  statutCommande: string | null | undefined
): boolean {
  if (!statutCommande) return false;
  return !STATUTS_TERMINAUX.has(statutCommande);
}

/**
 * Détermine si on peut encaisser le SOLDE FINAL d'une commande (paiement
 * qui ferait passer statut_paiement à "paye"). Le solde final n'est autorisé
 * que si la commande est au moins "repasse" — c'est-à-dire que le service
 * a été effectué (lavage + repassage).
 *
 * Rationale : éviter qu'une commande soit entièrement payée alors qu'elle
 * n'a pas encore été traitée. Le client paie pour un service terminé.
 *
 * Exception : à la CRÉATION de la commande (POST /api/admin/commandes),
 * un acompte total est autorisé (le client peut payer comptant à la
 * réception). Ce guard ne s'applique donc qu'au endpoint caissier
 * (paiements ultérieurs).
 *
 * @param statutCommande  Statut actuel de la commande.
 * @returns               true si le solde final peut être encaissé.
 */
export function peutEncaisserSoldeFinal(
  statutCommande: string | null | undefined
): boolean {
  if (!statutCommande) return false;
  return STATUTS_TRAITES.has(statutCommande);
}

/**
 * Vérifie si un paiement donné ferait passer la commande au statut "paye".
 *
 * @param montantPayeActuel  Montant déjà payé (commandes.montant_paye).
 * @param montantTotal       Montant total de la commande.
 * @param montantPaiement    Montant du paiement proposé.
 * @returns                  true si après ce paiement, montant_paye ≥ montant_total.
 */
export function paiementFermeCommande(
  montantPayeActuel: number,
  montantTotal: number,
  montantPaiement: number
): boolean {
  return montantPayeActuel + montantPaiement >= montantTotal;
}

/* -------------------------------------------------------------------------- */
/*  Helpers de labels (pour cohérence UI)                                     */
/* -------------------------------------------------------------------------- */

/** Libellés FR pour les statuts commande. */
export const STATUT_COMMANDE_LABELS: Record<string, string> = {
  recu: "Reçu",
  en_traitement: "En traitement",
  lave: "Lavé",
  repasse: "Repassé",
  pret: "Prêt",
  en_livraison: "En livraison",
  livre: "Livré",
  retire: "Retiré",
};

/** Libellés FR pour les statuts article (identiques à commande hors "en_livraison"). */
export const STATUT_ARTICLE_LABELS: Record<string, string> = {
  recu: "Reçu",
  en_traitement: "En traitement",
  lave: "Lavé",
  repasse: "Repassé",
  pret: "Prêt",
  retire: "Retiré",
  livre: "Livré",
};

/**
 * Explication humaine d'une transition refusée — pour messages d'erreur API.
 */
export function expliquerRefusTransition(
  from: string | null | undefined,
  to: string
): string {
  if (!from) {
    return `Statut source inconnu — impossible de valider la transition vers "${to}".`;
  }
  const allowed = TRANSITIONS_ARTICLE_AUTORISEES[from];
  if (!allowed) {
    return `Statut source "${from}" non reconnu.`;
  }
  const allowedList = [...allowed]
    .map((s) => STATUT_ARTICLE_LABELS[s] ?? s)
    .join(", ");
  return `Transition interdite : "${STATUT_ARTICLE_LABELS[from] ?? from}" → "${STATUT_ARTICLE_LABELS[to] ?? to}". Statuts autorisés depuis "${STATUT_ARTICLE_LABELS[from] ?? from}" : ${allowedList}.`;
}
