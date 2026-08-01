/**
 * OgPressing — /admin/dashboard (LOT 6.2)
 * ----------------------------------------
 * Vue d'ensemble du pressing connecté : KPIs du jour, raccourcis, commandes
 * récentes, alertes stock, clients avec impayés.
 *
 * Server Component : toutes les données sont récupérées côté serveur via
 * `getSupabaseServer()` (client anon + JWT utilisateur). La RLS isole
 * automatiquement par `pressing_id = get_pressing_id_utilisateur()` sur
 * commandes / paiements / produits_stock / vue_clients_enrichis. Aucun
 * filtre manuel par pressing_id n'est nécessaire côté code.
 *
 * Sections :
 *   1. Header (titre "Tableau de bord" + nom du pressing en sous-titre)
 *   2. 4 StatCards : CA du jour / Commandes du jour / Commandes en cours /
 *      Alertes stock
 *   3. Raccourcis : Nouvelle commande / Scanner QR (Lot 7) / Ajouter client
 *   4. Commandes récentes (5 dernières) + lien "Voir toutes les commandes"
 *   5. Alertes stock (produits sous seuil) — visible uniquement si alerte
 *   6. Clients avec impayés (Top 5 via vue_clients_enrichis)
 */
import Link from "next/link";
import {
  Wallet,
  ShoppingCart,
  Loader,
  AlertTriangle,
  ArrowRight,
  PackageX,
  Users,
  ChevronRight,
  AlertCircle,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ogpressing/stat-card";
import { StatusBadge } from "@/components/shared";
import { DashboardShortcuts } from "@/components/ogpressing/admin/dashboard/dashboard-shortcuts";
import { getSupabaseServer } from "@/lib/supabase/server";
import { formatFCFA, formatRelative } from "@/lib/utils/format";
import { STATUT_COMMANDE_LABELS } from "@/lib/workflow/commande-statut";

/* ------------------------------------------------------------------ */
/*  Types & helpers                                                   */
/* ------------------------------------------------------------------ */

interface CommandeRecente {
  id: string;
  numero_commande: string | null;
  statut: string;
  montant_total: number | null;
  created_at: string;
  client: { nom_complet: string | null } | null;
}

interface ProduitAlerte {
  id: string;
  nom: string;
  quantite_actuelle: string | number | null;
  seuil_alerte: string | number | null;
}

interface ClientImpaye {
  id: string;
  nom_complet: string | null;
  telephone: string | null;
  solde_impaye: number | null;
}

/**
 * Commande payée mais non prête — surveillance workflow (WORKFLOW-FIX-V1).
 * Ces commandes ont statut_paiement='paye' mais statut encore dans
 * ('recu','en_traitement','lave','repasse'). Elles ont été payées
 * (acompte total à la création ou encaissement) mais le service n'est
 * pas encore terminé. Le manager doit s'assurer qu'elles progressent
 * dans le workflow (lavage → repassage → prêt → retrait/livraison).
 */
interface CommandePayeeNonPrete {
  id: string;
  numero_commande: string | null;
  statut: string;
  statut_paiement: string | null;
  montant_total: number | null;
  created_at: string;
  date_pret_prevue: string | null;
  client: { nom_complet: string | null } | null;
}

/** Retourne les bornes [début, fin] du jour courant en UTC ISO strings. */
function getTodayBounds(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0)
  );
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999)
  );
  return { start: start.toISOString(), end: end.toISOString() };
}

/* ------------------------------------------------------------------ */
/*  Récupération des données (côté serveur, RLS pressing)             */
/* ------------------------------------------------------------------ */

async function getDashboardData() {
  const supabase = await getSupabaseServer();
  const { start, end } = getTodayBounds();

  // Requêtes en parallèle pour minimiser la latence. RLS filtre
  // automatiquement par pressing_id du manager connecté.
  const [
    caJour,
    commandesJour,
    commandesEnCours,
    tousProduits,
    commandesRecentes,
    clientsImpayes,
    pressing,
    commandesPayeesNonPretes,
  ] = await Promise.all([
    // 1. CA du jour = somme des montants des paiements du jour liés à une commande
    supabase
      .from("paiements")
      .select("montant")
      .not("commande_id", "is", null)
      .gte("date_paiement", start)
      .lte("date_paiement", end),
    // 2. Commandes du jour (créées aujourd'hui) — count
    supabase
      .from("commandes")
      .select("id", { count: "exact", head: true })
      .gte("created_at", start)
      .lte("created_at", end),
    // 3. Commandes en cours = statut != 'retire' AND != 'livre' — count
    supabase
      .from("commandes")
      .select("id", { count: "exact", head: true })
      .not("statut", "in", '("retire","livre")'),
    // 4. Tous les produits du pressing — filtrage colonne-à-colonne
    //    (quantite_actuelle < seuil_alerte) fait côté JS car PostgREST
    //    ne supporte pas la comparaison entre deux colonnes.
    supabase
      .from("produits_stock")
      .select("id, nom, quantite_actuelle, seuil_alerte")
      .order("nom", { ascending: true }),
    // 5. 5 dernières commandes + client (nested select)
    supabase
      .from("commandes")
      .select(
        "id, numero_commande, statut, montant_total, created_at, client:clients(nom_complet)"
      )
      .order("created_at", { ascending: false })
      .limit(5),
    // 6. Top 5 clients avec impayés (vue_clients_enrichis)
    supabase
      .from("vue_clients_enrichis")
      .select("id, nom_complet, telephone, solde_impaye")
      .gt("solde_impaye", 0)
      .order("solde_impaye", { ascending: false })
      .limit(5),
    // 7. Infos pressing (pour le sous-titre du header)
    supabase
      .from("pressing")
      .select("id, nom")
      .maybeSingle(),
    // 8. WORKFLOW-FIX-V1 : Commandes payées mais non prêtes (surveillance).
    //    statut_paiement='paye' AND statut NOT IN ('pret','en_livraison','livre','retire')
    //    → commandes à surveiller : le client a payé mais le service n'est
    //    pas encore terminé. Le manager doit s'assurer qu'elles avancent.
    supabase
      .from("commandes")
      .select(
        "id, numero_commande, statut, statut_paiement, montant_total, created_at, date_pret_prevue, client:clients(nom_complet)"
      )
      .eq("statut_paiement", "paye")
      .not("statut", "in", '("pret","en_livraison","livre","retire")')
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  // Filtrage JS : quantite_actuelle < seuil_alerte (PostgREST ne compare
  // pas deux colonnes entre elles). On garde aussi le tri alphabétique.
  const produitsAlerte: ProduitAlerte[] = (tousProduits.data ?? [])
    .filter((p) => {
      const q = Number(p.quantite_actuelle);
      const s = Number(p.seuil_alerte);
      return !Number.isNaN(q) && !Number.isNaN(s) && q < s;
    })
    .map((p) => ({
      id: p.id,
      nom: p.nom,
      quantite_actuelle: p.quantite_actuelle,
      seuil_alerte: p.seuil_alerte,
    }));

  // CA du jour : somme des montants
  const caJourTotal = (caJour.data ?? []).reduce(
    (sum, p) => sum + (p.montant ?? 0),
    0
  );

  return {
    caJour: caJourTotal,
    commandesJour: commandesJour.count ?? 0,
    commandesEnCours: commandesEnCours.count ?? 0,
    alertesStockCount: produitsAlerte.length,
    produitsAlerte,
    commandesRecentes: (commandesRecentes.data ?? []) as unknown as CommandeRecente[],
    clientsImpayes: (clientsImpayes.data ?? []) as ClientImpaye[],
    pressingNom: pressing.data?.nom ?? "Mon pressing",
    commandesPayeesNonPretes:
      (commandesPayeesNonPretes.data ?? []) as unknown as CommandePayeeNonPrete[],
  };
}

/* ------------------------------------------------------------------ */
/*  Page                                                              */
/* ------------------------------------------------------------------ */

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const data = await getDashboardData();

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* 1. Header */}
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Tableau de bord
        </h1>
        <p className="text-muted-foreground">{data.pressingNom}</p>
      </div>

      {/* 2. StatCards (4) */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="CA du jour"
          value={formatFCFA(data.caJour)}
          icon={Wallet}
          accent="secondary"
          description="Paiements encaissés aujourd'hui"
          isMonetary
        />
        <StatCard
          label="Commandes du jour"
          value={data.commandesJour}
          icon={ShoppingCart}
          accent="primary"
          description="Créées aujourd'hui"
        />
        <StatCard
          label="Commandes en cours"
          value={data.commandesEnCours}
          icon={Loader}
          accent="warning"
          description="Non retirées / non livrées"
        />
        <StatCard
          label="Alertes stock"
          value={data.alertesStockCount}
          icon={AlertTriangle}
          accent={data.alertesStockCount > 0 ? "danger" : "primary"}
          description={
            data.alertesStockCount > 0
              ? "Produits sous seuil"
              : "Tous les stocks sont OK"
          }
        />
      </div>

      {/* 3. Raccourcis */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Raccourcis</h2>
        <DashboardShortcuts />
      </section>

      {/* 4. Commandes récentes */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="text-lg">Commandes récentes</CardTitle>
            <CardDescription>
              Les 5 dernières commandes enregistrées
            </CardDescription>
          </div>
          <Button asChild variant="outline" size="sm" className="shrink-0">
            <Link href="/admin/commandes">
              Voir toutes les commandes
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {data.commandesRecentes.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-muted/20 py-10 text-center">
              <ShoppingCart className="size-8 text-muted-foreground/50" />
              <p className="text-sm font-medium text-foreground">
                Aucune commande pour le moment
              </p>
              <p className="max-w-xs text-xs text-muted-foreground">
                Les nouvelles commandes apparaîtront ici. Utilisez le raccourci
                « Nouvelle commande » pour enregistrer une commande.
              </p>
            </div>
          ) : (
            <ul className="divide-y">
              {data.commandesRecentes.map((c) => (
                <li
                  key={c.id}
                  className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 space-y-0.5">
                    <p className="truncate text-sm font-semibold text-foreground">
                      <span className="fcfa-tight text-xs text-muted-foreground">
                        {c.numero_commande ?? "—"}
                      </span>
                      {c.client?.nom_complet && (
                        <>
                          {" — "}
                          <span>{c.client.nom_complet}</span>
                        </>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatRelative(c.created_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="fcfa text-sm font-semibold text-foreground">
                      {formatFCFA(c.montant_total ?? 0)}
                    </span>
                    <StatusBadge
                      status={c.statut}
                      label={STATUT_COMMANDE_LABELS[c.statut] ?? c.statut}
                      className="shrink-0"
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* 4.bis. WORKFLOW-FIX-V1 — Commandes payées mais non prêtes (surveillance) */}
      {data.commandesPayeesNonPretes.length > 0 && (
        <Card className="border-warning/40">
          <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg text-warning">
                <AlertCircle className="size-5" />
                Commandes payées non prêtes
                <span className="ml-1 inline-flex items-center rounded-full bg-warning/10 px-2 py-0.5 text-xs font-semibold text-warning">
                  {data.commandesPayeesNonPretes.length}
                </span>
              </CardTitle>
              <CardDescription>
                Commandes entièrement payées mais pas encore prêtes (lavage /
                repassage / retrait en attente). Vérifiez que le workflow avance.
              </CardDescription>
            </div>
            <Button asChild variant="outline" size="sm" className="shrink-0">
              <Link href="/admin/commandes?statut_paiement=paye">
                Voir toutes
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {data.commandesPayeesNonPretes.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/admin/commandes/${c.id}`}
                    className="flex items-center justify-between gap-3 py-3 transition-colors first:pt-0 last:pb-0 hover:bg-accent/40 -mx-2 px-2 rounded-md"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <p className="truncate text-sm font-semibold text-foreground">
                        <span className="fcfa-tight text-xs text-muted-foreground">
                          {c.numero_commande ?? "—"}
                        </span>
                        {c.client?.nom_complet && (
                          <>
                            {" — "}
                            <span>{c.client.nom_complet}</span>
                          </>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Payée {formatRelative(c.created_at)}
                        {c.date_pret_prevue
                          ? ` · prévue ${formatRelative(c.date_pret_prevue)}`
                          : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="fcfa text-sm font-semibold text-foreground">
                        {formatFCFA(c.montant_total ?? 0)}
                      </span>
                      <StatusBadge
                        status={c.statut}
                        label={STATUT_COMMANDE_LABELS[c.statut] ?? c.statut}
                        className="shrink-0"
                      />
                      <ChevronRight className="size-4 text-muted-foreground" />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* 5. Alertes stock — visible uniquement s'il y a au moins une alerte */}
      {data.produitsAlerte.length > 0 && (
        <Card className="border-danger/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg text-danger">
              <PackageX className="size-5" />
              Alertes stock
              <span className="ml-1 inline-flex items-center rounded-full bg-danger/10 px-2 py-0.5 text-xs font-semibold text-danger">
                {data.produitsAlerte.length}
              </span>
            </CardTitle>
            <CardDescription>
              Produits dont la quantité actuelle est inférieure au seuil d&apos;alerte
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {data.produitsAlerte.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                >
                  <p className="truncate text-sm font-medium text-foreground">
                    {p.nom}
                  </p>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="rounded-md bg-danger/10 px-2 py-1 font-semibold text-danger">
                      {Number(p.quantite_actuelle)} / seuil {Number(p.seuil_alerte)}
                    </span>
                    <StatusBadge status="alerte_stock" label="Stock bas" variant="danger" />
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* 6. Clients avec impayés (Top 5) */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Users className="size-5 text-warning" />
              Clients avec impayés
            </CardTitle>
            <CardDescription>
              Top 5 des clients ayant le solde impayé le plus élevé
            </CardDescription>
          </div>
          <Button asChild variant="outline" size="sm" className="shrink-0">
            <Link href="/admin/clients?impayes=true">
              Voir tous les impayés
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {data.clientsImpayes.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-muted/20 py-10 text-center">
              <Users className="size-8 text-muted-foreground/50" />
              <p className="text-sm font-medium text-foreground">
                Aucun impayé
              </p>
              <p className="max-w-xs text-xs text-muted-foreground">
                Tous vos clients sont à jour. Félicitations !
              </p>
            </div>
          ) : (
            <ul className="divide-y">
              {data.clientsImpayes.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/admin/clients/${c.id}`}
                    className="flex items-center justify-between gap-3 py-3 transition-colors first:pt-0 last:pb-0 hover:bg-accent/40 -mx-2 px-2 rounded-md"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {c.nom_complet ?? "Client sans nom"}
                      </p>
                      {c.telephone && (
                        <p className="truncate text-xs text-muted-foreground">
                          {c.telephone}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="fcfa text-sm font-bold text-danger">
                        {formatFCFA(Number(c.solde_impaye ?? 0))}
                      </span>
                      <ChevronRight className="size-4 text-muted-foreground" />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
