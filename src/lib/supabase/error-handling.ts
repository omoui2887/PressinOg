/**
 * e-pressing — Helper de gestion d'erreurs Supabase (PURE — client + serveur)
 * --------------------------------------------------------------------------
 * Ce module est PURE JS : aucun import de `next/server` ou autre API serveur.
 * Il peut donc être importé côté client (composants 'use client') ET côté
 * serveur (Route Handlers, Server Components).
 *
 * Centralise :
 *   1. La détection des erreurs réseau Supabase (DNS mort, connexion
 *      impossible, timeout) — `isSupabaseNetworkError`.
 *   2. Un wrapper `fetch` avec timeout (AbortController) — `fetchWithTimeout`.
 *   3. Un message FR standard pour l'indisponibilité de service.
 *
 * La construction de la `NextResponse` 503 (côté serveur uniquement) est dans
 * `src/lib/supabase/server-error-response.ts` pour éviter d'importer
 * `next/server` dans les bundles client.
 *
 * 🔒 SÉCURITÉ : ce helper ne LOGUE JAMAIS la valeur des variables d'env ni
 *    les détails de l'erreur réseau côté client.
 */

/**
 * Message FR standard pour une indisponibilité de service (erreur réseau).
 * Réutilisé par toutes les routes API publiques et les composants client
 * pour la cohérence du message utilisateur.
 */
export const SERVICE_UNAVAILABLE_MESSAGE =
  "Le service est temporairement indisponible (serveur injoignable). " +
  "Réessayez dans quelques instants ou contactez-nous par WhatsApp au +225 05 76 10 32 77.";

/**
 * Détecte si une erreur (retournée par un appel Supabase ou levée par
 * fetch) est de nature RÉSEAU : DNS injoignable, connexion refusée,
 * timeout, etc.
 *
 * Signaux détectés :
 *   - error.message contient : "fetch failed", "ENOTFOUND", "ECONNREFUSED",
 *     "ETIMEDOUT", "EAI_AGAIN", "network", "Network", "Failed to fetch",
 *     "getaddrinfo", "connect ETIMEDOUT", "socket hang up", "aborted".
 *   - error.cause.code (Node) ∈ { ENOTFOUND, ECONNREFUSED, ETIMEDOUT,
 *     EAI_AGAIN, UND_ERR_CONNECT_TIMEOUT }.
 *   - error.name === "AbortError" (timeout via AbortController).
 *   - Supabase Auth : error.message === "fetch failed" ou contient
 *     "RequestFailed" pour getUser().
 *
 * @param error - l'erreur retournée par Supabase ({ error } destructuré)
 *                ou capturée dans un catch.
 * @returns true si l'erreur est réseau (→ 503 / message "service indisponible"),
 *          false sinon (→ 500 ou traitement métier spécifique).
 */
export function isSupabaseNetworkError(error: unknown): boolean {
  if (!error) return false;

  // Cas 1 : error est un objet Supabase (PostgrestError / AuthError) avec
  // un champ `message` et/ou `code`.
  if (typeof error === "object") {
    const e = error as {
      message?: string;
      code?: string | number;
      name?: string;
      cause?: { code?: string; message?: string };
    };

    // code réseau connu (PostgrestError n'a pas de code réseau, mais
    // certaines erreurs Auth oui).
    const code = e.code;
    if (
      typeof code === "string" &&
      [
        "ENOTFOUND",
        "ECONNREFUSED",
        "ETIMEDOUT",
        "EAI_AGAIN",
        "UND_ERR_CONNECT_TIMEOUT",
        "UND_ERR_SOCKET",
      ].includes(code)
    ) {
      return true;
    }

    // cause (Node fetch wrapper) — erreurs réseau typiques
    const cause = e.cause;
    if (cause && typeof cause === "object") {
      const causeCode = cause.code;
      if (
        typeof causeCode === "string" &&
        [
          "ENOTFOUND",
          "ECONNREFUSED",
          "ETIMEDOUT",
          "EAI_AGAIN",
          "UND_ERR_CONNECT_TIMEOUT",
          "UND_ERR_SOCKET",
        ].includes(causeCode)
      ) {
        return true;
      }
    }

    // name === AbortError (notre timeout via AbortController)
    if (e.name === "AbortError") {
      return true;
    }

    // message contient un signal réseau connu
    const msg = typeof e.message === "string" ? e.message : "";
    if (
      /fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|getaddrinfo|connect ETIMEDOUT|socket hang up|Failed to fetch|NetworkError|Network request failed|RequestFailed/i.test(
        msg
      )
    ) {
      return true;
    }
  }

  // Cas 2 : error est une string
  if (typeof error === "string") {
    return /fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|network|Failed to fetch/i.test(
      error
    );
  }

  return false;
}

/**
 * Crée un wrapper `fetch` avec timeout (via AbortController) pour les
 * clients Supabase. Permet de caper la latence d'un appel réseau mort
 * (DNS injoignable, projet en pause) à `timeoutMs` ms au lieu d'attendre
 * le timeout TCP/undici par défaut (~10-30s).
 *
 * Usage :
 *   createClient(url, key, { global: { fetch: fetchWithTimeout(8000) } })
 *
 * En production (Supabase joignable), ce wrapper est transparent : si la
 * requête réussit avant le timeout, l'AbortController est nettoyé et
 * n'impacte pas la réponse.
 *
 * 🌐 COMPATIBILITÉ : fonctionne côté serveur (Node/Edge) ET côté navigateur.
 *    Utilise uniquement des Web APIs : `fetch`, `AbortController`,
 *    `setTimeout`, `AbortSignal.any` (avec fallback pour les runtimes
 *    plus anciens).
 *
 * @param timeoutMs - délai max avant abort (défaut 8000ms).
 */
export function fetchWithTimeout(timeoutMs = 8000): typeof fetch {
  return (input: RequestInfo | URL, init?: RequestInit) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    // Si l'appelant fournit déjà un signal, on combine (abort si l'un
    // des deux signaux déclenche). Sinon on utilise juste le nôtre.
    const userSignal = init?.signal;
    const signal = userSignal
      ? mergeSignals(userSignal, controller.signal)
      : controller.signal;

    return fetch(input, { ...init, signal }).finally(() => {
      clearTimeout(timeoutId);
    });
  };
}

/**
 * Combine deux AbortSignal : abort dès que l'un des deux déclenche.
 * Utilise l'API `AbortSignal.any` si disponible (Node ≥ 20 / navigateurs
 * récents), sinon fallback manuel via écouteurs.
 */
function mergeSignals(a: AbortSignal, b: AbortSignal): AbortSignal {
  // API moderne (Node 20+ / navigateurs récents)
  if (typeof AbortSignal.any === "function") {
    return AbortSignal.any([a, b]);
  }
  // Fallback : si a est déjà aborté, retourne a ; sinon si b, retourne b ;
  // sinon crée un nouveau signal qui suit les deux.
  if (a.aborted) return a;
  if (b.aborted) return b;
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  a.addEventListener("abort", onAbort, { once: true });
  b.addEventListener("abort", onAbort, { once: true });
  return controller.signal;
}
