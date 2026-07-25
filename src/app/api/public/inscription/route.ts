/**
 * OgPressing — API publique : Inscription prospect
 * ------------------------------------------------
 * POST /api/public/inscription
 *
 * Crée une demande d'inscription dans la table `demandes_inscription`.
 * Utilise le client admin (service_role) pour bypasser RLS — pattern
 * production : validation serveur, pas de structure DB exposée au
 * navigateur, et robuste face aux éventuels soucis de cache RLS.
 *
 * Body (JSON) :
 *   - nom_gerant    (requis, 2-100 chars)
 *   - nom_pressing  (requis, 2-100 chars)
 *   - telephone     (requis, 8-20 chars)
 *   - email         (optionnel, format email)
 *   - ville         (optionnel, max 100)
 *   - commune       (optionnel, max 100)
 *   - message       (optionnel, max 1000)
 *
 * Réponse :
 *   200 { success: true, data: { id } }
 *   400 { success: false, error: "..." }
 *   500 { success: false, error: "..." }
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { ApiResponse } from "@/lib/types";

/* ----------------------- Validation ----------------------- */

interface InscriptionInput {
  nom_gerant?: unknown;
  nom_pressing?: unknown;
  telephone?: unknown;
  email?: unknown;
  ville?: unknown;
  commune?: unknown;
  message?: unknown;
}

function validate(input: InscriptionInput): {
  ok: boolean;
  error?: string;
  data?: Record<string, string>;
} {
  const errors: string[] = [];

  const nom_gerant = String(input.nom_gerant ?? "").trim();
  const nom_pressing = String(input.nom_pressing ?? "").trim();
  const telephone = String(input.telephone ?? "").trim();
  const email = String(input.email ?? "").trim();
  const ville = String(input.ville ?? "").trim();
  const commune = String(input.commune ?? "").trim();
  const message = String(input.message ?? "").trim();

  if (nom_gerant.length < 2 || nom_gerant.length > 100) {
    errors.push("Le nom du gérant doit comporter entre 2 et 100 caractères.");
  }
  if (nom_pressing.length < 2 || nom_pressing.length > 100) {
    errors.push("Le nom du pressing doit comporter entre 2 et 100 caractères.");
  }
  // Téléphone : chiffres, espaces, +, -, parenthèses — 8 à 20 chars après nettoyage
  const telClean = telephone.replace(/[\s\-().]/g, "");
  if (!/^\+?\d{8,20}$/.test(telClean)) {
    errors.push("Le téléphone doit contenir entre 8 et 20 chiffres.");
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push("L'email n'est pas valide.");
  }
  if (ville.length > 100) errors.push("La ville est trop longue (max 100).");
  if (commune.length > 100) errors.push("La commune est trop longue (max 100).");
  if (message.length > 1000) errors.push("Le message est trop long (max 1000).");

  if (errors.length > 0) {
    return { ok: false, error: errors.join(" ") };
  }

  return {
    ok: true,
    data: {
      nom_gerant,
      nom_pressing,
      telephone,
      email: email || undefined as unknown as string,
      ville: ville || undefined as unknown as string,
      commune: commune || undefined as unknown as string,
      message: message || undefined as unknown as string,
    },
  };
}

/* ----------------------- Handler ----------------------- */

export async function POST(req: NextRequest) {
  // Anti-spam basique : refuser les payload trop gros
  const contentLength = req.headers.get("content-length");
  if (contentLength && parseInt(contentLength, 10) > 10000) {
    return NextResponse.json<ApiResponse>(
      { success: false, error: "Requête trop volumineuse." },
      { status: 413 }
    );
  }

  let body: InscriptionInput;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json<ApiResponse>(
      { success: false, error: "Format JSON invalide." },
      { status: 400 }
    );
  }

  const validation = validate(body);
  if (!validation.ok || !validation.data) {
    return NextResponse.json<ApiResponse>(
      { success: false, error: validation.error! },
      { status: 400 }
    );
  }

  try {
    const supabase = getSupabaseAdmin();

    // Dédoublonnage léger : si une demande identique (même téléphone + même pressing)
    // existe déjà dans les 24 dernières heures, on évite le spam.
    const il_y_a_24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: existing } = await supabase
      .from("demandes_inscription")
      .select("id, created_at")
      .eq("telephone", validation.data.telephone)
      .eq("nom_pressing", validation.data.nom_pressing)
      .gte("created_at", il_y_a_24h)
      .limit(1)
      .maybeSingle();

    if (existing) {
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error:
            "Vous avez déjà envoyé une demande pour ce pressing dans les dernières 24h. Notre équipe vous contactera bientôt.",
        },
        { status: 409 }
      );
    }

    // INSERT
    const { data, error } = await supabase
      .from("demandes_inscription")
      .insert({
        nom_gerant: validation.data.nom_gerant,
        nom_pressing: validation.data.nom_pressing,
        telephone: validation.data.telephone,
        email: validation.data.email ?? null,
        ville: validation.data.ville ?? null,
        commune: validation.data.commune ?? null,
        message: validation.data.message ?? null,
      })
      .select("id")
      .single();

    if (error) {
      console.error("[api/public/inscription] Erreur Supabase :", error);
      return NextResponse.json<ApiResponse>(
        { success: false, error: "Erreur lors de l'enregistrement. Réessayez." },
        { status: 500 }
      );
    }

    return NextResponse.json<ApiResponse<{ id: string }>>(
      { success: true, data: { id: data.id } },
      { status: 200 }
    );
  } catch (err) {
    console.error("[api/public/inscription] Erreur inattendue :", err);
    return NextResponse.json<ApiResponse>(
      { success: false, error: "Erreur serveur. Réessayez plus tard." },
      { status: 500 }
    );
  }
}

// Pas de cache — contenu dynamique
export const dynamic = "force-dynamic";
