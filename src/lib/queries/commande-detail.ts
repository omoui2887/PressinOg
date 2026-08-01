/**
 * OgPressing — Requête partagée pour le détail d'une commande
 * ============================================================
 * Utilisée par les 3 pages Server Component :
 *   - /(admin)/admin/commandes/[id]
 *   - /(personnel)/personnel/manager/commandes/[id]
 *   - /(personnel)/personnel/receptionniste/commandes/[id]
 *
 * 🔧 ROBUSTESSE — gestion de la migration LOT 15 incomplète :
 * La migration 014_lot15_catalogue_articles.sql effectue 3 opérations
 * distinctes (renommage type_vetement → type_vetement_legacy, ajout de
 * catalogue_article_id, création de la FK). Selon l'état d'application
 * de la migration sur la base de production, certaines colonnes/contraintes
 * peuvent exister ou non.
 *
 * Stratégie : on essaie d'abord la requête « riche » (avec JOIN
 * catalogue_articles pour le nom lisible). Si elle échoue (erreur
 * PostgREST sur colonne ou contrainte manquante), on retombe sur une
 * requête « minimale » qui ne sélectionne que les colonnes garanties
 * d'exister (description + champs de base). Le nom de l'article est
 * alors dérivé du champ `description` de commande_lignes.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

// Colonnes communes de la table `commandes` (garanties d'exister)
const COMMANDE_BASE = `
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
  paiements:paiements(id, montant, methode, reference, date_paiement, est_acompte, enregistre_par, notes, created_at)
`;

// Relations imbriquées pour les lignes et articles — version « riche »
// avec JOIN catalogue_articles. Pas de hint de FK (PostgREST auto-résout
// si une seule FK existe entre les deux tables).
// Inclut les colonnes de casier (zone_stockage, date_rangeement, rangee_par)
// ajoutées par la migration 015_casiers_stockage.sql.
const LIGNES_RICHES = `lignes:commande_lignes(id, service_id, description, quantite, prix_unitaire, montant_ligne, created_at, service:services(id, nom, type))`;

const ARTICLES_RICHES = `articles:articles_vetements(id, ligne_id, code_qr, catalogue_article_id, couleur, couleur_libre, etat, description_etat, statut, photo_url, assigne_a, zone_stockage, date_rangeement, rangee_par, created_at, catalogue_article:catalogue_articles(id, nom, slug, icone_url), assigne:personnel!articles_vetements_assigne_a_fkey(id, nom_complet), range_par:personnel!articles_vetements_rangee_par_fkey(id, nom_complet))`;

// Version « minimale » — sans le JOIN catalogue_articles (garanti de
// fonctionner même si la FK n'existe pas). Inclut les colonnes de casier.
const LIGNES_MINIMAL = `lignes:commande_lignes(id, service_id, description, quantite, prix_unitaire, montant_ligne, created_at, service:services(id, nom, type))`;

const ARTICLES_MINIMAL = `articles:articles_vetements(id, ligne_id, code_qr, catalogue_article_id, couleur, couleur_libre, etat, description_etat, statut, photo_url, assigne_a, zone_stockage, date_rangeement, rangee_par, created_at, assigne:personnel!articles_vetements_assigne_a_fkey(id, nom_complet), range_par:personnel!articles_vetements_rangee_par_fkey(id, nom_complet))`;

// Version « ultra-minimale » — sans les colonnes de casier (migration 015
// non appliquée). Garanti de fonctionner sur toutes les versions de DB.
const ARTICLES_ULTRA_MINIMAL = `articles:articles_vetements(id, ligne_id, code_qr, catalogue_article_id, couleur, couleur_libre, etat, description_etat, statut, photo_url, assigne_a, created_at, assigne:personnel!articles_vetements_assigne_a_fkey(id, nom_complet))`;

export interface CommandeDetailResult {
  /** La commande si trouvée, null sinon. */
  commande: Record<string, unknown> | null;
  /** Erreur si la requête a échoué (utile pour diagnostiquer). */
  error: string | null;
}

/**
 * Récupère le détail complet d'une commande avec fallback robuste.
 *
 * @param supabase Client Supabase côté serveur (RLS isole par pressing).
 * @param commandeId UUID de la commande.
 * @returns `{ commande, error }` — si `error` est non-null, la requête
 *          a échoué pour une raison technique (colonne/contrainte
 *          manquante, erreur réseau, etc.). Si `commande` est null sans
 *          erreur, la commande n'existe pas ou n'appartient pas au
 *          pressing (RLS).
 */
export async function fetchCommandeDetail(
  supabase: SupabaseClient,
  commandeId: string
): Promise<CommandeDetailResult> {
  // --- Tentative 1 : requête riche (avec JOIN catalogue_articles) ---
  const { data: commandeRiche, error: errRiche } = await supabase
    .from("commandes")
    .select(
      `${COMMANDE_BASE},
      ${LIGNES_RICHES},
      ${ARTICLES_RICHES}`
    )
    .eq("id", commandeId)
    .maybeSingle();

  if (!errRiche && commandeRiche) {
    return { commande: commandeRiche, error: null };
  }

  // Si la requête riche a réussi mais n'a rien trouvé (commande=null),
  // c'est que la commande n'existe pas ou RLS la masque. Pas besoin de
  // retenter la minimale.
  if (!errRiche && !commandeRiche) {
    return { commande: null, error: null };
  }

  // --- Tentative 2 : requête minimale (sans JOIN catalogue_articles) ---
  // La tentative 1 a produit une erreur PostgREST — probablement une
  // colonne `type_vetement_legacy` manquante ou une FK non résolvable.
  // On retente avec les colonnes de base uniquement + colonnes casier.
  console.warn(
    "[fetchCommandeDetail] Requête riche échouée, fallback minimal:",
    errRiche?.message ?? errRiche
  );

  const { data: commandeMin, error: errMin } = await supabase
    .from("commandes")
    .select(
      `${COMMANDE_BASE},
      ${LIGNES_MINIMAL},
      ${ARTICLES_MINIMAL}`
    )
    .eq("id", commandeId)
    .maybeSingle();

  if (!errMin && commandeMin) {
    return { commande: commandeMin, error: null };
  }

  if (!errMin && !commandeMin) {
    // La commande n'existe pas ou RLS la masque.
    return { commande: null, error: null };
  }

  // --- Tentative 3 : requête ultra-minimale (sans colonnes de casier) ---
  // La tentative 2 a échoué — probablement parce que la migration 015
  // (colonnes zone_stockage / date_rangeement / rangee_par) n'a pas été
  // appliquée. On retente sans ces colonnes.
  console.warn(
    "[fetchCommandeDetail] Requête minimale échouée, fallback ultra-minimal:",
    errMin?.message ?? errMin
  );

  const { data: commandeUltra, error: errUltra } = await supabase
    .from("commandes")
    .select(
      `${COMMANDE_BASE},
      ${LIGNES_MINIMAL},
      ${ARTICLES_ULTRA_MINIMAL}`
    )
    .eq("id", commandeId)
    .maybeSingle();

  if (errUltra) {
    console.error(
      "[fetchCommandeDetail] Requête ultra-minimale aussi échouée:",
      errUltra
    );
    return { commande: null, error: errUltra.message ?? String(errUltra) };
  }

  return { commande: commandeUltra, error: null };
}
