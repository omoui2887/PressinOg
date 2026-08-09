/**
 * OgPressing — AddServiceDialog (LOT 11.1)
 * -----------------------------------------
 * Formulaire de création d'un service : Nom, Type, Prix unitaire.
 *
 * Au submit : POST /api/admin/services
 *   { nom, type, prix }
 *
 * 🎨 ILLUSTRATIONS (LOT 11.1+) : chaque option du Select "Type" affiche
 *    l'icône Lucide associée (cf. TYPES_SERVICES.icon) pour une cohérence
 *    visuelle avec la liste des services et le wizard de commande.
 *
 * ⚠️ COMPORTEMENT "allTaken" (LOT 11.1+) : lorsque les 5 types de service
 *    sont déjà configurés (contrainte DB UNIQUE(pressing_id, type)), on
 *    affiche le formulaire AVEC une note d'information en haut (au lieu
 *    d'un écran bloquant "Fermer"). Toutes les options du Select "Type"
 *    sont désactivées (marquées "(déjà configuré)"), donc l'utilisateur
 *    ne peut pas soumettre le formulaire — il comprend qu'il doit d'abord
 *    supprimer un service existant pour libérer un type. Le bouton
 *    "Ajouter le service" reste désactivé tant qu'aucun type n'est
 *    sélectionnable.
 *
 * Référence pattern : stock/add-product-dialog.tsx (RHF + zod + shadcn Form).
 */
"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Info, Loader2 } from "lucide-react";
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
  // ⚠️ FIX BUG-AUDIT-RUNTIME #4 (P1) : Zod v4 a remplacé `invalid_type_error`
  // et `required_error` par un seul paramètre `error` (ou `message`).
  prix: z.coerce
    .number({ error: "Prix invalide" })
    .int("Le prix doit être un entier")
    .min(0, "Le prix doit être ≥ 0"),
});

// @hookform/resolvers v5 : `z.coerce.number()` produit un type d'entrée
// (unknown) différent du type de sortie (number). On utilise `z.input` pour
// aligner TFieldValues sur le type d'entrée (champs non transformés), ce qui
// rend le resolver compatible avec useForm<FormValues>.
type FormValues = z.input<typeof schema>;

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
        console.error("[add-service] Erreur inattendue :", err);
        message = "Une erreur est survenue. Veuillez réessayer.";
      }
      toast.error(message);
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

        {/* Note informative quand tous les types sont déjà configurés.
            On affiche le formulaire quand même (plutôt qu'un écran bloquant)
            pour une UX cohérente : l'utilisateur voit la structure et
            comprend qu'il doit libérer un type en supprimant un service. */}
        {allTaken && (
          <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/5 p-3 text-sm">
            <Info className="mt-0.5 size-4 shrink-0 text-warning" />
            <div className="text-foreground">
              <p className="font-medium">
                Les 5 types de service sont déjà configurés.
              </p>
              <p className="mt-0.5 text-muted-foreground">
                Supprimez un service existant pour libérer un type, ou
                modifiez-le pour ajuster son nom ou son prix.
              </p>
            </div>
          </div>
        )}

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
                        const Icon = t.icon;
                        return (
                          <SelectItem
                            key={t.value}
                            value={t.value}
                            disabled={taken}
                          >
                            <span className="inline-flex items-center gap-2">
                              <Icon className="size-4" />
                              {t.label}
                              {taken && " (déjà configuré)"}
                            </span>
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
                      value={(field.value as number) ?? 0}
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
              <Button
                type="submit"
                disabled={submitting || allTaken}
                title={
                  allTaken
                    ? "Tous les types sont déjà configurés. Supprimez un service existant pour en créer un nouveau."
                    : undefined
                }
              >
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
      </DialogContent>
    </Dialog>
  );
}
