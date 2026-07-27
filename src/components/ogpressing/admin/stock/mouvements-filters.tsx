/**
 * OgPressing — MouvementsFilters (LOT 10.2)
 * ------------------------------------------
 * Filtres pour l'historique des mouvements :
 *   - par produit (dropdown)
 *   - par type (tous / entrée / sortie)
 *   - par plage de dates (date_start, date_end)
 *   - bouton Export .xlsx (placeholder LOT 12)
 */
"use client";

import { Download } from "lucide-react";
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
          onClick={() =>
            toast.info("Export Excel à venir", {
              description: "Cette fonctionnalité sera disponible dans une prochaine mise à jour.",
            })
          }
        >
          <Download className="mr-2 size-4" />
          Exporter en .xlsx
        </Button>
      </div>
    </div>
  );
}
