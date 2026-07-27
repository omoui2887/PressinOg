/**
 * OgPressing — MouvementDialog (LOT 10.1)
 * ---------------------------------------
 * Dialogue d'enregistrement d'un mouvement de stock (entrée ou sortie)
 * pour un produit donné.
 *
 * Au submit : POST /api/admin/stock/[id]/mouvements
 *   { type_mouvement, quantite, motif? }
 *
 * Le trigger DB met à jour quantite_actuelle automatiquement.
 * Gère l'erreur "stock négatif" (400) avec un message clair.
 */
"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, ArrowDownCircle, ArrowUpCircle, Plus, Minus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { formatQuantite, type ProduitStock } from "./stock-helpers";

const schema = z.object({
  type_mouvement: z.enum(["entree", "sortie"]),
  quantite: z.coerce
    .number()
    .refine((v) => v > 0, "La quantité doit être supérieure à 0"),
  motif: z
    .string()
    .max(500, "Le motif ne peut pas dépasser 500 caractères")
    .optional()
    .default(""),
});

type FormValues = z.infer<typeof schema>;

interface MouvementDialogProps {
  produit: ProduitStock | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMouvementCreated?: () => void;
}

export function MouvementDialog({
  produit,
  open,
  onOpenChange,
  onMouvementCreated,
}: MouvementDialogProps) {
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      type_mouvement: "entree",
      quantite: 1,
      motif: "",
    },
  });

  const { register, handleSubmit, watch, setValue, reset, formState: { errors } } = form;

  const typeMouvement = watch("type_mouvement");
  const quantite = watch("quantite");

  if (!produit) return null;

  const quantiteActuelle = Number(produit.quantite_actuelle);
  const nouvelleQuantite =
    typeMouvement === "entree"
      ? quantiteActuelle + (Number(quantite) || 0)
      : quantiteActuelle - (Number(quantite) || 0);

  async function onSubmit(values: FormValues) {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/stock/${produit!.id}/mouvements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type_mouvement: values.type_mouvement,
          quantite: values.quantite,
          motif: values.motif?.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Erreur lors de l'enregistrement du mouvement");
      }
      toast.success(
        values.type_mouvement === "entree"
          ? "Entrée de stock enregistrée"
          : "Sortie de stock enregistrée",
        {
          description: `${values.quantite} ${produit!.unite === "litre" ? "L" : "kg"} — ${produit!.nom}`,
        }
      );
      reset();
      onOpenChange(false);
      onMouvementCreated?.();
    } catch (err) {
      toast.error("Échec de l'enregistrement", {
        description: err instanceof Error ? err.message : "Erreur inconnue",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Enregistrer un mouvement</DialogTitle>
          <DialogDescription>
            {produit.nom} — Stock actuel :{" "}
            <span className="font-semibold text-foreground">
              {formatQuantite(produit.quantite_actuelle, produit.unite)}
            </span>
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Type de mouvement */}
          <div className="space-y-2">
            <Label>Type de mouvement</Label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setValue("type_mouvement", "entree", { shouldValidate: true })}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-lg border-2 p-3 transition-all",
                  typeMouvement === "entree"
                    ? "border-secondary bg-secondary/5"
                    : "border-border hover:border-secondary/40"
                )}
              >
                <ArrowDownCircle className={cn("size-6", typeMouvement === "entree" ? "text-secondary" : "text-muted-foreground")} />
                <span className={cn("text-sm font-medium", typeMouvement === "entree" ? "text-secondary" : "text-muted-foreground")}>
                  Entrée
                </span>
              </button>
              <button
                type="button"
                onClick={() => setValue("type_mouvement", "sortie", { shouldValidate: true })}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-lg border-2 p-3 transition-all",
                  typeMouvement === "sortie"
                    ? "border-warning bg-warning/5"
                    : "border-border hover:border-warning/40"
                )}
              >
                <ArrowUpCircle className={cn("size-6", typeMouvement === "sortie" ? "text-warning" : "text-muted-foreground")} />
                <span className={cn("text-sm font-medium", typeMouvement === "sortie" ? "text-warning" : "text-muted-foreground")}>
                  Sortie
                </span>
              </button>
            </div>
          </div>

          {/* Quantité avec boutons +/- */}
          <div className="space-y-2">
            <Label htmlFor="quantite">
              Quantité ({produit.unite === "litre" ? "en litres" : "en kg"})
            </Label>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-11 shrink-0"
                onClick={() =>
                  setValue("quantite", Math.max(0.5, (Number(quantite) || 1) - 0.5), {
                    shouldValidate: true,
                  })
                }
                aria-label="Diminuer"
              >
                <Minus className="size-4" />
              </Button>
              <Input
                id="quantite"
                type="number"
                step="0.5"
                min="0"
                {...register("quantite")}
                className="h-11 text-center"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-11 shrink-0"
                onClick={() =>
                  setValue("quantite", (Number(quantite) || 0) + 0.5, {
                    shouldValidate: true,
                  })
                }
                aria-label="Augmenter"
              >
                <Plus className="size-4" />
              </Button>
            </div>
            {errors.quantite && (
              <p className="text-xs text-danger">{errors.quantite.message}</p>
            )}
          </div>

          {/* Aperçu nouveau stock */}
          <div className="rounded-lg border bg-muted/30 p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Nouveau stock :</span>
              <span
                className={cn(
                  "font-semibold",
                  nouvelleQuantite < Number(produit.seuil_alerte)
                    ? "text-danger"
                    : "text-foreground"
                )}
              >
                {formatQuantite(nouvelleQuantite, produit.unite)}
              </span>
            </div>
            {nouvelleQuantite < 0 && (
              <p className="mt-1 text-xs text-danger">
                ⚠️ Stock insuffisant pour cette sortie.
              </p>
            )}
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="motif">
              Notes{" "}
              <span className="text-xs font-normal text-muted-foreground">
                (optionnel)
              </span>
            </Label>
            <Textarea
              id="motif"
              {...register("motif")}
              placeholder="Ex : Réassort fournisseur, consommation du jour…"
              rows={2}
              maxLength={500}
              className="resize-none"
            />
            {errors.motif && (
              <p className="text-xs text-danger">{errors.motif.message}</p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Annuler
            </Button>
            <Button
              type="submit"
              disabled={submitting || nouvelleQuantite < 0}
            >
              {submitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Enregistrement…
                </>
              ) : (
                "Enregistrer"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
