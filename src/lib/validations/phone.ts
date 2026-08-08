/**
 * OgPressing — Validation des numéros de téléphone ivoiriens (Côte d'Ivoire).
 * --------------------------------------------------------------------------
 * Centralise la validation + normalisation des téléphones pour toutes les
 * routes API (activation, inscription, personnel, clients). Avant ce module,
 * chaque route réimplémentait sa propre regex (formats divergents, bugs
 * subtils). AUDIT-B-03.
 *
 * Formats acceptés (après nettoyage) :
 *   - 0709090909       (10 chiffres, commence par 0)
 *   - 0709090909       (10 chiffres sans 0 initial → 709090909 — non, CI c'est 10 chiffres)
 *   - +2250709090909   (préfixe international)
 *   - +225709090909    (préfixe international sans 0 initial)
 *   - 2250709090909    (préfixe sans +)
 *
 * Les opérateurs CI : Orange (07), MTN (05), Moov (01), Wave (40数字).
 * On accepte tout numéro de 8 à 15 chiffres après nettoyage, mais on normalise
 * vers le format +225XXXXXXXXXX pour le stockage.
 */

/** Nettoie un numéro de téléphone (supprime espaces, tirets, parenthèses, points). */
export function cleanPhone(input: string): string {
  return input.replace(/[\s\-().]/g, "");
}

/**
 * Valide un numéro de téléphone ivoirien.
 * Accepte les formats avec/sans préfixe +225, avec/sans 0 initial.
 * @returns true si valide
 */
export function isValidCIPhone(input: string): boolean {
  const cleaned = cleanPhone(input);
  // Patterns acceptés :
  // +225 + 10 chiffres (0709090909) = 13 chiffres après +
  // 225 + 10 chiffres = 13 chiffres
  // 10 chiffres seuls (0709090909)
  // +225 + 9 chiffres (sans 0 initial) = 12 chiffres après +
  if (/^\+2250?\d{9}$/.test(cleaned)) return true;
  if (/^2250?\d{9}$/.test(cleaned)) return true;
  if (/^0?\d{9}$/.test(cleaned)) return true;
  // Fallback permissif : 8 à 15 chiffres (pour numéros internationaux non-CI)
  if (/^\+?\d{8,15}$/.test(cleaned)) return true;
  return false;
}

/**
 * Normalise un numéro vers le format +225XXXXXXXXXX.
 * Si le numéro n'est pas ivoirien, retourne le numéro nettoyé tel quel.
 */
export function normalizeCIPhone(input: string): string {
  const cleaned = cleanPhone(input);
  // Déjà au format +225...
  if (cleaned.startsWith("+225")) return cleaned;
  // Format 225... sans le +
  if (cleaned.startsWith("225") && cleaned.length >= 12) return "+" + cleaned;
  // Numéro ivoirien sans préfixe (10 chiffres avec 0, ou 9 sans 0)
  if (/^0?\d{9}$/.test(cleaned)) {
    const digits = cleaned.replace(/^0/, "");
    return "+225" + digits;
  }
  // Autre : retourner nettoyé
  return cleaned;
}
