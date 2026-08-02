/**
 * OgPressing — HorairesTab (LOT 11.2 — onglet 2)
 * ------------------------------------------------
 * Formulaire d'édition des horaires d'ouverture du pressing (7 jours).
 *
 * Pour chaque jour (Lundi → Dimanche) :
 *   - Label du jour
 *   - Switch "Fermé" (toggle ferme)
 *   - Si non fermé : 2 inputs `<input type="time">` (ouverture + fermeture)
 *     séparés par une flèche "→"
 *   - Si fermé : texte muted "Fermé"
 *
 * Au submit :
 *   1. Validation client : pour chaque jour non fermé, ouverture < fermeture
 *   2. PATCH /api/admin/pressing avec `{ horaires: horairesToDB(state) }`
 *   3. On success → toast.success + onUpdated(pressing)
 *
 * Données stockées dans `pressing.horaires` (jsonb) au format
 * `{ "lundi": "08:00-18:00", "dimanche": null }`.
 */
"use client";

import { useEffect, useState } from "react";
import { Loader2, Clock, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  HorairesState,
  JOURS_SEMAINE,
  PressingInfo,
  horairesToDB,
  horairesToState,
} from "./pressing-helpers";

interface HorairesTabProps {
  pressing: PressingInfo | null;
  loading: boolean;
  onUpdated: (p: PressingInfo) => void;
}

/** Compare deux heures "HH:MM". Retourne true si a < b. */
function isBefore(a: string, b: string): boolean {
  const [ah, am] = a.split(":").map(Number);
  const [bh, bm] = b.split(":").map(Number);
  if (ah !== bh) return ah < bh;
  return am < bm;
}

export function HorairesTab({
  pressing,
  loading,
  onUpdated,
}: HorairesTabProps) {
  const [state, setState] = useState<HorairesState | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Initialiser le state quand le pressing est chargé
  useEffect(() => {
    if (!pressing) return;
    setState(horairesToState(pressing.horaires));
  }, [pressing?.id, pressing]);

  /** Met à jour un jour donné. */
  function updateJour(
    key: (typeof JOURS_SEMAINE)[number]["key"],
    patch: Partial<HorairesState[typeof key]>
  ) {
    setState((prev) => {
      if (!prev) return prev;
      return { ...prev, [key]: { ...prev[key], ...patch } };
    });
  }

  async function onSubmit() {
    if (!state) return;

    // Validation client : pour chaque jour non fermé, ouverture < fermeture
    for (const jour of JOURS_SEMAINE) {
      const j = state[jour.key];
      if (j.ferme) continue;
      if (!isBefore(j.ouverture, j.fermeture)) {
        toast.error("Horaire invalide", {
          description: `L'heure d'ouverture doit être avant l'heure de fermeture pour ${jour.label}.`,
        });
        return;
      }
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/pressing", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ horaires: horairesToDB(state) }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Erreur lors de l'enregistrement");
      }
      toast.success("Horaires enregistrées", {
        description: "Vos horaires d'ouverture ont été mises à jour.",
      });
      onUpdated(data.data.pressing as PressingInfo);
    } catch (err) {
      toast.error("Échec de l'enregistrement", {
        description: err instanceof Error ? err.message : "Erreur inconnue",
      });
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
          <Skeleton className="h-10 w-full sm:w-48" />
        </CardContent>
      </Card>
    );
  }

  if (!pressing || !state) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Impossible de charger les horaires du pressing.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="size-5 text-primary" />
          Horaires d&apos;ouverture
        </CardTitle>
        <CardDescription>
          Les horaires sont affichées sur vos tickets imprimés. Laissez un jour
          « Fermé » s&apos;il n&apos;y a pas d&apos;activité.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {JOURS_SEMAINE.map((jour) => {
          const j = state[jour.key];
          return (
            <div
              key={jour.key}
              className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
            >
              {/* Label jour */}
              <div className="flex items-center gap-3">
                <span className="inline-flex size-8 items-center justify-center rounded-md bg-primary/10 text-xs font-bold uppercase text-primary">
                  {jour.label.slice(0, 3)}
                </span>
                <span className="text-sm font-medium text-foreground">
                  {jour.label}
                </span>
              </div>

              {/* Switch Fermé + inputs (ou texte Fermé) */}
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Switch
                    checked={j.ferme}
                    onCheckedChange={(checked) =>
                      updateJour(jour.key, { ferme: checked })
                    }
                    aria-label={`Fermé le ${jour.label}`}
                  />
                  Fermé
                </label>

                {j.ferme ? (
                  <span className="rounded-md bg-muted px-3 py-1.5 text-sm text-muted-foreground">
                    Fermé
                  </span>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      type="time"
                      value={j.ouverture}
                      onChange={(e) =>
                        updateJour(jour.key, { ouverture: e.target.value })
                      }
                      className="h-10 w-full min-w-[5.5rem] sm:w-28"
                      aria-label={`Heure d'ouverture ${jour.label}`}
                    />
                    <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                    <Input
                      type="time"
                      value={j.fermeture}
                      onChange={(e) =>
                        updateJour(jour.key, { fermeture: e.target.value })
                      }
                      className="h-10 w-full min-w-[5.5rem] sm:w-28"
                      aria-label={`Heure de fermeture ${jour.label}`}
                    />
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Bouton Enregistrer */}
        <div className="pt-2">
          <Button
            type="button"
            onClick={onSubmit}
            disabled={submitting}
            className="w-full sm:w-auto"
          >
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Enregistrement…
              </>
            ) : (
              "Enregistrer les horaires"
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
