/**
 * OgPressing — ExportImpayesButton
 * --------------------------------
 * Bouton d'export de la liste des clients avec impayés au format .xlsx.
 *
 * ⚠️ La logique d'export détaillée sera développée au Lot 12. Pour
 * l'instant, le bouton affiche un toast "Fonctionnalité à venir" au clic.
 */
"use client";

import { Download, Loader2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function ExportImpayesButton() {
  const [loading, setLoading] = useState(false);

  function handleClick() {
    setLoading(true);
    // Placeholder — Lot 12 implémentera l'export .xlsx réel
    setTimeout(() => {
      setLoading(false);
      toast.info("Fonctionnalité à venir", {
        description:
          "L'export de la liste des impayés en .xlsx sera disponible au Lot 12.",
      });
    }, 300);
  }

  return (
    <Button
      variant="outline"
      onClick={handleClick}
      disabled={loading}
      className="gap-2"
    >
      {loading ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <Download className="size-4" />
      )}
      <span className="hidden sm:inline">Exporter les impayés</span>
      <span className="sm:hidden">Export</span>
    </Button>
  );
}
