/**
 * OgPressing — AddServiceDialog (LOT 11.1)
 * -----------------------------------------
 * Formulaire de création d'un service : Nom, Type, Prix unitaire.
 *
 * Au submit : POST /api/admin/services
 *   { nom, type, prix }
 *
 * Référence pattern : stock/add-product-dialog.tsx (RHF + zod + shadcn Form).
 */
"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { TYPES_SERVICES } from "./services-helpers";

const schema = z.object({
  nom: z
    .string()
    .min(2, "Le nom doit comporter au moins 2 caractères")
    .max(100, "Le nom ne peut pas dépasser 100 caractères"),
  type: z.string().min(1, "Le type est obligatoire"),
  prix: z.coerce
    .number({ invalid_type_error: "Prix invalide" })
    .int("Le prix doit être un entier")
    .min(0, "Le prix doit être ≥ 0"),
});

type FormValues = z.infer<typeof schema>;

interface AddServiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
  /** Types déjà configurés par le pressing (pour désactiver ces options,
   *  car la contrainte DB UNIQUE(pressing_id, type) interdit les doublons). */
  existingTypes?: string[];
}

export function AddServiceDialog({
  open,
  onOpenChange,
  onCreated,
  existingTypes = [],
}: AddServiceDialogProps) {
  const [submitting, setSubmitting] = useState(false);
  const usedSet = new Set(existingTypes);
  const allTaken = TYPES_SERVICES.every((t) => usedSet.has(t.value));

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      nom: "",
      type: "",
      prix: 0,
    },
  });

  const { control, handleSubmit, reset } = form;

  async function onSubmit(values: FormValues) {
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nom: values.nom.trim(),
          type: values.type,
          prix: values.prix,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Erreur lors de la création du service");
      }
      toast.success("Service ajouté", {
        description: `${values.nom} a été ajouté au catalogue.`,
      });
      reset();
      onOpenChange(false);
      onCreated?.();
    } catch (err) {
      toast.error("Échec de la création", {
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
        if (!o) {
          reset();
        }
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ajouter un service</DialogTitle>
          <DialogDescription>
            Renseignez le nom, le type et le prix unitaire du service.
          </DialogDescription>
        </DialogHeader>

        {allTaken ? (
          <>
            <div className="rounded-md border border-warning/30 bg-warning/5 p-4 text-sm text-foreground">
              <p className="font-medium">
                Les 5 types de service sont déjà configurés.
              </p>
              <p className="mt-1 text-muted-foreground">
                Modifiez un service existant pour ajuster son nom ou son prix,
                ou désactivez-le si nécessaire.
              </p>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Fermer
              </Button>
            </DialogFooter>
          </>
        ) : (
        <Form {...form}>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* Nom */}
            <FormField
              control={control}
              name="nom"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nom du service *</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="Ex : Lavage simple"
                      className="h-11"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Type */}
            <FormField
              control={control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Type *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="h-11">
                        <SelectValue placeholder="Sélectionnez un type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {TYPES_SERVICES.map((t) => {
                        const taken = usedSet.has(t.value);
                        return (
                          <SelectItem
                            key={t.value}
                            value={t.value}
                            disabled={taken}
                          >
                            {t.label}
                            {taken && " (déjà configuré)"}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Prix */}
            <FormField
              control={control}
              name="prix"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Prix unitaire *</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="number"
                      min="0"
                      step="100"
                      className="h-11"
                      placeholder="Ex : 500"
                      value={field.value ?? 0}
                    />
                  </FormControl>
                  <p className="text-xs text-muted-foreground">
                    Montant en FCFA (entier)
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={submitting}
              >
                Annuler
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Création…
                  </>
                ) : (
                  "Ajouter le service"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
