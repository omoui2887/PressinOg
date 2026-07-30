/**
 * OgPressing — /personnel/manager/commandes/{id} (MGR-1)
 * ------------------------------------------------------
 * Page de détail d'une commande — variante "manager" de la page
 * admin /admin/commandes/{id}.
 *
 * Server Component qui fetch les données de la commande (RLS isole par
 * pressing_id) et délègue le rendu interactif au Client Component
 * <CommandeDetail basePath="/personnel/manager" />.
 *
 * `basePath` est transmis pour que :
 *   - le bouton "Retour aux commandes" pointe vers
 *     /personnel/manager/commandes
 *   - les liens internes (impression, étiquettes, fiche client) restent
 *     cohérents avec la variante manager
 *
 * 🔒 SÉCURITÉ : le layout (personnel)/layout.tsx vérifie déjà l'auth + le
 *    rôle. La SELECT Supabase est protégée par RLS : si la commande n'existe
 *    pas ou n'appartient pas au pressing, on renvoie null → page 404 FR.
 *
 *    ⚠️ Note sur les mutations : le manager a les memes permissions que
 *       l'admin sur les APIs (helper getConnectedPersonnel(allowWrite=true)
 *       accepte le manager). Il peut donc mettre à jour le statut des
 *       articles, enregistrer des paiements, etc.
 */
import Link from "next/link";
import { ArrowLeft, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getSupabaseServer } from "@/lib/supabase/server";
import { CommandeDetail } from "@/components/ogpressing/admin/commandes/commande-detail";
import type { CommandeDetail as CommandeDetailData } from "@/components/ogpressing/admin/commandes/commande-print";

export const dynamic = "force-dynamic";

const BASE_PATH = "/personnel/manager";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ManagerCommandeDetailPage({
  params,
}: PageProps) {
  const { id: commandeId } = await params;
  const supabase = await getSupabaseServer();

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
    console.error("[personnel/manager/commandes/[id]] Erreur SELECT:", cmdErr);
  }

  if (!commande) {
    return (
      <div className="mx-auto max-w-2xl space-y-5">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`${BASE_PATH}/commandes`}>
            <ArrowLeft className="size-4" />
            Retour aux commandes
          </Link>
        </Button>
        <Card>
          <CardContent className="flex flex-col items-center py-16 text-center">
            <AlertCircle className="size-12 text-muted-foreground" />
            <h1 className="mt-3 text-xl font-bold text-foreground">
              Commande introuvable
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Cette commande n&apos;existe pas ou n&apos;appartient pas à votre
              pressing.
            </p>
            <Button asChild className="mt-4">
              <Link href={`${BASE_PATH}/commandes`}>Retour aux commandes</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Tri côté JS des relations imbriquées (PostgREST ne peut pas toujours
  // appliquer .order sur les nested tables via le select string).
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

  const lignes =
    (commande.lignes as unknown as LigneRow[] | null) ?? [];
  const articles =
    (commande.articles as unknown as ArticleRow[] | null) ?? [];
  const paiements =
    (commande.paiements as unknown as PaiementRow[] | null) ?? [];

  lignes.sort(
    (a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  articles.sort(
    (a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  paiements.sort(
    (a, b) =>
      new Date(b.date_paiement).getTime() -
      new Date(a.date_paiement).getTime()
  );

  const detail: CommandeDetailData = {
    ...(commande as unknown as Omit<
      CommandeDetailData,
      "lignes" | "articles" | "paiements"
    >),
    lignes,
    articles,
    paiements,
  };

  return <CommandeDetail commande={detail} basePath={BASE_PATH} />;
}
