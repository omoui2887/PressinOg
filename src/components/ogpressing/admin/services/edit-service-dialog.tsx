/**
 * OgPressing — EditServiceDialog (LOT 11.1)
 * ------------------------------------------
 * Modification d'un service : Nom + Prix unitaire.
 * Le type n'est PAS éditable (spec LOT 11.1 — affiché en lecture seule).
 *
 * Au submit : PATCH /api/admin/services/[id]
 *   { nom, prix }
 *
 * Référence pattern : stock/edit-product-dialog.tsx (RHF + zod + reset sur
 * changement de produit).
 */
"use client";

import { useEffect, useState } from "react";
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
import { Badge } from "@/components/ui/badge";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { cn } from "@/lib/utils";
import {
  typeServiceBadgeClass,
  typeServiceIcon,
  typeServiceLabel,
  type ServiceItem,
} from "./services-helpers";

const schema = z.object({
  nom: z
    .string()
    .min(2, "Le nom doit comporter au moins 2 caractères")
    .max(100, "Le nom ne peut pas dépasser 100 caractères"),
  prix: z.coerce
    .number({ invalid_type_error: "Prix invalide" })
    .int("Le prix doit être un entier")
    .min(0, "Le prix doit être ≥ 0"),
});

type FormValues = z.infer<typeof schema>;

interface EditServiceDialogProps {
  service: ServiceItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated?: () => void;
}

export function EditServiceDialog({
  service,
  open,
  onOpenChange,
  onUpdated,
}: EditServiceDialogProps) {
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  // Pré-remplit le formulaire quand le service change.
  useEffect(() => {
    if (service && open) {
      form.reset({
        nom: service.nom,
        prix: service.prix ?? 0,
      });
    }
  }, [service, open, form]);

  if (!service) return null;

  const TypeIcon = typeServiceIcon(service.type);

  async function onSubmit(values: FormValues) {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/services/${service!.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nom: values.nom.trim(),
          prix: values.prix,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Erreur lors de la mise à jour");
      }
      toast.success("Service modifié", {
        description: `${values.nom} a été mis à jour.`,
      });
      onOpenChange(false);
      onUpdated?.();
    } catch (err) {
      // Pattern d'erreur : réseau vs métier (API FR) vs inconnu.
      // On n'expose JAMAIS error.stack, JSON.stringify(error) ou codes SQL/Supabase.
      let message: string;
      if (
        err instanceof TypeError &&
        err.message.includes("fetch")
      ) {
        message = "Erreur réseau. Vérifiez votre connexion internet.";
      } else if (
        err instanceof Error &&
        err.name === "NetworkError"
      ) {
        message = "Erreur réseau. Vérifiez votre connexion internet.";
      } else if (err instanceof Error && err.message) {
        // Message français renvoyé par l'API (erreur métier connue).
        message = err.message;
      } else {
        console.error("[edit-service] Erreur inattendue :", err);
        message = "Une erreur est survenue. Veuillez réessayer.";
      }
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Modifier le service</DialogTitle>
          <DialogDescription>
            Modifiez le nom ou le prix unitaire.
          </DialogDescription>
        </DialogHeader>

        {/* Type en lecture seule */}
        <div className="space-y-1.5">
          <p className="text-sm font-medium text-foreground">Type</p>
          <Badge
            variant="outline"
            className={cn(
              "gap-1.5 font-medium",
              typeServiceBadgeClass(service.type)
            )}
          >
            <TypeIcon className="size-3.5" />
            {typeServiceLabel(service.type)}
          </Badge>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="nom"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nom *</FormLabel>
                  <FormControl>
                    <Input {...field} className="h-11" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
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
                    Enregistrement…
                  </>
                ) : (
                  "Enregistrer"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
