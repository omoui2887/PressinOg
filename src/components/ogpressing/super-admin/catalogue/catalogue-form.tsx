/**
 * OgPressing — CatalogueForm (LOT 15.4)
 * --------------------------------------
 * Formulaire d'ajout / édition d'un article du catalogue global.
 * Utilisé dans un Dialog depuis `CataloguePage`.
 *
 * Champs :
 *   - Nom (requis, 2-200 caractères)
 *   - Slug (optionnel — auto-dérivé du nom si vide, kebab-case)
 *   - Catégorie (Select avec les 9 catégories initiales + option "Autre..."
 *     qui révèle un Input texte pour saisir une catégorie personnalisée)
 *   - Icône (upload de fichier image OU saisie manuelle du chemin icone_url)
 *     - Upload : POST /api/super-admin/catalogue/upload-icon multipart/form-data
 *     - Renvoie { publicUrl } → assigné à icone_url + preview
 *   - Ordre d'affichage (Input number, 0-9999, défaut 0)
 *   - Actif (Switch, défaut true)
 *
 * Submit :
 *   - Mode ajout : POST /api/super-admin/catalogue
 *   - Mode édition : PATCH /api/super-admin/catalogue/[id]
 *
 * Sur succès : toast sonner, fermeture du Dialog, appel `onSaved()` pour
 * rafraîchir la liste. Sur erreur : toast d'erreur.
 *
 * Référence pattern : admin/services/add-service-dialog.tsx (RHF + zod),
 * admin/services/edit-service-dialog.tsx (pré-remplissage via useEffect).
 */
"use client";

import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Image as ImageIcon, Check } from "lucide-react";
import Image from "next/image";
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
import { Switch } from "@/components/ui/switch";
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
import { cn } from "@/lib/utils";
import {
  CATALOGUE_CATEGORIES_NOMS,
  iconeUrlForSlug,
} from "@/lib/catalogue/catalogue-articles";
import type { CatalogueArticle } from "./catalogue-helpers";

// ---------------------------------------------------------------
// Schéma de validation (zod)
// ---------------------------------------------------------------

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const AUTRE_VALUE = "__autre__";

const schema = z.object({
  nom: z
    .string()
    .min(2, "Le nom doit comporter au moins 2 caractères")
    .max(200, "Le nom ne peut pas dépasser 200 caractères"),
  slug: z
    .string()
    .max(80, "Le slug ne peut pas dépasser 80 caractères")
    .optional()
    .or(z.literal(""))
    .refine(
      (v) => !v || SLUG_REGEX.test(v),
      "Slug invalide : kebab-case (minuscules, chiffres, tirets)"
    ),
  categorie: z.string().min(1, "La catégorie est obligatoire"),
  customCategorie: z
    .string()
    .max(100, "La catégorie ne peut pas dépasser 100 caractères")
    .optional()
    .or(z.literal("")),
  ordre_affichage: z.coerce
    .number()
    .int("L'ordre doit être un entier")
    .min(0, "L'ordre doit être ≥ 0")
    .max(9999, "L'ordre doit être ≤ 9999"),
  actif: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

// ---------------------------------------------------------------
// Props
// ---------------------------------------------------------------

interface CatalogueFormProps {
  /** Article à éditer, ou null pour le mode ajout. */
  article: CatalogueArticle | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Callback appelé après une création / édition réussie (pour refresh). */
  onSaved?: () => void;
}

// ---------------------------------------------------------------
// Composant
// ---------------------------------------------------------------

export function CatalogueForm({
  article,
  open,
  onOpenChange,
  onSaved,
}: CatalogueFormProps) {
  const [submitting, setSubmitting] = useState(false);
  const [iconeUrl, setIconeUrl] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const isEditMode = article !== null;

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      nom: "",
      slug: "",
      categorie: "",
      customCategorie: "",
      ordre_affichage: 0,
      actif: true,
    },
  });

  const { control, handleSubmit, reset, watch, setValue } = form;
  const categorieValue = watch("categorie");

  // Pré-remplit le formulaire à l'ouverture (mode édition) ou reset (mode ajout).
  useEffect(() => {
    if (!open) return;
    if (article) {
      const isKnown = CATALOGUE_CATEGORIES_NOMS.includes(article.categorie);
      reset({
        nom: article.nom,
        slug: article.slug,
        categorie: isKnown ? article.categorie : AUTRE_VALUE,
        customCategorie: isKnown ? "" : article.categorie,
        ordre_affichage: article.ordre_affichage ?? 0,
        actif: article.actif,
      });
      setIconeUrl(article.icone_url);
    } else {
      reset({
        nom: "",
        slug: "",
        categorie: "",
        customCategorie: "",
        ordre_affichage: 0,
        actif: true,
      });
      setIconeUrl("");
    }
  }, [article, open, reset]);

  // Reset l'input file natif à la fermeture pour permettre de re-upload le
  // même fichier plus tard.
  useEffect(() => {
    if (!open && fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [open]);

  // --- Upload d'icône vers Supabase Storage ---
  async function handleFileChange(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validation côté client (taille + MIME) pour éviter un round-trip inutile.
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Fichier trop volumineux", {
        description: "Taille maximale autorisée : 5 MB.",
      });
      return;
    }
    const allowed = [
      "image/png",
      "image/jpeg",
      "image/webp",
      "image/svg+xml",
    ];
    if (!allowed.includes(file.type)) {
      toast.error("Format non supporté", {
        description: "Formats acceptés : PNG, JPG, WebP, SVG.",
      });
      return;
    }

    setUploading(true);
    try {
      // Utilise le slug courant (si saisi) ou "article" comme suffixe de nom.
      const slugForUpload =
        form.getValues("slug")?.trim() || slugifyLite(form.getValues("nom"));

      const formData = new FormData();
      formData.append("file", file);
      if (slugForUpload) formData.append("slug", slugForUpload);

      const res = await fetch("/api/super-admin/catalogue/upload-icon", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Erreur lors de l'upload");
      }
      const publicUrl: string = data.data.publicUrl;
      setIconeUrl(publicUrl);
      toast.success("Icône uploadée", {
        description: "L'URL publique a été assignée à l'article.",
      });
    } catch (err) {
      toast.error("Échec de l'upload", {
        description: err instanceof Error ? err.message : "Erreur inconnue",
      });
    } finally {
      setUploading(false);
    }
  }

  // --- Soumission du formulaire ---
  async function onSubmit(values: FormValues) {
    // Résout la catégorie finale (soit sélectionnée, soit custom).
    const categorieFinale =
      values.categorie === AUTRE_VALUE
        ? (values.customCategorie?.trim() ?? "")
        : values.categorie;

    if (categorieFinale.length < 2) {
      toast.error("Catégorie invalide", {
        description: "La catégorie doit comporter au moins 2 caractères.",
      });
      return;
    }

    // Résout l'icone_url finale : si vide, dérive du slug (ou du nom slugifié).
    const slugFinal =
      values.slug?.trim() || slugifyLite(values.nom);
    const iconeFinale =
      iconeUrl.trim() || iconeUrlForSlug(slugFinal || "article");

    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        nom: values.nom.trim(),
        slug: slugFinal,
        categorie: categorieFinale,
        icone_url: iconeFinale,
        ordre_affichage: values.ordre_affichage,
        actif: values.actif,
      };

      let res: Response;
      if (isEditMode && article) {
        // PATCH : n'envoie que les champs modifiés (côté API, tous sont
        // optionnels). Ici on envoie tout pour simplicité — l'API gère.
        res = await fetch(`/api/super-admin/catalogue/${article.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch("/api/super-admin/catalogue", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Erreur lors de l'enregistrement");
      }

      toast.success(
        isEditMode ? "Article modifié avec succès" : "Article créé avec succès",
        {
          description: `${values.nom} — catégorie « ${categorieFinale} ».`,
        }
      );
      onOpenChange(false);
      onSaved?.();
    } catch (err) {
      toast.error("Échec de l'enregistrement", {
        description: err instanceof Error ? err.message : "Erreur inconnue",
      });
    } finally {
      setSubmitting(false);
    }
  }

  // Ferme le Dialog en resetant l'état.
  function handleOpenChange(o: boolean) {
    if (!o && !submitting && !uploading) {
      reset();
      setIconeUrl("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
    onOpenChange(o);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEditMode ? "Modifier l'article" : "Ajouter un article au catalogue"}
          </DialogTitle>
          <DialogDescription>
            {isEditMode
              ? "Modifiez le nom, la catégorie, l'icône ou l'ordre d'affichage."
              : "Renseignez les informations du nouvel article du catalogue global."}
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
                  <FormLabel>Nom *</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="Ex : Costumes & Vêtements de Cérémonie"
                      className="h-11"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Slug */}
            <FormField
              control={control}
              name="slug"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Slug (optionnel)</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="ex : costumes-ceremonie"
                      className="h-11 font-mono text-sm"
                    />
                  </FormControl>
                  <p className="text-xs text-muted-foreground">
                    Laissez vide pour générer automatiquement à partir du nom.
                    Format kebab-case (minuscules, chiffres, tirets).
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Catégorie */}
            <FormField
              control={control}
              name="categorie"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Catégorie *</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={(v) => {
                      field.onChange(v);
                      if (v !== AUTRE_VALUE) {
                        setValue("customCategorie", "");
                      }
                    }}
                  >
                    <FormControl>
                      <SelectTrigger className="h-11 w-full">
                        <SelectValue placeholder="Sélectionnez une catégorie" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {CATALOGUE_CATEGORIES_NOMS.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                      <SelectItem value={AUTRE_VALUE}>Autre…</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Catégorie personnalisée (si "Autre..." sélectionné) */}
            {categorieValue === AUTRE_VALUE && (
              <FormField
                control={control}
                name="customCategorie"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nouvelle catégorie *</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="Ex : Articles de sport"
                        className="h-11"
                      />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">
                      Sera créée comme nouvelle catégorie du catalogue.
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Icône (upload + preview + champ URL manuel) */}
            <div className="space-y-2">
              <Label>Icône de l&apos;article</Label>

              <div className="flex items-start gap-3">
                {/* Preview */}
                <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted/30">
                  {iconeUrl ? (
                    <Image
                      src={iconeUrl}
                      alt="Aperçu de l'icône"
                      width={80}
                      height={80}
                      unoptimized
                      className="size-full object-contain"
                      onError={() => {
                        // Si l'image ne charge pas, on remplace par une
                        // icône générique en vidant l'URL affichée.
                        setIconeUrl("");
                      }}
                    />
                  ) : (
                    <ImageIcon className="size-8 text-muted-foreground/50" />
                  )}
                </div>

                <div className="flex-1 space-y-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    onChange={handleFileChange}
                    disabled={uploading || submitting}
                    className="block w-full text-xs text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary-foreground hover:file:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  <p className="text-xs text-muted-foreground">
                    PNG, JPG, WebP ou SVG — max 5 MB.
                  </p>
                  {uploading && (
                    <p className="flex items-center gap-1.5 text-xs text-primary">
                      <Loader2 className="size-3 animate-spin" />
                      Upload en cours…
                    </p>
                  )}
                </div>
              </div>

              {/* Champ URL manuel (avancé) */}
              <Input
                value={iconeUrl}
                onChange={(e) => setIconeUrl(e.target.value)}
                placeholder="/images/articles/{slug}.png"
                className="h-9 font-mono text-xs"
                disabled={uploading || submitting}
              />
              <p className="text-xs text-muted-foreground">
                URL ou chemin public de l&apos;icône. Si vide, dérivé du slug
                automatiquement.
              </p>
            </div>

            {/* Ordre d'affichage */}
            <FormField
              control={control}
              name="ordre_affichage"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Ordre d&apos;affichage</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="number"
                      min="0"
                      max="9999"
                      step="1"
                      className="h-11"
                      value={field.value ?? 0}
                    />
                  </FormControl>
                  <p className="text-xs text-muted-foreground">
                    Entier entre 0 et 9999. Les articles sont triés par ordre
                    croissant au sein de leur catégorie.
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Actif */}
            <FormField
              control={control}
              name="actif"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <FormLabel className="text-sm font-medium">
                        Article actif
                      </FormLabel>
                      <p className="text-xs text-muted-foreground">
                        Un article inactif n&apos;apparaît plus dans le
                        sélecteur de commande, mais reste visible ici.
                      </p>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        aria-label="Activer/désactiver l'article"
                      />
                    </FormControl>
                  </div>
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={submitting || uploading}
              >
                Annuler
              </Button>
              <Button
                type="submit"
                disabled={submitting || uploading}
                className={cn("gap-2")}
              >
                {submitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    {isEditMode ? "Enregistrement…" : "Création…"}
                  </>
                ) : (
                  <>
                    <Check className="size-4" />
                    {isEditMode ? "Enregistrer" : "Ajouter l'article"}
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------
// Helper local : slugify léger (côté client, pour pré-upload)
// ---------------------------------------------------------------

/**
 * Slugify léger côté client pour nommer les fichiers uploadés. Ne valide
 * pas strictement ; l'API valide le slug final avec une regex plus stricte.
 */
function slugifyLite(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
