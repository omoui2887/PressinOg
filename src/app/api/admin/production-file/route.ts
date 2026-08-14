/**
 * e-pressing — API /api/admin/production-file
 * -------------------------------------------
 * GET : Vue "File de production" pour le manager — tous les articles non
 *       terminaux du pressing, avec leur statut d'assignation, regroupés
 *       par statut_assignation (non_assigne / assigne / en_cours / termine)
 *       et par employé.
 *
 * Paramètres query :
 *   - filtre     : 'non_assignes' | 'assignes' | 'en_cours' | 'termines'
 *                  | 'par_employe' | 'tous' (défaut 'tous')
 *   - employe_id : (avec filtre=par_employe) filtre par personnel_id
 *   - q          : recherche par numero_commande ou nom client
 *
 * Réponse :
 *   {
 *     success: true,
 *     data: ProductionFileItem[],
 *     counters: { non_assignes, assignes, en_cours, termines, total },
 *     par_employe: [{ personnel_id, nom_complet, role, count }, ...]
 *   }
 *
 * 🔒 SÉCURITÉ : manager only. RLS isole par pressing_id (via la vue
 *    production_file qui JOIN commandes → pressing_id).
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  getCurrentPersonnel,
  isPersonnelActive,
  hasRole,
  CAN_ASSIGNER_ARTICLES,
} from "@/lib/auth/roles";

export const dynamic = "force-dynamic";

interface ProductionFileItem {
  article_id: string;
  commande_id: string;
  pressing_id: string;
  numero_commande: string;
  commande_statut: string;
  date_reception: string | null;
  priorite: string | null;
  client_nom: string | null;
  client_telephone: string | null;
  article_statut: string;
  code_qr: string | null;
  assigne_a: string | null;
  assigne_nom: string | null;
  assigne_role: string | null;
  assigne_le: string | null;
  assigne_par: string | null;
  started_at: string | null;
  completed_at: string | null;
  zone_stockage: string | null;
  statut_assignation: string;
}

interface Counters {
  non_assignes: number;
  assignes: number;
  en_cours: number;
  termines: number;
  total: number;
}

interface ParEmployeItem {
  personnel_id: string;
  nom_complet: string;
  role: string;
  count: number;
}

export async function GET(request: NextRequest) {
  const supabase = await getSupabaseServer();
  const me = await getCurrentPersonnel(supabase);

  if (!me) {
    return NextResponse.json(
      { success: false, error: "Non authentifié" },
      { status: 401 }
    );
  }
  if (!isPersonnelActive(me)) {
    return NextResponse.json(
      { success: false, error: "Accès refusé — compte inactif" },
      { status: 403 }
    );
  }
  if (!hasRole(me, CAN_ASSIGNER_ARTICLES)) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Accès refusé — seul un manager peut consulter la file de production.",
      },
      { status: 403 }
    );
  }

  const sp = request.nextUrl.searchParams;
  const filtre = sp.get("filtre") || "tous";
  const employeId = sp.get("employe_id") || "";
  const q = (sp.get("q") || "").trim();

  // Tente d'utiliser la vue production_file (migration 037). Si elle
  // n'existe pas (migration non appliquée), on retombe sur une requête
  // manuelle équivalente.
  let query = supabase
    .from("production_file")
    .select("*")
    .eq("pressing_id", me.pressing_id);

  if (q) {
    const safeQ = q.replace(/%/g, "\\%").replace(/_/g, "\\_");
    query = query.or(
      `numero_commande.ilike.%${safeQ}%,client_nom.ilike.%${safeQ}%`
    );
  }

  if (filtre === "non_assignes") {
    query = query.eq("statut_assignation", "non_assigne");
  } else if (filtre === "assignes") {
    query = query.eq("statut_assignation", "assigne");
  } else if (filtre === "en_cours") {
    query = query.eq("statut_assignation", "en_cours");
  } else if (filtre === "termines") {
    query = query.eq("statut_assignation", "termine");
  } else if (filtre === "par_employe" && employeId) {
    query = query.eq("assigne_a", employeId);
  }

  query = query.order("date_reception", { ascending: false, nullsFirst: false });

  const { data, error } = await query;

  if (error) {
    // La vue production_file n'existe peut-être pas (migration 037 non
    // appliquée). On retombe sur une requête manuelle.
    console.warn(
      "[api/admin/production-file] Vue production_file indisponible, fallback manuel:",
      error.message
    );
    return await fallbackManualQuery(supabase, me.pressing_id, filtre, employeId, q);
  }

  const items = (data ?? []) as ProductionFileItem[];

  // Calcul des compteurs (sur TOUS les articles du pressing, pas seulement
  // la page filtrée) — on fait une 2e requête sans filtre de statut_assignation.
  const { data: allItems, error: allErr } = await supabase
    .from("production_file")
    .select("statut_assignation")
    .eq("pressing_id", me.pressing_id);

  const counters: Counters = {
    non_assignes: 0,
    assignes: 0,
    en_cours: 0,
    termines: 0,
    total: 0,
  };

  if (!allErr && allItems) {
    for (const it of allItems as Pick<ProductionFileItem, "statut_assignation">[]) {
      counters.total++;
      if (it.statut_assignation === "non_assigne") counters.non_assignes++;
      else if (it.statut_assignation === "assigne") counters.assignes++;
      else if (it.statut_assignation === "en_cours") counters.en_cours++;
      else if (it.statut_assignation === "termine") counters.termines++;
    }
  }

  // Regroupement par employé (pour la vue "par employé")
  const parEmployeMap = new Map<string, ParEmployeItem>();
  for (const it of items) {
    if (!it.assigne_a) continue;
    if (!parEmployeMap.has(it.assigne_a)) {
      parEmployeMap.set(it.assigne_a, {
        personnel_id: it.assigne_a,
        nom_complet: it.assigne_nom ?? "—",
        role: it.assigne_role ?? "—",
        count: 0,
      });
    }
    parEmployeMap.get(it.assigne_a)!.count++;
  }

  return NextResponse.json({
    success: true,
    data: items,
    counters,
    par_employe: [...parEmployeMap.values()].sort(
      (a, b) => b.count - a.count
    ),
  });
}

/* -------------------------------------------------------------------------- */
/*  Fallback manuel (si la vue production_file n'existe pas)                   */
/* -------------------------------------------------------------------------- */

async function fallbackManualQuery(
  supabase: Awaited<ReturnType<typeof getSupabaseServer>>,
  pressingId: string,
  filtre: string,
  employeId: string,
  q: string
) {
  // Requête manuelle équivalente à la vue production_file.
  // On sélectionne les articles + JOIN commande + client + personnel assigné.
  let query = supabase
    .from("articles_vetements")
    .select(
      `id, commande_id, statut, code_qr, assigne_a, assigne_le, assigne_par,
       started_at, completed_at, zone_stockage,
       commande:commandes(id, numero_commande, statut, date_reception, priorite, pressing_id,
         client:clients(nom_complet, telephone)),
       assigne:personnel!articles_vetements_assigne_a_fkey(nom_complet, role)`
    )
    .neq("statut", "retire")
    .neq("statut", "livre")
    .eq("commande.pressing_id", pressingId);

  // Note : le filtre .eq("commande.pressing_id", ...) peut ne pas être
  // supporté par PostgREST sur un nested embed. RLS isole déjà par pressing,
  // donc on peut retirer ce filtre si nécessaire. On le garde pour défense.

  const { data, error } = await query;

  if (error) {
    console.error(
      "[api/admin/production-file] Fallback manuel aussi échoué:",
      error.message
    );
    return NextResponse.json(
      {
        success: false,
        error: "Erreur lors de la récupération de la file de production.",
      },
      { status: 500 }
    );
  }

  // Transformer en ProductionFileItem[]
  // PostgREST renvoie les relations imbriquées sous forme de tableaux
  // (même pour les relations 1-1) quand aucun hint de FK n'est fourni.
  // On gère donc les deux formes (tableau ou objet unique) défensivement.
  type RawRow = {
    id: string;
    commande_id: string;
    statut: string;
    code_qr: string | null;
    assigne_a: string | null;
    assigne_le: string | null;
    assigne_par: string | null;
    started_at: string | null;
    completed_at: string | null;
    zone_stockage: string | null;
    commande:
      | {
          id: string;
          numero_commande: string;
          statut: string;
          date_reception: string | null;
          priorite: string | null;
          pressing_id: string;
          client:
            | { nom_complet: string | null; telephone: string | null }[]
            | { nom_complet: string | null; telephone: string | null }
            | null;
        }
      | {
          id: string;
          numero_commande: string;
          statut: string;
          date_reception: string | null;
          priorite: string | null;
          pressing_id: string;
          client:
            | { nom_complet: string | null; telephone: string | null }[]
            | { nom_complet: string | null; telephone: string | null }
            | null;
        }[]
      | null;
    assigne:
      | { nom_complet: string; role: string }
      | { nom_complet: string; role: string }[]
      | null;
  };

  // Helper pour extraire le premier élément d'une relation qui peut être
  // un tableau ou un objet unique.
  function first<T>(v: T | T[] | null | undefined): T | null {
    if (v == null) return null;
    if (Array.isArray(v)) return (v[0] as T) ?? null;
    return v as T;
  }

  const items: ProductionFileItem[] = ((data ?? []) as unknown as RawRow[]).map(
    (r) => {
      const cmd = first(r.commande);
      const client = first(cmd?.client ?? null);
      const assigne = first(r.assigne);
      const statutAssign = !r.assigne_a
        ? "non_assigne"
        : r.completed_at
        ? "termine"
        : r.started_at
        ? "en_cours"
        : "assigne";
      return {
        article_id: r.id,
        commande_id: r.commande_id,
        pressing_id: cmd?.pressing_id ?? "",
        numero_commande: cmd?.numero_commande ?? "",
        commande_statut: cmd?.statut ?? "",
        date_reception: cmd?.date_reception ?? null,
        priorite: cmd?.priorite ?? null,
        client_nom: client?.nom_complet ?? null,
        client_telephone: client?.telephone ?? null,
        article_statut: r.statut,
        code_qr: r.code_qr,
        assigne_a: r.assigne_a,
        assigne_nom: assigne?.nom_complet ?? null,
        assigne_role: assigne?.role ?? null,
        assigne_le: r.assigne_le,
        assigne_par: r.assigne_par,
        started_at: r.started_at,
        completed_at: r.completed_at,
        zone_stockage: r.zone_stockage,
        statut_assignation: statutAssign,
      };
    }
  );

  // Filtrer par q
  let filtered = items;
  if (q) {
    const ql = q.toLowerCase();
    filtered = filtered.filter(
      (it) =>
        it.numero_commande.toLowerCase().includes(ql) ||
        (it.client_nom?.toLowerCase().includes(ql) ?? false)
    );
  }

  // Filtrer par statut_assignation
  if (filtre === "non_assignes") {
    filtered = filtered.filter((i) => i.statut_assignation === "non_assigne");
  } else if (filtre === "assignes") {
    filtered = filtered.filter((i) => i.statut_assignation === "assigne");
  } else if (filtre === "en_cours") {
    filtered = filtered.filter((i) => i.statut_assignation === "en_cours");
  } else if (filtre === "termines") {
    filtered = filtered.filter((i) => i.statut_assignation === "termine");
  } else if (filtre === "par_employe" && employeId) {
    filtered = filtered.filter((i) => i.assigne_a === employeId);
  }

  filtered.sort((a, b) => {
    const da = a.date_reception ? new Date(a.date_reception).getTime() : 0;
    const db = b.date_reception ? new Date(b.date_reception).getTime() : 0;
    return db - da;
  });

  // Compteurs globaux (sur TOUS les articles, pas le filtre)
  const counters: Counters = {
    non_assignes: 0,
    assignes: 0,
    en_cours: 0,
    termines: 0,
    total: items.length,
  };
  for (const it of items) {
    if (it.statut_assignation === "non_assigne") counters.non_assignes++;
    else if (it.statut_assignation === "assigne") counters.assignes++;
    else if (it.statut_assignation === "en_cours") counters.en_cours++;
    else if (it.statut_assignation === "termine") counters.termines++;
  }

  // Par employé
  const parEmployeMap = new Map<string, ParEmployeItem>();
  for (const it of items) {
    if (!it.assigne_a) continue;
    if (!parEmployeMap.has(it.assigne_a)) {
      parEmployeMap.set(it.assigne_a, {
        personnel_id: it.assigne_a,
        nom_complet: it.assigne_nom ?? "—",
        role: it.assigne_role ?? "—",
        count: 0,
      });
    }
    parEmployeMap.get(it.assigne_a)!.count++;
  }

  return NextResponse.json({
    success: true,
    data: filtered,
    counters,
    par_employe: [...parEmployeMap.values()].sort((a, b) => b.count - a.count),
  });
}
