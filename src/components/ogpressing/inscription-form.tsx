/**
 * OgPressing — Formulaire d'inscription (landing page)
 * ----------------------------------------------------
 * Prospects non authentifiés. POST vers /api/public/inscription.
 *
 * Champs (alignés sur la table demandes_inscription) :
 *   - nom_gerant (requis)
 *   - nom_pressing (requis)
 *   - telephone (requis)
 *   - email (optionnel)
 *   - ville (optionnel)
 *   - commune (optionnel)
 *   - message (optionnel)
 *
 * Client component : gestion d'état, validation, soumission, feedback.
 */
"use client";

import { useState, type FormEvent } from "react";
import { Loader2, CheckCircle2, AlertCircle, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type Status = "idle" | "submitting" | "success" | "error";

interface FormState {
  nom_gerant: string;
  nom_pressing: string;
  telephone: string;
  email: string;
  ville: string;
  commune: string;
  message: string;
}

const INITIAL: FormState = {
  nom_gerant: "",
  nom_pressing: "",
  telephone: "",
  email: "",
  ville: "",
  commune: "",
  message: "",
};

export function InscriptionForm() {
  const [form, setForm] = useState<FormState>(INITIAL);
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState<string>("");

  function update<K extends keyof FormState>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus("submitting");
    setErrorMsg("");

    try {
      const res = await fetch("/api/public/inscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Une erreur est survenue. Réessayez.");
      }
      setStatus("success");
      setForm(INITIAL);
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Erreur inconnue.");
    }
  }

  if (status === "success") {
    return (
      <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-secondary/30 bg-secondary/5 p-8 text-center">
        <div className="flex size-14 items-center justify-center rounded-full bg-secondary/15">
          <CheckCircle2 className="size-8 text-secondary" />
        </div>
        <div>
          <h3 className="text-xl font-bold text-foreground">Demande envoyée !</h3>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            Merci pour votre intérêt. Notre équipe vous contactera sous 24h via WhatsApp
            au numéro indiqué pour finaliser votre inscription.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => setStatus("idle")}
          className="mt-2"
        >
          Envoyer une autre demande
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="nom_gerant"
          label="Nom du gérant"
          required
          value={form.nom_gerant}
          onChange={(v) => update("nom_gerant", v)}
          placeholder="Ex : Awa Koné"
          autoComplete="name"
        />
        <Field
          id="nom_pressing"
          label="Nom du pressing"
          required
          value={form.nom_pressing}
          onChange={(v) => update("nom_pressing", v)}
          placeholder="Ex : Pressing Cocody"
          autoComplete="organization"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="telephone"
          label="Téléphone (WhatsApp)"
          required
          type="tel"
          value={form.telephone}
          onChange={(v) => update("telephone", v)}
          placeholder="Ex : 07 00 00 00 00"
          autoComplete="tel"
        />
        <Field
          id="email"
          label="Email (optionnel)"
          type="email"
          value={form.email}
          onChange={(v) => update("email", v)}
          placeholder="Ex : gerant@pressing.ci"
          autoComplete="email"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="ville"
          label="Ville (optionnel)"
          value={form.ville}
          onChange={(v) => update("ville", v)}
          placeholder="Ex : Abidjan"
        />
        <Field
          id="commune"
          label="Commune / Quartier (optionnel)"
          value={form.commune}
          onChange={(v) => update("commune", v)}
          placeholder="Ex : Cocody"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="message">Message (optionnel)</Label>
        <Textarea
          id="message"
          value={form.message}
          onChange={(e) => update("message", e.target.value)}
          placeholder="Précisez vos besoins, nombre d'employés, questions..."
          rows={3}
          className="resize-none"
        />
      </div>

      {status === "error" && (
        <div className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger/5 p-3 text-sm text-danger">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      <Button
        type="submit"
        size="lg"
        className="w-full"
        disabled={status === "submitting"}
      >
        {status === "submitting" ? (
          <>
            <Loader2 className="size-4 animate-spin" /> Envoi en cours...
          </>
        ) : (
          <>
            <Send className="size-4" /> Envoyer ma demande
          </>
        )}
      </Button>

      <p className="text-center text-xs text-muted-foreground">
        En envoyant ce formulaire, vous acceptez d&apos;être contacté par OgPressing.
        Aucun règlement ne se fait en ligne.
      </p>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/*  Sous-composant Field (input + label)                              */
/* ------------------------------------------------------------------ */

function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
  required,
  type = "text",
  autoComplete,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  type?: "text" | "tel" | "email";
  autoComplete?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className={cn(required && "after:ml-0.5 after:text-danger after:content-['*']")}>
        {label}
      </Label>
      <Input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        autoComplete={autoComplete}
        className="h-11"
      />
    </div>
  );
}
