/**
 * OgPressing — API publique : Inscription prospect (LOT 4 — formulaire landing)
 * --------------------------------------------------------------------------
 * POST /api/public/inscription
 *
 * Crée une demande d'inscription dans la table `demandes_inscription`.
 * Utilise le client admin (service_role) pour bypasser RLS — pattern
 * production : validation serveur, anti-spam, pas de structure DB exposée
 * au navigateur, et robuste face aux éventuels soucis de cache RLS.
 *
 * Champs supportés (spec LOT 4 prompt 4.2 — PRD §4.2 liste 10 champs) :
 *   - nom           (requis, 2-50)        → concaténé avec prenom dans nom_gerant
 *   - prenom        (requis, 2-50)        → concaténé avec nom dans nom_gerant
 *   - telephone     (requis, format ivoirien : 0XXXXXXXX ou +225XXXXXXXX)
 *   - email         (requis, format email valide)
 *   - nom_pressing  (requis, 2-100)
 *   - ville         (requis, enum 11 villes CI + "Autre")
 *   - adresse       (requis, min 5)        → stocké dans commune (équivalent spec)
 *   - nombre_machines  (requis, integer >= 1)
 *   - nombre_employes  (optionnel, integer >= 0)
 *   - message       (optionnel, max 500)
 *
 * Champ extra non-PRD (toléré, default 'starter') :
 *   - plan_souhaite (optionnel, enum : starter | pro | business | indecis)
 *     Fix (FIX-WAVE1-A #12) : PRD §4.2 ne liste pas `plan_souhaite` parmi
 *     les 10 champs du formulaire. Avant ce fix, le route renvoyait 400 si
 *     le champ était manquant. Désormais, il default à 'starter' si absent
 *     ou invalide — jamais de 400 sur ce champ.
 *
 * Réponse :
 *   200 { success: true, data: { id } }
 *   400 { success: false, error: "..." }  (validation)
 *   409 { success: false, error: "..." }  (doublon 24h)
 *   500 { success: false, error: "..." }  (erreur serveur)
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isValidCIPhone, normalizeCIPhone } from "@/lib/validations/phone";
import { isEnvConfigured } from "@/lib/env";
import { isSupabaseNetworkError } from "@/lib/supabase/error-handling";
import { serviceUnavailableResponse } from "@/lib/supabase/server-error-response";
import type { ApiResponse } from "@/lib/types";

/* ----------------------- Constantes ----------------------- */

const VILLES_CI = [
  "Abidjan",
  "Bouaké",
  "Daloa",
  "Yamoussoukro",
  "San-Pédro",
  "Korhogo",
  "Man",
  "Divo",
  "Gagnoa",
  "Anyama",
  "Autre",
] as const;

const PLANS_VALIDES = ["starter", "pro", "business", "indecis"] as const;

/* ----------------------- Validation ----------------------- */

interface InscriptionInput {
  nom?: unknown;
  prenom?: unknown;
  telephone?: unknown;
  email?: unknown;
  nom_pressing?: unknown;
  ville?: unknown;
  adresse?: unknown;
  nombre_machines?: unknown;
  nombre_employes?: unknown;
  plan_souhaite?: unknown;
  message?: unknown;
}

function validate(input: InscriptionInput): {
  ok: boolean;
  error?: string;
  data?: Record<string, string | number | null>;
} {
  const errors: string[] = [];

  const nom = String(input.nom ?? "").trim();
  const prenom = String(input.prenom ?? "").trim();
  const telephone = String(input.telephone ?? "").trim();
  const email = String(input.email ?? "").trim().toLowerCase();
  const nom_pressing = String(input.nom_pressing ?? "").trim();
  const ville = String(input.ville ?? "").trim();
  const adresse = String(input.adresse ?? "").trim();
  const message = String(input.message ?? "").trim();

  // Nom : 2-50 caractères
  if (nom.length < 2 || nom.length > 50) {
    errors.push("Le nom doit comporter entre 2 et 50 caractères.");
  }

  // Prénom : 2-50 caractères
  if (prenom.length < 2 || prenom.length > 50) {
    errors.push("Le prénom doit comporter entre 2 et 50 caractères.");
  }

  // AUDIT-B-03 — Validation centralisée des téléphones ivoiriens (délégation
  // au helper `isValidCIPhone`). L'ancienne regex `/^(\+225)?0?\d{8,10}$/`
  // était trop restrictive (refusait les numéros non-CI valides) et
  // inconsistante avec les autres routes. Le helper accepte les formats
  // 0XXXXXXXXX, +225XXXXXXXXXX, 225XXXXXXXXXX + un fallback permissif.
  if (!isValidCIPhone(telephone)) {
    errors.push(
      "Le téléphone doit être un numéro ivoirien valide (ex : 07 00 00 00 00 ou +225 07 00 00 00 00)."
    );
  }

  // Email obligatoire et valide
  if (!email) {
    errors.push("L'email est obligatoire.");
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push("L'email n'est pas valide.");
  }

  // Nom du pressing : 2-100 caractères
  if (nom_pressing.length < 2 || nom_pressing.length > 100) {
    errors.push("Le nom du pressing doit comporter entre 2 et 100 caractères.");
  }

  // Ville : enum 11 villes CI
  if (!ville) {
    errors.push("La ville est obligatoire.");
  } else if (!VILLES_CI.includes(ville as (typeof VILLES_CI)[number])) {
    errors.push("La ville sélectionnée n'est pas valide.");
  }

  // Adresse : min 5 caractères
  if (adresse.length < 5) {
    errors.push("L'adresse doit comporter au moins 5 caractères.");
  }

  // Nombre de machines : entier >= 1
  const machines = Number(input.nombre_machines);
  if (
    input.nombre_machines === undefined ||
    input.nombre_machines === null ||
    input.nombre_machines === ""
  ) {
    errors.push("Le nombre de machines est obligatoire.");
  } else if (!Number.isInteger(machines) || machines < 1) {
    errors.push("Le nombre de machines doit être un entier supérieur ou égal à 1.");
  }

  // Nombre d'employés : optionnel, mais si fourni doit être entier >= 0
  let employes: number | null = null;
  if (
    input.nombre_employes !== undefined &&
    input.nombre_employes !== null &&
    input.nombre_employes !== ""
  ) {
    employes = Number(input.nombre_employes);
    if (!Number.isInteger(employes) || employes < 0) {
      errors.push("Le nombre d'employés doit être un entier supérieur ou égal à 0.");
    }
  }

  // Plan souhaité : optionnel (champ extra non-PRD §4.2).
  // Fix (FIX-WAVE1-A #12) : PRD §4.2 ne liste pas `plan_souhaite` parmi les
  // 10 champs du formulaire. On tolère le champ (utile pour le marketing)
  // mais on ne renvoie JAMAIS 400 si absent ou invalide — on default à
  // 'starter' (le plan d'entrée de gamme).
  const planRaw = String(input.plan_souhaite ?? "").trim().toLowerCase();
  const plan = (PLANS_VALIDES as readonly string[]).includes(planRaw)
    ? planRaw
    : "starter";

  // Message : optionnel, max 500 caractères
  if (message.length > 500) {
    errors.push("Le message est trop long (max 500 caractères).");
  }

  if (errors.length > 0) {
    return { ok: false, error: errors.join(" ") };
  }

  // Construire le payload pour la DB
  // - nom_gerant = "Prenom Nom" (concaténation spec 4.2 → schema DB 1 champ)
  // - commune = adresse (équivalent spec)
  // - nombre_machines / nombre_employes / plan_souhaite (nouvelles colonnes)
  // - telephone : AUDIT-B-03 — normalisé vers +225XXXXXXXXXX pour cohérence
  //   avec les autres routes (activation, personnel).
  return {
    ok: true,
    data: {
      nom_gerant: `${prenom} ${nom}`.trim(),
      nom_pressing,
      telephone: normalizeCIPhone(telephone),
      email,
      ville,
      commune: adresse,
      nombre_machines: machines,
      nombre_employes: employes,
      plan_souhaite: plan,
      message: message || null,
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
    // Garde-fou : si les variables d'environnement Supabase ne sont pas
    // configurées, on renvoie une erreur explicite (et non un 500 générique)
    // pour aider l'utilisateur à comprendre que le problème vient de la
    // configuration serveur, pas de sa saisie.
    if (!isEnvConfigured()) {
      console.error(
        "[api/public/inscription] Variables d'environnement Supabase manquantes — impossible d'enregistrer la demande."
      );
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error:
            "Le service d'inscription est temporairement indisponible (configuration serveur incomplète). Contactez-nous directement par WhatsApp ou téléphone.",
        },
        { status: 503 }
      );
    }

    const supabase = getSupabaseAdmin();

    // Dédoublonnage léger : si une demande identique (même téléphone + même pressing)
    // existe déjà dans les 24 dernières heures, on évite le spam.
    const il_y_a_24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: existing, error: existingError } = await supabase
      .from("demandes_inscription")
      .select("id, created_at")
      .eq("telephone", validation.data.telephone as string)
      .eq("nom_pressing", validation.data.nom_pressing as string)
      .gte("created_at", il_y_a_24h)
      .limit(1)
      .maybeSingle();

    // Erreur réseau (Supabase injoignable) → 503 clair au lieu d'un 500.
    if (existingError && isSupabaseNetworkError(existingError)) {
      return serviceUnavailableResponse("api/public/inscription", existingError);
    }

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
      .insert(validation.data)
      .select("id")
      .single();

    if (error) {
      // Erreur réseau (Supabase injoignable) → 503 clair.
      if (isSupabaseNetworkError(error)) {
        return serviceUnavailableResponse("api/public/inscription", error);
      }
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
    // Erreur réseau (Supabase injoignable, throw depuis le client) → 503.
    if (isSupabaseNetworkError(err)) {
      return serviceUnavailableResponse("api/public/inscription", err);
    }
    console.error("[api/public/inscription] Erreur inattendue :", err);
    return NextResponse.json<ApiResponse>(
      { success: false, error: "Erreur serveur. Réessayez plus tard." },
      { status: 500 }
    );
  }
}

// Pas de cache — contenu dynamique
export const dynamic = "force-dynamic";
