/**
 * OgPressing — MouvementsFilters (LOT 10.2 + PRD §14/§15)
 * ------------------------------------------------------
 * Filtres pour l'historique des mouvements :
 *   - par produit (dropdown)
 *   - par type (tous / entrée / sortie)
 *   - par plage de dates (date_start, date_end)
 *   - bouton Export .xlsx (PRD §15 — rapport Stock mouvements)
 *
 * L'export appelle GET /api/admin/rapports/stock avec les filtres
 * courants (date_start, date_end, produit_id, type) puis déclenche
 * `exportToExcel()` côté client pour télécharger le .xlsx.
 *
 * 🚫 PLAN GATING (PRD §16) — si la route renvoie 403 (plan Starter),
 * le toast affiche le message invitant à passer au plan Pro.
 */
"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { exportToExcel } from "@/lib/utils/export-xlsx";
import { COLONNES_STOCK } from "../rapports/rapports-helpers";

export type TypeMouvementFilter = "all" | "entree" | "sortie";

interface MouvementsFiltersProps {
  produitId: string;
  onProduitChange: (id: string) => void;
  type: TypeMouvementFilter;
  onTypeChange: (t: TypeMouvementFilter) => void;
  dateStart: string;
  onDateStartChange: (d: string) => void;
  dateEnd: string;
  onDateEndChange: (d: string) => void;
  produits: { id: string; nom: string }[];
}

export function MouvementsFilters({
  produitId,
  onProduitChange,
  type,
  onTypeChange,
  dateStart,
  onDateStartChange,
  dateEnd,
  onDateEndChange,
  produits,
}: MouvementsFiltersProps) {
  const [exporting, setExporting] = useState(false);

  async function handleExport() {
    if (exporting) return;
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (dateStart) params.set("date_start", dateStart);
      if (dateEnd) params.set("date_end", dateEnd);
      if (produitId && produitId !== "all") {
        params.set("produit_id", produitId);
      }
      if (type !== "all") params.set("type", type);

      const qs = params.toString();
      const url = `/api/admin/rapports/stock${qs ? `?${qs}` : ""}`;

      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) {
        let description = `Erreur HTTP ${response.status}`;
        try {
          const errJson = (await response.json()) as { error?: string };
          if (errJson?.error) description = errJson.error;
        } catch {
          /* ignore */
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
          description:
            "Aucun mouvement de stock pour les filtres sélectionnés.",
        });
        return;
      }

      exportToExcel(rows, COLONNES_STOCK, "rapport_stock_mouvements");

      toast.success("Export réussi", {
        description: `${rows.length} mouvement(s) exporté(s)`,
      });
    } catch (err) {
      console.error("[MouvementsFilters] Erreur export:", err);
      toast.error("Export échoué", {
        description:
          err instanceof Error
            ? err.message
            : "Erreur réseau — vérifiez votre connexion.",
      });
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* Produit */}
        <div className="space-y-1.5">
          <Label className="text-xs">Produit</Label>
          <Select value={produitId || "all"} onValueChange={onProduitChange}>
            <SelectTrigger className="h-10">
              <SelectValue placeholder="Tous les produits" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les produits</SelectItem>
              {produits.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.nom}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Type */}
        <div className="space-y-1.5">
          <Label className="text-xs">Type</Label>
          <Select value={type} onValueChange={(v) => onTypeChange(v as TypeMouvementFilter)}>
            <SelectTrigger className="h-10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous</SelectItem>
              <SelectItem value="entree">Entrées</SelectItem>
              <SelectItem value="sortie">Sorties</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Date début */}
        <div className="space-y-1.5">
          <Label className="text-xs">Du</Label>
          <Input
            type="date"
            value={dateStart}
            onChange={(e) => onDateStartChange(e.target.value)}
            className="h-10"
          />
        </div>

        {/* Date fin */}
        <div className="space-y-1.5">
          <Label className="text-xs">Au</Label>
          <Input
            type="date"
            value={dateEnd}
            onChange={(e) => onDateEndChange(e.target.value)}
            className="h-10"
          />
        </div>
      </div>

      {/* Export */}
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={handleExport}
          disabled={exporting}
          aria-label="Exporter les mouvements de stock au format Excel"
        >
          {exporting ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <Download className="mr-2 size-4" />
          )}
          Exporter en .xlsx
        </Button>
      </div>
    </div>
  );
}
