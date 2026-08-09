/**
 * OgPressing — API publique : Vérification préalable d'un code d'activation
 * -----------------------------------------------------------------------
 * POST /api/public/activation/verify-code
 *
 * Cette route est utilisée par l'ÉTAPE 1 du formulaire d'activation
 * (/activation) pour valider un code PRS-XXXX-XXXX AVANT d'afficher le
 * formulaire de création de compte.
 *
 * ⚠️ Contexte RLS :
 *   - Le rôle `anon` ne peut SELECT que les colonnes `(code, utilise)` sur
 *     `codes_activation` (policy `code_read_public` + GRANT column-level).
 *   - Les colonnes sensibles (`date_expiration`, `plan_initial`, `id`,
 *     `cree_par`, `pressing_id_cible`, `date_utilisation`) ne sont PAS
 *     accessibles à anon → on DOIT faire cette vérification côté serveur
 *     avec `getSupabaseAdmin()` (service_role, bypass RLS).
 *
 * Body (JSON) :
 *   { code: string }   — format attendu PRS-XXXX-XXXX
 *
 * Réponses :
 *   200 { success: true,  data: { code_id: string, plan: "starter"|"pro"|"business" } }
 *   400 { success: false, error: "Ce code n'est pas valide ou a expiré, contactez le +225 05 76 10 32 77 par WhatsApp" }
 *   400 { success: false, error: "Ce code a déjà été utilisé. Chaque code est à usage unique." }
 *   400 { success: false, error: "Ce code a expiré. Les codes sont valables 7 jours. Contactez OgPressing pour un nouveau code." }
 *   400 { success: false, error: "Le code d'activation doit être au format PRS-XXXX-XXXX." }
 *   500 { success: false, error: "Erreur lors de la vérification du code." }
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isEnvConfigured } from "@/lib/env";
import { isSupabaseNetworkError } from "@/lib/supabase/error-handling";
import { serviceUnavailableResponse } from "@/lib/supabase/server-error-response";
import type { ApiResponse, PlanAbonnement } from "@/lib/types";

export const dynamic = "force-dynamic";

const CODE_REGEX = /^PRS-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

const MSG_INVALIDE =
  "Ce code n'est pas valide ou a expiré, contactez le +225 05 76 10 32 77 par WhatsApp";
const MSG_DEJA_UTILISE =
  "Ce code a déjà été utilisé. Chaque code est à usage unique.";
const MSG_EXPIRE =
  "Ce code a expiré. Les codes sont valables 7 jours. Contactez OgPressing pour un nouveau code.";
const MSG_FORMAT =
  "Le code d'activation doit être au format PRS-XXXX-XXXX.";

interface VerifyCodeBody {
  code?: unknown;
}

export async function POST(req: NextRequest) {
  // Limite de taille du body (anti-abus)
  const contentLength = req.headers.get("content-length");
  if (contentLength && parseInt(contentLength, 10) > 2000) {
    return NextResponse.json<ApiResponse>(
      { success: false, error: "Requête trop volumineuse." },
      { status: 413 }
    );
  }

  // Parse JSON
  let body: VerifyCodeBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json<ApiResponse>(
      { success: false, error: "Format JSON invalide." },
      { status: 400 }
    );
  }

  // Normalisation + validation du format
  const codeRaw = String(body.code ?? "").trim().toUpperCase();
  if (!CODE_REGEX.test(codeRaw)) {
    return NextResponse.json<ApiResponse>(
      { success: false, error: MSG_FORMAT },
      { status: 400 }
    );
  }

  // Garde-fou : si les variables d'environnement Supabase ne sont pas
  // configurées, on renvoie une erreur explicite (503) au lieu d'un 500
  // générique côté getSupabaseAdmin().
  if (!isEnvConfigured()) {
    return NextResponse.json<ApiResponse>(
      {
        success: false,
        error:
          "Le service d'activation est temporairement indisponible (configuration serveur incomplète). Contactez-nous par WhatsApp au +225 05 76 10 32 77.",
      },
      { status: 503 }
    );
  }

  const supabase = getSupabaseAdmin();

  // Lookup du code (service_role → bypass RLS, accès à toutes les colonnes)
  const { data: codeRow, error: codeError } = await supabase
    .from("codes_activation")
    .select("id, utilise, date_expiration, plan_initial")
    .eq("code", codeRaw)
    .maybeSingle();

  if (codeError) {
    // Erreur réseau (Supabase injoignable) → 503 clair au lieu d'un 500.
    if (isSupabaseNetworkError(codeError)) {
      return serviceUnavailableResponse("api/public/activation/verify-code", codeError);
    }
    console.error("[verify-code] Erreur lookup code :", codeError);
    return NextResponse.json<ApiResponse>(
      { success: false, error: "Erreur lors de la vérification du code." },
      { status: 500 }
    );
  }

  // 1. Code introuvable
  if (!codeRow) {
    return NextResponse.json<ApiResponse>(
      { success: false, error: MSG_INVALIDE },
      { status: 400 }
    );
  }

  // 2. Code déjà utilisé
  if (codeRow.utilise) {
    return NextResponse.json<ApiResponse>(
      { success: false, error: MSG_DEJA_UTILISE },
      { status: 400 }
    );
  }

  // 3. Code expiré
  if (
    codeRow.date_expiration &&
    new Date(codeRow.date_expiration).getTime() < Date.now()
  ) {
    return NextResponse.json<ApiResponse>(
      { success: false, error: MSG_EXPIRE },
      { status: 400 }
    );
  }

  // 4. Code valide — on renvoie l'id + le plan associé
  const plan: PlanAbonnement = (codeRow.plan_initial as PlanAbonnement) ?? "starter";

  return NextResponse.json<ApiResponse<{ code_id: string; plan: PlanAbonnement }>>(
    { success: true, data: { code_id: codeRow.id as string, plan } },
    { status: 200 }
  );
}
