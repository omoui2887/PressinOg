/**
 * OgPressing — API /api/admin/tarifs-articles (GET + POST)
 * ---------------------------------------------------------
 * Tarifs spécifiques par article du catalogue × type de service.
 *
 * GET — Liste des tarifs du pressing connecté :
 *   - Renvoie les tarifs (article × service × prix) pour le pressing courant
 *   - Inclut une JOIN sur catalogue_articles pour récupérer nom, slug, icone_url, categorie
 *   - Utilisé par la page /admin/tarifs et par le POS pour afficher les prix par article
 *
 * POST — Création d'un tarif (ou upsert) :
 *   Body : { catalogue_article_id, type_service, prix, duree_estimee? }
 *   Auth : manager actif du pressing. pressing_id forcé à celui du manager.
 *   Contraintes : prix entier ≥ 0, (pressing, article, type) unique
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
  "laver_repasser",
  "nettoyage_sec",
  "detachage",
  "blanchisserie",
] as const;

type TypeService = (typeof TYPES_VALID)[number];

/**
 * Libellés français par défaut pour l'auto-provisionnement des services.
 * Utilisés quand un service doit être créé automatiquement suite à la
 * configuration d'un tarif (le manager n'a pas besoin d'aller dans la
 * page Services pour que le tarif soit opérationnel dans le POS).
 */
const SERVICE_LABELS: Record<TypeService, string> = {
  lavage: "Lavage",
  repassage: "Repassage",
  laver_repasser: "Laver-Repasser",
  nettoyage_sec: "Nettoyage à sec",
  detachage: "Détachage",
  blanchisserie: "Blanchisserie",
};

/**
 * Garantit qu'un service de ce type existe pour le pressing connecté.
 * Si aucun service n'existe, en crée un automatiquement avec un nom par
 * défaut et le prix du tarif. Cela évite l'erreur « service_id est requis »
 * dans le POS quand l'admin configure des tarifs sans créer les services.
 *
 * RLS : opère via le client anon + JWT du manager (RLS autorise l'INSERT
 * sur services pour le pressing du manager connecté).
 */
async function ensureServiceExists(
  supabase: NonNullable<Awaited<ReturnType<typeof getSupabaseServer>>>,
  pressingId: string,
  typeService: TypeService,
  prix: number,
  dureeEstimee: string | null
): Promise<void> {
  // Vérifie s'il existe déjà un service (actif ou inactif) de ce type.
  const { data: existing, error: checkErr } = await supabase
    .from("services")
    .select("id")
    .eq("pressing_id", pressingId)
    .eq("type", typeService)
    .maybeSingle();

  if (checkErr) {
    console.warn(
      "[tarifs-articles] ensureServiceExists: check failed:",
      checkErr.message
    );
    return; // non-bloquant — le tarif est quand même créé
  }
  if (existing) return; // service déjà présent, rien à faire

  // Crée le service manquant avec un nom par défaut.
  const insertPayload: Record<string, unknown> = {
    pressing_id: pressingId,
    type: typeService,
    nom: SERVICE_LABELS[typeService],
    prix,
    actif: true,
  };
  if (dureeEstimee) {
    insertPayload.duree_estimee = dureeEstimee;
  }

  const { error: insertErr } = await supabase
    .from("services")
    .insert(insertPayload);

  if (insertErr) {
    // 23505 = violation unique → un service a été créé entre-temps (race).
    // Ce n'est pas une erreur fatale : le service existe, c'est l'essentiel.
    if (insertErr.code !== "23505") {
      console.warn(
        "[tarifs-articles] ensureServiceExists: insert failed:",
        insertErr.message
      );
    }
  }
}

/** Vérifie l'auth + retourne le personnel connecté. `allowWrite=true` exige manager. */
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

export interface TarifArticle {
  id: string;
  pressing_id: string;
  catalogue_article_id: string;
  type_service: TypeService;
  prix: number;
  duree_estimee: string | null;
  actif: boolean;
  created_at: string;
  updated_at: string;
  // Jointure catalogue_articles
  catalogue_article?: {
    id: string;
    slug: string;
    nom: string;
    icone_url: string;
    categorie: string;
  } | null;
}

// ================================================================
//  GET — Liste des tarifs du pressing
// ================================================================
export async function GET(request: NextRequest) {
  const auth = await getConnectedPersonnel(false);
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const searchParams = request.nextUrl.searchParams;
  const all = searchParams.get("all") === "true";

  let query = supabase
    .from("tarifs_articles")
    .select(
      `id, pressing_id, catalogue_article_id, type_service, prix, duree_estimee, actif, created_at, updated_at,
       catalogue_article:catalogue_articles(id, slug, nom, icone_url, categorie, ordre_affichage)`
    )
    .order("type_service", { ascending: true });

  if (!all) {
    query = query.eq("actif", true);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[api/admin/tarifs-articles GET] Erreur SELECT:", error);
    return NextResponse.json(
      { success: false, error: "Erreur lors de la récupération des tarifs" },
      { status: 500 }
    );
  }

  // Tri côté application : par catégorie du catalogue, puis ordre_affichage,
  // puis type_service (PostgREST ne supporte pas le ORDER BY sur colonne
  // de table jointe via la syntaxe .order("foreignTable(column)"))
  const sorted = (data ?? []).slice().sort((a: any, b: any) => {
    const ca = a?.catalogue_article;
    const cb = b?.catalogue_article;
    if (ca && cb) {
      const catCmp = String(ca.categorie ?? "").localeCompare(String(cb.categorie ?? ""));
      if (catCmp !== 0) return catCmp;
      const ordCmp = (ca.ordre_affichage ?? 0) - (cb.ordre_affichage ?? 0);
      if (ordCmp !== 0) return ordCmp;
    }
    return String(a?.type_service ?? "").localeCompare(String(b?.type_service ?? ""));
  });

  return NextResponse.json({
    success: true,
    data: sorted as unknown as TarifArticle[],
  });
}

// ================================================================
//  POST — Création d'un tarif (upsert)
// ================================================================
interface CreateBody {
  catalogue_article_id?: unknown;
  type_service?: unknown;
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

  const catalogueArticleId =
    typeof body.catalogue_article_id === "string"
      ? body.catalogue_article_id
      : "";
  const typeService = typeof body.type_service === "string" ? body.type_service : "";

  if (!catalogueArticleId) {
    return NextResponse.json(
      { success: false, error: "Article du catalogue requis." },
      { status: 400 }
    );
  }
  if (!(TYPES_VALID as readonly string[]).includes(typeService)) {
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
      { success: false, error: "Prix invalide (entier ≥ 0 FCFA)." },
      { status: 400 }
    );
  }

  let dureeEstimee: string | null = null;
  if (
    typeof body.duree_estimee === "string" &&
    body.duree_estimee.trim() !== ""
  ) {
    dureeEstimee = body.duree_estimee.trim();
  }

  // Auto-provisionne le service correspondant s'il n'existe pas encore.
  // Sans service, le tarif ne pourrait pas être utilisé dans le POS
  // (commande_lignes.service_id est une FK vers services.id).
  await ensureServiceExists(
    supabase,
    pressingId,
    typeService as TypeService,
    prix,
    dureeEstimee
  );

  // Upsert : si un tarif existe déjà pour (pressing, article, type), on UPDATE le prix
  const upsertPayload: Record<string, unknown> = {
    pressing_id: pressingId,
    catalogue_article_id: catalogueArticleId,
    type_service: typeService,
    prix,
    actif: true,
  };
  if (dureeEstimee) {
    upsertPayload.duree_estimee = dureeEstimee;
  }

  const { data: tarif, error: upsertErr } = await supabase
    .from("tarifs_articles")
    .upsert(upsertPayload, {
      onConflict: "pressing_id,catalogue_article_id,type_service",
    })
    .select(
      `id, pressing_id, catalogue_article_id, type_service, prix, duree_estimee, actif, created_at, updated_at,
       catalogue_article:catalogue_articles(id, slug, nom, icone_url, categorie, ordre_affichage)`
    )
    .maybeSingle();

  if (upsertErr || !tarif) {
    console.error("[api/admin/tarifs-articles POST] Erreur UPSERT:", upsertErr);
    if (upsertErr && upsertErr.code === "23505") {
      return NextResponse.json(
        {
          success: false,
          error:
            "Un tarif existe déjà pour cet article et ce type de service. Modifiez le tarif existant.",
        },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { success: false, error: "Erreur lors de la création du tarif." },
      { status: 500 }
    );
  }

  return NextResponse.json(
    { success: true, data: tarif as unknown as TarifArticle },
    { status: 201 }
  );
}
