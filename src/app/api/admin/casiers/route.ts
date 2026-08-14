/**
 * e-pressing — API /api/admin/casiers (GET) — Système de casiers uniques
 * ---------------------------------------------------------------------
 * Liste les casiers du pressing connecté avec leur état (libre/occupé).
 *
 * Le frontend ne fait qu'AFFICHER les disponibilités — il ne peut PAS
 * assigner/libérer directement (ça passe par POST/DELETE /assign qui
 * appellent la RPC atomique).
 *
 * Query params :
 *   - search  : filtre par code de casier (ex: "A1") ou nom de client
 *   - statut  : "libre" | "occupe" | "tous" (défaut: "tous")
 *   - zone    : filtre par zone (ex: "A")
 *
 * Réponse :
 *   {
 *     success: true,
 *     data: {
 *       casiers: CasierAvecEtat[],     // liste avec état libre/occupé
 *       total: number,
 *       total_libres: number,
 *       total_occupes: number,
 *       taux_occupation: number,       // 0-100
 *       zones: string[]                // zones disponibles (ex: ["A","B","C","D"])
 *     }
 *   }
 *
 * 🔒 SÉCURITÉ :
 *   - getSupabaseServer() (anon + JWT) → RLS `isolation_pressing`.
 *   - Auth : n'importe quel personnel actif (CAN_VOIR_CASIERS).
 *   - 401 si non authentifié, 403 si personnel inactif.
 *
 * 🗄️ ROBUSTESSE :
 *   - Si la migration 039 n'est pas appliquée (table `casiers` absente),
 *     l'API renvoie une réponse gracieuse avec `migration_appliquee: false`.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  CAN_VOIR_CASIERS,
  getCurrentPersonnel,
  hasRole,
  isPersonnelActive,
} from "@/lib/auth/roles";

export const dynamic = "force-dynamic";

interface CasierAvecEtat {
  id: string;
  code: string;
  zone: string | null;
  actif: boolean;
  occupe: boolean;
  // Si occupé :
  article_id?: string;
  article_description?: string | null;
  commande_id?: string;
  commande_numero?: string | null;
  client_nom?: string | null;
  client_telephone?: string | null;
  date_rangeement?: string | null;
  range_par_nom?: string | null;
  statut_article?: string | null;
  affectation_id?: string;
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
  if (!hasRole(me, CAN_VOIR_CASIERS)) {
    return NextResponse.json(
      { success: false, error: "Accès refusé — rôle insuffisant" },
      { status: 403 }
    );
  }

  // --- Parse query params ---
  const { searchParams } = new URL(request.url);
  const search = (searchParams.get("search") ?? "").trim().toLowerCase();
  const statutFiltre = (searchParams.get("statut") ?? "tous").toLowerCase();
  const zoneFiltre = (searchParams.get("zone") ?? "").trim().toUpperCase();

  // --- Tentative : requête sur la table `casiers` (migration 039) ---
  // On fetch tous les casiers du pressing + LEFT JOIN l'affectation active +
  // l'article + la commande + le client + le personnel.
  const { data: casiersData, error: casiersErr } = await supabase
    .from("casiers")
    .select(
      `id,
       code,
       zone,
       actif,
       casier_affectations!left(
         id,
         statut,
         affecte_le,
         affecte_par,
         article:articles_vetements(
           id,
           statut,
           zone_stockage,
           date_rangeement,
           ligne:commande_lignes(description),
           commande:commandes(
             id,
             numero_commande,
             client:clients(nom_complet, telephone)
           ),
           range_par:personnel!articles_vetements_rangee_par_fkey(nom_complet)
         )
       )`
    )
    .eq("pressing_id", me.pressing_id)
    .order("code", { ascending: true })
    .limit(500);

  if (casiersErr) {
    // La table `casiers` n'existe probablement pas (migration 039 non appliquée).
    console.warn(
      "[api/admin/casiers] Table `casiers` introuvable (migration 039 non appliquée ?) :",
      casiersErr.message
    );
    return NextResponse.json({
      success: true,
      data: {
        casiers: [],
        total: 0,
        total_libres: 0,
        total_occupes: 0,
        taux_occupation: 0,
        zones: [],
        migration_appliquee: false,
      },
    });
  }

  // --- Construction de la liste avec état libre/occupé ---
  const casiers: CasierAvecEtat[] = (casiersData ?? []).map((row) => {
    const r = row as unknown as {
      id: string;
      code: string;
      zone: string | null;
      actif: boolean;
      casier_affectations: Array<{
        id: string;
        statut: string;
        affecte_le: string;
        affecte_par: string | null;
        article: {
          id: string;
          statut: string;
          zone_stockage: string | null;
          date_rangeement: string | null;
          ligne: { description: string | null } | null;
          commande: {
            id: string;
            numero_commande: string;
            client: { nom_complet: string; telephone: string } | null;
          } | null;
          range_par: { nom_complet: string } | null;
        } | null;
      }> | null;
    };

    // Trouve l'affectation active (statut='actif')
    const activeAff = (r.casier_affectations ?? []).find(
      (a) => a.statut === "actif"
    );

    const occupe = !!activeAff?.article;
    const art = activeAff?.article;

    return {
      id: r.id,
      code: r.code,
      zone: r.zone,
      actif: r.actif,
      occupe,
      article_id: art?.id,
      article_description: art?.ligne?.description ?? null,
      commande_id: art?.commande?.id,
      commande_numero: art?.commande?.numero_commande,
      client_nom: art?.commande?.client?.nom_complet ?? null,
      client_telephone: art?.commande?.client?.telephone ?? null,
      date_rangeement: art?.date_rangeement ?? activeAff?.affecte_le ?? null,
      range_par_nom: art?.range_par?.nom_complet ?? null,
      statut_article: art?.statut,
      affectation_id: activeAff?.id,
    };
  });

  // --- Filtrage côté TS (search, statut, zone) ---
  let filtered = casiers;

  if (zoneFiltre) {
    filtered = filtered.filter((c) => c.zone === zoneFiltre);
  }

  if (statutFiltre === "libre") {
    filtered = filtered.filter((c) => !c.occupe && c.actif);
  } else if (statutFiltre === "occupe") {
    filtered = filtered.filter((c) => c.occupe);
  }

  if (search) {
    filtered = filtered.filter(
      (c) =>
        c.code.toLowerCase().includes(search) ||
        (c.client_nom ?? "").toLowerCase().includes(search) ||
        (c.commande_numero ?? "").toLowerCase().includes(search) ||
        (c.article_description ?? "").toLowerCase().includes(search)
    );
  }

  // --- Stats ---
  const total = casiers.length;
  const totalOccupes = casiers.filter((c) => c.occupe).length;
  const totalLibres = casiers.filter((c) => !c.occupe && c.actif).length;
  const tauxOccupation = total > 0 ? Math.round((totalOccupes / total) * 100) : 0;
  const zones = [...new Set(casiers.map((c) => c.zone).filter(Boolean))] as string[];

  return NextResponse.json({
    success: true,
    data: {
      casiers: filtered,
      total,
      total_libres: totalLibres,
      total_occupes: totalOccupes,
      taux_occupation: tauxOccupation,
      zones,
      migration_appliquee: true,
    },
  });
}
