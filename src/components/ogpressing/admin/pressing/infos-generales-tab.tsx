/**
 * OgPressing — InfosGeneralesTab (LOT 11.2 — onglet 1)
 * -----------------------------------------------------
 * Formulaire d'édition des informations générales du pressing :
 *   - Nom (obligatoire, 2-200)
 *   - Ville (≤ 100)
 *   - Adresse (≤ 500)
 *   - Téléphone (10 chiffres, commence par 0, ou vide)
 *   - Email (format email, ou vide)
 *   - Logo (upload image PNG/JPEG/WebP, max 2 Mo, vers Supabase Storage
 *     bucket `logos`)
 *
 * Au submit :
 *   1. Si un nouveau logo est sélectionné → upload Storage `logos` (échec
 *      non bloquant, toast.warning)
 *   2. PATCH /api/admin/pressing avec les champs modifiés
 *   3. On success → toast.success + onUpdated(pressing)
 *
 * Patterns réutilisés : RHF + zod + shadcn Form (cf. add-product-dialog.tsx),
 * upload Storage côté client (cf. add-product-dialog.tsx FDS PDF).
 */
"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Upload, X, Building2, ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { PressingInfo } from "./pressing-helpers";

const schema = z.object({
  nom: z
    .string()
    .min(2, "Le nom doit comporter au moins 2 caractères")
    .max(200, "Le nom ne peut pas dépasser 200 caractères"),
  ville: z
    .string()
    .max(100, "La ville ne peut pas dépasser 100 caractères")
    .optional()
    .default(""),
  adresse: z
    .string()
    .max(500, "L'adresse ne peut pas dépasser 500 caractères")
    .optional()
    .default(""),
  telephone: z
    .string()
    .optional()
    .default("")
    .refine(
      (v) => {
        if (!v || v.trim() === "") return true;
        const digits = v.replace(/[\s.-]/g, "");
        return /^0\d{9}$/.test(digits);
      },
      {
        message:
          "Format invalide. 10 chiffres commençant par 0 (ex : 07 12 34 56 78).",
      }
    ),
  email: z
    .string()
    .optional()
    .default("")
    .refine(
      (v) => {
        if (!v || v.trim() === "") return true;
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
      },
      { message: "Format d'email invalide." }
    ),
});

type FormValues = z.infer<typeof schema>;

interface InfosGeneralesTabProps {
  pressing: PressingInfo | null;
  loading: boolean;
  onUpdated: (p: PressingInfo) => void;
}

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
const MAX_SIZE = 2 * 1024 * 1024; // 2 Mo

export function InfosGeneralesTab({
  pressing,
  loading,
  onUpdated,
}: InfosGeneralesTabProps) {
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  // logo_url actuel (soit celui du pressing en DB, soit celui nouvellement uploadé)
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      nom: "",
      ville: "",
      adresse: "",
      telephone: "",
      email: "",
    },
  });

  const { control, handleSubmit, reset, formState } = form;

  // Reset du form quand le pressing est chargé / change
  useEffect(() => {
    if (!pressing) return;
    reset({
      nom: pressing.nom ?? "",
      ville: pressing.ville ?? "",
      adresse: pressing.adresse ?? "",
      telephone: pressing.telephone ?? "",
      email: pressing.email ?? "",
    });
    setLogoUrl(pressing.logo_url ?? null);
    setLogoFile(null);
    setLogoPreviewUrl(null);
  }, [pressing?.id, reset, pressing]);

  // Cleanup URL.createObjectURL pour éviter les fuites mémoire
  useEffect(() => {
    return () => {
      if (logoPreviewUrl) {
        URL.revokeObjectURL(logoPreviewUrl);
      }
    };
  }, [logoPreviewUrl]);

  /** Upload le logo vers le bucket Storage `logos`. Retourne l'URL publique ou null. */
  async function uploadLogo(): Promise<string | null> {
    if (!logoFile || !pressing) return null;
    setUploading(true);
    try {
      const supabase = getSupabaseBrowser();
      const ext = logoFile.name.split(".").pop()?.toLowerCase() || "png";
      const path = `logos/${pressing.id}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("logos")
        .upload(path, logoFile, {
          cacheControl: "3600",
          upsert: false,
          contentType: logoFile.type || "image/png",
        });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage
        .from("logos")
        .getPublicUrl(path);
      return pub?.publicUrl ?? null;
    } catch (err) {
      console.warn("[pressing] Échec upload logo (continuons sans) :", err);
      toast.warning("Logo non uploadé", {
        description:
          "Le stockage des logos est indisponible. Les autres informations seront tout de même enregistrées.",
      });
      return null;
    } finally {
      setUploading(false);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) {
      setLogoFile(null);
      if (logoPreviewUrl) {
        URL.revokeObjectURL(logoPreviewUrl);
        setLogoPreviewUrl(null);
      }
      return;
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      toast.error("Fichier invalide", {
        description: "Le logo doit être une image PNG, JPEG ou WebP.",
      });
      return;
    }
    if (file.size > MAX_SIZE) {
      toast.error("Fichier trop volumineux", {
        description: "Le logo ne peut pas dépasser 2 Mo.",
      });
      return;
    }
    // Révoque l'ancienne preview si présente
    if (logoPreviewUrl) URL.revokeObjectURL(logoPreviewUrl);
    setLogoFile(file);
    setLogoPreviewUrl(URL.createObjectURL(file));
  }

  function handleRemoveLogo() {
    if (logoPreviewUrl) URL.revokeObjectURL(logoPreviewUrl);
    setLogoFile(null);
    setLogoPreviewUrl(null);
    setLogoUrl(null);
  }

  async function onSubmit(values: FormValues) {
    setSubmitting(true);
    try {
      // 1. Upload logo si un nouveau fichier est sélectionné
      let finalLogoUrl = logoUrl;
      if (logoFile) {
        const uploaded = await uploadLogo();
        if (uploaded) {
          finalLogoUrl = uploaded;
        }
        // Si upload échoue (retourne null), finalLogoUrl garde sa valeur précédente
        // (potentiellement l'ancien logo du pressing), sauf si l'utilisateur l'avait retiré.
      }

      // 2. PATCH
      const res = await fetch("/api/admin/pressing", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nom: values.nom.trim(),
          ville: values.ville?.trim() || null,
          adresse: values.adresse?.trim() || null,
          telephone: values.telephone?.trim() || null,
          email: values.email?.trim() || null,
          logo_url: finalLogoUrl,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Erreur lors de l'enregistrement");
      }

      // 3. Succès : toast + propagation
      toast.success("Informations enregistrées", {
        description: "Les modifications ont été enregistrées avec succès.",
      });
      // Réinitialise l'état logo (le nouveau logo est désormais "l'actuel")
      setLogoFile(null);
      if (logoPreviewUrl) URL.revokeObjectURL(logoPreviewUrl);
      setLogoPreviewUrl(null);
      setLogoUrl(finalLogoUrl);
      onUpdated(data.data.pressing as PressingInfo);
    } catch (err) {
      toast.error("Échec de l'enregistrement", {
        description: err instanceof Error ? err.message : "Erreur inconnue",
      });
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent className="space-y-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-11 w-full" />
          ))}
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!pressing) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Impossible de charger les informations du pressing.
        </CardContent>
      </Card>
    );
  }

  // Image affichée : preview locale si un nouveau fichier est sélectionné,
  // sinon logo_url (DB ou nouvellement uploadé).
  const displayedLogoUrl = logoPreviewUrl ?? logoUrl;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="size-5 text-primary" />
          Informations générales
        </CardTitle>
        <CardDescription>
          Ces informations apparaissent sur vos tickets imprimés et dans votre espace.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form
            onSubmit={handleSubmit(onSubmit)}
            className="space-y-4"
            noValidate
          >
            {/* Nom */}
            <FormField
              control={control}
              name="nom"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nom du pressing *</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="Ex : OgPressing Cocody"
                      className="h-11"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Ville + Téléphone */}
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={control}
                name="ville"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ville</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="Ex : Abidjan"
                        className="h-11"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={control}
                name="telephone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Téléphone</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="tel"
                        placeholder="Ex : 07 12 34 56 78"
                        className="h-11"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Email + Adresse */}
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="email"
                        placeholder="ex : contact@monpressing.ci"
                        className="h-11"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={control}
                name="adresse"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Adresse</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="Ex : Rue des Jardins, Cocody"
                        className="h-11"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Logo */}
            <div className="space-y-2">
              <Label>Logo du pressing</Label>
              <p className="text-xs text-muted-foreground">
                PNG, JPEG ou WebP. Max 2 Mo. Affiché sur vos tickets et dans votre
                espace.
              </p>

              {/* Preview actuelle */}
              {displayedLogoUrl ? (
                <div className="flex items-center gap-3 rounded-md border bg-muted/30 p-3">
                  <img
                    src={displayedLogoUrl}
                    alt={`Logo ${pressing.nom}`}
                    className="size-16 shrink-0 rounded-md border object-contain bg-white"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {logoFile ? logoFile.name : "Logo actuel"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {logoFile ? "Nouveau logo (pas encore enregistré)" : "Logo enregistré"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleRemoveLogo}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-danger/10 hover:text-danger"
                    aria-label="Retirer le logo"
                  >
                    <X className="size-4" />
                    Retirer
                  </button>
                </div>
              ) : (
                <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed p-6 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-primary">
                  <span className="flex size-10 items-center justify-center rounded-full bg-muted">
                    <ImageIcon className="size-5" />
                  </span>
                  <span className="flex items-center gap-1.5 font-medium">
                    <Upload className="size-4" />
                    Cliquez pour sélectionner un logo
                  </span>
                  <span className="text-xs">PNG, JPEG ou WebP — max 2 Mo</span>
                  <input
                    type="file"
                    accept={ALLOWED_TYPES.join(",")}
                    className="sr-only"
                    onChange={handleFileChange}
                  />
                </label>
              )}

              {/* Bouton "Changer le logo" si un logo est déjà affiché */}
              {displayedLogoUrl && (
                <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium text-primary hover:underline">
                  <Upload className="size-3.5" />
                  Changer le logo
                  <input
                    type="file"
                    accept={ALLOWED_TYPES.join(",")}
                    className="sr-only"
                    onChange={handleFileChange}
                  />
                </label>
              )}
            </div>

            {/* Submit */}
            <Button
              type="submit"
              disabled={submitting || uploading || formState.isSubmitting}
              className="w-full sm:w-auto"
            >
              {submitting || uploading ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {uploading ? "Upload logo…" : "Enregistrement…"}
                </>
              ) : (
                "Enregistrer les modifications"
              )}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
