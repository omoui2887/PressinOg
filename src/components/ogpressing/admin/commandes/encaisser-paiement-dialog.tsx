/**
 * OgPressing — EncaisserPaiementDialog
 * --------------------------------------
 * Dialog réutilisable pour encaisser un paiement (acompte ou solde final)
 * sur une commande existante.
 *
 * FIX-ENCAISSE-ADMIN : ce dialog permet au manager / réceptionniste / caissier
 * de régler le solde d'une commande partiellement payée directement depuis
 * la page détail de la commande — sans passer par l'interface caissier dédiée.
 *
 * Flux :
 *   1. Ouverture du dialog (montant pré-rempli avec le reste à payer)
 *   2. Saisie : montant + méthode + référence (optionnelle) + notes (optionnelles)
 *   3. Soumission → POST /api/personnel/caissier/encaisser
 *   4. Succès : toast + onClose (le parent doit router.refresh() pour
 *      recharger les données de la commande depuis le serveur)
 *
 * Sécurité :
 *   - L'endpoint vérifie le rôle (CAN_ENCAISSER_PAIEMENT) + RLS par pressing
 *   - Le montant est validé côté client (≤ reste à payer) ET côté serveur
 *   - Les notes sont limitées à 2000 caractères (CHECK DB migration 031)
 */
"use client";

import { useState } from "react";
import {
  Banknote,
  CreditCard,
  Loader2,
  Smartphone,
  Wallet,
} from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  METHODE_PAIEMENT_LABELS,
  METHODE_PAIEMENT_OPTIONS,
} from "../commande-wizard/remise-labels";
import type { MethodePaiement } from "@/lib/types/database.types";
import { formatFCFA } from "@/lib/utils/format";

interface EncaisserPaiementDialogProps {
  /** Indique si le dialog est ouvert. */
  open: boolean;
  /** Callback appelé à la fermeture (X, Annuler, ou après succès). */
  onOpenChange: (open: boolean) => void;
  /** ID de la commande sur laquelle encaisser le paiement. */
  commandeId: string;
  /** Numéro de la commande (affiché dans le titre, ex: CMD-20260808-399496). */
  numeroCommande: string;
  /** Montant total de la commande (FCFA). */
  montantTotal: number;
  /** Montant déjà payé sur la commande (FCFA). */
  montantPaye: number;
  /** Callback appelé après un encaissement réussi. Le parent doit
   *  router.refresh() pour recharger les données serveur. */
  onSuccess?: () => void;
}

export function EncaisserPaiementDialog({
  open,
  onOpenChange,
  commandeId,
  numeroCommande,
  montantTotal,
  montantPaye,
  onSuccess,
}: EncaisserPaiementDialogProps) {
  const resteAPayer = Math.max(0, montantTotal - montantPaye);

  // Montant : pré-rempli avec le reste à payer (cas le plus courant :
  // le client vient régler le solde). L'utilisateur peut le réduire pour
  // un paiement partiel supplémentaire (accompte supplémentaire).
  const [montantInput, setMontantInput] = useState<string>(
    String(resteAPayer)
  );
  const [methode, setMethode] = useState<MethodePaiement>("especes");
  const [reference, setReference] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  // Réinitialise le formulaire quand le dialog s'ouvre.
  // Évite de conserver les valeurs d'une session précédente.
  // On utilise un useEffect léger basé sur `open`.
  // Pas de dépendance sur resteAPayer pour ne pas reset pendant la saisie.
  // En cas de payment successful, le parent ferme + re-ouvre si besoin,
  // et resteAPayer sera recalculé avec les nouvelles props.
  // (On réinit explicitement sur open=true.)
  // Simple : on remet le montant au reste à payer à l'ouverture.
  const handleOpenChange = (next: boolean) => {
    if (next) {
      // Ouverture : pré-remplit le montant avec le reste à payer courant.
      setMontantInput(String(resteAPayer));
      setMethode("especes");
      setReference("");
      setNotes("");
      setSubmitting(false);
    }
    onOpenChange(next);
  };

  const parsedMontant = parseInt(montantInput, 10);
  const isMontantValid =
    Number.isFinite(parsedMontant) &&
    Number.isInteger(parsedMontant) &&
    parsedMontant > 0 &&
    parsedMontant <= resteAPayer + 1; // tolérance 1 FCFA (alignée backend)
  const isNotesValid = notes.length <= 2000;

  async function handleSubmit() {
    if (!isMontantValid) {
      toast.error("Montant invalide", {
        description: `Le montant doit être un entier entre 1 et ${formatFCFA(resteAPayer)}.`,
      });
      return;
    }
    if (!isNotesValid) {
      toast.error("Notes trop longues", {
        description: "Les notes ne peuvent pas dépasser 2000 caractères.",
      });
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/personnel/caissier/encaisser", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commande_id: commandeId,
          montant: parsedMontant,
          methode,
          reference: reference.trim() || undefined,
          notes: notes.trim() || undefined,
        }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Échec de l'encaissement");
      }

      // Succès : toast + fermeture + callback pour refresh
      const nouveauReste = data.data?.reste_a_payer;
      const nouveauStatut = data.data?.nouveau_statut_paiement;
      const ferme = nouveauStatut === "paye";

      toast.success("Paiement encaissé", {
        description:
          ferme && nouveauReste === 0
            ? `Commande ${numeroCommande} entièrement soldée (${formatFCFA(parsedMontant)}).`
            : `Acompte de ${formatFCFA(parsedMontant)} encaissé. Reste à payer : ${formatFCFA(nouveauReste ?? 0)}.`,
      });

      onOpenChange(false);
      onSuccess?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur inconnue";
      toast.error("Échec de l'encaissement", { description: msg });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="size-5 text-primary" />
            Encaisser un paiement
          </DialogTitle>
          <DialogDescription>
            Commande{" "}
            <span className="font-mono font-semibold text-foreground">
              {numeroCommande}
            </span>{" "}
            — saisissez le montant versé par le client.
          </DialogDescription>
        </DialogHeader>

        {/* Récap financier */}
        <div className="rounded-lg border bg-muted/30 p-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Total commande</span>
            <span className="font-semibold text-foreground">
              {formatFCFA(montantTotal)}
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between">
            <span className="text-muted-foreground">Déjà payé</span>
            <span className="font-medium text-secondary">
              {formatFCFA(montantPaye)}
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between border-t pt-1">
            <span className="text-muted-foreground">Reste à payer</span>
            <span
              className={`font-bold ${
                resteAPayer > 0 ? "text-danger" : "text-secondary"
              }`}
            >
              {formatFCFA(resteAPayer)}
            </span>
          </div>
        </div>

        {/* Formulaire */}
        <div className="space-y-4">
          {/* Montant */}
          <div className="space-y-1.5">
            <Label htmlFor="encaisser-montant" className="text-sm">
              Montant versé (FCFA)
            </Label>
            <Input
              id="encaisser-montant"
              type="number"
              min={1}
              max={resteAPayer + 1}
              step={1}
              value={montantInput}
              onChange={(e) => setMontantInput(e.target.value)}
              disabled={submitting}
              className="font-mono"
              inputMode="numeric"
              autoFocus
            />
            <p className="text-[11px] text-muted-foreground">
              Pré-rempli avec le reste à payer. Réduisez si le client verse un
              acompte partiel.
            </p>
          </div>

          {/* Méthode */}
          <div className="space-y-1.5">
            <Label htmlFor="encaisser-methode" className="text-sm">
              Méthode de paiement
            </Label>
            <Select
              value={methode}
              onValueChange={(v) => setMethode(v as MethodePaiement)}
              disabled={submitting}
            >
              <SelectTrigger id="encaisser-methode" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {METHODE_PAIEMENT_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    <span className="flex items-center gap-2">
                      {opt.value === "especes" && (
                        <Banknote className="size-3.5" />
                      )}
                      {opt.value === "mobile_money" && (
                        <Smartphone className="size-3.5" />
                      )}
                      {opt.value === "carte_bancaire" && (
                        <CreditCard className="size-3.5" />
                      )}
                      {opt.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Référence (optionnelle) */}
          <div className="space-y-1.5">
            <Label
              htmlFor="encaisser-reference"
              className="text-sm text-muted-foreground"
            >
              Référence <span className="text-xs">(optionnel)</span>
            </Label>
            <Input
              id="encaisser-reference"
              type="text"
              maxLength={100}
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              disabled={submitting}
              placeholder="N° transaction Mobile Money, 4 derniers chiffres carte…"
              className="font-mono text-xs"
            />
          </div>

          {/* Notes (optionnelles) */}
          <div className="space-y-1.5">
            <Label
              htmlFor="encaisser-notes"
              className="text-sm text-muted-foreground"
            >
              Notes <span className="text-xs">(optionnel, max 2000)</span>
            </Label>
            <Textarea
              id="encaisser-notes"
              rows={2}
              maxLength={2000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={submitting}
              placeholder="Note interne sur ce paiement…"
              className="resize-none text-sm"
            />
            <p className="text-right text-[10px] text-muted-foreground">
              {notes.length}/2000
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
            className="sm:mr-auto"
          >
            Annuler
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !isMontantValid || !isNotesValid}
          >
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Encaissement…
              </>
            ) : (
              <>
                <Wallet className="size-4" />
                Encaisser {formatFCFA(parsedMontant || 0)}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { METHODE_PAIEMENT_LABELS };
