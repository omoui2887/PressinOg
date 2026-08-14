/**
 * e-pressing — API /api/admin/casiers/[id]/historique (GET)
 * ---------------------------------------------------------
 * Retourne l'historique des affectations d'un casier (actives + libérées).
 *
 * [id] = code du casier (ex: "A1")
 *
 * Réponse :
 *   {
 *     success: true,
 *     data: {
 *       casier: { id, code, zone, actif },
 *       affectations: AffectationHistorique[]
 *     }
 *   }
 *
 * 🔒 SÉCURITÉ :
 *   - getSupabaseServer() (anon + JWT) → RLS.
 *   - Auth : CAN_VOIR_CASIERS (tous les rôles actifs).
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

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface AffectationHistorique {
  id: string;
  statut: string;
  affecte_le: string;
  libere_le: string | null;
  motif: string | null;
  article_id: string;
  article_description: string | null;
  commande_numero: string | null;
  client_nom: string | null;
  affecte_par_nom: string | null;
  libere_par_nom: string | null;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
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

  const { id: casierCode } = await params;
  const code = decodeURIComponent(casierCode);

  // --- Fetch le casier ---
  const { data: casier, error: casierErr } = await supabase
    .from("casiers")
    .select("id, code, zone, actif")
    .eq("pressing_id", me.pressing_id)
    .eq("code", code)
    .maybeSingle();

  if (casierErr) {
    console.error("[api/admin/casiers/[id]/historique] SELECT casier error:", casierErr);
    return NextResponse.json(
      { success: false, error: "Erreur interne du serveur" },
      { status: 500 }
    );
  }
  if (!casier) {
    return NextResponse.json(
      { success: false, error: "Casier introuvable." },
      { status: 404 }
    );
  }

  // --- Fetch l'historique des affectations ---
  const { data: affectations, error: affErr } = await supabase
    .from("casier_affectations")
    .select(
      `id,
       statut,
       affecte_le,
       libere_le,
       motif,
       article_id,
       affecte_par,
       libere_par,
       article:articles_vetements(
         ligne:commande_lignes(description),
         commande:commandes(
           numero_commande,
           client:clients(nom_complet)
         )
       ),
       affecte_par_personnel:personnel!casier_affectations_affecte_par_fkey(nom_complet),
       libere_par_personnel:personnel!casier_affectations_libere_par_fkey(nom_complet)`
    )
    .eq("casier_id", casier.id)
    .order("affecte_le", { ascending: false })
    .limit(100);

  if (affErr) {
    console.error("[api/admin/casiers/[id]/historique] SELECT affectations error:", affErr);
    return NextResponse.json(
      { success: false, error: "Erreur interne du serveur" },
      { status: 500 }
    );
  }

  const historique: AffectationHistorique[] = (affectations ?? []).map(
    (row) => {
      const r = row as unknown as {
        id: string;
        statut: string;
        affecte_le: string;
        libere_le: string | null;
        motif: string | null;
        article_id: string;
        article: {
          ligne: { description: string | null } | null;
          commande: {
            numero_commande: string;
            client: { nom_complet: string } | null;
          } | null;
        } | null;
        affecte_par_personnel: { nom_complet: string } | null;
        libere_par_personnel: { nom_complet: string } | null;
      };
      return {
        id: r.id,
        statut: r.statut,
        affecte_le: r.affecte_le,
        libere_le: r.libere_le,
        motif: r.motif,
        article_id: r.article_id,
        article_description: r.article?.ligne?.description ?? null,
        commande_numero: r.article?.commande?.numero_commande ?? null,
        client_nom: r.article?.commande?.client?.nom_complet ?? null,
        affecte_par_nom: r.affecte_par_personnel?.nom_complet ?? null,
        libere_par_nom: r.libere_par_personnel?.nom_complet ?? null,
      };
    }
  );

  return NextResponse.json({
    success: true,
    data: {
      casier,
      affectations: historique,
    },
  });
}
