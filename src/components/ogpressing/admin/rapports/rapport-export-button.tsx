"use client";

/**
 * e-pressing — <RapportExportButton> ( LOT 12.2 + 12.3 )
 * --------------------------------------------------------
 * Bouton générique d'export .xlsx pour les 10 rapports du module Rapports.
 *
 * Comportement au clic :
 *   1. Active l'état de chargement ( spinner Loader2 )
 *   2. Construit l'URL `/api/admin/rapports/${type}` avec les query params
 *      pertinents selon CONFIG_RAPPORTS[type].withDate / withMois / withPeriode
 *      et les props fournies ( date / mois / start / end )
 *   3. fetch( url, { cache: "no-store" } )
 *   4. Si !success → toast.error( "Export échoué", { description } )
 *   5. Appelle exportToExcel( data, columns, fileName ) — déclenche le
 *      téléchargement du fichier .xlsx côté client
 *   6. toast.success( "Export réussi", { description: "N lignes exportées" } )
 *
 * Le libellé du bouton provient de CONFIG_RAPPORTS[type].label par défaut,
 * surchargeable via la prop `label`. Sur mobile ( < sm ), seul un libellé
 * abrégé "Export" est affiché pour économiser l'espace.
 *
 * 🔒 SÉCURITÉ : aucune — c'est un bouton client. L'auth/RLS est gérée par
 *   la route API appelée.
 */
import { Download, Loader2 } from "lucide-react";
import { useState } from "react";
import type { VariantProps } from "class-variance-authority";
import { Button, buttonVariants } from "@/components/ui/button";
import { toast } from "sonner";
import { exportToExcel } from "@/lib/utils/export-xlsx";
import {
  CONFIG_RAPPORTS,
  type TypeRapport,
} from "./rapports-helpers";

export interface RapportExportButtonProps {
  /** Type de rapport à exporter ( détermine l'URL + les colonnes + le nom de fichier ). */
  type: TypeRapport;
  /** Variante visuelle du bouton ( défaut "outline" ). */
  variant?: VariantProps<typeof buttonVariants>["variant"];
  /** Taille du bouton ( défaut "default" ). */
  size?: VariantProps<typeof buttonVariants>["size"];
  /** Classes Tailwind additionnelles. */
  className?: string;
  /** Surcharge le libellé par défaut ( CONFIG_RAPPORTS[type].label ). */
  label?: string;
  /** Date "YYYY-MM-DD" pour les rapports journalier / hebdomadaire. */
  date?: string;
  /** Mois "YYYY-MM" pour le rapport mensuel. */
  mois?: string;
  /** Date ISO de début ( pour rapports paiements / remises ). */
  start?: string;
  /** Date ISO de fin ( pour rapports paiements / remises ). */
  end?: string;
  /** Désactive le bouton ( en plus de l'état loading ). */
  disabled?: boolean;
}

export function RapportExportButton({
  type,
  variant = "outline",
  size = "default",
  className,
  label,
  date,
  mois,
  start,
  end,
  disabled = false,
}: RapportExportButtonProps) {
  const [loading, setLoading] = useState(false);
  const config = CONFIG_RAPPORTS[type];
  const displayLabel = label ?? config.label;

  async function handleClick() {
    if (loading || disabled) return;
    setLoading(true);

    try {
      // Construction de l'URL avec query params
      const params = new URLSearchParams();
      if (config.withDate && date) {
        params.set("date", date);
      }
      if (config.withMois && mois) {
        params.set("mois", mois);
      }
      if (config.withPeriode && start) {
        params.set("start", start);
      }
      if (config.withPeriode && end) {
        params.set("end", end);
      }
      const qs = params.toString();
      const url = `/api/admin/rapports/${type}${qs ? `?${qs}` : ""}`;

      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) {
        // Erreur réseau / HTTP — on tente de parser le message
        let description = `Erreur HTTP ${response.status}`;
        try {
          const errJson = (await response.json()) as { error?: string };
          if (errJson?.error) description = errJson.error;
        } catch {
          /* ignore — on garde la description par défaut */
        }
        toast.error("Export échoué", { description });
        return;
      }

      const json = (await response.json()) as {
        success: boolean;
        data?: Record<string, unknown>[];
        error?: string;
      };

      if (!json.success) {
        toast.error("Export échoué", {
          description: json.error ?? "Erreur inconnue",
        });
        return;
      }

      const rows = Array.isArray(json.data) ? json.data : [];
      if (rows.length === 0) {
        toast.info("Aucune donnée à exporter", {
          description: "Le rapport ne contient aucune ligne pour la période sélectionnée.",
        });
        return;
      }

      // Génère et télécharge le fichier .xlsx
      exportToExcel(rows, config.columns, config.fileName);

      toast.success("Export réussi", {
        description: `${rows.length} ligne(s) exportée(s)`,
      });
    } catch (err) {
      console.error("[RapportExportButton] Erreur réseau:", err);
      toast.error("Export échoué", {
        description:
          err instanceof Error
            ? err.message
            : "Erreur réseau — vérifiez votre connexion.",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      onClick={handleClick}
      disabled={loading || disabled}
      className={className}
      aria-label={`Exporter ${displayLabel} au format Excel`}
    >
      {loading ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <Download className="size-4" />
      )}
      <span className="hidden sm:inline">{displayLabel}</span>
      <span className="sm:hidden">Export</span>
    </Button>
  );
}
