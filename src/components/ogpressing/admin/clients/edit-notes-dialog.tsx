/**
 * OgPressing — EditNotesDialog (LOT 8.2)
 * ---------------------------------------
 * Dialog d'édition des notes libres d'un client (textarea 4 lignes).
 * Submit via PATCH /api/admin/clients/{id} avec `{ notes }`.
 *
 * Sur succès : toast + callback `onUpdated(client)`. Sur erreur : toast.
 *
 * Client component — gestion état formulaire + fetch.
 */
"use client";

import { useEffect, useState } from "react";
import { Loader2, StickyNote, X } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import type { ClientDetail } from "./client-detail-helpers";

interface EditNotesDialogProps {
  client: ClientDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: (client: ClientDetail) => void;
}

export function EditNotesDialog({
  client,
  open,
  onOpenChange,
  onUpdated,
}: EditNotesDialogProps) {
  const [notes, setNotes] = useState<string>(client.notes ?? "");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setNotes(client.notes ?? "");
    }
  }, [open, client]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/clients/${client.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notes: notes.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Erreur lors de la mise à jour");
      }
      toast.success("Notes modifiées");
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
            <StickyNote className="size-5 text-primary" />
            Modifier les notes
          </DialogTitle>
          <DialogDescription>
            Notes internes visibles par votre équipe (préférences particulières,
            contraintes, historique de litiges…).
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="edit-notes">Notes</Label>
            <Textarea
              id="edit-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="ex : Client sensible aux parfums forts, éviter l'adoucissant."
              rows={4}
              disabled={submitting}
              autoFocus
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
                  <StickyNote className="size-4" />
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
