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
 *   1. POST /api/admin/stock SANS fds_url (crée le produit, renvoie son id).
 *   2. Si une FDS a été sélectionnée : POST /api/admin/stock/[id]/fds-upload
 *      (multipart/form-data). Le serveur valide MIME + taille + magic number
 *      %PDF-, uploade via admin client (service_role) et met à jour
 *      `produits_stock.fds_url` côté serveur. L'échec FDS n'est PAS bloquant
 *      (le produit est déjà créé) — toast.warning.
 *
 * 🔒 SÉCURITÉ (AUDIT Conclusion #2 + #4 — REMEDIATE-STORAGE) :
 *   - Bucket `fds` PRIVÉ (migration 016). Path préfixé par pressing_id :
 *     `fds/{pressing_id}/{timestamp}-{random}.pdf` → RLS `fds_select_isolation`.
 *   - L'upload FDS ne se fait PLUS côté client (clé anon) : un attaquant
 *     pouvait forger un Content-Type `application/pdf` et uploader un
 *     binaire arbitraire. Désormais, l'upload passe par la route serveur
 *     dédiée qui valide MIME + magic number %PDF- avant d'écrire.
 *   - Pré-check client MIME `application/pdf` strict pour UX (feedback
 *     instantané) — le serveur reste la source de vérité.
 *   - Lecture FDS : /api/admin/stock/[id]/fds-url (signed URL 1 heure).
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

// @hookform/resolvers v5 : `z.coerce.number()` et `.optional().default("")`
// produisent un type d'entrée différent du type de sortie. On utilise
// `z.input` pour aligner TFieldValues sur le type d'entrée (champs non
// transformés), ce qui rend le resolver compatible avec useForm<FormValues>.
type FormValues = z.input<typeof schema>;

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

  /**
   * Upload la FDS vers le bucket Storage PRIVÉ `fds` VIA LA ROUTE SERVEUR
   * /api/admin/stock/[id]/fds-upload. Le serveur valide MIME + taille + magic
   * number %PDF-, puis uploade via admin client (service_role) et met à jour
   * `produits_stock.fds_url`. Retourne `true` en cas de succès, `false` sinon.
   *
   * 🔒 L'upload ne se fait PLUS côté client (clé anon) — la route serveur est
   *    la source de vérité. Le pré-check MIME côté client (handleFileChange)
   *    n'est qu'une aide ergonomique.
   */
  async function uploadFdsServerSide(
    produitId: string
  ): Promise<boolean> {
    if (!fdsFile) return false;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", fdsFile);
      const res = await fetch(
        `/api/admin/stock/${produitId}/fds-upload`,
        {
          method: "POST",
          body: formData,
          // Ne PAS set Content-Type : le navigateur le fait avec le boundary.
        }
      );
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(
          data.error || "Erreur lors de l'upload de la FDS côté serveur"
        );
      }
      return true;
    } catch (err) {
      // 🔒 Audit #16 (Phase 4) : on ne logue pas l'objet err complet.
      console.warn(
        "[stock] Échec upload FDS serveur :",
        err instanceof Error ? err.message : "erreur"
      );
      toast.warning("FDS non uploadée", {
        description:
          err instanceof Error
            ? err.message
            : "Le produit a été créé, mais l'upload de la FDS a échoué.",
      });
      return false;
    } finally {
      setUploading(false);
    }
  }

  async function onSubmit(values: FormValues) {
    setSubmitting(true);
    try {
      // 1. Crée le produit SANS fds_url (la route FDS-upload mettra à jour
      //    produits_stock.fds_url côté serveur après validation).
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
          fds_url: null,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success || !data.data?.id) {
        throw new Error(data.error || "Erreur lors de la création du produit");
      }
      const produitId: string = data.data.id;

      // 2. Upload FDS si un fichier a été sélectionné (non bloquant — le
      //    produit est déjà créé ; en cas d'échec FDS, toast.warning).
      if (fdsFile) {
        await uploadFdsServerSide(produitId);
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
    // Sécurité (audit #4) : refuse tout fichier dont le MIME n'est pas
    // exactement "application/pdf", indépendamment de l'extension.
    // Avant : `&&` laissait passer malware.pdf (MIME piégé + extension .pdf).
    if (file.type !== "application/pdf") {
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
                        value={(field.value as number) ?? 0}
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
                        value={(field.value as number) ?? 0}
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
