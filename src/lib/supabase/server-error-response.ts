/**
 * OgPressing — Réponse 503 "Service indisponible" (SERVEUR UNIQUEMENT)
 * --------------------------------------------------------------------
 * Construit une `NextResponse` 503 standardisée pour les erreurs réseau
 * Supabase. SÉPARÉ de `error-handling.ts` (qui est pure JS client+serveur)
 * pour éviter d'importer `next/server` dans les bundles client.
 *
 * Usage (Route Handlers uniquement) :
 *   import { serviceUnavailableResponse } from "@/lib/supabase/server-error-response";
 *   if (isSupabaseNetworkError(error)) {
 *     return serviceUnavailableResponse("api/public/inscription", error);
 *   }
 */
import { NextResponse } from "next/server";
import { SERVICE_UNAVAILABLE_MESSAGE } from "@/lib/supabase/error-handling";
import type { ApiResponse } from "@/lib/types";

/**
 * Construit une réponse 503 "Service indisponible" standardisée pour les
 * erreurs réseau Supabase.
 *
 * @param context - court identifiant de la route (pour le log serveur),
 *                  ex : "api/public/inscription".
 * @param error   - l'erreur originale (loggée côté serveur, jamais renvoyée
 *                  au client).
 * @returns NextResponse 503 JSON `{ success: false, error: MESSAGE }`.
 */
export function serviceUnavailableResponse(
  context: string,
  error?: unknown
): NextResponse<ApiResponse> {
  // Log serveur uniquement (peut contenir des détails techniques utiles
  // au debug, jamais exposés au client).
  if (error) {
    console.error(
      `[${context}] Service Supabase injoignable (erreur réseau) :`,
      error instanceof Error
        ? {
            message: error.message,
            name: error.name,
            cause: (error as { cause?: unknown }).cause,
          }
        : error
    );
  } else {
    console.error(`[${context}] Service Supabase injoignable (erreur réseau).`);
  }
  return NextResponse.json<ApiResponse>(
    { success: false, error: SERVICE_UNAVAILABLE_MESSAGE },
    { status: 503 }
  );
}
