/**
 * OgPressing — /admin/clients/{id}
 * ---------------------------------
 * Page de détail d'un client : informations, statistiques (solde impayé,
 * total dépensé, nombre de commandes, points fidélité), historique des
 * commandes du client.
 *
 * Server Component : récupère le client + ses commandes via Supabase
 * (RLS isole par pressing). Le client ne peut voir que ses propres clients.
 *
 * Si le client n'existe pas ou n'appartient pas au pressing → page 404
 * avec message d'erreur.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Phone,
  Mail,
  MapPin,
  Star,
  ShoppingBag,
  AlertCircle,
  Wallet,
  Calendar,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getSupabaseServer } from "@/lib/supabase/server";

interface PageProps {
  params: Promise<{ id: string }>;
}

function formatFCFA(value: number): string {
  return new Intl.NumberFormat("fr-FR").format(value) + " FCFA";
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

const STATUT_CMD_LABEL: Record<string, string> = {
  recu: "Reçu",
  en_cours: "En cours",
  pret: "Prêt",
  livre: "Livré",
  retire: "Retiré",
  annule: "Annulé",
};

const STATUT_PAIEMENT_LABEL: Record<string, string> = {
  non_paye: "Non payé",
  partiel: "Partiel",
  paye: "Payé",
};

const STATUT_PAIEMENT_BADGE: Record<
  string,
  "destructive" | "secondary" | "outline"
> = {
  non_paye: "destructive",
  partiel: "secondary",
  paye: "outline",
};

export default async function ClientDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await getSupabaseServer();

  // Récupère le client (RLS : seulement si appartient au pressing)
  const { data: client, error } = await supabase
    .from("clients")
    .select(
      "id, nom_complet, telephone, email, adresse, points_fidelite, notes, created_at"
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !client) {
    return (
      <div className="mx-auto max-w-2xl space-y-5">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/admin/clients">
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
              <Link href="/admin/clients">Retour aux clients</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Récupère les commandes du client
  const { data: commandes } = await supabase
    .from("commandes")
    .select(
      "id, numero_commande, statut, statut_paiement, montant_total, montant_paye, date_reception, date_pret_prevue, date_livraison, date_retrait"
    )
    .eq("client_id", client.id)
    .order("created_at", { ascending: false })
    .limit(50);

  // Calcule les agrégations
  const nombreCommandes = commandes?.length ?? 0;
  const totalDepense =
    commandes?.reduce((sum, c) => sum + (c.montant_total || 0), 0) ?? 0;
  const soldeImpaye =
    commandes?.reduce((sum, c) => {
      if (c.statut_paiement === "non_paye" || c.statut_paiement === "partiel") {
        return sum + Math.max((c.montant_total || 0) - (c.montant_paye || 0), 0);
      }
      return sum;
    }, 0) ?? 0;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild aria-label="Retour">
            <Link href="/admin/clients">
              <ArrowLeft className="size-5" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {client.nom_complet}
            </h1>
            <p className="text-sm text-muted-foreground">
              Client depuis le {formatDate(client.created_at)}
            </p>
          </div>
        </div>
      </div>

      {/* Coordonnées + stats */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Coordonnées */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Coordonnées</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center gap-3">
              <Phone className="size-4 text-muted-foreground" />
              <a
                href={`tel:${client.telephone}`}
                className="font-medium text-foreground hover:text-primary"
              >
                {client.telephone}
              </a>
            </div>
            {client.email && (
              <div className="flex items-center gap-3">
                <Mail className="size-4 text-muted-foreground" />
                <a
                  href={`mailto:${client.email}`}
                  className="font-medium text-foreground hover:text-primary"
                >
                  {client.email}
                </a>
              </div>
            )}
            {client.adresse && (
              <div className="flex items-center gap-3">
                <MapPin className="size-4 text-muted-foreground" />
                <span className="text-foreground">{client.adresse}</span>
              </div>
            )}
            {client.notes && (
              <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
                {client.notes}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Statistiques */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Statistiques</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <AlertCircle className="size-3.5" />
                  Solde impayé
                </p>
                <p
                  className={
                    soldeImpaye > 0
                      ? "text-lg font-bold text-danger"
                      : "text-lg font-bold text-foreground"
                  }
                >
                  {formatFCFA(soldeImpaye)}
                </p>
              </div>
              <div className="space-y-1">
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Wallet className="size-3.5" />
                  Total dépensé
                </p>
                <p className="text-lg font-bold text-foreground">
                  {formatFCFA(totalDepense)}
                </p>
              </div>
              <div className="space-y-1">
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <ShoppingBag className="size-3.5" />
                  Commandes
                </p>
                <p className="text-lg font-bold text-foreground">
                  {nombreCommandes}
                </p>
              </div>
              <div className="space-y-1">
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Star className="size-3.5 text-warning" />
                  Points fidélité
                </p>
                <p className="text-lg font-bold text-foreground">
                  {client.points_fidelite}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Historique des commandes */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShoppingBag className="size-4 text-primary" />
            Historique des commandes
            {nombreCommandes > 0 && (
              <Badge variant="secondary" className="ml-1">
                {nombreCommandes}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!commandes || commandes.length === 0 ? (
            <div className="flex flex-col items-center py-8 text-center">
              <Users className="size-10 text-muted-foreground" />
              <p className="mt-2 text-sm font-medium text-foreground">
                Aucune commande
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Ce client n&apos;a pas encore de commande enregistrée.
              </p>
            </div>
          ) : (
            <>
              {/* Desktop : tableau */}
              <div className="hidden overflow-hidden rounded-lg border md:block">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/50">
                    <tr className="text-left">
                      <th className="px-4 py-2 font-semibold text-foreground">
                        N° commande
                      </th>
                      <th className="px-4 py-2 font-semibold text-foreground">
                        Date
                      </th>
                      <th className="px-4 py-2 font-semibold text-foreground">
                        Statut
                      </th>
                      <th className="px-4 py-2 font-semibold text-foreground">
                        Paiement
                      </th>
                      <th className="px-4 py-2 text-right font-semibold text-foreground">
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {commandes.map((cmd) => (
                      <tr key={cmd.id} className="hover:bg-accent/50">
                        <td className="px-4 py-3 font-mono text-xs text-foreground">
                          {cmd.numero_commande}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {formatDate(cmd.date_reception)}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="outline">
                            {STATUT_CMD_LABEL[cmd.statut] || cmd.statut}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={STATUT_PAIEMENT_BADGE[cmd.statut_paiement] || "outline"}>
                            {STATUT_PAIEMENT_LABEL[cmd.statut_paiement] ||
                              cmd.statut_paiement}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-foreground">
                          {formatFCFA(cmd.montant_total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile : cards */}
              <ul className="space-y-2 md:hidden">
                {commandes.map((cmd) => (
                  <li
                    key={cmd.id}
                    className="rounded-lg border bg-card p-3 text-sm"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs text-foreground">
                        {cmd.numero_commande}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(cmd.date_reception)}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <Badge variant="outline" className="text-xs">
                        {STATUT_CMD_LABEL[cmd.statut] || cmd.statut}
                      </Badge>
                      <Badge
                        variant={STATUT_PAIEMENT_BADGE[cmd.statut_paiement] || "outline"}
                        className="text-xs"
                      >
                        {STATUT_PAIEMENT_LABEL[cmd.statut_paiement] ||
                          cmd.statut_paiement}
                      </Badge>
                    </div>
                    <p className="mt-2 text-right font-semibold text-foreground">
                      {formatFCFA(cmd.montant_total)}
                    </p>
                  </li>
                ))}
              </ul>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
