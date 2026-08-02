/**
 * OgPressing — RenouvellementDialog
 * ----------------------------------
 * Dialog (modal) pour enregistrer un nouveau paiement d'échéance (renouvellement)
 * pour un abonnement. Le Super Admin peut attribuer un plan de 1, 3, 6 ou 12 mois.
 *
 * ⚠️ DÉCLARATIF : aucune transaction bancaire réelle n'est initiée par cette
 *    interface. Le règlement réel (espèces, Mobile Money, carte) se fait HORS
 *    application. Ce formulaire enregistre simplement une déclaration de paiement
 *    pour tracer les échéances et prolonger la date_fin de l'abonnement.
 *
 * Champs :
 *   - Durée du plan (1, 3, 6 ou 12 mois — boutons radio stylés)
 *   - Montant (number, requis, entier positif) — auto-calculé = montant_mensuel × duree
 *     mais reste éditable (le Super Admin peut ajuster en cas de promo/remise)
 *   - Mode de paiement (Select : espèces / Mobile Money / carte bancaire)
 *   - Référence (texte optionnel — n° transaction MOMO, n° reçu espèces…)
 *   - Justificatif (fichier optionnel — image/PDF max 5MB, uploadé vers le
 *     bucket Storage `justificatifs`)
 *
 * Flow :
 *   1. Si un justificatif est fourni, on l'upload côté client (browser) vers
 *      le bucket `justificatifs` via getSupabaseBrowser(). Si l'upload échoue
 *      (bucket manquant, quota dépassé, etc.), on continue SANS justificatif
 *      (toast d'avertissement) — le justificatif est optionnel.
 *   2. On POST /api/super-admin/abonnements/[id]/renouveler avec
 *      { montant, methode, duree_mois, reference, justificatif_url }.
 *   3. L'API insère une ligne dans `paiements` (abonnement_id renseigné) et
 *      met à jour l'abonnement (date_fin + duree_mois mois, statut='actif', etc.).
 *
 * 🔒 SÉCURITÉ (REMEDIATE-STORAGE — AUDIT Conclusion #2) :
 *   Le bucket `justificatifs` est désormais PRIVÉ (migration 016) et accessible
 *   UNIQUEMENT au Super Admin via la policy RLS `justificatifs_select_sa`.
 *   La colonne `justificatif_url` stocke désormais le PATH Storage (plus une
 *   URL publique ou une signed URL permanente). La lecture se fait via la
 *   route serveur /api/super-admin/abonnements/[id]/justificatif-url qui
 *   génère une signed URL valide 1 HEURE (et non 10 ans comme avant).
 *
 * Submit : on success, toast + appelle onRenewed (le parent rafraîchit la liste).
 */
"use client";

import { useState } from "react";
import {
  CreditCard,
  Loader2,
  RotateCw,
  Upload,
  X,
  FileText,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import {
  type Abonnement,
  type MethodePaiement,
  METHODE_LABELS,
  PLAN_LABELS,
} from "./abonnements-helpers";
import { formatFCFA } from "@/lib/utils/format";
import { cn } from "@/lib/utils";

interface RenouvellementDialogProps {
  abonnement: Abonnement;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRenewed?: () => void;
}

type DureeMois = 1 | 3 | 6 | 12;

/** Options de durée de plan affichées dans le dialog.
 *  Chaque option a un libellé court, un libellé long et un badge de réduction
 *  optionnel (ex : 12 mois = 2 mois offerts). */
const DUREE_OPTIONS: {
  value: DureeMois;
  label: string;
  longLabel: string;
  badge?: string;
}[] = [
  { value: 1, label: "1 mois", longLabel: "1 mois" },
  { value: 3, label: "3 mois", longLabel: "3 mois" },
  { value: 6, label: "6 mois", longLabel: "6 mois" },
  { value: 12, label: "1 an", longLabel: "12 mois", badge: "2 mois offerts" },
];

type FormState = {
  dureeMois: DureeMois;
  montant: string; // string pour l'input, parsé en int à la soumission
  methode: MethodePaiement;
  reference: string;
  justificatif: File | null;
};

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp", "application/pdf"];

export function RenouvellementDialog({
  abonnement,
  open,
  onOpenChange,
  onRenewed,
}: RenouvellementDialogProps) {
  const montantMensuel = abonnement.montant_mensuel ?? 0;
  const defaultMontant = String(montantMensuel);
  const [form, setForm] = useState<FormState>({
    dureeMois: 1,
    montant: defaultMontant,
    methode: "especes",
    reference: "",
    justificatif: null,
  });
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);

  function reset() {
    setForm({
      dureeMois: 1,
      montant: defaultMontant,
      methode: "especes",
      reference: "",
      justificatif: null,
    });
    setErrors({});
  }

  /** Quand l'utilisateur change la durée, on recalcule le montant suggéré
   *  (= montant_mensuel × durée). Le Super Admin peut ensuite ajuster
   *  manuellement si besoin (promo, remise, etc.). */
  function handleDureeChange(duree: DureeMois) {
    const suggested = montantMensuel * duree;
    setForm((prev) => ({
      ...prev,
      dureeMois: duree,
      montant: String(suggested),
    }));
    if (errors.montant) {
      setErrors((prev) => ({ ...prev, montant: undefined }));
    }
  }

  function handleOpenChange(next: boolean) {
    if (submitting) return;
    onOpenChange(next);
    if (!next) {
      // Reset en fermant (après la fermeture pour éviter le flicker)
      setTimeout(reset, 100);
    }
  }

  function validateFile(file: File): string | null {
    if (file.size > MAX_FILE_SIZE) {
      return "Le fichier dépasse 5 MB";
    }
    if (!ACCEPTED_TYPES.includes(file.type)) {
      return "Format non supporté (PNG, JPEG, WebP ou PDF uniquement)";
    }
    return null;
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    if (file) {
      const err = validateFile(file);
      if (err) {
        setErrors((prev) => ({ ...prev, justificatif: err }));
        toast.error(err);
        e.target.value = "";
        return;
      }
    }
    setErrors((prev) => ({ ...prev, justificatif: undefined }));
    setForm((prev) => ({ ...prev, justificatif: file }));
  }

  function validate(): boolean {
    const nextErrors: Partial<Record<keyof FormState, string>> = {};
    const montantNum = parseInt(form.montant, 10);
    if (
      !form.montant ||
      Number.isNaN(montantNum) ||
      montantNum <= 0 ||
      !Number.isInteger(montantNum)
    ) {
      nextErrors.montant = "Montant invalide (entier positif requis)";
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  /**
   * Upload le justificatif vers le bucket Storage PRIVÉ `justificatifs`.
   * Retourne le PATH Storage (pas une URL publique ni une signed URL permanente)
   * du fichier, ou null si l'upload échoue ou si aucun fichier n'a été fourni.
   *
   * 🔒 Le bucket `justificatifs` est privé et accessible uniquement au Super
   *    Admin (RLS policy `justificatifs_select_sa`). La lecture se fait via
   *    la route serveur /api/super-admin/abonnements/[id]/justificatif-url
   *    qui génère une signed URL valide 1 heure.
   */
  async function uploadJustificatif(): Promise<string | null> {
    if (!form.justificatif) return null;
    setUploading(true);
    try {
      const supabase = getSupabaseBrowser();
      const ext = form.justificatif.name.split(".").pop() || "bin";
      const path = `abonnements/${abonnement.id}/${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("justificatifs")
        .upload(path, form.justificatif, {
          cacheControl: "3600",
          upsert: false,
        });
      if (upErr) {
        throw upErr;
      }
      // On retourne le PATH Storage (pas une URL publique ni une signed URL
      // permanente). La lecture se fera via la route serveur dédiée qui
      // génère une signed URL valide 1 heure (cf. REMEDIATE-STORAGE).
      return path;
    } catch (err) {
      console.warn(
        "[renouvellement] Échec upload justificatif (continuons sans) :",
        err
      );
      toast.warning("Justificatif non uploadé", {
        description:
          "Le stockage des justificatifs est indisponible. Le paiement sera enregistré sans justificatif.",
      });
      return null;
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      // 1. Upload justificatif (optionnel, échec non bloquant)
      const justificatifUrl = await uploadJustificatif();

      // 2. POST API renouveler
      const res = await fetch(
        `/api/super-admin/abonnements/${abonnement.id}/renouveler`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            montant: parseInt(form.montant, 10),
            methode: form.methode,
            duree_mois: form.dureeMois,
            reference: form.reference.trim() || null,
            justificatif_url: justificatifUrl,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(
          data.error || "Erreur lors de l'enregistrement du paiement"
        );
      }
      const dureeLabel =
        form.dureeMois === 12
          ? "1 an"
          : `${form.dureeMois} mois`;
      toast.success("Paiement enregistré", {
        description: `Abonnement prolongé de ${dureeLabel} — jusqu'au ${
          data.data?.abonnement?.date_fin
            ? new Date(data.data.abonnement.date_fin).toLocaleDateString("fr-FR")
            : "l'échéance calculée"
        }.`,
      });
      handleOpenChange(false);
      onRenewed?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur inattendue";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  const total = submitting || uploading;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCw className="size-5 text-primary" />
            Renouveler / Attribuer un plan
          </DialogTitle>
          <DialogDescription>
            {abonnement.pressing?.nom} — Plan {PLAN_LABELS[abonnement.plan]} (
            {formatFCFA(abonnement.montant_mensuel)}/mois). Choisissez la durée :
            1, 3, 6 ou 12 mois.
          </DialogDescription>
        </DialogHeader>

        {/* Alerte déclarative — toujours visible */}
        <Alert className="border-warning/40 bg-warning/10">
          <AlertCircle className="text-warning" />
          <AlertDescription className="text-foreground">
            <span className="font-semibold text-warning">
              Déclaratif — aucune transaction bancaire réelle n&apos;est initiée.
            </span>{" "}
            Ce formulaire enregistre une déclaration de paiement pour tracer les
            échéances. Le règlement réel se fait hors application.
          </AlertDescription>
        </Alert>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Durée du plan (1, 3, 6 ou 12 mois) */}
          <div className="space-y-1.5">
            <Label>
              Durée du plan <span className="text-danger">*</span>
            </Label>
            <div
              role="radiogroup"
              aria-label="Durée du plan d'abonnement"
              className="grid grid-cols-2 gap-2 sm:grid-cols-4"
            >
              {DUREE_OPTIONS.map((opt) => {
                const selected = form.dureeMois === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => handleDureeChange(opt.value)}
                    disabled={total}
                    className={cn(
                      "relative flex flex-col items-center justify-center gap-0.5 rounded-lg border p-3 text-center transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                      selected
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-card text-foreground hover:border-primary/40 hover:bg-accent/50",
                      total && "cursor-not-allowed opacity-60"
                    )}
                  >
                    <span className="text-sm font-semibold">{opt.label}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {opt.longLabel}
                    </span>
                    {opt.badge && (
                      <span className="mt-0.5 inline-flex items-center rounded-full bg-secondary/15 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-secondary">
                        {opt.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              Sélectionnez la durée de l&apos;abonnement à attribuer. Le montant
              ci-dessous s&apos;ajuste automatiquement (modifiable).
            </p>
          </div>

          {/* Montant */}
          <div className="space-y-1.5">
            <Label htmlFor="montant">
              Montant payé <span className="text-danger">*</span>
            </Label>
            <div className="relative">
              <Input
                id="montant"
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                value={form.montant}
                onChange={(e) => {
                  setForm((prev) => ({ ...prev, montant: e.target.value }));
                  if (errors.montant)
                    setErrors((prev) => ({ ...prev, montant: undefined }));
                }}
                placeholder="ex : 24900"
                disabled={total}
                className="pr-16"
                autoFocus
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">
                FCFA
              </span>
            </div>
            {errors.montant && (
              <p className="text-xs text-danger">{errors.montant}</p>
            )}
            <p className="text-xs text-muted-foreground">
              Suggestion : {formatFCFA(montantMensuel)} × {form.dureeMois} mois
              = {formatFCFA(montantMensuel * form.dureeMois)}. Ajustable pour
              remise ou promo.
            </p>
          </div>

          {/* Mode de paiement */}
          <div className="space-y-1.5">
            <Label htmlFor="methode">
              Mode de paiement <span className="text-danger">*</span>
            </Label>
            <Select
              value={form.methode}
              onValueChange={(v) =>
                setForm((prev) => ({ ...prev, methode: v as MethodePaiement }))
              }
              disabled={total}
            >
              <SelectTrigger id="methode" className="w-full">
                <SelectValue placeholder="Sélectionner un mode" />
              </SelectTrigger>
              <SelectContent>
                {(
                  Object.keys(METHODE_LABELS) as MethodePaiement[]
                ).map((m) => (
                  <SelectItem key={m} value={m}>
                    {METHODE_LABELS[m]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Référence */}
          <div className="space-y-1.5">
            <Label htmlFor="reference">Référence (optionnel)</Label>
            <Input
              id="reference"
              type="text"
              value={form.reference}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, reference: e.target.value }))
              }
              placeholder="ex : N° transaction MOMO, n° reçu…"
              disabled={total}
              maxLength={500}
            />
            <p className="text-xs text-muted-foreground">
              Numéro de transaction Mobile Money, numéro de reçu espèces, etc.
            </p>
          </div>

          {/* Justificatif */}
          <div className="space-y-1.5">
            <Label htmlFor="justificatif">Justificatif (optionnel)</Label>
            <div className="rounded-lg border border-dashed bg-muted/30 p-3">
              <label
                htmlFor="justificatif"
                className="flex cursor-pointer flex-col items-center justify-center gap-1 text-center"
              >
                {form.justificatif ? (
                  <>
                    <CheckCircle2 className="size-6 text-secondary" />
                    <span className="text-xs font-medium text-foreground">
                      {form.justificatif.name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {(form.justificatif.size / 1024).toFixed(1)} KB — cliquer
                      pour remplacer
                    </span>
                  </>
                ) : (
                  <>
                    <Upload className="size-6 text-muted-foreground" />
                    <span className="text-xs font-medium text-foreground">
                      Cliquer pour sélectionner un fichier
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Image (PNG, JPEG, WebP) ou PDF — 5 MB max
                    </span>
                  </>
                )}
              </label>
              <Input
                id="justificatif"
                type="file"
                accept={ACCEPTED_TYPES.join(",")}
                onChange={handleFileChange}
                disabled={total}
                className="sr-only"
              />
              {form.justificatif && (
                <button
                  type="button"
                  onClick={() =>
                    setForm((prev) => ({ ...prev, justificatif: null }))
                  }
                  className="mt-2 flex items-center gap-1 text-xs text-danger hover:underline"
                  disabled={total}
                >
                  <X className="size-3" />
                  Retirer le fichier
                </button>
              )}
            </div>
            {errors.justificatif && (
              <p className="text-xs text-danger">{errors.justificatif}</p>
            )}
            {uploading && (
              <p className="flex items-center gap-1 text-xs text-primary">
                <Loader2 className="size-3 animate-spin" />
                Upload du justificatif…
              </p>
            )}
          </div>

          {/* Récap visuel */}
          <div className="flex items-start gap-2 rounded-md bg-muted/50 p-3 text-xs">
            <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <p className="text-muted-foreground">
              La date de fin de l&apos;abonnement sera prolongée de{" "}
              <span className="font-semibold text-foreground">
                {form.dureeMois === 12 ? "1 an (12 mois)" : `${form.dureeMois} mois`}
              </span>{" "}
              à partir de{" "}
              <span className="font-medium text-foreground">
                {abonnement.date_fin && new Date(abonnement.date_fin) > new Date()
                  ? `la date de fin actuelle (${new Date(
                      abonnement.date_fin
                    ).toLocaleDateString("fr-FR")})`
                  : "aujourd'hui (l'abonnement est expiré ou sans échéance)"}
              </span>
              .
            </p>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={total}>
                <X className="size-4" />
                Annuler
              </Button>
            </DialogClose>
            <Button type="submit" disabled={total}>
              {total ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {uploading ? "Upload…" : "Enregistrement…"}
                </>
              ) : (
                <>
                  <CreditCard className="size-4" />
                  Enregistrer le paiement
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
