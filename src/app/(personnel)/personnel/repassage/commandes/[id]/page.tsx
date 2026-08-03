/**
 * OgPressing — /personnel/repassage/commandes/{id} (REP-1)
 * --------------------------------------------------------
 * Page de détail d'une commande — variante "repassage" de la page
 * admin /admin/commandes/{id}.
 *
 * Server Component qui fetch les données de la commande (RLS isole par
 * pressing_id) et délègue le rendu interactif au Client Component
 * <CommandeDetail basePath="/personnel/repassage" />.
 *
 * `basePath` est transmis pour que :
 *   - le bouton "Retour aux commandes" pointe vers
 *     /personnel/repassage/commandes
 *   - les liens internes (impression, étiquettes, fiche client) restent
 *     cohérents avec la variante repassage
 *
 * 🔒 SÉCURITÉ : le layout (personnel)/layout.tsx vérifie déjà l'auth + le
 *    rôle (repassage uniquement sur /personnel/repassage/*). La SELECT
 *    Supabase est protégée par RLS : si la commande n'existe pas ou
 *    n'appartient pas au pressing, on renvoie null → page d'erreur FR.
 *
 *    ⚠️ Note sur les mutations : l'API PATCH /api/admin/commandes/[id]
 *       (statut d'article) accepte n'importe quel personnel actif du
 *       pressing. Le repassage peut donc mettre à jour le statut des
 *       articles (lave → repasse → pret) et assigner un casier de stockage.
 */
import Link from "next/link";
import { ArrowLeft, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getSupabaseServer } from "@/lib/supabase/server";
import { fetchCommandeDetail } from "@/lib/queries/commande-detail";
import { CommandeDetail } from "@/components/ogpressing/admin/commandes/commande-detail";
import type { CommandeDetail as CommandeDetailData } from "@/components/ogpressing/admin/commandes/commande-print";

export const dynamic = "force-dynamic";

const BASE_PATH = "/personnel/repassage";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function RepassageCommandeDetailPage({
  params,
}: PageProps) {
  const { id: commandeId } = await params;
  const supabase = await getSupabaseServer();

  const { commande, error } = await fetchCommandeDetail(supabase, commandeId);

  // Erreur technique (requête PostgREST échouée même après fallback)
  if (error) {
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
            <AlertCircle className="size-12 text-destructive" />
            <h1 className="mt-3 text-xl font-bold text-foreground">
              Erreur de chargement
            </h1>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              Impossible de charger cette commande. Erreur technique :
            </p>
            <p className="mt-2 max-w-md rounded bg-muted p-2 font-mono text-xs text-muted-foreground">
              {error}
            </p>
            <Button asChild className="mt-4">
              <Link href={`${BASE_PATH}/commandes`}>Retour aux commandes</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
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
    catalogue_article_id: string | null;
    couleur: string | null;
    couleur_libre: string | null;
    etat: string | null;
    description_etat: string | null;
    statut: string;
    photo_url: string | null;
    assigne_a: string | null;
    zone_stockage: string | null;
    date_rangeement: string | null;
    rangee_par: string | null;
    created_at: string;
    catalogue_article?: {
      id: string;
      nom: string;
      slug: string;
      icone_url: string | null;
    } | null;
    assigne: { id: string; nom_complet: string } | null;
    range_par: { id: string; nom_complet: string } | null;
  };
  type LigneRow = {
    id: string;
    service_id: string | null;
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
