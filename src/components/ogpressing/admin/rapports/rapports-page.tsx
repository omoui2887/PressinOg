/**
 * e-pressing — RapportsPage (client orchestrator) — LOT 12.1
 * ------------------------------------------------------------
 * Page /admin/rapports : vue d'ensemble des statistiques du pressing sur
 * la période sélectionnée.
 *
 * Fonctionnalités :
 *   - Sélecteur de période (Aujourd'hui / Cette semaine / Ce mois-ci / Perso)
 *   - 4 StatCards : CA total, Nombre de commandes, Panier moyen, Total remises
 *   - Graphique CA par jour (BarChart)
 *   - Graphique CA par mode de paiement (PieChart)
 *   - Graphique CA par type de service (BarChart)
 *   - Section "Clients avec impayés"
 *   - Section "Remises appliquées"
 *
 * Données via GET /api/admin/rapports?periode=...&start=...&end=...
 * (RLS isole par pressing_id automatiquement).
 *
 * 10 exports .xlsx sont exposés dans la section « Exports Excel » (regroupés
 * par catégorie : Période / Commandes & Clients / Personnel).
 *
 * Mobile-first : cards empilées sur mobile, grilles 2/4 colonnes sur sm/lg.
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import {
  BarChart3,
  ShoppingCart,
  Calculator,
  Percent,
  CalendarDays,
  FileSpreadsheet,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/ogpressing/stat-card";
import { formatFCFA, formatFCFACompact } from "@/lib/utils/format";
import {
  type PeriodeRapport,
  type RapportsDataResponse,
  computePeriode,
} from "./rapports-helpers";
import { PeriodSelector } from "./period-selector";
import { ClientsImpayesSection } from "./clients-impayes-section";
import { RemisesSection } from "./remises-section";
import { RapportExportButton } from "./rapport-export-button";

// 🚀 PERF : Les 3 charts Recharts (~95KB gzippé) sont lazy-loadés via
// next/dynamic avec ssr:false. Ils ne sont rendus qu'après le fetch API
// (loading === false), donc on diffère aussi le téléchargement du bundle
// Recharts jusqu'au moment où les données sont prêtes.
const ChartCaParJour = dynamic(
  () => import("./rapports-charts").then((m) => m.ChartCaParJour),
  {
    ssr: false,
    loading: () => <Skeleton className="h-[300px] w-full rounded-lg" />,
  }
);
const ChartCaParMode = dynamic(
  () => import("./rapports-charts").then((m) => m.ChartCaParMode),
  {
    ssr: false,
    loading: () => <Skeleton className="h-[300px] w-full rounded-lg" />,
  }
);
const ChartCaParTypeService = dynamic(
  () => import("./rapports-charts").then((m) => m.ChartCaParTypeService),
  {
    ssr: false,
    loading: () => <Skeleton className="h-[300px] w-full rounded-lg" />,
  }
);

/** État initial (avant le 1er fetch). */
const EMPTY_DATA: RapportsDataResponse = {
  success: true,
  periode: "aujourdhui",
  start: "",
  end: "",
  stats: {
    ca_total: 0,
    nombre_commandes: 0,
    panier_moyen: 0,
    total_remises: 0,
  },
  ca_par_jour: [],
  ca_par_mode: [],
  ca_par_type_service: [],
  clients_impayes: [],
  remises_appliquees: [],
};

export function RapportsPage({
  /** Affiche la section "Exports Excel (.xlsx)" (défaut: true).
   *  Mettre à false pour les rôles en lecture seule sans export (ex : Manager
   *  en attente de confirmation de la matrice de permissions, Comptable garde
   *  les exports). */
  showExports = true,
  /** Base path for internal navigation links. Defaults to "/admin".
   *  Set to "/personnel/comptable" (or other role) for personnel variants.
   *  Actuellement utilisé pour les futurs liens de navigation interne — les
   *  boutons d'export .xlsx restent des appels API (relatifs) et n'utilisent
   *  pas ce chemin. */
  basePath = "/admin",
}: {
  showExports?: boolean;
  basePath?: string;
} = {}) {
  //basePath est réservé pour les futurs liens de navigation interne (back-link
  // vers le dashboard du rôle, etc.). Pour l'instant aucun lien n'en a besoin
  // car les boutons d'export .xlsx font des appels API relatifs
  // (/api/admin/rapports/...) et la sélection de période est inline.
  void basePath;
  const [periode, setPeriode] = useState<PeriodeRapport>("aujourdhui");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [data, setData] = useState<RapportsDataResponse>(EMPTY_DATA);
  const [loading, setLoading] = useState(true);

  const fetchRapports = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("periode", periode);
      if (periode === "perso") {
        if (customStart) params.set("start", customStart);
        if (customEnd) params.set("end", customEnd);
      }
      const res = await fetch(`/api/admin/rapports?${params.toString()}`, {
        cache: "no-store",
      });
      const json: RapportsDataResponse = await res.json();
      if (json.success) {
        setData(json);
      } else {
        console.error("[rapports] Erreur API:", json.error);
        setData(EMPTY_DATA);
      }
    } catch (err) {
      console.error("[rapports] Erreur fetch:", err);
      setData(EMPTY_DATA);
    } finally {
      setLoading(false);
    }
  }, [periode, customStart, customEnd]);

  useEffect(() => {
    fetchRapports();
  }, [fetchRapports]);

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      {/* Header */}
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
          <BarChart3 className="size-6 text-primary" />
          Rapports
        </h1>
        <p className="text-sm text-muted-foreground">
          Suivez le chiffre d&apos;affaires, les paiements et les remises de
          votre pressing.
        </p>
      </div>

      {/* Sélecteur de période */}
      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
          <CalendarDays className="size-4 text-primary" />
          Période analysée
        </div>
        <PeriodSelector
          periode={periode}
          onPeriodeChange={setPeriode}
          customStart={customStart}
          customEnd={customEnd}
          onCustomStartChange={setCustomStart}
          onCustomEndChange={setCustomEnd}
        />
      </Card>

      {/* Exports Excel — masqués si showExports=false (Manager en attente
          confirmation, Comptable les garde) */}
      {showExports &&
        (() => {
        // Calcule la date/mois pour les exports basés sur la période courante
        const periodeCfg = computePeriode(periode, customStart, customEnd);
        const exportDate = periodeCfg.start.slice(0, 10); // YYYY-MM-DD
        const exportMois = periodeCfg.start.slice(0, 7); // YYYY-MM
        return (
          <Card className="p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
              <FileSpreadsheet className="size-4 text-secondary" />
              Exports Excel (.xlsx)
            </div>
            {/* Exports liés à la période courante */}
            <p className="mb-2 text-xs text-muted-foreground">
              Période — liés à la sélection courante
            </p>
            <div className="mb-4 flex flex-wrap gap-2">
              <RapportExportButton
                type="journalier"
                size="sm"
                date={exportDate}
                label="Journalier"
              />
              <RapportExportButton
                type="hebdomadaire"
                size="sm"
                date={exportDate}
                label="Hebdomadaire"
              />
              <RapportExportButton
                type="mensuel"
                size="sm"
                mois={exportMois}
                label="Mensuel"
              />
              <RapportExportButton
                type="remises"
                size="sm"
                start={periodeCfg.start}
                end={periodeCfg.end}
                label="Remises (période)"
              />
              <RapportExportButton
                type="stock"
                size="sm"
                start={periodeCfg.start}
                end={periodeCfg.end}
                label="Stock (mouvements)"
              />
            </div>
            {/* Exports globaux Commandes / Clients */}
            <p className="mb-2 text-xs text-muted-foreground">
              Commandes &amp; Clients — exports globaux
            </p>
            <div className="mb-4 flex flex-wrap gap-2">
              <RapportExportButton
                type="commandes"
                size="sm"
                label="Toutes les commandes"
              />
              <RapportExportButton
                type="paiements"
                size="sm"
                label="Tous les paiements"
              />
              <RapportExportButton
                type="impayes"
                size="sm"
                label="Impayés (clients)"
              />
              <RapportExportButton
                type="clients"
                size="sm"
                label="Tous les clients"
              />
            </div>
            {/* Exports Personnel */}
            <p className="mb-2 text-xs text-muted-foreground">
              Personnel — exports globaux
            </p>
            <div className="flex flex-wrap gap-2">
              <RapportExportButton
                type="personnel"
                size="sm"
                label="Tous les employés"
              />
            </div>
          </Card>
        );
      })()}

      {/* 4 StatCards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[124px] w-full rounded-xl" />
          ))
        ) : (
          <>
            <StatCard
              label="CA total"
              value={formatFCFACompact(data.stats.ca_total)}
              icon={BarChart3}
              accent="primary"
              description="Chiffre d'affaires de la période"
            />
            <StatCard
              label="Commandes"
              value={data.stats.nombre_commandes}
              icon={ShoppingCart}
              accent="secondary"
              description="Nombre de commandes reçues"
            />
            <StatCard
              label="Panier moyen"
              value={formatFCFACompact(data.stats.panier_moyen)}
              icon={Calculator}
              accent="warning"
              description="CA total ÷ nombre de commandes"
            />
            <StatCard
              label="Total remises"
              value={formatFCFA(data.stats.total_remises)}
              icon={Percent}
              accent="warning"
              description="Remises accordées sur la période"
            />
          </>
        )}
      </div>

      {/* Graphique CA par jour */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Chiffre d&apos;affaires par jour</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-[300px] w-full rounded-lg" />
          ) : (
            <ChartCaParJour data={data.ca_par_jour} />
          )}
        </CardContent>
      </Card>

      {/* 2 graphiques côte à côte (lg+) */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              CA par mode de paiement
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[300px] w-full rounded-lg" />
            ) : (
              <ChartCaParMode data={data.ca_par_mode} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">CA par type de service</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[300px] w-full rounded-lg" />
            ) : (
              <ChartCaParTypeService data={data.ca_par_type_service} />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Section clients avec impayés */}
      <ClientsImpayesSection
        clients={data.clients_impayes}
        loading={loading}
      />

      {/* Section remises appliquées */}
      <RemisesSection remises={data.remises_appliquees} loading={loading} />
    </div>
  );
}
