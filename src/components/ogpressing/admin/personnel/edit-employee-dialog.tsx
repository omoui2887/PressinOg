/**
 * OgPressing — EditEmployeeDialog (LOT 9.3)
 * ------------------------------------------
 * Dialog de modification d'un employé existant.
 *
 * Champs éditables : Nom, Prénom, Téléphone, Email, Rôle.
 * Le nom_complet en DB est reconstruit comme "{prenom} {nom}".
 *
 * Submit : PATCH /api/admin/personnel/[id] { action: "modifier", ... }
 * → toast succès + callback onUpdated (rafraîchir la liste).
 *
 * 🔒 L'API vérifie en défense en profondeur que l'appelant est manager
 *    actif du même pressing. RLS isole par pressing_id.
 */
"use client";

import { useState, useEffect } from "react";
import { Pencil, Loader2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectValue,
  SelectTrigger,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  type RolePersonnel,
  type Employe,
  ROLE_PERSONNEL_LABELS,
} from "./personnel-helpers";

interface EditEmployeeDialogProps {
  employe: Employe;
  onUpdated?: () => void;
  /** Élément déclencheur (bouton). Si non fourni, aucun trigger n'est rendu
   *  (mode contrôlé — utiliser open/onOpenChange). */
  trigger?: React.ReactNode;
  /** Mode contrôlé : open state géré par le parent. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function EditEmployeeDialog({
  employe,
  onUpdated,
  trigger,
  open: controlledOpen,
  onOpenChange,
}: EditEmployeeDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const [submitting, setSubmitting] = useState(false);

  // Champs formulaire — initialisés depuis l'employé
  // nom_complet est au format "Prenom Nom" → on split
  const [nom, setNom] = useState("");
  const [prenom, setPrenom] = useState("");
  const [telephone, setTelephone] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<RolePersonnel>("receptionniste");

  // Quand le dialog s'ouvre, initialise les champs depuis l'employé
  useEffect(() => {
    if (open) {
      // nom_complet = "Prenom Nom" → split sur le premier espace
      const parts = (employe.nom_complet || "").trim().split(" ");
      const p = parts[0] || "";
      const n = parts.slice(1).join(" ") || "";
      setPrenom(p);
      setNom(n);
      setTelephone(employe.telephone ?? "");
      setEmail(employe.email ?? "");
      setRole(employe.role);
    }
  }, [open, employe]);

  async function handleSubmit() {
    if (!nom.trim() || !prenom.trim() || !telephone.trim()) {
      toast.error("Nom, prénom et téléphone sont obligatoires.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/personnel/${employe.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "modifier",
          nom: nom.trim(),
          prenom: prenom.trim(),
          telephone: telephone.trim(),
          email: email.trim().toLowerCase(),
          role,
        }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Erreur lors de la modification");
      }

      toast.success(`${employe.nom_complet} a été modifié`);
      onUpdated?.();
      setOpen(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur inattendue";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && (
        <DialogTrigger asChild>
          {trigger}
        </DialogTrigger>
      )}

      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="size-5 text-primary" />
            Modifier un employé
          </DialogTitle>
          <DialogDescription>
            Mettez à jour les informations de {employe.nom_complet}. Le
            changement de rôle prend effet immédiatement sur les permissions.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Nom + Prénom */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit-nom">Nom *</Label>
              <Input
                id="edit-nom"
                value={nom}
                onChange={(e) => setNom(e.target.value)}
                disabled={submitting}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-prenom">Prénom *</Label>
              <Input
                id="edit-prenom"
                value={prenom}
                onChange={(e) => setPrenom(e.target.value)}
                disabled={submitting}
              />
            </div>
          </div>

          {/* Téléphone */}
          <div className="space-y-1.5">
            <Label htmlFor="edit-tel">Téléphone *</Label>
            <Input
              id="edit-tel"
              value={telephone}
              onChange={(e) => setTelephone(e.target.value)}
              placeholder="+225 07 00 00 00 00"
              disabled={submitting}
            />
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <Label htmlFor="edit-email">Email</Label>
            <Input
              id="edit-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@exemple.com"
              disabled={submitting}
            />
            {!email && (
              <p className="text-xs text-muted-foreground">
                Laissez vide si l'employé n'a pas d'email.
              </p>
            )}
          </div>

          {/* Rôle */}
          <div className="space-y-1.5">
            <Label htmlFor="edit-role">Rôle *</Label>
            <Select
              value={role}
              onValueChange={(v) => setRole(v as RolePersonnel)}
              disabled={submitting}
            >
              <SelectTrigger id="edit-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(ROLE_PERSONNEL_LABELS) as RolePersonnel[]).map(
                  (r) => (
                    <SelectItem key={r} value={r}>
                      {ROLE_PERSONNEL_LABELS[r]}
                    </SelectItem>
                  )
                )}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={submitting}
          >
            Annuler
          </Button>
          <Button onClick={handleSubmit} disabled={submitting} className="gap-2">
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Modification...
              </>
            ) : (
              <>
                Enregistrer
                <ArrowRight className="size-4" />
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
