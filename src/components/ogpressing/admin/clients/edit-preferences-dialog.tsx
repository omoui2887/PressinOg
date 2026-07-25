/**
 * OgPressing — EditPreferencesDialog (LOT 8.2)
 * ---------------------------------------------
 * Dialog d'édition des préférences de lavage d'un client (6 Selects
 * correspondant aux 6 clés du JSONB `preferences_lavage`).
 *
 * Chaque Select a une option "Non spécifié" (= undefined, la clé sera
 * omise du payload PATCH) + les valeurs de l'enum correspondant.
 *
 * Submit via PATCH /api/admin/clients/{id} avec `{ preferences_lavage:
 * { ...onlySetKeys } }`. Sur succès : toast + callback `onUpdated(client)`.
 *
 * Client component — gestion état formulaire + fetch.
 */
"use client";

import { useEffect, useState } from "react";
import { Loader2, Settings2, X } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import type { ClientDetail } from "./client-detail-helpers";
import type { PreferencesLavage } from "@/components/ogpressing/admin/commande-wizard/state";

interface EditPreferencesDialogProps {
  client: ClientDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: (client: ClientDetail) => void;
}

// ----------------------------------------------------------------
// Options des 6 Selects (valeur brute → libellé FR).
// La valeur "__none__" représente "Non spécifié" (clé omise du payload).
// ----------------------------------------------------------------

const NONE = "__none__";

const DETERGENT_OPTIONS: { value: string; label: string }[] = [
  { value: "classique", label: "Classique" },
  { value: "bio", label: "Bio" },
  { value: "sans_phosphore", label: "Sans phosphore" },
];

const TEMPERATURE_OPTIONS: { value: string; label: string }[] = [
  { value: "froid", label: "Froid" },
  { value: "tiede", label: "Tiède" },
  { value: "chaud", label: "Chaud" },
];

const OUI_NON_OPTIONS: { value: string; label: string }[] = [
  { value: "oui", label: "Oui" },
  { value: "non", label: "Non" },
];

const REPASSAGE_OPTIONS: { value: string; label: string }[] = [
  { value: "standard", label: "Standard" },
  { value: "leger", label: "Léger" },
  { value: "aucun", label: "Aucun" },
];

// ----------------------------------------------------------------
// Mapping entre le form state (toutes les clés en string) et le
// PreferencesLavage strict (clés optionnelles avec valeurs typées).
// ----------------------------------------------------------------

interface PrefFormState {
  detergent: string;
  temperature: string;
  adoucissant: string;
  detachage_prealable: string;
  pressing_intensif: string;
  repassage: string;
}

const EMPTY_FORM: PrefFormState = {
  detergent: NONE,
  temperature: NONE,
  adoucissant: NONE,
  detachage_prealable: NONE,
  pressing_intensif: NONE,
  repassage: NONE,
};

function prefsToForm(prefs: PreferencesLavage | null | undefined): PrefFormState {
  return {
    detergent: prefs?.detergent ?? NONE,
    temperature: prefs?.temperature ?? NONE,
    adoucissant: prefs?.adoucissant ?? NONE,
    detachage_prealable: prefs?.detachage_prealable ?? NONE,
    pressing_intensif: prefs?.pressing_intensif ?? NONE,
    repassage: prefs?.repassage ?? NONE,
  };
}

/** Construit le payload `preferences_lavage` (uniquement les clés définies). */
function formToPrefs(
  form: PrefFormState
): PreferencesLavage {
  const out: PreferencesLavage = {};
  // Pour chaque clé : si la valeur est différente de NONE, on l'ajoute.
  // Le cast est sûr car les options des Selects correspondent aux enums.
  (Object.keys(form) as (keyof PrefFormState)[]).forEach((key) => {
    const v = form[key];
    if (v !== NONE) {
      // @ts-expect-error — valeur validée par les options du Select
      out[key] = v;
    }
  });
  return out;
}

export function EditPreferencesDialog({
  client,
  open,
  onOpenChange,
  onUpdated,
}: EditPreferencesDialogProps) {
  const [form, setForm] = useState<PrefFormState>(() =>
    prefsToForm(client.preferences_lavage)
  );
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(prefsToForm(client.preferences_lavage));
    }
  }, [open, client]);

  function update(key: keyof PrefFormState, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const prefs = formToPrefs(form);
      const res = await fetch(`/api/admin/clients/${client.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferences_lavage: prefs }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Erreur lors de la mise à jour");
      }
      toast.success("Préférences modifiées");
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
            <Settings2 className="size-5 text-primary" />
            Préférences de lavage
          </DialogTitle>
          <DialogDescription>
            Configurez les préférences par défaut appliquées aux futures
            commandes du client.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <PrefSelect
            id="pref-detergent"
            label="Détergent 🧴"
            value={form.detergent}
            onChange={(v) => update("detergent", v)}
            options={DETERGENT_OPTIONS}
            disabled={submitting}
          />
          <PrefSelect
            id="pref-temperature"
            label="Température 🌡️"
            value={form.temperature}
            onChange={(v) => update("temperature", v)}
            options={TEMPERATURE_OPTIONS}
            disabled={submitting}
          />
          <PrefSelect
            id="pref-adoucissant"
            label="Adoucissant ✨"
            value={form.adoucissant}
            onChange={(v) => update("adoucissant", v)}
            options={OUI_NON_OPTIONS}
            disabled={submitting}
          />
          <PrefSelect
            id="pref-detachage"
            label="Détachage préalable 🧽"
            value={form.detachage_prealable}
            onChange={(v) => update("detachage_prealable", v)}
            options={OUI_NON_OPTIONS}
            disabled={submitting}
          />
          <PrefSelect
            id="pref-pressing"
            label="Pressing intensif 💪"
            value={form.pressing_intensif}
            onChange={(v) => update("pressing_intensif", v)}
            options={OUI_NON_OPTIONS}
            disabled={submitting}
          />
          <PrefSelect
            id="pref-repassage"
            label="Repassage 👔"
            value={form.repassage}
            onChange={(v) => update("repassage", v)}
            options={REPASSAGE_OPTIONS}
            disabled={submitting}
          />

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
                  <Settings2 className="size-4" />
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

// ----------------------------------------------------------------
// Sous-composant PrefSelect — un Select avec label + option "Non
// spécifié" en première position.
// ----------------------------------------------------------------

interface PrefSelectProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
}

function PrefSelect({
  id,
  label,
  value,
  onChange,
  options,
  disabled,
}: PrefSelectProps) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder="Non spécifié" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>Non spécifié</SelectItem>
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
