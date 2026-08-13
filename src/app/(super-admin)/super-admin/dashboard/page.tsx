/**
 * e-pressing — Dashboard Super Admin
 * ----------------------------------
 * Route : /super-admin/dashboard (groupe `(super-admin)`)
 *
 * Accès : Super Admin uniquement (vérifié côté middleware + layout).
 *
 * Server Component : récupère toutes les données via Supabase côté serveur
 * (RLS : is_super_admin() = true → accès total) pour un chargement rapide
 * sans aller-retour client.
 *
 * Contenu :
 *   - Header (titre + sous-titre)
 *   - 4 StatCards : pressings actifs / demandes en attente / MRR / pressings essai
 *   - Line chart : nouveaux pressings actifs par mois (6 derniers mois)
 *   - 5 dernières demandes d'inscription + lien vers /super-admin/demandes
 */
import Link from "next/link";
import {
  Building2,
  Inbox,
  Wallet,
  Sparkles,
  ArrowRight,
  MapPin,
  Clock,
} from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ogpressing/stat-card";
import { StatusBadge, EmptyState } from "@/components/shared";
import {
  ChartNouveauxPressingsLazy as ChartNouveauxPressings,
  type ChartPoint,
} from "@/components/ogpressing/super-admin/chart-nouveaux-pressings-lazy";
import { getSupabaseServer } from "@/lib/supabase/server";
import { formatFCFA, formatFCFACompact, formatRelative } from "@/lib/utils/format";

/* ------------------------------------------------------------------ */
/*  Types & helpers                                                   */
/* ------------------------------------------------------------------ */

interface DemandeRecente {
  id: string;
  nom_gerant: string;
  nom_pressing: string;
  ville: string | null;
  statut: string;
  created_at: string;
}

/** Libellés français pour les statuts de demande d'inscription. */
const STATUT_DEMANDE_LABELS: Record<string, string> = {
  en_attente: "En attente",
  contactee: "Contactée",
  validee: "Validée",
  refusee: "Refusée",
};

/** Construit la série des 6 derniers mois (incluant le mois courant). */
function getDerniers6Mois(): { key: string; label: string }[] {
  const now = new Date();
  const mois: { key: string; label: string }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    mois.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: format(d, "MMM", { locale: fr }).replace(".", ""),
    });
  }
  return mois;
}

/* ------------------------------------------------------------------ */
/*  Récupération des données (côté serveur, RLS super admin)          */
/* ------------------------------------------------------------------ */

async function getDashboardData() {
  const supabase = await getSupabaseServer();

  // Requêtes en parallèle pour minimiser la latence.
  const [
    pressingsActifs,
    demandesEnAttente,
    pressingsEssai,
    abonnementsActifs,
    pressingsPourChart,
    demandesRecentes,
  ] = await Promise.all([
    // 1. Nombre de pressings actifs
    supabase
      .from("pressing")
      .select("id", { count: "exact", head: true })
      .eq("statut", "actif"),
    // 2. Nombre de demandes en attente
    supabase
      .from("demandes_inscription")
      .select("id", { count: "exact", head: true })
      .eq("statut", "en_attente"),
    // 3. Nombre de pressings en période d'essai
    supabase
      .from("pressing")
      .select("id", { count: "exact", head: true })
      .eq("statut", "essai"),
    // 4. Abonnements actifs (pour MRR)
    supabase
      .from("abonnements")
      .select("montant_mensuel")
      .eq("statut", "actif"),
    // 5. Pressings actifs avec date_activation (pour le chart 6 mois)
    supabase
      .from("pressing")
      .select("date_activation")
      .eq("statut", "actif"),
    // 6. 5 dernières demandes
    supabase
      .from("demandes_inscription")
      .select("id, nom_gerant, nom_pressing, ville, statut, created_at")
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  // Agrégation MRR : somme des montant_mensuel des abonnements actifs.
  const mrr = (abonnementsActifs.data ?? []).reduce(
    (sum, a) => sum + (a.montant_mensuel ?? 0),
    0
  );

  // Agrégation chart : regrouper les pressings par mois d'activation.
  const mois = getDerniers6Mois();
  const counts: Record<string, number> = Object.fromEntries(
    mois.map((m) => [m.key, 0])
  );
  for (const p of pressingsPourChart.data ?? []) {
    if (!p.date_activation) continue;
    const d = new Date(p.date_activation);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (key in counts) counts[key] += 1;
  }
  const chartData: ChartPoint[] = mois.map((m) => ({
    month: m.label,
    count: counts[m.key],
  }));

  return {
    pressingsActifs: pressingsActifs.count ?? 0,
    demandesEnAttente: demandesEnAttente.count ?? 0,
    pressingsEssai: pressingsEssai.count ?? 0,
    mrr,
    chartData,
    demandesRecentes: (demandesRecentes.data ?? []) as DemandeRecente[],
  };
}

/* ------------------------------------------------------------------ */
/*  Page                                                              */
/* ------------------------------------------------------------------ */

export default async function SuperAdminDashboardPage() {
  const data = await getDashboardData();

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Tableau de bord
        </h1>
        <p className="text-muted-foreground">
          Vue d&apos;ensemble de la plateforme e-pressing
        </p>
      </div>

      {/* StatCards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Pressings actifs"
          value={data.pressingsActifs}
          icon={Building2}
          accent="primary"
          description="Abonnements en règle"
        />
        <StatCard
          label="Demandes en attente"
          value={data.demandesEnAttente}
          icon={Inbox}
          accent="warning"
          description="À traiter"
        />
        <StatCard
          label="MRR estimé"
          value={formatFCFACompact(data.mrr)}
          icon={Wallet}
          accent="secondary"
          description={formatFCFA(data.mrr) + " / mois"}
        />
        <StatCard
          label="En période d'essai"
          value={data.pressingsEssai}
          icon={Sparkles}
          accent="warning"
          description="7 jours inclus"
        />
      </div>

      {/* Graphique */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            Nouveaux pressings actifs par mois
          </CardTitle>
          <CardDescription>
            Évolution sur les 6 derniers mois
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChartNouveauxPressings data={data.chartData} />
        </CardContent>
      </Card>

      {/* 5 dernières demandes */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="text-lg">5 dernières demandes</CardTitle>
            <CardDescription>
              Prospects ayant rempli le formulaire d&apos;inscription
            </CardDescription>
          </div>
          <Button asChild variant="outline" size="sm" className="shrink-0">
            <Link href="/super-admin/demandes">
              Voir toutes les demandes
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {data.demandesRecentes.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title="Aucune demande pour le moment"
              description="Les nouvelles demandes d'inscription déposées sur la landing page apparaîtront ici."
              compact
            />
          ) : (
            <ul className="divide-y">
              {data.demandesRecentes.map((d) => (
                <li
                  key={d.id}
                  className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 space-y-0.5">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {d.nom_gerant}{" "}
                      <span className="font-normal text-muted-foreground">
                        — {d.nom_pressing}
                      </span>
                    </p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      {d.ville && (
                        <span className="flex items-center gap-1">
                          <MapPin className="size-3" />
                          {d.ville}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Clock className="size-3" />
                        {formatRelative(d.created_at)}
                      </span>
                    </div>
                  </div>
                  <StatusBadge
                    status={d.statut}
                    label={STATUT_DEMANDE_LABELS[d.statut] ?? d.statut}
                    className="shrink-0"
                  />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
