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

/* -------------------------------------------------------------------------- */
/*  Mapping canonique statut → variante visuelle (EMBELLISSEMENT §14)          */
/* -------------------------------------------------------------------------- */
/**
 * SOURCE UNIQUE DE VÉRITÉ pour la couleur de chaque statut à travers
 * toute l'application. Toute couleur de badge de commande DOIT venir
 * de cette table — ne JAMAIS coder en dur une variante dans un composant.
 *
 * Palette alignée sur le prompt d'embellissement §14 :
 *   REÇUE          → slate (gris ardoise — commande vient d'arriver)
 *   EN TRAITEMENT  → info  (bleu — en cours de préparation)
 *   LAVÉ           → cyan  (cyan — eau, lavage)
 *   REPASSÉ        → violet (violet doux — vapeur, repassage)
 *   PRÊT           → success (vert — disponible au retrait)
 *   EN LIVRAISON   → info  (bleu — en route)
 *   LIVRÉ          → successSolid (vert foncé plein — terminé)
 *   RETIRÉ         → neutral (gris — archivé)
 *
 * Statuts de paiement (§14) :
 *   PAYÉ    → success
 *   ACOMPTE → warning
 *   IMPAYÉ  → danger
 *
 * Badges divers (§14) :
 *   EXPRESS         → accent (Or Textile)
 *   EN RETARD       → danger
 *   NOUVEAU CLIENT  → info
 *   ACTIF           → success
 *   INACTIF         → neutral
 *   ESSAI           → warning
 *   ABONNEMENT EXPIRÉ → danger
 */
export type StatutBadgeVariant =
  | "neutral"
  | "info"
  | "success"
  | "successSolid"
  | "warning"
  | "danger"
  | "slate"
  | "cyan"
  | "violet"
  | "accent"
  // Variantes éditoriales LX (Phase 3-a) — opt-in, usage manuel via prop
  // `variant` (jamais renvoyées par getStatutBadgeVariant() car aucun statut
  // métier ne mappe dessus ; réservées aux dashboards éditoriaux luxe).
  | "editorialGold"
  | "editorialIvory";

/** Mapping statut commande → variante badge canonique. */
export const STATUT_COMMANDE_BADGE_VARIANTS: Record<
  string,
  StatutBadgeVariant
> = {
  recu: "slate",
  en_traitement: "info",
  lave: "cyan",
  repasse: "violet",
  pret: "success",
  en_livraison: "info",
  livre: "successSolid",
  retire: "neutral",
};

/** Mapping statut paiement → variante badge canonique. */
export const STATUT_PAIEMENT_BADGE_VARIANTS: Record<
  string,
  StatutBadgeVariant
> = {
  paye: "success",
  acompte: "warning",
  impaye: "danger",
};

/** Mapping statut article → variante badge canonique (identique à commande hors "en_livraison"). */
export const STATUT_ARTICLE_BADGE_VARIANTS: Record<
  string,
  StatutBadgeVariant
> = {
  recu: "slate",
  en_traitement: "info",
  lave: "cyan",
  repasse: "violet",
  pret: "success",
  retire: "neutral",
  livre: "successSolid",
};

/** Badges divers (express, retard, etc.) — usage ponctuel. */
export const STATUT_BADGES_AUTRES: Record<string, StatutBadgeVariant> = {
  express: "accent",
  en_retard: "danger",
  retard: "danger",
  nouveau_client: "info",
  actif: "success",
  inactif: "neutral",
  essai: "warning",
  abonnement_expire: "danger",
  expire: "danger",
};

/**
 * Retourne la variante canonique pour un statut donné.
 * Cherche successivement dans : commande, paiement, article, autres.
 * Retourne "neutral" par défaut si le statut n'est pas reconnu.
 *
 * Usage :
 *   const v = getStatutBadgeVariant("pret");        // → "success"
 *   const v = getStatutBadgeVariant("impaye");      // → "danger"
 *   const v = getStatutBadgeVariant("express");     // → "accent"
 */
export function getStatutBadgeVariant(statut: string): StatutBadgeVariant {
  return (
    STATUT_COMMANDE_BADGE_VARIANTS[statut] ??
    STATUT_PAIEMENT_BADGE_VARIANTS[statut] ??
    STATUT_ARTICLE_BADGE_VARIANTS[statut] ??
    STATUT_BADGES_AUTRES[statut] ??
    "neutral"
  );
}

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

/* -------------------------------------------------------------------------- */
/*  Macro-étapes du workflow (vue employés)                                    */
/* -------------------------------------------------------------------------- */

/**
 * Les 3 macro-étapes du workflow de traitement des vêtements, telles
 * qu'affichées dans les dashboards employés (cf. demande utilisateur) :
 *
 *   1. pretraiter_laver   — "Prétraiter / Laver"
 *      Articles au statut: recu, en_traitement, lave
 *      Rôle concerné     : laveur
 *
 *   2. repasser_emballer  — "Repasser / Emballer"
 *      Articles au statut: repasse, pret
 *      Rôle concerné     : repassage (+ rangement en casier)
 *
 *   3. livrer_recuperer   — "Livrer / Récupérer"
 *      Articles au statut: en_livraison, livre, retire
 *      Rôles concernés   : livreur, réceptionniste (retrait sur place)
 *
 * Ces macro-étapes permettent de grouper visuellement les articles par
 * phase de traitement dans les dashboards, pour que chaque employé voie
 * immédiatement où en est chaque vêtement dans le pipeline.
 */
export const ETAPES_TRAITEMENT = [
  "pretraiter_laver",
  "repasser_emballer",
  "livrer_recuperer",
] as const;

export type EtapeTraitement = (typeof ETAPES_TRAITEMENT)[number];

/** Libellés FR pour les 3 macro-étapes. */
export const ETAPE_TRAITEMENT_LABELS: Record<EtapeTraitement, string> = {
  pretraiter_laver: "Prétraiter / Laver",
  repasser_emballer: "Repasser / Emballer",
  livrer_recuperer: "Livrer / Récupérer",
};

/** Descriptions courtes pour les sous-titres des cartes. */
export const ETAPE_TRAITEMENT_DESCRIPTIONS: Record<EtapeTraitement, string> = {
  pretraiter_laver: "Articles reçus, en traitement ou lavés",
  repasser_emballer: "Articles lavés à repasser et à ranger en casier",
  livrer_recuperer: "Articles prêts à livrer ou à retirer",
};

/** Noms d'icônes Lucide associées à chaque macro-étape (pour rendu UI). */
export const ETAPE_TRAITEMENT_ICONS: Record<
  EtapeTraitement,
  "Droplets" | "Wind" | "PackageCheck"
> = {
  pretraiter_laver: "Droplets",
  repasser_emballer: "Wind",
  livrer_recuperer: "PackageCheck",
};

/** Variante de couleur sémantique pour chaque macro-étape. */
export const ETAPE_TRAITEMENT_VARIANTS: Record<
  EtapeTraitement,
  "warning" | "primary" | "secondary"
> = {
  pretraiter_laver: "warning",
  repasser_emballer: "primary",
  livrer_recuperer: "secondary",
};

/**
 * Mappe un statut d'article vers sa macro-étape de traitement.
 *
 * @param statutArticle  Statut de l'article (recu, en_traitement, lave, ...).
 * @returns              La macro-étape correspondante, ou null si le statut
 *                       est inconnu.
 */
export function getEtapeTraitementArticle(
  statutArticle: string | null | undefined
): EtapeTraitement | null {
  if (!statutArticle) return null;
  switch (statutArticle) {
    case "recu":
    case "en_traitement":
    case "lave":
      return "pretraiter_laver";
    case "repasse":
    case "pret":
      return "repasser_emballer";
    case "en_livraison":
    case "livre":
    case "retire":
      return "livrer_recuperer";
    default:
      return null;
  }
}

/**
 * Liste des statuts d'article appartenant à une macro-étape donnée.
 * Utile pour filtrer des listes d'articles côté UI.
 */
export const STATUTS_PAR_ETAPE: Record<EtapeTraitement, readonly string[]> = {
  pretraiter_laver: ["recu", "en_traitement", "lave"],
  repasser_emballer: ["repasse", "pret"],
  livrer_recuperer: ["en_livraison", "livre", "retire"],
};

/**
 * Regroupe une liste d'articles par macro-étape de traitement.
 *
 * @param articles  Liste d'articles (chaque article doit avoir un champ `statut`).
 * @returns         Un objet avec les 3 macro-étapes comme clés et les tableaux
 *                  d'articles correspondants comme valeurs.
 */
export function grouperArticlesParEtape<
  T extends { statut: string | null | undefined }
>(
  articles: readonly T[]
): Record<EtapeTraitement, T[]> {
  const result: Record<EtapeTraitement, T[]> = {
    pretraiter_laver: [],
    repasser_emballer: [],
    livrer_recuperer: [],
  };
  for (const a of articles) {
    const etape = getEtapeTraitementArticle(a.statut);
    if (etape) {
      result[etape].push(a);
    }
  }
  return result;
}
