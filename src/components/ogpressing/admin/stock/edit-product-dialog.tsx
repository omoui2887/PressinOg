/**
 * OgPressing — EditProductDialog (LOT 10.1)
 * ------------------------------------------
 * Modification d'un produit_stock : nom, catégorie, unité, seuil d'alerte,
 * prix d'achat, fournisseur, date d'expiration, FDS (re-upload).
 *
 * Au submit :
 *   1. Si une nouvelle FDS est sélectionnée : POST /api/admin/stock/[id]/fds-upload
 *      (multipart/form-data). Le serveur valide MIME + taille + magic number
 *      %PDF-, uploade via admin client (service_role) et met à jour
 *      `produits_stock.fds_url` côté serveur.
 *   2. PATCH /api/admin/stock/[id] pour les autres champs (et fds_url=null
 *      si l'utilisateur a cliqué "supprimer la FDS" sans nouveau fichier).
 *
 * 🔒 SÉCURITÉ (AUDIT Conclusion #2 + #4 — REMEDIATE-STORAGE) :
 *   - Bucket `fds` PRIVÉ (migration 016). Path préfixé par pressing_id :
 *     `fds/{pressing_id}/{timestamp}-{random}.pdf` → RLS `fds_select_isolation`.
 *   - L'upload FDS ne se fait PLUS côté client (clé anon) — un attaquant
 *     pouvait forger un Content-Type `application/pdf` et uploader un
 *     binaire arbitraire. Désormais, l'upload passe par la route serveur
 *     dédiée qui valide MIME + magic number %PDF- avant d'écrire.
 *   - Pré-check client MIME `application/pdf` strict pour UX (feedback
 *     instantané) — le serveur reste la source de vérité.
 *   - Lecture FDS : /api/admin/stock/[id]/fds-url (signed URL 1 heure).
 */
"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Upload, FileText, X, ExternalLink } from "lucide-react";
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
import { CATEGORIES, UNITES, type ProduitStock } from "./stock-helpers";

const schema = z.object({
  nom: z
    .string()
    .min(2, "Le nom doit comporter au moins 2 caractères")
    .max(100, "Le nom ne peut pas dépasser 100 caractères"),
  categorie: z.string().min(1, "La catégorie est obligatoire"),
  unite: z.string().min(1, "L'unité est obligatoire"),
  seuil_alerte: z.coerce.number().min(0, "Le seuil doit être ≥ 0"),
  date_expiration: z.string().optional().default(""),
  prix_achat_unitaire: z.string().optional().default(""),
  fournisseur: z.string().max(200).optional().default(""),
});

type FormValues = z.infer<typeof schema>;

interface EditProductDialogProps {
  produit: ProduitStock | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onProductUpdated?: () => void;
}

export function EditProductDialog({
  produit,
  open,
  onOpenChange,
  onProductUpdated,
}: EditProductDialogProps) {
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [fdsFile, setFdsFile] = useState<File | null>(null);
  const [removeFds, setRemoveFds] = useState(false);
  const [viewingFds, setViewingFds] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  // Pré-remplit le formulaire quand le produit change.
  useEffect(() => {
    if (produit && open) {
      form.reset({
        nom: produit.nom,
        categorie: produit.categorie,
        unite: produit.unite,
        seuil_alerte: Number(produit.seuil_alerte) || 0,
        date_expiration: produit.date_expiration || "",
        prix_achat_unitaire:
          produit.prix_achat_unitaire !== null
            ? String(produit.prix_achat_unitaire)
            : "",
        fournisseur: produit.fournisseur || "",
      });
      setFdsFile(null);
      setRemoveFds(false);
    }
  }, [produit, open, form]);

  if (!produit) return null;

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
            : "Les autres modifications ont été enregistrées sans nouvelle FDS.",
      });
      return false;
    } finally {
      setUploading(false);
    }
  }

  /**
   * Récupère une signed URL (1 heure) pour la FDS d'un produit via la route
   * serveur /api/admin/stock/[id]/fds-url. La route vérifie l'authentification,
   * le rattachement au pressing, et applique la RLS Storage.
   *
   * Retourne l'URL signée ou null en cas d'erreur.
   */
  async function fetchFdsSignedUrl(produitId: string): Promise<string | null> {
    try {
      const res = await fetch(`/api/admin/stock/${produitId}/fds-url`, {
        method: "GET",
      });
      const data = await res.json();
      if (!res.ok || !data.success || !data.data?.url) {
        throw new Error(data.error || "Signed URL FDS indisponible");
      }
      return data.data.url as string;
    } catch (err) {
      // 🔒 Audit #16 (Phase 4) : on ne logue pas l'objet err complet.
      console.warn(
        "[stock] Échec fetchFdsSignedUrl :",
        err instanceof Error ? err.message : "erreur"
      );
      toast.error("FDS inaccessible", {
        description:
          err instanceof Error ? err.message : "Erreur inconnue",
      });
      return null;
    }
  }

  /** Ouvre la FDS du produit dans un nouvel onglet via signed URL serveur. */
  async function handleViewFds() {
    if (!produit) return;
    setViewingFds(true);
    try {
      const url = await fetchFdsSignedUrl(produit.id);
      if (url) {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    } finally {
      setViewingFds(false);
    }
  }

  async function onSubmit(values: FormValues) {
    setSubmitting(true);
    try {
      // 1. Si un nouveau fichier FDS est sélectionné, l'uploader côté serveur
      //    FIRST (la route met à jour produits_stock.fds_url directement).
      //    Si l'upload réussit, on n'envoie PAS fds_url dans le PATCH ci-dessous.
      let fdsUploaded = false;
      if (fdsFile) {
        fdsUploaded = await uploadFdsServerSide(produit!.id);
      }

      // 2. PATCH des autres champs (nom, categorie, unite, seuil, etc.).
      //    Inclut fds_url=null UNIQUEMENT si l'utilisateur a cliqué "supprimer
      //    la FDS" et n'a pas sélectionné de nouveau fichier.
      const body: Record<string, unknown> = {
        nom: values.nom.trim(),
        categorie: values.categorie,
        unite: values.unite,
        seuil_alerte: values.seuil_alerte,
        date_expiration: values.date_expiration || null,
        prix_achat_unitaire:
          values.prix_achat_unitaire && values.prix_achat_unitaire.trim() !== ""
            ? parseInt(values.prix_achat_unitaire, 10)
            : null,
        fournisseur: values.fournisseur?.trim() || null,
      };
      if (!fdsUploaded && removeFds) {
        body.fds_url = null;
      }

      const res = await fetch(`/api/admin/stock/${produit!.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Erreur lors de la mise à jour");
      }
      toast.success("Produit modifié", {
        description: `${values.nom} a été mis à jour.`,
      });
      onOpenChange(false);
      onProductUpdated?.();
    } catch (err) {
      toast.error("Échec de la modification", {
        description: err instanceof Error ? err.message : "Erreur inconnue",
      });
    } finally {
      setSubmitting(false);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // Sécurité (audit #4) : refuse tout fichier dont le MIME n'est pas
    // exactement "application/pdf", indépendamment de l'extension.
    // Avant : `&&` laissait passer malware.pdf (MIME piégé + extension .pdf).
    if (file.type !== "application/pdf") {
      toast.error("Fichier invalide", { description: "La FDS doit être un PDF." });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Fichier trop volumineux", { description: "Max 5 Mo." });
      return;
    }
    setFdsFile(file);
    setRemoveFds(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Modifier le produit</DialogTitle>
          <DialogDescription>{produit.nom}</DialogDescription>
        </DialogHeader>

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

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="categorie"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Catégorie *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="h-11">
                          <SelectValue />
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
                control={form.control}
                name="unite"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Unité *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="h-11">
                          <SelectValue />
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

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
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

              <FormField
                control={form.control}
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
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
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
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
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
                      <Input {...field} className="h-11" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* FDS actuelle + upload */}
            <div className="space-y-2">
              <Label>Fiche de Données de Sécurité (FDS)</Label>
              {produit.fds_url && !removeFds && !fdsFile ? (
                <div className="flex items-center gap-2 rounded-md border bg-muted/30 p-3">
                  <FileText className="size-5 shrink-0 text-primary" />
                  <button
                    type="button"
                    onClick={handleViewFds}
                    disabled={viewingFds}
                    className="flex flex-1 items-center gap-1 text-sm text-primary hover:underline disabled:opacity-60"
                  >
                    {viewingFds ? "Génération…" : "Voir la FDS actuelle"}
                    {!viewingFds && <ExternalLink className="size-3" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => setRemoveFds(true)}
                    className="text-muted-foreground hover:text-danger"
                    aria-label="Supprimer la FDS"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              ) : fdsFile ? (
                <div className="flex items-center gap-2 rounded-md border bg-muted/30 p-3">
                  <FileText className="size-5 shrink-0 text-secondary" />
                  <span className="flex-1 truncate text-sm text-foreground">
                    {fdsFile.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => setFdsFile(null)}
                    className="text-muted-foreground hover:text-danger"
                    aria-label="Retirer"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              ) : (
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed p-4 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-primary">
                  <Upload className="size-4" />
                  <span>
                    {removeFds ? "Nouvelle FDS (l'ancienne sera supprimée)" : "Cliquez pour sélectionner un PDF"}
                  </span>
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
                disabled={submitting || uploading || viewingFds}
              >
                Annuler
              </Button>
              <Button type="submit" disabled={submitting || uploading || viewingFds}>
                {submitting || uploading ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    {uploading ? "Upload FDS…" : "Enregistrement…"}
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
