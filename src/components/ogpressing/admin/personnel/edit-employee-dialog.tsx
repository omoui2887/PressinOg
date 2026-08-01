/**
 * OgPressing — EditEmployeeDialog (LOT 9.3)
 * ------------------------------------------
 * Dialog de modification d'un employé existant.
 *
 * Champs éditables communs : Nom, Prénom, Téléphone, Email, Rôle.
 * Champs éditables spécifiques au rôle "caissier" (AUDIT 9.7 — migration 019) :
 *   - Nom affiché sur les reçus (nom_affiche_recu, TEXT)
 *   - Modes de paiement autorisés (modes_paiement_autorises, JSONB array)
 *   - Seuil d'alerte impayé (seuil_alerte_impaye, INTEGER FCFA)
 *
 * Le nom_complet en DB est reconstruit comme "{prenom} {nom}".
 *
 * Submit : PATCH /api/admin/personnel/[id] { action: "modifier", ... }
 * → toast succès + callback onUpdated (rafraîchir la liste).
 *
 * 🔒 L'API vérifie en défense en profondeur que l'appelant est manager
 *    actif du même pressing. RLS isole par pressing_id. L'API rejette
 *    les champs caissier (400) si la cible n'est pas caissier.
 */
"use client";

import { useState, useEffect } from "react";
import { Pencil, Loader2, ArrowRight, Info } from "lucide-react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
  type ModePaiementCaissier,
  ROLE_PERSONNEL_LABELS,
  MODES_PAIEMENT_CAISSIER,
  MODE_PAIEMENT_LABELS,
  MODES_AUTORISES_DEFAUT,
  SEUIL_ALERTE_IMPAYE_DEFAUT,
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

  // Champs caissier (AUDIT 9.7 — migration 019)
  const [nomAfficheRecu, setNomAfficheRecu] = useState("");
  const [modesAutorises, setModesAutorises] = useState<ModePaiementCaissier[]>(
    MODES_AUTORISES_DEFAUT
  );
  const [seuilAlerte, setSeuilAlerte] = useState<string>("");

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

      // Init champs caissier (avec fallback sur valeurs par défaut si
      // l'employé n'a pas encore ces colonnes — base pré-migration 019).
      setNomAfficheRecu(employe.nom_affiche_recu ?? "");
      // On ne conserve que les modes valides connus côté UI ; si la colonne
      // contient des valeurs inattendues (corruption / base non migrée),
      // on retombe sur le défaut "tous autorisés".
      const modesRecus = Array.isArray(employe.modes_paiement_autorises)
        ? employe.modes_paiement_autorises.filter((m): m is ModePaiementCaissier =>
            (MODES_PAIEMENT_CAISSIER as readonly string[]).includes(m)
          )
        : [];
      setModesAutorises(
        modesRecus.length > 0 ? modesRecus : MODES_AUTORISES_DEFAUT
      );
      setSeuilAlerte(
        typeof employe.seuil_alerte_impaye === "number"
          ? String(employe.seuil_alerte_impaye)
          : String(SEUIL_ALERTE_IMPAYE_DEFAUT)
      );
    }
  }, [open, employe]);

  /** Bascule un mode de paiement dans la sélection du caissier. */
  function toggleMode(mode: ModePaiementCaissier) {
    setModesAutorises((prev) =>
      prev.includes(mode)
        ? prev.filter((m) => m !== mode)
        : [...prev, mode]
    );
  }

  async function handleSubmit() {
    if (!nom.trim() || !prenom.trim() || !telephone.trim()) {
      toast.error("Nom, prénom et téléphone sont obligatoires.");
      return;
    }

    // Validation spécifique caissier (uniquement si role === "caissier")
    if (role === "caissier") {
      if (modesAutorises.length === 0) {
        toast.error(
          "Au moins un mode de paiement doit être autorisé pour ce caissier."
        );
        return;
      }
      const seuilNum = parseInt(seuilAlerte || "0", 10);
      if (
        !Number.isFinite(seuilNum) ||
        !Number.isInteger(seuilNum) ||
        seuilNum < 0 ||
        seuilNum > 1_000_000
      ) {
        toast.error(
          "Le seuil d'alerte impayé doit être un entier entre 0 et 1 000 000 FCFA."
        );
        return;
      }
    }

    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        action: "modifier",
        nom: nom.trim(),
        prenom: prenom.trim(),
        telephone: telephone.trim(),
        email: email.trim().toLowerCase(),
        role,
      };

      // On n'envoie les champs caissier QUE si le role est "caissier".
      // Cela évite le rejet 400 "CHAMPS_CAISSIER_SUR_NON_CAISSIER" côté API
      // lorsque l'admin change un caissier vers un autre rôle.
      if (role === "caissier") {
        payload.modes_paiement_autorises = modesAutorises;
        payload.nom_affiche_recu = nomAfficheRecu.trim();
        payload.seuil_alerte_impaye = parseInt(seuilAlerte || "0", 10);
      }

      const res = await fetch(`/api/admin/personnel/${employe.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Erreur lors de la modification");
      }

      toast.success(`${employe.nom_complet} a été modifié`);
      onUpdated?.();
      setOpen(false);
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
        console.error("[edit-employee] Erreur inattendue :", err);
        message = "Une erreur est survenue. Veuillez réessayer.";
      }
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  const estCaissier = role === "caissier";

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
                Laissez vide si l&apos;employé n&apos;a pas d&apos;email.
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

          {/* ---- Champs spécifiques au rôle caissier (AUDIT 9.7) ---- */}
          {estCaissier && (
            <div className="space-y-4 rounded-md border border-amber-200 bg-amber-50/50 p-3 dark:border-amber-900 dark:bg-amber-950/20">
              <div className="flex items-start gap-2">
                <Info className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-400" />
                <p className="text-xs text-amber-900 dark:text-amber-200">
                  Ces champs ne s&apos;appliquent qu&apos;aux caissiers. Ils
                  contrôlent les modes de paiement que ce caissier est
                  habilité à encaisser et le seuil de tolérance des soldes
                  impayés.
                </p>
              </div>

              {/* Nom affiché sur les reçus */}
              <div className="space-y-1.5">
                <Label htmlFor="edit-nom-recu">
                  Nom affiché sur les reçus
                </Label>
                <Input
                  id="edit-nom-recu"
                  value={nomAfficheRecu}
                  onChange={(e) => setNomAfficheRecu(e.target.value)}
                  placeholder="Laisser vide pour utiliser le nom complet"
                  maxLength={100}
                  disabled={submitting}
                />
                <p className="text-xs text-muted-foreground">
                  Si vide, le nom complet ({prenom || "Prénom"} {nom || "Nom"})
                  sera utilisé sur les reçus.
                </p>
              </div>

              {/* Modes de paiement autorisés */}
              <div className="space-y-2">
                <Label>Modes de paiement autorisés</Label>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {MODES_PAIEMENT_CAISSIER.map((mode) => {
                    const checked = modesAutorises.includes(mode);
                    return (
                      <label
                        key={mode}
                        htmlFor={`edit-mode-${mode}`}
                        className="flex cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
                      >
                        <Checkbox
                          id={`edit-mode-${mode}`}
                          checked={checked}
                          onCheckedChange={() => toggleMode(mode)}
                          disabled={submitting}
                        />
                        <span>{MODE_PAIEMENT_LABELS[mode]}</span>
                      </label>
                    );
                  })}
                </div>
                {modesAutorises.length === 0 && (
                  <Alert variant="destructive" className="py-2">
                    <AlertDescription className="text-xs">
                      Au moins un mode de paiement doit être sélectionné.
                    </AlertDescription>
                  </Alert>
                )}
              </div>

              {/* Seuil d'alerte impayé */}
              <div className="space-y-1.5">
                <Label htmlFor="edit-seuil">Seuil d&apos;alerte impayé (FCFA)</Label>
                <Input
                  id="edit-seuil"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={1000000}
                  step={100}
                  value={seuilAlerte}
                  onChange={(e) => setSeuilAlerte(e.target.value)}
                  placeholder="5000"
                  disabled={submitting}
                />
                <p className="text-xs text-muted-foreground">
                  En-dessous de ce montant, un solde impayé est considéré
                  comme acceptable (tolérance arrondi / micro-solde).
                </p>
              </div>
            </div>
          )}
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
