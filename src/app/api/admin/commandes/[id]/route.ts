/**
 * OgPressing — API /api/admin/commandes/[id] (GET detail)
 * --------------------------------------------------------
 * LOT 7 — détail complet d'une commande pour la page de suivi/détail :
 *   - champs de la commande
 *   - client (clients) imbriqué
 *   - cree_par_personnel (personnel!commandes_cree_par_fkey)
 *   - lignes (commande_lignes) avec service imbriqué, ordonnées par created_at ASC
 *   - articles (articles_vetements) avec assigne imbriqué, ordonnés par created_at ASC
 *   - paiements ordonnés par date_paiement DESC
 *
 * Réponse :
 *   { success: true, data: CommandeDetail }
 *
 * 🔒 SÉCURITÉ :
 *   - getSupabaseServer() (client anon + JWT) → RLS `isolation_pressing`
 *     isole par pressing_id. Si la commande n'existe pas ou n'appartient pas
 *     au pressing, la SELECT renvoie null → 404.
 *   - Auth : n'importe quel personnel actif.
 *   - 401 si non authentifié, 403 si personnel inactif, 404 si commande
 *     introuvable.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

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

  const { id: commandeId } = await params;

  // Récupère la commande avec toutes ses relations (RLS isole par pressing)
  const { data: commande, error: cmdErr } = await supabase
    .from("commandes")
    .select(
      `
      id,
      pressing_id,
      numero_commande,
      statut,
      statut_paiement,
      montant_total,
      montant_paye,
      remise_type,
      remise_valeur,
      montant_total_avant_remise,
      montant_remise,
      date_reception,
      date_pret_prevue,
      date_pret_reel,
      date_livraison,
      date_retrait,
      livraison,
      adresse_livraison,
      frais_livraison,
      notes,
      cree_par,
      created_at,
      updated_at,
      client:clients(id, nom_complet, telephone, email, adresse, points_fidelite),
      cree_par_personnel:personnel!commandes_cree_par_fkey(id, nom_complet),
      lignes:commande_lignes(id, service_id, type_vetement, description, quantite, prix_unitaire, montant_ligne, created_at, service:services(id, nom, type)),
      articles:articles_vetements(id, ligne_id, code_qr, type_vetement, couleur, couleur_libre, etat, description_etat, statut, photo_url, assigne_a, created_at, assigne:personnel!articles_vetements_assigne_a_fkey(id, nom_complet)),
      paiements:paiements(id, montant, methode, reference, date_paiement, est_acompte, enregistre_par, notes, created_at)
      `
    )
    .eq("id", commandeId)
    .maybeSingle();

  if (cmdErr) {
    console.error("[api/admin/commandes/[id]] Erreur SELECT:", cmdErr);
    return NextResponse.json(
      { success: false, error: "Erreur lors de la récupération de la commande" },
      { status: 500 }
    );
  }

  if (!commande) {
    return NextResponse.json(
      { success: false, error: "Commande introuvable" },
      { status: 404 }
    );
  }

  // Trie les relations imbriquées (PostgREST ne peut pas toujours appliquer
  // .order sur les nested tables via le select string, on trie côté JS).
  type ArticleRow = {
    id: string;
    ligne_id: string | null;
    code_qr: string | null;
    type_vetement: string | null;
    couleur: string | null;
    couleur_libre: string | null;
    etat: string | null;
    description_etat: string | null;
    statut: string;
    photo_url: string | null;
    assigne_a: string | null;
    created_at: string;
    assigne: { id: string; nom_complet: string } | null;
  };

  type LigneRow = {
    id: string;
    service_id: string | null;
    type_vetement: string | null;
    description: string | null;
    quantite: number;
    prix_unitaire: number;
    montant_ligne: number;
    created_at: string;
    service: { id: string; nom: string; type: string | null } | null;
  };

  type PaiementRow = {
    id: string;
    montant: number;
    methode: string;
    reference: string | null;
    date_paiement: string;
    est_acompte: boolean;
    enregistre_par: string | null;
    notes: string | null;
    created_at: string;
  };

  const lignes = (commande.lignes as unknown as LigneRow[] | null) ?? [];
  const articles = (commande.articles as unknown as ArticleRow[] | null) ?? [];
  const paiements =
    (commande.paiements as unknown as PaiementRow[] | null) ?? [];

  // Tri : lignes/articles par created_at ASC, paiements par date_paiement DESC
  lignes.sort((a, b) => {
    return (
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
  });
  articles.sort((a, b) => {
    return (
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
  });
  paiements.sort((a, b) => {
    return (
      new Date(b.date_paiement).getTime() -
      new Date(a.date_paiement).getTime()
    );
  });

  return NextResponse.json({
    success: true,
    data: {
      ...commande,
      lignes,
      articles,
      paiements,
    },
  });
}
