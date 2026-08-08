/**
 * OgPressing — EditInfoDialog (LOT 8.2)
 * --------------------------------------
 * Dialog d'édition des coordonnées d'un client : nom_complet, telephone,
 * email, adresse. Pré-rempli avec les valeurs courantes, submit via
 * PATCH /api/admin/clients/{id}.
 *
 * Sur succès : toast + callback `onUpdated(client)` pour que le parent
 * (ClientDetailPage) mette à jour son état local `currentClient` + ferme
 * le dialog. Sur erreur : toast.
 *
 * Client component — gestion état formulaire + fetch.
 */
"use client";

import { useEffect, useState } from "react";
import { Loader2, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import type { ClientDetail } from "./client-detail-helpers";

interface EditInfoDialogProps {
  client: ClientDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Appelé avec le client mis à jour après succès du PATCH. */
  onUpdated: (client: ClientDetail) => void;
}

interface FormState {
  nom_complet: string;
  telephone: string;
  email: string;
  adresse: string;
}

function toFormState(client: ClientDetail): FormState {
  return {
    nom_complet: client.nom_complet ?? "",
    telephone: client.telephone ?? "",
    email: client.email ?? "",
    adresse: client.adresse ?? "",
  };
}

export function EditInfoDialog({
  client,
  open,
  onOpenChange,
  onUpdated,
}: EditInfoDialogProps) {
  const [form, setForm] = useState<FormState>(() => toFormState(client));
  const [errors, setErrors] = useState<
    Partial<Record<keyof FormState, string>>
  >({});
  const [submitting, setSubmitting] = useState(false);

  // Resync le formulaire quand le client change (ex : autre fiche ouverte)
  // ou quand le dialog s'ouvre.
  useEffect(() => {
    if (open) {
      setForm(toFormState(client));
      setErrors({});
    }
  }, [open, client]);

  function update<K extends keyof FormState>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) {
      setErrors((prev) => ({ ...prev, [key]: undefined }));
    }
  }

  function validate(): boolean {
    const next: Partial<Record<keyof FormState, string>> = {};
    if (!form.nom_complet.trim()) {
      next.nom_complet = "Le nom complet est obligatoire";
    }
    if (!form.telephone.trim()) {
      next.telephone = "Le téléphone est obligatoire";
    }
    if (
      form.email.trim() &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())
    ) {
      next.email = "Format d'email invalide";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/clients/${client.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nom_complet: form.nom_complet.trim(),
          telephone: form.telephone.trim(),
          email: form.email.trim() || null,
          adresse: form.adresse.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Erreur lors de la mise à jour");
      }
      toast.success("Informations modifiées");
      onUpdated(data.data as ClientDetail);
      onOpenChange(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur inattendue";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  function handleOpenChange(next: boolean) {
    if (submitting) return;
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="size-5 text-primary" />
            Modifier les informations
          </DialogTitle>
          <DialogDescription>
            Mettez à jour les coordonnées du client.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Nom complet */}
          <div className="space-y-1.5">
            <Label htmlFor="edit-nom">
              Nom complet <span className="text-danger">*</span>
            </Label>
            <Input
              id="edit-nom"
              value={form.nom_complet}
              onChange={(e) => update("nom_complet", e.target.value)}
              disabled={submitting}
              required
              autoFocus
            />
            {errors.nom_complet && (
              <p className="text-xs text-danger">{errors.nom_complet}</p>
            )}
          </div>

          {/* Téléphone */}
          <div className="space-y-1.5">
            <Label htmlFor="edit-tel">
              Téléphone <span className="text-danger">*</span>
            </Label>
            <Input
              id="edit-tel"
              type="tel"
              value={form.telephone}
              onChange={(e) => update("telephone", e.target.value)}
              disabled={submitting}
              required
            />
            {errors.telephone && (
              <p className="text-xs text-danger">{errors.telephone}</p>
            )}
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <Label htmlFor="edit-email">Email (optionnel)</Label>
            <Input
              id="edit-email"
              type="email"
              value={form.email}
              onChange={(e) => update("email", e.target.value)}
              placeholder="ex : client@example.ci"
              disabled={submitting}
            />
            {errors.email && (
              <p className="text-xs text-danger">{errors.email}</p>
            )}
          </div>

          {/* Adresse */}
          <div className="space-y-1.5">
            <Label htmlFor="edit-adresse">Adresse (optionnel)</Label>
            <Input
              id="edit-adresse"
              value={form.adresse}
              onChange={(e) => update("adresse", e.target.value)}
              placeholder="ex : Cocody, Abidjan"
              disabled={submitting}
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={submitting}>
                <X className="size-4" />
                Annuler
              </Button>
            </DialogClose>
            <Button type="submit" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Enregistrement…
                </>
              ) : (
                <>
                  <Pencil className="size-4" />
                  Enregistrer
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
