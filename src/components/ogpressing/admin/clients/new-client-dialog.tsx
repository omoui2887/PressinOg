/**
 * e-pressing — NewClientDialog
 * -----------------------------
 * Dialog (modal) pour créer un nouveau client rattaché au pressing connecté.
 * Champs : Nom complet (requis), Téléphone (requis), Email (optionnel),
 * Adresse (optionnel).
 *
 * Identique aux champs de l'Étape 1 du POS (Wizard Nouvelle Commande) —
 * pourra être réutilisé via refactor ultérieur.
 *
 * Submit : POST /api/admin/clients → on success, toast + appelle onCreate
 * (le parent peut rafraîchir la liste).
 *
 * Client component : gestion état formulaire + fetch.
 */
"use client";

import { useState } from "react";
import { Plus, Loader2, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

/**
 * Client créé par le dialog, renvoyé au parent via `onCreated`.
 * Inclut les champs minimaux nécessaires pour présélectionner le client
 * dans un flux parent (ex : Étape 1 du wizard commande).
 */
export interface CreatedClient {
  id: string;
  nom_complet: string;
  telephone: string;
  email: string | null;
}

interface NewClientDialogProps {
  /**
   * Callback legacy (sans argument) appelé après création. Conservé pour
   * backward compat (ex : `ClientsPage` qui rafraîchit juste la liste).
   */
  onCreate?: () => void;
  /**
   * Callback appelé après création avec le client créé (id, nom_complet,
   * telephone, email). Utilisé par le wizard commande pour présélectionner
   * le nouveau client sans refetch de la liste.
   */
  onCreated?: (client: CreatedClient) => void;
  trigger?: React.ReactNode;
}

type FormState = {
  nom_complet: string;
  telephone: string;
  email: string;
  adresse: string;
};

const EMPTY: FormState = {
  nom_complet: "",
  telephone: "",
  email: "",
  adresse: "",
};

export function NewClientDialog({
  onCreate,
  onCreated,
  trigger,
}: NewClientDialogProps) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [submitting, setSubmitting] = useState(false);

  function update<K extends keyof FormState>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
    // Efface l'erreur du champ modifié
    if (errors[key]) {
      setErrors((prev) => ({ ...prev, [key]: undefined }));
    }
  }

  function validate(): boolean {
    const nextErrors: Partial<Record<keyof FormState, string>> = {};
    if (!form.nom_complet.trim()) {
      nextErrors.nom_complet = "Le nom complet est obligatoire";
    }
    if (!form.telephone.trim()) {
      nextErrors.telephone = "Le téléphone est obligatoire";
    }
    if (
      form.email.trim() &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())
    ) {
      nextErrors.email = "Format d'email invalide";
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/clients", {
        method: "POST",
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
        throw new Error(data.error || "Erreur lors de la création");
      }
      toast.success(`Client « ${form.nom_complet.trim()} » créé avec succès`);
      // L'API renvoie le client créé dans `data.data` (id, nom_complet,
      // telephone, email, adresse, points_fidelite, …). On le remonte au
      // parent via `onCreated` (présélection wizard) et `onCreate` (refresh).
      const created: CreatedClient | undefined = data?.data
        ? {
            id: data.data.id,
            nom_complet: data.data.nom_complet,
            telephone: data.data.telephone,
            email: data.data.email ?? null,
          }
        : undefined;
      setForm(EMPTY);
      setErrors({});
      setOpen(false);
      if (created) {
        onCreated?.(created);
      }
      onCreate?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur inattendue";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  function handleOpenChange(next: boolean) {
    if (submitting) return;
    setOpen(next);
    if (!next) {
      // Reset en fermant
      setForm(EMPTY);
      setErrors({});
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <Plus className="size-4" />
            Nouveau client
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="size-5 text-primary" />
            Nouveau client
          </DialogTitle>
          <DialogDescription>
            Renseignez les informations du client. Il sera rattaché à votre
            pressing.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Nom complet */}
          <div className="space-y-1.5">
            <Label htmlFor="client-nom">
              Nom complet <span className="text-danger">*</span>
            </Label>
            <Input
              id="client-nom"
              value={form.nom_complet}
              onChange={(e) => update("nom_complet", e.target.value)}
              placeholder="ex : Awa Koné"
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
            <Label htmlFor="client-tel">
              Téléphone <span className="text-danger">*</span>
            </Label>
            <Input
              id="client-tel"
              type="tel"
              value={form.telephone}
              onChange={(e) => update("telephone", e.target.value)}
              placeholder="ex : +225 07 00 00 00"
              disabled={submitting}
              required
            />
            {errors.telephone && (
              <p className="text-xs text-danger">{errors.telephone}</p>
            )}
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <Label htmlFor="client-email">Email (optionnel)</Label>
            <Input
              id="client-email"
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
            <Label htmlFor="client-adresse">Adresse (optionnel)</Label>
            <Input
              id="client-adresse"
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
                  Création…
                </>
              ) : (
                <>
                  <Plus className="size-4" />
                  Créer le client
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
