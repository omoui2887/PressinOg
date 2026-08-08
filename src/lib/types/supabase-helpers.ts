/**
 * OgPressing — Helpers de typage pour Supabase (AUDIT-C-02).
 * --------------------------------------------------------------------------
 * Problème : supabase-js (PostgREST TypeScript client) infère les relations
 * comme des TABLEAUX dans les réponses `.select("*, relation(*)")`, même pour
 * les jointures 1-1 via `!inner` (FK unique). Or PostgREST renvoie un OBJET
 * UNIQUE pour ces jointures 1-1 à l'exécution. Le type TypeScript déclaré
 * (`{ col: any }[]`) ne correspond donc pas à la donnée réelle (`{ col: any }`).
 *
 * Cela force les routes à utiliser des casts `as unknown as LigneRow[]` qui
 * court-circuitent le typage. AUDIT-C-02 demande de fournir des helpers
 * typés pour réduire ces casts `as unknown as` et documenter l'écart.
 *
 * Solution : ces helpers (`asSingle` / `asArray`) normalisent la valeur
 * retournée par Supabase (qui peut être un objet, un tableau d'1 élément,
 * ou null) vers le type attendu, en testant dynamiquement la forme.
 *
 * Usage typique (remplace `as unknown as LigneRow[]`) :
 *   const lignes = asArray<LigneRow>(rawLignes);
 *   const client = asSingle<{ nom_complet: string | null }>(rawClient);
 *
 * Note : on ne supprime pas tous les casts existants — on fournit juste des
 * helpers réutilisables. La refactorisation complète serait trop risquée et
 * hors-scope de ce fix (cf. AUDIT-C-02 dans AUDIT_SECURITE.md).
 */

/**
 * AUDIT-C-02 — Supabase returns single object for !inner 1-1 joins but
 * TypeScript infers array. Use this helper to safely narrow the type.
 *
 * PostgREST peut retourner :
 *   - un objet unique `T` (cas nominal pour 1-1)
 *   - un tableau `[T]` (ce que supabase-js infère côté type)
 *   - `null` ou `undefined` (si pas de match)
 *
 * On retourne `T | null` dans tous les cas.
 */
export function asSingle<T>(value: unknown): T | null {
  if (Array.isArray(value)) return (value[0] as T) ?? null;
  return (value as T) ?? null;
}

/**
 * AUDIT-C-02 — Supabase returns array for 1-N joins. Use for type safety.
 *
 * PostgREST peut retourner :
 *   - un tableau `T[]` (cas nominal pour 1-N)
 *   - un objet unique `T` (rare, mais possible pour certaines configs)
 *   - `null` ou `undefined` (si pas de match)
 *
 * On retourne toujours un tableau (vide si pas de match).
 */
export function asArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value == null) return [];
  return [value as T];
}
