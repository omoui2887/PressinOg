/**
 * e-pressing — PaiementsFinancierSection (LOT 12.4 — migration 043)
 * -------------------------------------------------------------------
 * Section "Immuable — Paiements & Annulations" de la page /admin/rapports.
 *
 * Affiche le rapport financier immuable (migration 043) :
 *   - 4 StatCards : Paiements valides, Paiements annulés, Remboursements,
 *     Net encaissé (montant_net_encaisse = valides - remboursements)
 *   - Tableau "Répartition par type d'annulation" (4 lignes : erreur_saisie,
 *     doublon, remboursement, autre) avec Nombre + Montant
 *
 * États : loading (skeletons), error (message + bouton "Réessayer"), data.
 *
 * Données via GET /api/admin/rapports/paiements-financier?start=...&end=...
 * Le filtre pressing_id est appliqué côté API (service_role + filtre explicite).
 *
 * Mobile-first : cards en grid-cols-2 sur mobile, 4 colonnes sur lg+, tableau
 * responsive (scroll-x sur très petits écrans via overflow-x-auto).
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  ShieldCheck,
  XCircle,
  RotateCcw,
  Wallet,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/ogpressing/stat-card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatFCFA } from "@/lib/utils/format";

/* -------------------------------------------------------------------------- */
/*  TYPES — réponse API                                                        */
/* -------------------------------------------------------------------------- */

type TypeAnnulationPaiement =
  | "erreur_saisie"
  | "doublon"
  | "remboursement"
  | "autre";

interface PaiementAgg {
  count: number;
  montant: number;
}

interface ParTypeAnnulationRow {
  type: TypeAnnulationPaiement;
  count: number;
  montant: number;
}

interface PaiementsFinancierData {
  periode: { start: string | null; end: string | null };
  valides: PaiementAgg;
  annules: PaiementAgg;
  remboursements: PaiementAgg;
  par_type_annulation: ParTypeAnnulationRow[];
  montant_net_encaisse: number;
}

interface ApiResponse {
  success: boolean;
  data?: PaiementsFinancierData;
  error?: string;
}

/* -------------------------------------------------------------------------- */
/*  CONSTANTES — libellés FR par type d'annulation                             */
/* -------------------------------------------------------------------------- */

const TYPE_ANNULATION_LABELS: Record<TypeAnnulationPaiement, string> = {
  erreur_saisie: "Erreur de saisie",
  doublon: "Doublon",
  remboursement: "Remboursement",
  autre: "Autre",
};

/** Couleur du badge selon le type d'annulation (cohérent avec remises-section). */
function badgeClassForType(type: TypeAnnulationPaiement): string {
  switch (type) {
    case "erreur_saisie":
      return "border-warning/30 bg-warning/10 text-warning";
    case "doublon":
      return "border-warning/30 bg-warning/10 text-warning";
    case "remboursement":
      return "border-danger/30 bg-danger/10 text-danger";
    case "autre":
      return "border-muted text-muted-foreground bg-muted/30";
  }
}

/** État initial avant le 1er fetch. */
const EMPTY_DATA: PaiementsFinancierData = {
  periode: { start: null, end: null },
  valides: { count: 0, montant: 0 },
  annules: { count: 0, montant: 0 },
  remboursements: { count: 0, montant: 0 },
  par_type_annulation: [
    { type: "erreur_saisie", count: 0, montant: 0 },
    { type: "doublon", count: 0, montant: 0 },
    { type: "remboursement", count: 0, montant: 0 },
    { type: "autre", count: 0, montant: 0 },
  ],
  montant_net_encaisse: 0,
};

/* -------------------------------------------------------------------------- */
/*  PROPS                                                                      */
/* -------------------------------------------------------------------------- */

interface PaiementsFinancierSectionProps {
  /** Borne de début ISO 8601 (ou null si pas de filtre période). */
  start: string | null;
  /** Borne de fin ISO 8601 (ou null si pas de filtre période). */
  end: string | null;
}

/* -------------------------------------------------------------------------- */
/*  COMPOSANT                                                                  */
/* -------------------------------------------------------------------------- */

export function PaiementsFinancierSection({
  start,
  end,
}: PaiementsFinancierSectionProps) {
  const [data, setData] = useState<PaiementsFinancierData>(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (start) params.set("start", start);
      if (end) params.set("end", end);
      const url = `/api/admin/rapports/paiements-financier${
        params.toString() ? `?${params.toString()}` : ""
      }`;
      const res = await fetch(url, { cache: "no-store" });
      const json: ApiResponse = await res.json();
      if (json.success && json.data) {
        setData(json.data);
      } else {
        console.error(
          "[paiements-financier] Erreur API:",
          json.error
        );
        setError(json.error || "Erreur lors du chargement du rapport.");
        setData(EMPTY_DATA);
      }
    } catch (err) {
      console.error("[paiements-financier] Erreur fetch:", err);
      setError(
        "Impossible de charger le rapport financier. Vérifiez votre connexion."
      );
      setData(EMPTY_DATA);
    } finally {
      setLoading(false);
    }
  }, [start, end]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="size-5 text-secondary" />
            Immuable — Paiements &amp; Annulations
          </CardTitle>
          {!loading && !error && (
            <Badge
              variant="outline"
              className="border-muted text-muted-foreground"
            >
              Migration 043
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Les paiements annulés ne sont jamais supprimés — chaque annulation
          est tracée avec son type (erreur de saisie, doublon, remboursement
          ou autre) pour audit financier.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        {error ? (
          <div
            role="alert"
            className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-danger/30 bg-danger/5 px-4 py-10 text-center"
          >
            <span
              className="flex size-11 items-center justify-center rounded-full bg-danger/10 text-danger"
              aria-hidden
            >
              <XCircle className="size-5" />
            </span>
            <div className="space-y-1">
              <p className="font-medium text-foreground">
                Erreur de chargement du rapport financier
              </p>
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchData}
              disabled={loading}
              className="mt-1"
            >
              <RefreshCw className={cn("size-4", loading && "animate-spin")} />
              Réessayer
            </Button>
          </div>
        ) : (
          <>
            {/* 4 StatCards : valides, annulés, remboursements, net encaissé */}
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-[124px] w-full rounded-xl" />
                ))
              ) : (
                <>
                  <StatCard
                    label="Paiements valides"
                    value={formatFCFA(data.valides.montant)}
                    icon={CheckCircle2}
                    accent="secondary"
                    description={`${data.valides.count} paiement${
                      data.valides.count > 1 ? "s" : ""
                    }`}
                    isMonetary
                  />
                  <StatCard
                    label="Paiements annulés"
                    value={formatFCFA(data.annules.montant)}
                    icon={XCircle}
                    accent="danger"
                    description={`${data.annules.count} paiement${
                      data.annules.count > 1 ? "s" : ""
                    }`}
                    isMonetary
                  />
                  <StatCard
                    label="Remboursements"
                    value={formatFCFA(data.remboursements.montant)}
                    icon={RotateCcw}
                    accent="warning"
                    description={`${data.remboursements.count} remboursement${
                      data.remboursements.count > 1 ? "s" : ""
                    }`}
                    isMonetary
                  />
                  <StatCard
                    label="Net encaissé"
                    value={formatFCFA(data.montant_net_encaisse)}
                    icon={Wallet}
                    accent="primary"
                    description="Valides − remboursements"
                    isMonetary
                  />
                </>
              )}
            </div>

            {/* Répartition par type d'annulation */}
            <div>
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
                <RotateCcw className="size-4 text-warning" />
                Répartition par type d&apos;annulation
              </div>
              {loading ? (
                <div className="space-y-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full rounded-md" />
                  ))}
                </div>
              ) : (
                <>
                  {/* Vue desktop : tableau */}
                  <div className="hidden overflow-hidden rounded-lg border md:block">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead>Type d&apos;annulation</TableHead>
                          <TableHead className="text-center">
                            Nombre
                          </TableHead>
                          <TableHead className="text-right">
                            Montant total
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.par_type_annulation.map((row) => (
                          <TableRow key={row.type}>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={cn(
                                  "font-medium",
                                  badgeClassForType(row.type)
                                )}
                              >
                                {TYPE_ANNULATION_LABELS[row.type]}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-center tabular-nums">
                              {row.count}
                            </TableCell>
                            <TableCell className="text-right font-semibold tabular-nums">
                              {formatFCFA(row.montant)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Vue mobile : cards empilées */}
                  <div className="space-y-2 md:hidden">
                    {data.par_type_annulation.map((row) => (
                      <div
                        key={row.type}
                        className={cn(
                          "flex items-center justify-between gap-3 rounded-lg border p-3",
                          row.type === "remboursement"
                            ? "border-danger/20 bg-danger/5"
                            : row.count > 0
                            ? "border-warning/20 bg-warning/5"
                            : "border-border bg-muted/20"
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className={cn(
                              "font-medium",
                              badgeClassForType(row.type)
                            )}
                          >
                            {TYPE_ANNULATION_LABELS[row.type]}
                          </Badge>
                          <span className="text-xs tabular-nums text-muted-foreground">
                            {row.count} annulation{row.count > 1 ? "s" : ""}
                          </span>
                        </div>
                        <span className="font-semibold tabular-nums text-foreground">
                          {formatFCFA(row.montant)}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
