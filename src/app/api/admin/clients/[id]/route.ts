/**
 * OgPressing — API /api/admin/clients/[id] (GET detail + PATCH update)
 * --------------------------------------------------------------------
 * LOT 7 — fondations pour le wizard POS et la fiche client :
 *
 * 1) GET /api/admin/clients/{id}
 *    Renvoie un client complet (id, pressing_id, nom_complet, telephone,
 *    email, adresse, points_fidelite, notes, preferences_lavage, created_at,
 *    updated_at). 404 si introuvable (RLS isole par pressing).
 *
 * 2) PATCH /api/admin/clients/{id}
 *    Met à jour partiellement un client : nom_complet, telephone, email,
 *    adresse, notes, preferences_lavage. Les champs `preferences_lavage`
 *    suivent un schéma JSONB strict (clés + enums validés). Auth : manager
 *    OU receptionniste (ceux qui peuvent éditer les clients).
 *
 * 🔒 SÉCURITÉ :
 *   - getSupabaseServer() (client anon + JWT) → RLS `isolation_pressing`
 *     isole par pressing_id.
 *   - GET : n'importe quel personnel actif.
 *   - PATCH : manager ou receptionniste (actif + statut_compte='actif').
 *   - 401 si non authentifié, 403 si non autorisé, 404 si client introuvable.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { isValidCIPhone, normalizeCIPhone } from "@/lib/validations/phone";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/* -------------------------------------------------------------------------- */
/*  PREFERENCES_LAVAGE — schéma JSONB strict                                  */
/* -------------------------------------------------------------------------- */

/**
 * Schéma JSONB `preferences_lavage` stocké sur `clients`.
 *
 * Toutes les clés sont OPTIONNELLES (le client peut n'avoir aucune préférence
 * renseignée, preferences_lavage = null ou {}). Les valeurs doivent
 * appartenir aux enums ci-dessous si présentes.
 */
interface PreferencesLavage {
  detergent?: "classique" | "bio" | "sans_phosphore";
  temperature?: "froid" | "tiede" | "chaud";
  adoucissant?: "oui" | "non";
  detachage_prealable?: "oui" | "non";
  pressing_intensif?: "oui" | "non";
  repassage?: "standard" | "leger" | "aucun";
}

const PREF_ENUMS: Record<
  keyof PreferencesLavage,
  readonly string[]
> = {
  detergent: ["classique", "bio", "sans_phosphore"],
  temperature: ["froid", "tiede", "chaud"],
  adoucissant: ["oui", "non"],
  detachage_prealable: ["oui", "non"],
  pressing_intensif: ["oui", "non"],
  repassage: ["standard", "leger", "aucun"],
};

/**
 * Valide un objet `preferences_lavage` entrant.
 * Renvoie `{ ok: true, value: PreferencesLavage }` ou `{ ok: false, error }`.
 */
function validatePreferencesLavage(
  raw: unknown
): { ok: true; value: PreferencesLavage } | { ok: false; error: string } {
  if (raw === null || raw === undefined) {
    return { ok: true, value: {} };
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return {
      ok: false,
      error: "preferences_lavage doit être un objet ou null",
    };
  }
  const obj = raw as Record<string, unknown>;
  const cleaned: PreferencesLavage = {};

  for (const key of Object.keys(obj) as (keyof PreferencesLavage)[]) {
    if (!(key in PREF_ENUMS)) {
      return {
        ok: false,
        error: `preferences_lavage.${key} : clé inconnue (clés valides : ${Object.keys(
          PREF_ENUMS
        ).join(", ")})`,
      };
    }
    const value = obj[key];
    if (value === null || value === undefined) continue; // ignore null
    if (typeof value !== "string") {
      return {
        ok: false,
        error: `preferences_lavage.${key} doit être une chaîne`,
      };
    }
    if (!PREF_ENUMS[key].includes(value)) {
      return {
        ok: false,
        error: `preferences_lavage.${key} : valeur '${value}' invalide (valeurs attendues : ${PREF_ENUMS[
          key
        ].join(", ")})`,
      };
    }
    // @ts-expect-error — value est validée comme appartenant à l'union
    cleaned[key] = value;
  }

  return { ok: true, value: cleaned };
}

/* -------------------------------------------------------------------------- */
/*  GET — détail client                                                        */
/* -------------------------------------------------------------------------- */

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const supabase = await getSupabaseServer();
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) {
    return NextResponse.json(
      { success: false, error: "Non authentifié" },
      { status: 401 }
    );
  }

  // Vérifie que l'appelant est un personnel actif
  const { data: me } = await supabase
    .from("personnel")
    .select("id, actif, statut_compte")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (!me) {
    return NextResponse.json(
      { success: false, error: "Accès refusé — personnel introuvable" },
      { status: 403 }
    );
  }
  if (me.actif !== true || me.statut_compte !== "actif") {
    return NextResponse.json(
      { success: false, error: "Accès refusé — compte inactif" },
      { status: 403 }
    );
  }

  const { id: clientId } = await params;

  // Récupère le client (RLS isole par pressing — renvoie null si introuvable)
  const { data: client, error: clientErr } = await supabase
    .from("clients")
    .select(
      "id, pressing_id, nom_complet, telephone, email, adresse, points_fidelite, notes, preferences_lavage, created_at, updated_at"
    )
    .eq("id", clientId)
    .maybeSingle();

  if (clientErr) {
    console.error("[api/admin/clients/[id]] Erreur SELECT:", clientErr);
    return NextResponse.json(
      { success: false, error: "Erreur lors de la récupération du client" },
      { status: 500 }
    );
  }

  if (!client) {
    return NextResponse.json(
      { success: false, error: "Client introuvable" },
      { status: 404 }
    );
  }

  return NextResponse.json({
    success: true,
    data: client,
  });
}

/* -------------------------------------------------------------------------- */
/*  PATCH — mise à jour partielle                                              */
/* -------------------------------------------------------------------------- */

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const supabase = await getSupabaseServer();
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) {
    return NextResponse.json(
      { success: false, error: "Non authentifié" },
      { status: 401 }
    );
  }

  // Vérifie que l'appelant est manager OU receptionniste (actif + actif compte)
  const { data: me } = await supabase
    .from("personnel")
    .select("id, role, actif, statut_compte")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (!me) {
    return NextResponse.json(
      { success: false, error: "Accès refusé — personnel introuvable" },
      { status: 403 }
    );
  }
  if (me.actif !== true || me.statut_compte !== "actif") {
    return NextResponse.json(
      { success: false, error: "Accès refusé — compte inactif" },
      { status: 403 }
    );
  }
  if (me.role !== "manager" && me.role !== "receptionniste") {
    return NextResponse.json(
      {
        success: false,
        error:
          "Accès refusé — seuls les managers et réceptionnistes peuvent éditer les clients",
      },
      { status: 403 }
    );
  }

  const { id: clientId } = await params;

  // Parse le body
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Corps de requête invalide (JSON attendu)" },
      { status: 400 }
    );
  }

  // Construit l'objet update en ne reprenant que les champs fournis
  const updates: Record<string, unknown> = {};

  if ("nom_complet" in body) {
    const v = typeof body.nom_complet === "string" ? body.nom_complet.trim() : "";
    if (!v) {
      return NextResponse.json(
        { success: false, error: "nom_complet ne peut pas être vide" },
        { status: 400 }
      );
    }
    updates.nom_complet = v;
  }

  if ("telephone" in body) {
    const v =
      typeof body.telephone === "string" ? body.telephone.trim() : "";
    if (!v) {
      return NextResponse.json(
        { success: false, error: "telephone ne peut pas être vide" },
        { status: 400 }
      );
    }
    // AUDIT-B-03 — Validation du téléphone ivoirien (centralisée dans
    // `isValidCIPhone`). Avant ce fix, seul le non-vide était vérifié.
    if (!isValidCIPhone(v)) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Le téléphone doit être un numéro ivoirien valide (ex : 07 00 00 00 00 ou +225 07 00 00 00 00).",
        },
        { status: 400 }
      );
    }
    // AUDIT-B-03 — Normalisation vers +225XXXXXXXXXX pour cohérence avec
    // les autres routes (activation, inscription, personnel, clients POST).
    updates.telephone = normalizeCIPhone(v);
  }

  if ("email" in body) {
    const v = body.email;
    if (v === null) {
      updates.email = null;
    } else if (typeof v === "string") {
      const trimmed = v.trim();
      if (trimmed && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
        return NextResponse.json(
          { success: false, error: "Format d'email invalide" },
          { status: 400 }
        );
      }
      updates.email = trimmed || null;
    } else {
      return NextResponse.json(
        { success: false, error: "email doit être une chaîne ou null" },
        { status: 400 }
      );
    }
  }

  if ("adresse" in body) {
    const v = body.adresse;
    if (v === null) {
      updates.adresse = null;
    } else if (typeof v === "string") {
      updates.adresse = v.trim() || null;
    } else {
      return NextResponse.json(
        { success: false, error: "adresse doit être une chaîne ou null" },
        { status: 400 }
      );
    }
  }

  if ("notes" in body) {
    const v = body.notes;
    if (v === null) {
      updates.notes = null;
    } else if (typeof v === "string") {
      updates.notes = v.trim() || null;
    } else {
      return NextResponse.json(
        { success: false, error: "notes doit être une chaîne ou null" },
        { status: 400 }
      );
    }
  }

  if ("preferences_lavage" in body) {
    const validation = validatePreferencesLavage(body.preferences_lavage);
    if (!validation.ok) {
      return NextResponse.json(
        { success: false, error: validation.error },
        { status: 400 }
      );
    }
    updates.preferences_lavage = validation.value;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Aucun champ à mettre à jour. Champs éditables : nom_complet, telephone, email, adresse, notes, preferences_lavage.",
      },
      { status: 400 }
    );
  }

  // Applique la mise à jour (RLS isole par pressing → 0 ligne affectée si
  // le client n'appartient pas au pressing → on renvoie 404)
  const { data: updated, error: updateErr } = await supabase
    .from("clients")
    .update(updates)
    .eq("id", clientId)
    .select(
      "id, pressing_id, nom_complet, telephone, email, adresse, points_fidelite, notes, preferences_lavage, created_at, updated_at"
    )
    .maybeSingle();

  if (updateErr) {
    console.error("[api/admin/clients/[id]] Erreur UPDATE:", updateErr);
    return NextResponse.json(
      { success: false, error: "Erreur lors de la mise à jour du client" },
      { status: 500 }
    );
  }

  if (!updated) {
    return NextResponse.json(
      { success: false, error: "Client introuvable dans votre pressing" },
      { status: 404 }
    );
  }

  return NextResponse.json({
    success: true,
    data: updated,
  });
}
