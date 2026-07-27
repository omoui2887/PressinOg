/**
 * OgPressing — API /api/admin/pressing (GET + PATCH) — LOT 11.2
 * -------------------------------------------------------------
 * Page /admin/pressing — configuration générale du pressing :
 *   - Onglet 1 "Informations générales" : nom, ville, adresse, téléphone,
 *     email, logo_url
 *   - Onglet 2 "Horaires d'ouverture"   : horaires (jsonb)
 *   - Onglet 3 "Mon abonnement"          : lecture seule (renvoyé par GET)
 *
 * GET  — Renvoie `{ pressing, abonnement }` (abonnement le plus récent du
 *        pressing connecté). Lecture réservée au manager (page admin-only
 *        selon spec LOT 11.2).
 * PATCH — Met à jour n'importe quel sous-ensemble des champs : nom,
 *        telephone, email, adresse, ville, logo_url, horaires.
 *        Manager actif requis.
 *
 * 🔒 SÉCURITÉ :
 *   - getSupabaseServer() (anon + JWT). RLS isole par pressing_id.
 *   - Vérification rôle manager (actif + statut_compte=actif) pour GET et PATCH.
 *   - Le `pressing_id` est TOUJOURS celui du manager connecté (jamais trusté
 *     depuis le body) — impossible de modifier un autre pressing via cette API.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const JOURS_VALID = [
  "lundi",
  "mardi",
  "mercredi",
  "jeudi",
  "vendredi",
  "samedi",
  "dimanche",
] as const;

const PRESSING_FIELDS =
  "id, nom, telephone, email, adresse, ville, commune, logo_url, horaires, statut, date_activation";

const ABONNEMENT_FIELDS =
  "id, plan, statut, date_debut, date_fin, montant_mensuel";

/** Vérifie l'auth + retourne le personnel connecté (manager actif requis). */
async function getConnectedManager() {
  const supabase = await getSupabaseServer();
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) {
    return {
      error: NextResponse.json(
        { success: false, error: "Non authentifié" },
        { status: 401 }
      ),
    };
  }
  const { data: me } = await supabase
    .from("personnel")
    .select("id, pressing_id, role, actif, statut_compte")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (
    !me ||
    me.actif !== true ||
    me.statut_compte !== "actif" ||
    me.role !== "manager"
  ) {
    return {
      error: NextResponse.json(
        { success: false, error: "Accès refusé — manager requis" },
        { status: 403 }
      ),
    };
  }
  return { me, supabase };
}

/* ================================================================
 *  GET — Récupère la config du pressing + dernier abonnement
 * ================================================================ */
export async function GET() {
  const auth = await getConnectedManager();
  if ("error" in auth) return auth.error;
  const { me, supabase } = auth;
  const pressingId = me!.pressing_id;

  // 1. Ligne pressing
  const { data: pressing, error: pressingErr } = await supabase
    .from("pressing")
    .select(PRESSING_FIELDS)
    .eq("id", pressingId)
    .maybeSingle();

  if (pressingErr) {
    console.error("[api/admin/pressing GET] Erreur SELECT pressing:", pressingErr);
    return NextResponse.json(
      { success: false, error: "Erreur lors de la récupération du pressing" },
      { status: 500 }
    );
  }
  if (!pressing) {
    return NextResponse.json(
      { success: false, error: "Pressing introuvable" },
      { status: 404 }
    );
  }

  // 2. Dernier abonnement (date_debut DESC)
  const { data: abonnement, error: aboErr } = await supabase
    .from("abonnements")
    .select(ABONNEMENT_FIELDS)
    .eq("pressing_id", pressingId)
    .order("date_debut", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (aboErr) {
    console.error("[api/admin/pressing GET] Erreur SELECT abonnement:", aboErr);
    // Non bloquant : on renvoie pressing sans abonnement
    return NextResponse.json({
      success: true,
      data: { pressing, abonnement: null },
    });
  }

  return NextResponse.json({
    success: true,
    data: { pressing, abonnement: abonnement ?? null },
  });
}

/* ================================================================
 *  PATCH — Met à jour les champs du pressing
 * ================================================================ */

interface PatchBody {
  nom?: unknown;
  telephone?: unknown;
  email?: unknown;
  adresse?: unknown;
  ville?: unknown;
  logo_url?: unknown;
  horaires?: unknown;
}

/** Valide et normalise une valeur horaires envoyée par le client.
 *  Retourne soit l'objet `Record<string,string|null>` soit une erreur. */
function validateHoraires(
  raw: unknown
): { ok: true; value: Record<string, string | null> } | { ok: false; error: string } {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, error: "Format horaires invalide (objet attendu)." };
  }
  const obj = raw as Record<string, unknown>;
  const out: Record<string, string | null> = {};

  // Vérifie que toutes les clés présentes sont des jours valides
  for (const key of Object.keys(obj)) {
    if (!(JOURS_VALID as readonly string[]).includes(key)) {
      return {
        ok: false,
        error: `Jour invalide dans les horaires : "${key}".`,
      };
    }
    const v = obj[key];
    if (v === null) {
      out[key] = null;
      continue;
    }
    if (typeof v !== "string") {
      return {
        ok: false,
        error: `Valeur invalide pour le jour "${key}" (string ou null attendu).`,
      };
    }
    // Format "HH:MM-HH:MM"
    const match = v.match(/^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/);
    if (!match) {
      return {
        ok: false,
        error: `Format d'horaire invalide pour "${key}" : "${v}". Attendu "HH:MM-HH:MM".`,
      };
    }
    const [, oh, om, fh, fm] = match;
    const ohNum = parseInt(oh, 10);
    const omNum = parseInt(om, 10);
    const fhNum = parseInt(fh, 10);
    const fmNum = parseInt(fm, 10);
    if (
      ohNum > 23 || omNum > 59 ||
      fhNum > 23 || fmNum > 59
    ) {
      return {
        ok: false,
        error: `Heure invalide pour "${key}" : "${v}".`,
      };
    }
    out[key] = v;
  }

  return { ok: true, value: out };
}

export async function PATCH(request: NextRequest) {
  const auth = await getConnectedManager();
  if ("error" in auth) return auth.error;
  const { me, supabase } = auth;
  const pressingId = me!.pressing_id;

  let body: PatchBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Corps de requête invalide (JSON attendu)" },
      { status: 400 }
    );
  }

  const update: Record<string, unknown> = {};

  // nom : string 2-200
  if (body.nom !== undefined) {
    if (typeof body.nom !== "string") {
      return NextResponse.json(
        { success: false, error: "Nom invalide (texte attendu)." },
        { status: 400 }
      );
    }
    const nom = body.nom.trim();
    if (nom.length < 2 || nom.length > 200) {
      return NextResponse.json(
        {
          success: false,
          error: "Le nom doit comporter entre 2 et 200 caractères.",
        },
        { status: 400 }
      );
    }
    update.nom = nom;
  }

  // telephone : string, format ivoirien (10 chiffres commençant par 0) OU vide
  if (body.telephone !== undefined) {
    if (body.telephone === null) {
      update.telephone = null;
    } else if (typeof body.telephone === "string") {
      const tel = body.telephone.trim();
      if (tel === "") {
        update.telephone = null;
      } else {
        // Format ivoirien : 10 chiffres, commence par 0
        const digits = tel.replace(/[\s.-]/g, "");
        if (!/^0\d{9}$/.test(digits)) {
          return NextResponse.json(
            {
              success: false,
              error:
                "Téléphone invalide. Format attendu : 10 chiffres commençant par 0 (ex : 07 12 34 56 78).",
            },
            { status: 400 }
          );
        }
        update.telephone = digits;
      }
    } else {
      return NextResponse.json(
        { success: false, error: "Téléphone invalide (texte attendu)." },
        { status: 400 }
      );
    }
  }

  // email : format email OU vide/null
  if (body.email !== undefined) {
    if (body.email === null) {
      update.email = null;
    } else if (typeof body.email === "string") {
      const email = body.email.trim();
      if (email === "") {
        update.email = null;
      } else {
        // Validation email simple
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          return NextResponse.json(
            { success: false, error: "Format d'email invalide." },
            { status: 400 }
          );
        }
        update.email = email;
      }
    } else {
      return NextResponse.json(
        { success: false, error: "Email invalide (texte attendu)." },
        { status: 400 }
      );
    }
  }

  // adresse : string ≤ 500
  if (body.adresse !== undefined) {
    if (body.adresse === null) {
      update.adresse = null;
    } else if (typeof body.adresse === "string") {
      const adresse = body.adresse.trim();
      if (adresse.length > 500) {
        return NextResponse.json(
          { success: false, error: "L'adresse ne peut pas dépasser 500 caractères." },
          { status: 400 }
        );
      }
      update.adresse = adresse || null;
    } else {
      return NextResponse.json(
        { success: false, error: "Adresse invalide (texte attendu)." },
        { status: 400 }
      );
    }
  }

  // ville : string ≤ 100
  if (body.ville !== undefined) {
    if (body.ville === null) {
      update.ville = null;
    } else if (typeof body.ville === "string") {
      const ville = body.ville.trim();
      if (ville.length > 100) {
        return NextResponse.json(
          { success: false, error: "La ville ne peut pas dépasser 100 caractères." },
          { status: 400 }
        );
      }
      update.ville = ville || null;
    } else {
      return NextResponse.json(
        { success: false, error: "Ville invalide (texte attendu)." },
        { status: 400 }
      );
    }
  }

  // logo_url : URL ou null
  if (body.logo_url !== undefined) {
    if (body.logo_url === null || body.logo_url === "") {
      update.logo_url = null;
    } else if (typeof body.logo_url === "string") {
      // Validation URL basique
      try {
        new URL(body.logo_url);
        update.logo_url = body.logo_url;
      } catch {
        return NextResponse.json(
          { success: false, error: "URL du logo invalide." },
          { status: 400 }
        );
      }
    } else {
      return NextResponse.json(
        { success: false, error: "logo_url invalide." },
        { status: 400 }
      );
    }
  }

  // horaires : objet validé
  if (body.horaires !== undefined) {
    if (body.horaires === null) {
      update.horaires = null;
    } else {
      const result = validateHoraires(body.horaires);
      if (!result.ok) {
        return NextResponse.json(
          { success: false, error: result.error },
          { status: 400 }
        );
      }
      update.horaires = result.value;
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json(
      { success: false, error: "Aucun champ à mettre à jour." },
      { status: 400 }
    );
  }

  const { data: updated, error: updateErr } = await supabase
    .from("pressing")
    .update(update)
    .eq("id", pressingId)
    .select(PRESSING_FIELDS)
    .maybeSingle();

  if (updateErr || !updated) {
    console.error("[api/admin/pressing PATCH] Erreur UPDATE:", updateErr);
    return NextResponse.json(
      { success: false, error: "Erreur lors de la mise à jour du pressing." },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, data: { pressing: updated } });
}
