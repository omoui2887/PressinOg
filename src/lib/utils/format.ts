/**
 * OgPressing — Fonctions utilitaires de formatage
 * -----------------------------------------------
 *
 * Conventions projet (PROJECT_CONTEXT.md) :
 *   - Devise : FCFA (XOF) → suffixe " FCFA" + séparateurs de milliers " "
 *     Exemple : formatFCFA(12500) → "12 500 FCFA"
 *   - Date   : JJ/MM/AAAA
 *   - Heure  : HH:mm
 *
 * Ces helpers sont PUREMENT front-side (aucun appel Supabase). Ils peuvent
 * être importés indifféremment dans des Client ou Server Components.
 */
import { format, parseISO, isValid } from "date-fns";
import { fr } from "date-fns/locale";

/* -------------------------------------------------------------------------- */
/*  MONTANTS FCFA                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Formate un montant entier en FCFA avec espace insécable comme séparateur
 * de milliers et suffixe " FCFA".
 *
 * @example
 *   formatFCFA(12500)      → "12 500 FCFA"
 *   formatFCFA(0)          → "0 FCFA"
 *   formatFCFA(1000000)    → "1 000 000 FCFA"
 *   formatFCFA(-500)       → "-500 FCFA"
 *
 * @param montant - Montant en FCFA (entier). Accepte aussi un float si la
 *                  BDD renvoie du BIGINT en number, on tronque la partie décimale.
 * @returns Chaîne formatée prête à l'affichage.
 */
export function formatFCFA(montant: number | null | undefined): string {
  if (montant === null || montant === undefined || Number.isNaN(montant)) {
    return "0 FCFA";
  }

  const entier = Math.trunc(montant);
  const signe = entier < 0 ? "-" : "";
  const valeurAbsolue = Math.abs(entier);

  // Formatage avec espaces insécables (\u202F = narrow no-break space,
  // recommandé pour les nombres en français).
  const avecSeparateurs = valeurAbsolue
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, "\u202F");

  return `${signe}${avecSeparateurs}\u202FFCFA`;
}

/**
 * Variante compacte pour les montants élevés (utile dans les stats cards).
 *
 * @example
 *   formatFCFACompact(12500)      → "12,5 K FCFA"
 *   formatFCFACompact(1500000)    → "1,5 M FCFA"
 *   formatFCFACompact(500)        → "500 FCFA"
 */
export function formatFCFACompact(montant: number | null | undefined): string {
  if (montant === null || montant === undefined || Number.isNaN(montant)) {
    return "0 FCFA";
  }
  const abs = Math.abs(montant);
  const signe = montant < 0 ? "-" : "";

  if (abs >= 1_000_000) {
    return `${signe}${(abs / 1_000_000).toLocaleString("fr-FR", {
      maximumFractionDigits: 1,
    })}\u202FM\u202FFCFA`;
  }
  if (abs >= 1_000) {
    return `${signe}${(abs / 1_000).toLocaleString("fr-FR", {
      maximumFractionDigits: 1,
    })}\u202FK\u202FFCFA`;
  }
  return `${signe}${abs}\u202FFCFA`;
}

/* -------------------------------------------------------------------------- */
/*  DATES & HEURES                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Convertit n'importe quelle entrée date en objet Date valide.
 * Gère :
 *   - Date JS
 *   - String ISO (ex : "2026-07-24T14:30:00Z")
 *   - String date-fns déjà parsable
 */
function toDate(valeur: string | Date): Date | null {
  if (valeur instanceof Date) {
    return isValid(valeur) ? valeur : null;
  }
  // Chaîne ISO → parseISO gère mieux les timezones que new Date()
  const parsed = parseISO(valeur);
  if (isValid(parsed)) return parsed;

  // Fallback : new Date()
  const fallback = new Date(valeur);
  return isValid(fallback) ? fallback : null;
}

/**
 * Formate une date au format français JJ/MM/AAAA HH:mm.
 *
 * @example
 *   formatDate("2026-07-24T14:30:00Z")  → "24/07/2026 14:30"
 *   formatDate(new Date(2026, 6, 24))    → "24/07/2026 00:00"
 *
 * @param date - Date ISO (string) ou objet Date
 * @returns Date formatée, ou "—" si la date est invalide
 */
export function formatDate(date: string | Date | null | undefined): string {
  if (date === null || date === undefined) return "—";
  const d = toDate(date);
  if (!d) return "—";
  return format(d, "dd/MM/yyyy HH:mm", { locale: fr });
}

/**
 * Formate une date au format JJ/MM/AAAA (sans l'heure).
 *
 * @example
 *   formatDateOnly("2026-07-24T14:30:00Z")  → "24/07/2026"
 */
export function formatDateOnly(
  date: string | Date | null | undefined
): string {
  if (date === null || date === undefined) return "—";
  const d = toDate(date);
  if (!d) return "—";
  return format(d, "dd/MM/yyyy", { locale: fr });
}

/**
 * Formate une heure au format HH:mm.
 *
 * @example
 *   formatTime("2026-07-24T14:30:00Z")  → "14:30"
 */
export function formatTime(
  date: string | Date | null | undefined
): string {
  if (date === null || date === undefined) return "—";
  const d = toDate(date);
  if (!d) return "—";
  return format(d, "HH:mm", { locale: fr });
}

/**
 * Formate une date de manière relative en français.
 *
 * @example
 *   formatRelative(now)            → "à l'instant"
 *   formatRelative(il y a 2h)      → "il y a 2 heures"
 *   formatRelative(hier)           → "hier"
 *
 * Utile pour les listes de commandes / activités récentes.
 */
export function formatRelative(
  date: string | Date | null | undefined
): string {
  if (date === null || date === undefined) return "—";
  const d = toDate(date);
  if (!d) return "—";

  const diffMs = Date.now() - d.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHeure = Math.floor(diffMin / 60);
  const diffJour = Math.floor(diffHeure / 24);

  if (diffSec < 60) return "à l'instant";
  if (diffMin < 60) {
    return `il y a ${diffMin} ${diffMin > 1 ? "minutes" : "minute"}`;
  }
  if (diffHeure < 24) {
    return `il y a ${diffHeure} ${diffHeure > 1 ? "heures" : "heure"}`;
  }
  if (diffJour === 1) return "hier";
  if (diffJour < 7) return `il y a ${diffJour} jours`;

  // Au-delà de 7 jours, on affiche la date complète
  return format(d, "dd/MM/yyyy", { locale: fr });
}
