/**
 * e-pressing — /personnel/caissier/clients/{id} (CAIS-1)
 * -------------------------------------------------------
 * Page de détail d'un client — variante "caissier" en lecture seule.
 *
 * Server Component (thin) : fetch les données initiales via Supabase
 * (RLS isole par pressing) et les passe en props au Client Component
 * <ClientDetailPage basePath="/personnel/caissier" readOnly /> qui gère
 * l'interactivité (tabs, mais SANS boutons "Modifier" grâce à readOnly).
 *
 * 🔒 SÉCURITÉ : le layout (personnel)/layout.tsx vérifie déjà l'auth + le
 *    rôle. La SELECT Supabase est protégée par RLS : si le client n'existe
 *    pas ou n'appartient pas au pressing, on renvoie null → page 404 FR.
 *
 *    ⚠️ Le PATCH /api/admin/clients/[id] accepte manager OU receptionniste
 *       uniquement — le caissier NE peut PAS éditer. Le flag `readOnly`
 *       cache les boutons "Modifier" côté UI.
 */
import Link from "next/link";
import { ArrowLeft, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getSupabaseServer } from "@/lib/supabase/server";
import { ClientDetailPage } from "@/components/ogpressing/admin/clients/client-detail-page";
import type {
  ClientDetail,
  CommandeListItem,
  Paiement,
} from "@/components/ogpressing/admin/clients/client-detail-helpers";

export const dynamic = "force-dynamic";

const BASE_PATH = "/personnel/caissier";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function Page({ params }: PageProps) {
  const { id } = await params;
  const supabase = await getSupabaseServer();

  // ----------------------------------------------------------------
  // 1) Récupère le client (RLS isole par pressing → null si introuvable)
  // ----------------------------------------------------------------
  const { data: client, error } = await supabase
    .from("clients")
    .select(
      "id, pressing_id, nom_complet, telephone, email, adresse, points_fidelite, notes, preferences_lavage, created_at, updated_at"
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !client) {
    return (
      <div className="mx-auto max-w-2xl space-y-5">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`${BASE_PATH}/clients`}>
            <ArrowLeft className="size-4" />
            Retour aux clients
          </Link>
        </Button>
        <Card>
          <CardContent className="flex flex-col items-center py-16 text-center">
            <AlertCircle className="size-12 text-muted-foreground" />
            <h1 className="mt-3 text-xl font-bold text-foreground">
              Client introuvable
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Ce client n&apos;existe pas ou n&apos;appartient pas à votre pressing.
            </p>
            <Button asChild className="mt-4">
              <Link href={`${BASE_PATH}/clients`}>Retour aux clients</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const clientDetail = client as unknown as ClientDetail;

  // ----------------------------------------------------------------
  // 2) Récupère les 50 dernières commandes du client
  // ----------------------------------------------------------------
  const { data: commandesData } = await supabase
    .from("commandes")
    .select(
      "id, numero_commande, statut, statut_paiement, montant_total, montant_paye, date_reception, date_pret_prevue, date_livraison, date_retrait, created_at"
    )
    .eq("client_id", clientDetail.id)
    .order("created_at", { ascending: false })
    .limit(50);

  const commandes = (commandesData ?? []) as unknown as CommandeListItem[];

  // ----------------------------------------------------------------
  // 3) Récupère tous les paiements des commandes du client
  // ----------------------------------------------------------------
  const commandeIds = commandes.map((c) => c.id);
  let paiements: Paiement[] = [];
  if (commandeIds.length > 0) {
    const { data: paiementsData } = await supabase
      .from("paiements")
      .select(
        "id, commande_id, montant, methode, reference, date_paiement, est_acompte, notes, created_at"
      )
      .in("commande_id", commandeIds)
      .order("date_paiement", { ascending: false });
    paiements = (paiementsData ?? []) as unknown as Paiement[];
  }

  // ----------------------------------------------------------------
  // 4) Rend le Client Component orchestrator (readOnly = pas de "Modifier")
  // ----------------------------------------------------------------
  return (
    <ClientDetailPage
      client={clientDetail}
      commandes={commandes}
      paiements={paiements}
      basePath={BASE_PATH}
      readOnly
    />
  );
}
