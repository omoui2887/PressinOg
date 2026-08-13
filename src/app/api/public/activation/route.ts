/**
 * e-pressing — API publique : Activation d'un pressing
 * ----------------------------------------------------
 * POST /api/public/activation
 *
 * Étapes (transaction manuelle avec rollback) :
 *   1. Valide le code (format PRS-XXXX-XXXX, non utilisé, non expiré)
 *   2. Crée l'utilisateur Supabase Auth (admin.createUser)
 *   3. Crée la ligne `pressing` (statut='essai')
 *   4. Crée la ligne `personnel` (role='manager', compte admin du pressing)
 *   5. Crée la ligne `abonnements` (plan du code, statut='essai', 7 jours)
 *   6. Marque le code comme utilisé (utilise=true, pressing_id_cible= nouveau pressing)
 *
 * En cas d'échec à une étape : rollback des étapes précédentes.
 *
 * Body (JSON) :
 *   - code          (requis, PRS-XXXX-XXXX)
 *   - nom_complet   (requis, 2-100)
 *   - email         (requis, format email)
 *   - password      (requis, min 8)
 *   - nom_pressing  (requis, 2-100)
 *   - telephone     (requis, 8-20 chiffres)
 *   - ville         (optionnel)
 *   - commune       (optionnel)
 *
 * Réponse :
 *   200 { success: true, data: { pressing_id, email } }
 *   400 { success: false, error: "..." }  (validation / code invalide)
 *   409 { success: false, error: "..." }  (email déjà utilisé / code déjà utilisé)
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

const PLAN_PRICES: Record<string, number> = {
  starter: 9900,
  pro: 24900,
  business: 49900,
};

const ESSAI_DURATION_DAYS = 7;
const CODE_REGEX = /^PRS-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

/* ----------------------- Validation ----------------------- */

interface ActivationInput {
  code?: unknown;
  nom_complet?: unknown;
  email?: unknown;
  password?: unknown;
  nom_pressing?: unknown;
  telephone?: unknown;
  ville?: unknown;
  commune?: unknown;
}

function validate(input: ActivationInput): {
  ok: boolean;
  error?: string;
  data?: {
    code: string;
    nom_complet: string;
    email: string;
    password: string;
    nom_pressing: string;
    telephone: string;
    ville: string | null;
    commune: string | null;
  };
} {
  const errors: string[] = [];

  const code = String(input.code ?? "").trim().toUpperCase();
  const nom_complet = String(input.nom_complet ?? "").trim();
  const email = String(input.email ?? "").trim().toLowerCase();
  const password = String(input.password ?? "");
  const nom_pressing = String(input.nom_pressing ?? "").trim();
  const telephone = String(input.telephone ?? "").trim();
  const ville = String(input.ville ?? "").trim();
  const commune = String(input.commune ?? "").trim();

  if (!CODE_REGEX.test(code)) {
    errors.push("Le code d'activation doit être au format PRS-XXXX-XXXX.");
  }
  if (nom_complet.length < 2 || nom_complet.length > 100) {
    errors.push("Le nom complet doit comporter entre 2 et 100 caractères.");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push("L'email n'est pas valide.");
  }
  if (password.length < 8) {
    errors.push("Le mot de passe doit comporter au moins 8 caractères.");
  }
  if (nom_pressing.length < 2 || nom_pressing.length > 100) {
    errors.push("Le nom du pressing doit comporter entre 2 et 100 caractères.");
  }
  // AUDIT-B-03 — Validation centralisée des téléphones ivoiriens.
  // L'ancienne regex `/^\+?\d{8,20}$/` était trop permissive et inconsistante
  // avec les autres routes (inscription, personnel). On délègue maintenant à
  // `isValidCIPhone` qui accepte les formats 0XXXXXXXXX, +225XXXXXXXXXX,
  // 225XXXXXXXXXX et un fallback permissif pour les numéros non-CI.
  if (!isValidCIPhone(telephone)) {
    errors.push(
      "Le téléphone doit être un numéro ivoirien valide (ex : 07 09 09 09 09 ou +225 07 09 09 09 09)."
    );
  }
  if (ville.length > 100) errors.push("La ville est trop longue (max 100).");
  if (commune.length > 100) errors.push("La commune est trop longue (max 100).");

  if (errors.length > 0) {
    return { ok: false, error: errors.join(" ") };
  }

  // AUDIT-B-03 — Normalisation vers le format +225XXXXXXXXXX avant stockage.
  // On retourne le numéro normalisé (et non l'entrée brute) afin que les
  // INSERTs dans `pressing.telephone` et `personnel.telephone` soient
  // cohérents avec les autres routes (inscription, personnel).
  const telephoneNormalized = normalizeCIPhone(telephone);

  return {
    ok: true,
    data: {
      code,
      nom_complet,
      email,
      password,
      nom_pressing,
      telephone: telephoneNormalized,
      ville: ville || null,
      commune: commune || null,
    },
  };
}

/* ----------------------- Handler ----------------------- */

export async function POST(req: NextRequest) {
  const contentLength = req.headers.get("content-length");
  if (contentLength && parseInt(contentLength, 10) > 10000) {
    return NextResponse.json<ApiResponse>(
      { success: false, error: "Requête trop volumineuse." },
      { status: 413 }
    );
  }

  let body: ActivationInput;
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

  const { code, nom_complet, email, password, nom_pressing, telephone, ville, commune } =
    validation.data;

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

  /* --- Étape 1 : Vérifier le code --- */
  const { data: codeRow, error: codeError } = await supabase
    .from("codes_activation")
    .select("id, utilise, date_expiration, plan_initial, cree_par")
    .eq("code", code)
    .maybeSingle();

  if (codeError) {
    // Erreur réseau (Supabase injoignable) → 503 clair au lieu d'un 500.
    if (isSupabaseNetworkError(codeError)) {
      return serviceUnavailableResponse("api/public/activation", codeError);
    }
    console.error("[activation] Erreur lookup code :", codeError);
    return NextResponse.json<ApiResponse>(
      { success: false, error: "Erreur lors de la vérification du code." },
      { status: 500 }
    );
  }

  if (!codeRow) {
    return NextResponse.json<ApiResponse>(
      { success: false, error: "Code d'activation introuvable. Vérifiez votre saisie." },
      { status: 400 }
    );
  }

  if (codeRow.utilise) {
    return NextResponse.json<ApiResponse>(
      { success: false, error: "Ce code a déjà été utilisé. Chaque code est à usage unique." },
      { status: 409 }
    );
  }

  if (codeRow.date_expiration && new Date(codeRow.date_expiration) < new Date()) {
    return NextResponse.json<ApiResponse>(
      {
        success: false,
        error: "Ce code a expiré. Les codes sont valables 7 jours. Contactez e-pressing pour un nouveau code.",
      },
      { status: 400 }
    );
  }

  const planInitial: string = codeRow.plan_initial;
  const montantMensuel = PLAN_PRICES[planInitial] ?? PLAN_PRICES.starter;

  /* --- Variables pour rollback --- */
  let createdUserId: string | null = null;
  let createdPressingId: string | null = null;
  let createdPersonnelId: string | null = null;
  let createdAbonnementId: string | null = null;

  try {
    /* --- Étape 2 : Créer l'utilisateur Auth --- */
    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        nom_complet,
        role: "manager",
        source: "activation",
      },
    });

    if (authError) {
      // Email déjà utilisé ?
      if (authError.message.toLowerCase().includes("already") || authError.message.toLowerCase().includes("registered")) {
        return NextResponse.json<ApiResponse>(
          { success: false, error: "Cet email est déjà utilisé. Connectez-vous ou utilisez un autre email." },
          { status: 409 }
        );
      }
      console.error("[activation] Erreur createUser :", authError);
      // Sécurité (audit #8) : ne pas fuiter le message Supabase brut.
      throw new Error("Erreur interne du serveur");
    }

    createdUserId = authUser.user.id;

    /* --- Étape 3 : Créer le pressing --- */
    const { data: pressing, error: pressingError } = await supabase
      .from("pressing")
      .insert({
        nom: nom_pressing,
        telephone,
        email,
        ville,
        commune,
        statut: "essai",
        date_activation: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (pressingError || !pressing) {
      // Sécurité (audit #8) : log serveur seul, message générique au client.
      console.error("[activation] Erreur INSERT pressing :", pressingError);
      throw new Error("Erreur interne du serveur");
    }

    createdPressingId = pressing.id;

    /* --- Étape 4 : Créer le personnel (manager = admin du pressing) --- */
    const { data: personnel, error: personnelError } = await supabase
      .from("personnel")
      .insert({
        pressing_id: createdPressingId,
        user_id: createdUserId,
        nom_complet,
        email,
        telephone,
        role: "manager",
        methode_creation: "creation_directe",
        statut_compte: "actif",
        date_activation: new Date().toISOString(),
        actif: true,
      })
      .select("id")
      .single();

    if (personnelError || !personnel) {
      // Sécurité (audit #8) : log serveur seul, message générique au client.
      console.error("[activation] Erreur INSERT personnel :", personnelError);
      throw new Error("Erreur interne du serveur");
    }

    createdPersonnelId = personnel.id;

    /* --- Étape 5 : Créer l'abonnement (essai 7 jours) --- */
    const maintenant = new Date();
    const finEssai = new Date(maintenant.getTime() + ESSAI_DURATION_DAYS * 24 * 60 * 60 * 1000);

    const { data: abonnement, error: abonnementError } = await supabase
      .from("abonnements")
      .insert({
        pressing_id: createdPressingId,
        plan: planInitial,
        statut: "essai",
        date_debut: maintenant.toISOString(),
        date_fin: finEssai.toISOString(),
        montant_mensuel: montantMensuel,
      })
      .select("id")
      .single();

    if (abonnementError || !abonnement) {
      // Sécurité (audit #8) : log serveur seul, message générique au client.
      console.error("[activation] Erreur INSERT abonnement :", abonnementError);
      throw new Error("Erreur interne du serveur");
    }

    createdAbonnementId = abonnement.id;

    /* --- Étape 6 : Marquer le code comme utilisé --- */
    // 🔒 AUDIT-B-01 — Garde TOCTOU : on ajoute `.eq("utilise", false)` à
    // l'UPDATE pour garantir l'atomicité au niveau DB. Sans ce garde, deux
    // requêtes concurrentes utilisant le même code pouvaient toutes les deux
    // passer l'étape 1 (check utilise === false) puis réussir l'UPDATE (qui
    // ne testait que l'id) → double activation (deux pressings créés d'un
    // seul code).
    //
    // Avec `.eq("utilise", false)` + `.select("id").maybeSingle()`, l'UPDATE
    // ne modifie la ligne QUE si utilise est toujours false au moment de
    // l'exécution. Si un autre processus l'a déjà positionné à true entre
    // temps, l'UPDATE affecte 0 ligne → `updatedCode` est null → on lève
    // une erreur qui déclenche le rollback (suppression du pressing,
    // personnel, abonnement, user Auth créés aux étapes 2-5).
    const { data: updatedCode, error: updateCodeError } = await supabase
      .from("codes_activation")
      .update({
        utilise: true,
        date_utilisation: new Date().toISOString(),
        pressing_id_cible: createdPressingId,
      })
      .eq("id", codeRow.id)
      .eq("utilise", false)
      .select("id")
      .maybeSingle();

    if (updateCodeError) {
      // Sécurité (audit #8) : log serveur seul, message générique au client.
      console.error("[activation] Erreur UPDATE code :", updateCodeError);
      throw new Error("Erreur interne du serveur");
    }

    if (!updatedCode) {
      // 0 ligne mise à jour = le code a été utilisé concurremment entre
      // l'étape 1 (check) et l'étape 6 (UPDATE). On log côté serveur et on
      // déclenche le rollback via le catch block ci-dessous (le message
      // renvoyé au client reste générique).
      console.error(
        "[activation] Code utilisé concurremment (TOCTOU) — rollback"
      );
      throw new Error("TOCTOU: code used concurrently");
    }

    /* --- Succès --- */
    // À ce point, createdPressingId est garanti non-null : si l'INSERT pressing
    // avait échoué (étape 3), on aurait throw avant d'arriver ici. Le guard
    // `!` explicite satisfait TypeScript (createdPressingId est `string | null`).
    return NextResponse.json<ApiResponse<{ pressing_id: string; email: string }>>(
      { success: true, data: { pressing_id: createdPressingId!, email } },
      { status: 200 }
    );
  } catch (err) {
    console.error("[activation] Échec — rollback en cours :", err);

    /* --- Rollback manuel (ordre inverse) --- */
    if (createdAbonnementId) {
      await supabase.from("abonnements").delete().eq("id", createdAbonnementId);
    }
    if (createdPersonnelId) {
      await supabase.from("personnel").delete().eq("id", createdPersonnelId);
    }
    if (createdPressingId) {
      await supabase.from("pressing").delete().eq("id", createdPressingId);
    }
    if (createdUserId) {
      await supabase.auth.admin.deleteUser(createdUserId);
    }

    // Erreur réseau (Supabase injoignable en cours de transaction) → 503
    // clair, plus actionnable pour l'utilisateur qu'un 500 générique.
    if (isSupabaseNetworkError(err)) {
      return serviceUnavailableResponse("api/public/activation", err);
    }

    // Sécurité (audit #8) : les erreurs métier (email déjà utilisé, code
    // invalide/expiré/déjà utilisé) sont renvoyées AVANT ce catch via
    // NextResponse.json direct. Toute erreur atteignant ici est technique
    // (Supabase, SQL, réseau) → message générique, détail loggé ci-dessus.
    return NextResponse.json<ApiResponse>(
      { success: false, error: "Erreur interne du serveur" },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";
