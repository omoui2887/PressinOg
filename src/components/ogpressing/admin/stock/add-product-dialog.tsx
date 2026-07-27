/**
 * OgPressing — AddProductDialog (LOT 10.1)
 * -----------------------------------------
 * Formulaire de création d'un produit de stock (biodétergent).
 *
 * Champs : nom, catégorie (6 options), unité (litre/kg), quantité initiale,
 * seuil d'alerte, date d'expiration (optionnel), prix d'achat (optionnel),
 * fournisseur (optionnel), FDS PDF (upload vers Supabase Storage, optionnel).
 *
 * Au submit :
 *   1. Upload FDS vers bucket Storage `fds` (échec non bloquant)
 *   2. POST /api/admin/stock avec fds_url
 */
"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Upload, FileText, X } from "lucide-react";
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
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { CATEGORIES, UNITES } from "./stock-helpers";

const schema = z.object({
  nom: z
    .string()
    .min(2, "Le nom doit comporter au moins 2 caractères")
    .max(100, "Le nom ne peut pas dépasser 100 caractères"),
  categorie: z.string().min(1, "La catégorie est obligatoire"),
  unite: z.string().min(1, "L'unité est obligatoire"),
  quantite_initiale: z.coerce
    .number()
    .min(0, "La quantité initiale doit être ≥ 0"),
  seuil_alerte: z.coerce
    .number()
    .min(0, "Le seuil d'alerte doit être ≥ 0"),
  date_expiration: z.string().optional().default(""),
  prix_achat_unitaire: z.string().optional().default(""),
  fournisseur: z.string().max(200).optional().default(""),
});

type FormValues = z.infer<typeof schema>;

interface AddProductDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onProductCreated?: () => void;
}

export function AddProductDialog({
  open,
  onOpenChange,
  onProductCreated,
}: AddProductDialogProps) {
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [fdsFile, setFdsFile] = useState<File | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      nom: "",
      categorie: "",
      unite: "",
      quantite_initiale: 0,
      seuil_alerte: 0,
      date_expiration: "",
      prix_achat_unitaire: "",
      fournisseur: "",
    },
  });

  const { control, handleSubmit, reset, formState: { errors } } = form;

  /** Upload la FDS vers le bucket Storage `fds`. Retourne l'URL publique ou null. */
  async function uploadFds(): Promise<string | null> {
    if (!fdsFile) return null;
    setUploading(true);
    try {
      const supabase = getSupabaseBrowser();
      const ext = fdsFile.name.split(".").pop() || "pdf";
      const path = `fds/${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("fds")
        .upload(path, fdsFile, {
          cacheControl: "3600",
          upsert: false,
          contentType: "application/pdf",
        });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("fds").getPublicUrl(path);
      if (pub?.publicUrl) return pub.publicUrl;
      return null;
    } catch (err) {
      console.warn("[stock] Échec upload FDS (continuons sans) :", err);
      toast.warning("FDS non uploadée", {
        description:
          "Le stockage des FDS est indisponible. Le produit sera créé sans FDS.",
      });
      return null;
    } finally {
      setUploading(false);
    }
  }

  async function onSubmit(values: FormValues) {
    setSubmitting(true);
    try {
      const fdsUrl = await uploadFds();
      const res = await fetch("/api/admin/stock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nom: values.nom.trim(),
          categorie: values.categorie,
          unite: values.unite,
          quantite_initiale: values.quantite_initiale,
          seuil_alerte: values.seuil_alerte,
          date_expiration: values.date_expiration || null,
          prix_achat_unitaire:
            values.prix_achat_unitaire && values.prix_achat_unitaire.trim() !== ""
              ? parseInt(values.prix_achat_unitaire, 10)
              : null,
          fournisseur: values.fournisseur?.trim() || null,
          fds_url: fdsUrl,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Erreur lors de la création du produit");
      }
      toast.success("Produit ajouté", {
        description: `${values.nom} a été ajouté au stock.`,
      });
      reset();
      setFdsFile(null);
      onOpenChange(false);
      onProductCreated?.();
    } catch (err) {
      toast.error("Échec de la création", {
        description: err instanceof Error ? err.message : "Erreur inconnue",
      });
    } finally {
      setSubmitting(false);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) {
      setFdsFile(null);
      return;
    }
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Fichier invalide", {
        description: "La FDS doit être un fichier PDF.",
      });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Fichier trop volumineux", {
        description: "La FDS ne peut pas dépasser 5 Mo.",
      });
      return;
    }
    setFdsFile(file);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          reset();
          setFdsFile(null);
        }
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ajouter un produit</DialogTitle>
          <DialogDescription>
            Renseignez les informations du biodétergent à suivre en stock.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* Nom */}
            <FormField
              control={control}
              name="nom"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nom du produit *</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="Ex : Détergent concentré 5L"
                      className="h-11"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Catégorie + Unité */}
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={control}
                name="categorie"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Catégorie *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="h-11">
                          <SelectValue placeholder="Sélectionnez" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {CATEGORIES.map((c) => (
                          <SelectItem key={c.value} value={c.value}>
                            {c.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={control}
                name="unite"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Unité *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="h-11">
                          <SelectValue placeholder="Sélectionnez" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {UNITES.map((u) => (
                          <SelectItem key={u.value} value={u.value}>
                            {u.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Quantité initiale + Seuil */}
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={control}
                name="quantite_initiale"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Quantité initiale *</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="number"
                        step="0.5"
                        min="0"
                        className="h-11"
                        value={field.value ?? 0}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={control}
                name="seuil_alerte"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Seuil d&apos;alerte *</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="number"
                        step="0.5"
                        min="0"
                        className="h-11"
                        value={field.value ?? 0}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Date d'expiration + Prix d'achat */}
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={control}
                name="date_expiration"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Date d&apos;expiration{" "}
                      <span className="text-xs font-normal text-muted-foreground">
                        (optionnel)
                      </span>
                    </FormLabel>
                    <FormControl>
                      <Input {...field} type="date" className="h-11" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={control}
                name="prix_achat_unitaire"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Prix d&apos;achat (FCFA){" "}
                      <span className="text-xs font-normal text-muted-foreground">
                        (optionnel)
                      </span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="number"
                        min="0"
                        step="100"
                        className="h-11"
                        placeholder="Ex : 5000"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Fournisseur */}
            <FormField
              control={control}
              name="fournisseur"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Fournisseur{" "}
                    <span className="text-xs font-normal text-muted-foreground">
                      (optionnel)
                    </span>
                  </FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="Ex : Société CI Chimie"
                      className="h-11"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Upload FDS */}
            <div className="space-y-2">
              <Label>
                Fiche de Données de Sécurité (FDS){" "}
                <span className="text-xs font-normal text-muted-foreground">
                  (PDF, optionnel, max 5 Mo)
                </span>
              </Label>
              {fdsFile ? (
                <div className="flex items-center gap-2 rounded-md border bg-muted/30 p-3">
                  <FileText className="size-5 shrink-0 text-primary" />
                  <span className="flex-1 truncate text-sm text-foreground">
                    {fdsFile.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => setFdsFile(null)}
                    className="text-muted-foreground hover:text-danger"
                    aria-label="Retirer la FDS"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              ) : (
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed p-4 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-primary">
                  <Upload className="size-4" />
                  <span>Cliquez pour sélectionner un PDF</span>
                  <input
                    type="file"
                    accept="application/pdf,.pdf"
                    className="sr-only"
                    onChange={handleFileChange}
                  />
                </label>
              )}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={submitting || uploading}
              >
                Annuler
              </Button>
              <Button type="submit" disabled={submitting || uploading}>
                {submitting || uploading ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    {uploading ? "Upload FDS…" : "Création…"}
                  </>
                ) : (
                  "Ajouter le produit"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
