/**
 * e-pressing — API /api/admin/casiers (GET)
 * --------------------------------------------------
 * Liste les casiers de stockage pour linges propres du pressing connecté.
 *
 * Retourne 2 listes :
 *   1. `occupees` : casiers actuellement occupés (articles avec zone_stockage
 *      non-null, statut "pret"). Pour chaque casier : code, article (id,
 *      description), commande (id, numéro), client (nom, téléphone),
 *      date de rangement, personnel qui a rangé.
 *   2. `libres` : casiers suggérés disponibles (basés sur un plan par défaut
 *      A1-A20, B1-B20, C1-C20, D1-D20 — 80 casiers). Sont exclus les casiers
 *      déjà occupés.
 *
 * Réponse :
 *   {
 *     success: true,
 *     data: {
 *       occupees: CasierOccupe[],
 *       libres: string[],
 *       total_occupees: number,
 *       total_libres: number,
 *       migration_appliquee: boolean  // false si les colonnes casier n'existent pas
 *     }
 *   }
 *
 * 🔒 SÉCURITÉ :
 *   - getSupabaseServer() (client anon + JWT) → RLS `isolation_pressing`.
 *   - Auth : n'importe quel personnel actif (manager, réceptionniste,
 *     repassage, laveur, livreur, caissier, comptable).
 *   - 401 si non authentifié, 403 si personnel inactif.
 *
 * 🗄️ ROBUSTESSE :
 *   - Si la migration 015 n'est pas appliquée (colonnes zone_stockage
 *     absentes), l'API renvoie `migration_appliquee: false` avec des listes
 *     vides. Le frontend peut afficher un message demandant d'appliquer
 *     la migration.
 */
import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Plan de casiers par défaut : 4 rangées (A, B, C, D) × 20 colonnes. */
const PLAN_CASIERS_DEFAUT: string[] = (() => {
  const rows = ["A", "B", "C", "D"];
  const cols = 20;
  const casiers: string[] = [];
  for (const r of rows) {
    for (let c = 1; c <= cols; c++) {
      casiers.push(`${r}${c}`);
    }
  }
  return casiers;
})();

interface CasierOccupe {
  zone_stockage: string;
  article_id: string;
  article_description: string;
  commande_id: string;
  commande_numero: string;
  client_nom: string | null;
  client_telephone: string | null;
  date_rangeement: string | null;
  range_par_nom: string | null;
  statut_article: string;
}

export async function GET() {
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
    .select("id, actif, statut_compte, pressing_id")
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

  // --- Tentative 1 : requête avec colonnes casier (migration 015 appliquée) ---
  // On sélectionne tous les articles avec zone_stockage non-null, en joinant
  // la commande + client + personnel qui a rangé. RLS isole par pressing.
  const { data: articlesRiche, error: errRiche } = await supabase
    .from("articles_vetements")
    .select(
      `id,
       zone_stockage,
       date_rangeement,
       statut,
       catalogue_article_id,
       ligne_id,
       commande:commandes(
         id,
         numero_commande,
         client:clients(nom_complet, telephone)
       ),
       range_par:personnel!articles_vetements_rangee_par_fkey(nom_complet),
       ligne:commande_lignes(description)`
    )
    .not("zone_stockage", "is", null)
    .order("zone_stockage", { ascending: true })
    .limit(500);

  if (errRiche) {
    // La colonne zone_stockage n'existe probablement pas (migration 015
    // non appliquée). On renvoie une réponse gracieuse indiquant que la
    // fonctionnalité n'est pas encore active.
    console.warn(
      "[api/admin/casiers] Requête riche échouée (migration 015 non appliquée ?) :",
      errRiche.message
    );
    return NextResponse.json({
      success: true,
      data: {
        occupees: [],
        libres: [],
        total_occupees: 0,
        total_libres: 0,
        migration_appliquee: false,
        plan_defaut: PLAN_CASIERS_DEFAUT,
      },
    });
  }

  // --- Construction de la liste des casiers occupés ---
  const occupees: CasierOccupe[] = (articlesRiche ?? []).map((row) => {
    const r = row as unknown as {
      id: string;
      zone_stockage: string;
      date_rangeement: string | null;
      statut: string;
      catalogue_article_id: string | null;
      ligne_id: string | null;
      commande: {
        id: string;
        numero_commande: string;
        client: { nom_complet: string; telephone: string } | null;
      } | null;
      range_par: { nom_complet: string } | null;
      ligne: { description: string | null } | null;
    };
    return {
      zone_stockage: r.zone_stockage,
      article_id: r.id,
      article_description: r.ligne?.description ?? "—",
      commande_id: r.commande?.id ?? "",
      commande_numero: r.commande?.numero_commande ?? "—",
      client_nom: r.commande?.client?.nom_complet ?? null,
      client_telephone: r.commande?.client?.telephone ?? null,
      date_rangeement: r.date_rangeement,
      range_par_nom: r.range_par?.nom_complet ?? null,
      statut_article: r.statut,
    };
  });

  // --- Calcul des casiers libres (plan par défaut - occupés) ---
  const occupeSet = new Set(occupees.map((c) => c.zone_stockage));
  const libres = PLAN_CASIERS_DEFAUT.filter((c) => !occupeSet.has(c));

  // On inclut aussi dans `occupees` les casiers personnalisés qui ne sont
  // pas dans le plan par défaut (ex: "E5" si l'utilisateur a saisi un code
  // hors plan). Ils sont juste affichés comme occupés sans être dans `libres`.

  return NextResponse.json({
    success: true,
    data: {
      occupees,
      libres,
      total_occupees: occupees.length,
      total_libres: libres.length,
      migration_appliquee: true,
      plan_defaut: PLAN_CASIERS_DEFAUT,
    },
  });
}
