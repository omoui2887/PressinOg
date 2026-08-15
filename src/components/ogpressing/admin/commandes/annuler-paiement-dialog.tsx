/**
 * e-pressing — AnnulerPaiementDialog
 * -----------------------------------
 * Dialog de confirmation FORT pour l'annulation d'un paiement financier
 * (reversal entry — migration 035/043).
 *
 * ⚠️ PRINCIPE FONDAMENTAL : on ne supprime JAMAIS un paiement. L'annulation
 *    crée une écriture de reversal (statut_row='annule' + ligne dans
 *    `paiement_annulations` + recalcul montant_paye/statut_paiement + audit).
 *    Cette action est IRRÉVERSIBLE.
 *
 * Flux :
 *   1. Ouverture du dialog (affiche les détails du paiement : montant,
 *      méthode, date, référence)
 *   2. Saisie : type d'annulation (radio) + motif (textarea, 10–1000 cars)
 *   3. Checkbox de confirmation obligatoire (« action irréversible »)
 *   4. Bouton « Annuler ce paiement » activé uniquement si :
 *        - type sélectionné
 *        - motif valide (10 ≤ len ≤ 1000)
 *        - checkbox cochée
 *   5. Soumission → POST /api/admin/paiements/[id]/annuler
 *   6. Succès : toast + fermeture + onSuccess (le parent router.refresh())
 *
 * Sécurité :
 *   - L'endpoint vérifie le rôle (CAN_ANNULER_PAIEMENT = manager, comptable)
 *     + RLS par pressing + RPC SQL (defense-in-depth)
 *   - Le bouton n'est affiché que pour les rôles autorisés (côté parent)
 *
 * @see src/app/api/admin/paiements/[id]/annuler/route.ts
 * @see src/lib/financial/atomic.ts (annulerPaiementAtomique)
 */
"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { formatFCFA, formatDate } from "@/lib/utils/format";
import { methodePaiementLabel, type CommandeDetailPaiement } from "./commande-print";

/** Types d'annulation acceptés par l'API (mirroir de TypeAnnulationPaiement). */
type TypeAnnulation = "erreur_saisie" | "doublon" | "remboursement" | "autre";

/** Options du sélecteur de type (label + valeur + note optionnelle). */
const TYPE_OPTIONS: ReadonlyArray<{
  value: TypeAnnulation;
  label: string;
  description?: string;
}> = [
  {
    value: "erreur_saisie",
    label: "Erreur de saisie",
    description: "Montant ou méthode incorrects saisis par mégarde.",
  },
  {
    value: "doublon",
    label: "Doublon",
    description: "Le paiement a été enregistré deux fois.",
  },
  {
    value: "remboursement",
    label: "Remboursement",
    description:
      "L'argent a été rendu au client (espèces ou transfert reverse).",
  },
  {
    value: "autre",
    label: "Autre",
    description: "Précisez la raison dans le motif ci-dessous.",
  },
];

/** Bornes de longueur du motif (alignées sur la validation backend). */
const MOTIF_MIN = 10;
const MOTIF_MAX = 1000;

interface AnnulerPaiementDialogProps {
  /** Indique si le dialog est ouvert. */
  open: boolean;
  /** Callback appelé à la fermeture (X, Échap, Annuler, ou après succès). */
  onOpenChange: (open: boolean) => void;
  /** Paiement ciblé par l'annulation. Null si dialog fermé. */
  paiement: CommandeDetailPaiement | null;
  /** ID de la commande parente (utilisé uniquement pour le toast de succès). */
  commandeId: string;
  /** Callback appelé après une annulation réussie. Le parent doit
   *  router.refresh() pour recharger les données serveur. */
  onSuccess: () => void;
}

export function AnnulerPaiementDialog({
  open,
  onOpenChange,
  paiement,
  commandeId,
  onSuccess,
}: AnnulerPaiementDialogProps) {
  const [type, setType] = useState<TypeAnnulation>("erreur_saisie");
  const [motif, setMotif] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  // Réinitialise le formulaire à chaque ouverture. Évite de conserver les
  // valeurs d'une session précédente (motif, type, checkbox).
  useEffect(() => {
    if (open) {
      setType("erreur_saisie");
      setMotif("");
      setConfirmed(false);
      setSubmitting(false);
      setApiError(null);
    }
  }, [open]);

  const trimmedMotif = motif.trim();
  const isMotifValid =
    trimmedMotif.length >= MOTIF_MIN && trimmedMotif.length <= MOTIF_MAX;
  const canSubmit = isMotifValid && confirmed && !submitting && !!paiement;

  async function handleSubmit() {
    if (!paiement) return;
    if (!isMotifValid || !confirmed) return;

    setSubmitting(true);
    setApiError(null);
    try {
      const res = await fetch(
        `/api/admin/paiements/${paiement.id}/annuler`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ motif: trimmedMotif, type }),
        }
      );
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.success) {
        const msg =
          (typeof data.error === "string" && data.error) ||
          `Échec de l'annulation (HTTP ${res.status}).`;
        setApiError(msg);
        toast.error("Échec de l'annulation", { description: msg });
        return;
      }

      // Succès : toast informatif + fermeture + callback pour refresh.
      const d = data.data ?? {};
      const nouveauStatut =
        typeof d.nouveau_statut_paiement === "string"
          ? d.nouveau_statut_paiement
          : null;
      const reste =
        typeof d.reste_a_payer === "number" ? d.reste_a_payer : null;

      toast.success("Paiement annulé", {
        description:
          nouveauStatut && reste !== null
            ? `${formatFCFA(paiement.montant)} reversé. Statut paiement : ${nouveauStatut} — reste ${formatFCFA(reste)}.`
            : `${formatFCFA(paiement.montant)} reversé (écriture d'annulation créée).`,
      });

      onOpenChange(false);
      onSuccess();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur inconnue";
      setApiError(msg);
      toast.error("Échec de l'annulation", { description: msg });
    } finally {
      setSubmitting(false);
    }
  }

  // On ne rend pas le contenu si aucun paiement n'est fourni (sécurité
  // supplémentaire : le dialog reste contrôlé par `open` côté parent, mais
  // on évite tout rendu avec des données partielles).
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-h-[90vh] max-w-[calc(100%-2rem)] overflow-y-auto sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="size-5 shrink-0" />
            Annuler ce paiement
          </AlertDialogTitle>
          <AlertDialogDescription>
            Cette action crée une écriture de reversal et est{" "}
            <strong className="font-semibold text-foreground">
              irréversible
            </strong>
            . Le paiement sera marqué comme annulé et le montant sera déduit
            du cumul payé de la commande.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {paiement ? (
          <div className="space-y-4">
            {/* Récap du paiement ciblé */}
            <div className="rounded-lg border bg-muted/30 p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Montant</span>
                <span className="font-mono font-semibold text-foreground">
                  {formatFCFA(paiement.montant)}
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Méthode</span>
                <span className="font-medium text-foreground">
                  {methodePaiementLabel(paiement.methode)}
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Date</span>
                <span className="text-foreground">
                  {formatDate(paiement.date_paiement)}
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Référence</span>
                <span className="font-mono text-xs text-foreground">
                  {paiement.reference ?? "—"}
                </span>
              </div>
            </div>

            {/* Type d'annulation */}
            <div className="space-y-2">
              <Label className="text-sm font-medium text-foreground">
                Type d'annulation
              </Label>
              <RadioGroup
                value={type}
                onValueChange={(v) => setType(v as TypeAnnulation)}
                className="gap-1.5"
                disabled={submitting}
              >
                {TYPE_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    htmlFor={`annuler-type-${opt.value}`}
                    className="flex cursor-pointer items-start gap-3 rounded-md border border-transparent p-2 transition-colors hover:bg-accent/50 has-[:checked]:border-border has-[:checked]:bg-accent/40"
                  >
                    <RadioGroupItem
                      id={`annuler-type-${opt.value}`}
                      value={opt.value}
                      className="mt-0.5"
                      disabled={submitting}
                    />
                    <div className="space-y-0.5">
                      <div className="text-sm font-medium text-foreground">
                        {opt.label}
                      </div>
                      {opt.description && (
                        <div className="text-xs text-muted-foreground">
                          {opt.description}
                        </div>
                      )}
                      {opt.value === "remboursement" && (
                        <div className="mt-1 rounded border border-destructive/20 bg-destructive/5 px-2 py-1 text-[11px] text-destructive">
                          ⚠️ L'argent a été rendu au client — justifiez le
                          mode de reverse dans le motif.
                        </div>
                      )}
                    </div>
                  </label>
                ))}
              </RadioGroup>
            </div>

            {/* Motif */}
            <div className="space-y-2">
              <Label
                htmlFor="annuler-motif"
                className="text-sm font-medium text-foreground"
              >
                Motif{" "}
                <span className="text-xs text-muted-foreground">
                  (min {MOTIF_MIN}, max {MOTIF_MAX})
                </span>
              </Label>
              <Textarea
                id="annuler-motif"
                rows={4}
                maxLength={MOTIF_MAX}
                value={motif}
                onChange={(e) => setMotif(e.target.value)}
                disabled={submitting}
                placeholder={`Expliquez pourquoi ce paiement est annulé (au moins ${MOTIF_MIN} caractères)…`}
                className="resize-none text-sm"
                aria-describedby="annuler-motif-help"
              />
              <div className="flex items-center justify-between gap-2">
                <p
                  id="annuler-motif-help"
                  className="text-[11px] text-muted-foreground"
                >
                  {motif.trim().length < MOTIF_MIN && motif.trim().length > 0
                    ? `Encore ${MOTIF_MIN - motif.trim().length} caractères minimum.`
                    : "Visible dans l'audit log et la table paiement_annulations."}
                </p>
                <p className="text-right text-[10px] text-muted-foreground">
                  {motif.length}/{MOTIF_MAX}
                </p>
              </div>
            </div>

            {/* Checkbox de confirmation forte */}
            <label
              htmlFor="annuler-confirm"
              className="flex cursor-pointer items-start gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 transition-colors hover:bg-destructive/10"
            >
              <Checkbox
                id="annuler-confirm"
                checked={confirmed}
                onCheckedChange={(v) => setConfirmed(v === true)}
                disabled={submitting}
                className="mt-0.5 data-[state=checked]:bg-destructive data-[state=checked]:border-destructive data-[state=checked]:text-white"
              />
              <span className="text-sm font-medium text-foreground">
                Je confirme que cette action est{" "}
                <span className="text-destructive">irréversible</span> et que
                le motif saisi est exact.
              </span>
            </label>

            {/* Erreur API */}
            {apiError && (
              <Alert variant="destructive">
                <AlertTriangle className="size-4" />
                <AlertDescription>{apiError}</AlertDescription>
              </Alert>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Aucun paiement sélectionné.
          </p>
        )}

        <AlertDialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
            className="sm:mr-auto"
          >
            Fermer
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => void handleSubmit()}
            disabled={!canSubmit}
          >
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Annulation…
              </>
            ) : (
              <>
                <AlertTriangle className="size-4" />
                Annuler ce paiement
              </>
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
