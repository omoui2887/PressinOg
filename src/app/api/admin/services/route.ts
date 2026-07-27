/**
 * OgPressing — API /api/admin/services (GET + POST) — LOT 11.1
 * ------------------------------------------------------------
 *
 * GET — Liste des services du pressing connecté :
 *   - sans paramètre ou ?all=false → services ACTIFS seulement
 *     (utilisé par le wizard de création de commande, LOT 7)
 *   - ?all=true → TOUS les services (actifs + inactifs), utilisé par
 *     la page /admin/services pour permettre la réactivation
 *   - Tri : type ASC puis prix ASC
 *
 * POST — Création d'un service :
 *   Body : { nom, type, prix, duree_estimee? }
 *   Auth : manager actif du pressing. pressing_id forcé à celui du manager.
 *   Contraintes : nom 2-100, type dans type_service enum, prix entier ≥ 0
 *
 * 🔒 SÉCURITÉ :
 *   - getSupabaseServer() (anon + JWT). RLS isole par pressing.
 *   - Lecture (GET) : tout personnel actif du pressing
 *   - Écriture (POST) : manager uniquement
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const TYPES_VALID = [
  "lavage",
  "repassage",
  "nettoyage_sec",
  "detachage",
  "blanchisserie",
] as const;

/** Vérifie l'auth + retourne le personnel connecté.
 *  `allowWrite=true` exige le rôle manager. */
async function getConnectedPersonnel(allowWrite: boolean) {
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

  if (!me || me.actif !== true || me.statut_compte !== "actif") {
    return {
      error: NextResponse.json(
        { success: false, error: "Compte inactif ou désactivé" },
        { status: 403 }
      ),
    };
  }
  if (allowWrite && me.role !== "manager") {
    return {
      error: NextResponse.json(
        { success: false, error: "Accès refusé — manager requis" },
        { status: 403 }
      ),
    };
  }
  return { me, supabase };
}

export async function GET(request: NextRequest) {
  const auth = await getConnectedPersonnel(false);
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const searchParams = request.nextUrl.searchParams;
  const all = searchParams.get("all") === "true";

  let query = supabase
    .from("services")
    .select("id, type, nom, prix, duree_estimee, actif, created_at, updated_at")
    .order("type", { ascending: true })
    .order("prix", { ascending: true });

  if (!all) {
    query = query.eq("actif", true);
  }

  const { data: services, error: servicesErr } = await query;

  if (servicesErr) {
    console.error("[api/admin/services GET] Erreur SELECT:", servicesErr);
    return NextResponse.json(
      { success: false, error: "Erreur lors de la récupération des services" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    data: services ?? [],
  });
}

/* ================================================================
 *  POST — Création d'un service (LOT 11.1)
 * ================================================================ */

interface CreateBody {
  nom?: unknown;
  type?: unknown;
  prix?: unknown;
  duree_estimee?: unknown;
}

export async function POST(request: NextRequest) {
  const auth = await getConnectedPersonnel(true);
  if ("error" in auth) return auth.error;
  const { me, supabase } = auth;
  const pressingId = me!.pressing_id;

  let body: CreateBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Corps de requête invalide (JSON attendu)" },
      { status: 400 }
    );
  }

  const nom = typeof body.nom === "string" ? body.nom.trim() : "";
  const type = typeof body.type === "string" ? body.type : "";

  if (!nom || nom.length < 2 || nom.length > 100) {
    return NextResponse.json(
      {
        success: false,
        error: "Le nom doit comporter entre 2 et 100 caractères.",
      },
      { status: 400 }
    );
  }
  if (!(TYPES_VALID as readonly string[]).includes(type)) {
    return NextResponse.json(
      { success: false, error: "Type de service invalide." },
      { status: 400 }
    );
  }

  const prix =
    typeof body.prix === "number"
      ? body.prix
      : parseInt(String(body.prix ?? "0"), 10);
  if (Number.isNaN(prix) || prix < 0) {
    return NextResponse.json(
      { success: false, error: "Prix unitaire invalide (entier ≥ 0 FCFA)." },
      { status: 400 }
    );
  }

  // duree_estimee est un INTERVAL PostgreSQL. On accepte soit une chaîne
  // libre ("2 hours", "1 day", "90 minutes") soit null.
  // La validation réelle est faite par PostgreSQL ; en cas d'erreur on
  // renvoie 400.
  let dureeEstimee: string | null = null;
  if (
    typeof body.duree_estimee === "string" &&
    body.duree_estimee.trim() !== ""
  ) {
    dureeEstimee = body.duree_estimee.trim();
  }

  const insertPayload: Record<string, unknown> = {
    pressing_id: pressingId,
    nom,
    type,
    prix,
    actif: true,
  };
  if (dureeEstimee) {
    insertPayload.duree_estimee = dureeEstimee;
  }

  const { data: service, error: insertErr } = await supabase
    .from("services")
    .insert(insertPayload)
    .select(
      "id, type, nom, prix, duree_estimee, actif, created_at, updated_at"
    )
    .maybeSingle();

  if (insertErr || !service) {
    console.error("[api/admin/services POST] Erreur INSERT:", insertErr);
    // 23505 = violation contrainte unique (services_pressing_id_type_uniq)
    // → un service de ce type existe déjà pour ce pressing
    if (insertErr && insertErr.code === "23505") {
      return NextResponse.json(
        {
          success: false,
          error:
            "Un service de ce type existe déjà pour votre pressing. Modifiez le service existant ou changez de type.",
        },
        { status: 409 }
      );
    }
    // Erreur courante : format duree_estimee invalide → 22007
    if (insertErr && insertErr.code === "22007") {
      return NextResponse.json(
        {
          success: false,
          error:
            "Format de durée estimée invalide. Exemples valides : « 2 hours », « 1 day », « 90 minutes ».",
        },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: "Erreur lors de la création du service." },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, data: service }, { status: 201 });
}
