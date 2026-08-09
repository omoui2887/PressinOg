/**
 * OgPressing — Formulaire d'inscription (LOT 4 — landing page #inscription)
 * -------------------------------------------------------------------------
 * Composant client avec react-hook-form + zod.
 * 11 champs spec LOT 4 prompt 4.2 :
 *   1. Nom (texte, requis, 2-50)
 *   2. Prénom (texte, requis, 2-50)
 *   3. Téléphone (requis, format ivoirien 0XX ou +225 XX)
 *   4. Email (requis, format email)
 *   5. Nom du pressing (requis, 2-100)
 *   6. Ville (dropdown, requis, 11 villes CI + Autre)
 *   7. Adresse (requis, min 5)
 *   8. Nombre de machines (requis, entier >= 1)
 *   9. Nombre d'employés (optionnel, entier >= 0)
 *  10. Plan souhaité (dropdown, requis : Starter, Pro, Business, Indécis)
 *  11. Message (textarea, optionnel, max 500)
 *
 * Comportement :
 *   - Pré-remplit le plan si l'utilisateur a cliqué sur "Choisir ce plan"
 *     depuis la section Tarifs (via Zustand store useInscriptionStore)
 *   - Soumet en POST /api/public/inscription (service_role, bypass RLS)
 *   - Affiche un message de succès spec exact + réinitialise le formulaire
 *   - Affiche un message d'erreur en cas d'échec avec retry automatique
 *   - Bouton désactivé + spinner Loader2 pendant l'envoi
 *
 * Design :
 *   - 1 colonne sur mobile, 2 colonnes sur desktop pour les champs courts
 *     (Nom/Prénom, Ville/Adresse, Machines/Employés, Téléphone/Email)
 *   - Feedback visuel : bordure rouge + message sous chaque champ (FormMessage)
 *   - Respecte le design system (primary bleu, secondary vert, danger rouge)
 */
"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Send, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useInscriptionStore } from "@/lib/stores/inscription-store";

/* ----------------------- Constantes ----------------------- */

const VILLES_CI = [
  "Abidjan",
  "Bouaké",
  "Daloa",
  "Yamoussoukro",
  "San-Pédro",
  "Korhogo",
  "Man",
  "Divo",
  "Gagnoa",
  "Anyama",
  "Autre",
] as const;

const PLANS = [
  { value: "starter", label: "Starter — 9 900 FCFA/mois" },
  { value: "pro", label: "Pro — 24 900 FCFA/mois (populaire)" },
  { value: "business", label: "Business — 49 900 FCFA/mois" },
  { value: "indecis", label: "Je ne sais pas encore" },
] as const;

/* ----------------------- Schéma Zod ----------------------- */

const inscriptionSchema = z.object({
  nom: z
    .string()
    .min(2, "Le nom doit comporter au moins 2 caractères.")
    .max(50, "Le nom ne peut pas dépasser 50 caractères."),
  prenom: z
    .string()
    .min(2, "Le prénom doit comporter au moins 2 caractères.")
    .max(50, "Le prénom ne peut pas dépasser 50 caractères."),
  telephone: z
    .string()
    .min(8, "Le téléphone est trop court.")
    .refine((val) => {
      const clean = val.replace(/[\s\-().]/g, "");
      return /^(\+225)?0?\d{8,10}$/.test(clean);
    }, "Numéro ivoirien invalide (ex : 07 00 00 00 00 ou +225 07 00 00 00 00)."),
  email: z
    .string()
    .min(1, "L'email est obligatoire.")
    .email("L'email n'est pas valide."),
  nom_pressing: z
    .string()
    .min(2, "Le nom du pressing doit comporter au moins 2 caractères.")
    .max(100, "Le nom du pressing ne peut pas dépasser 100 caractères."),
  ville: z.string().min(1, "La ville est obligatoire."),
  adresse: z
    .string()
    .min(5, "L'adresse doit comporter au moins 5 caractères.")
    .max(200, "L'adresse ne peut pas dépasser 200 caractères."),
  nombre_machines: z.coerce
    .number({ message: "Le nombre de machines doit être un entier." })
    .int("Le nombre de machines doit être un entier.")
    .min(1, "Le nombre de machines doit être au moins 1."),
  nombre_employes: z
    .union([
      z.coerce
        .number()
        .int()
        .min(0, "Le nombre d'employés ne peut pas être négatif."),
      z.literal("").transform(() => null),
      z.null(),
    ])
    .optional(),
  plan_souhaite: z.string().min(1, "Le plan souhaité est obligatoire."),
  message: z
    .string()
    .max(500, "Le message ne peut pas dépasser 500 caractères.")
    .optional()
    .default(""),
});

// ⚠️ z.input (et non z.infer/z.output) — nécessaire pour @hookform/resolvers v5 :
// le resolver attend Resolver<TInput, any, TOutput> où TInput doit matcher
// exactement le TFormValues de useForm. Or le schema utilise z.coerce.number()
// et .optional().default() qui produisent TInput ≠ TOutput.
type InscriptionFormValues = z.input<typeof inscriptionSchema>;

/* ----------------------- Composant ----------------------- */

export function InscriptionForm() {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const selectedPlan = useInscriptionStore((s) => s.selectedPlan);

  const form = useForm<InscriptionFormValues>({
    resolver: zodResolver(inscriptionSchema),
    defaultValues: {
      nom: "",
      prenom: "",
      telephone: "",
      email: "",
      nom_pressing: "",
      ville: "",
      adresse: "",
      nombre_machines: 1,
      nombre_employes: "",
      plan_souhaite: selectedPlan ?? "",
      message: "",
    },
  });

  const {
    handleSubmit,
    control,
    reset,
    formState: { isSubmitting },
    watch,
  } = form;

  const messageValue = watch("message") ?? "";

  async function onSubmit(values: InscriptionFormValues) {
    setSubmitError(null);
    setSubmitted(false);

    try {
      const res = await fetch("/api/public/inscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...values,
          // coerce nombre_employes null → undefined (pas envoyé)
          nombre_employes:
            values.nombre_employes == null
              ? undefined
              : values.nombre_employes,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(
          data.error || "Erreur lors de l'envoi. Réessayez plus tard."
        );
      }

      // Succès : réinitialiser le formulaire + afficher le message spec
      reset();
      setSubmitted(true);
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
        console.error("[inscription] Erreur inattendue :", err);
        message = "Une erreur est survenue. Veuillez réessayer.";
      }
      setSubmitError(message);
      toast.error(message);
    }
  }

  /* --- État succès --- */
  if (submitted && !submitError) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex flex-col items-center justify-center gap-3 rounded-xl border border-secondary/30 bg-secondary/5 px-6 py-12 text-center"
      >
        <span className="flex size-14 items-center justify-center rounded-full bg-secondary/15 text-secondary">
          <CheckCircle2 className="size-7" />
        </span>
        <p className="text-lg font-semibold text-foreground">
          ✅ Merci ! Notre équipe vous contactera très bientôt par WhatsApp ou
          téléphone.
        </p>
        <p className="max-w-md text-sm text-muted-foreground">
          Votre demande a bien été enregistrée. Notre équipe la traitera dans
          les plus brefs délais pour vous proposer une démonstration et un code
          d&apos;activation.
        </p>
        <Button
          type="button"
          variant="outline"
          className="mt-2"
          onClick={() => setSubmitted(false)}
        >
          Envoyer une autre demande
        </Button>
      </div>
    );
  }

  /* --- Formulaire --- */
  return (
    <Form {...form}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
        {/* Ligne 1 : Nom + Prénom */}
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={control}
            name="nom"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Nom <span className="text-danger">*</span>
                </FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    placeholder="Koné"
                    autoComplete="family-name"
                    disabled={isSubmitting}
                    className="h-11"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={control}
            name="prenom"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Prénom <span className="text-danger">*</span>
                </FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    placeholder="Awa"
                    autoComplete="given-name"
                    disabled={isSubmitting}
                    className="h-11"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Ligne 2 : Téléphone + Email */}
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={control}
            name="telephone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Téléphone <span className="text-danger">*</span>
                </FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    type="tel"
                    placeholder="07 00 00 00 00"
                    autoComplete="tel"
                    disabled={isSubmitting}
                    className="h-11"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Email <span className="text-danger">*</span>
                </FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    type="email"
                    placeholder="vous@pressing.ci"
                    autoComplete="email"
                    disabled={isSubmitting}
                    className="h-11"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Nom du pressing (pleine largeur) */}
        <FormField
          control={control}
          name="nom_pressing"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Nom du pressing <span className="text-danger">*</span>
              </FormLabel>
              <FormControl>
                <Input
                  {...field}
                  placeholder="Ex : Pressing Cocody"
                  autoComplete="organization"
                  disabled={isSubmitting}
                  className="h-11"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Ligne 3 : Ville + Adresse */}
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={control}
            name="ville"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Ville <span className="text-danger">*</span>
                </FormLabel>
                <Select
                  onValueChange={field.onChange}
                  value={field.value}
                  disabled={isSubmitting}
                >
                  <FormControl>
                    <SelectTrigger className="h-11">
                      <SelectValue placeholder="Sélectionnez votre ville" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {VILLES_CI.map((ville) => (
                      <SelectItem key={ville} value={ville}>
                        {ville}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={control}
            name="adresse"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Adresse <span className="text-danger">*</span>
                </FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    placeholder="Rue, quartier, repère…"
                    autoComplete="street-address"
                    disabled={isSubmitting}
                    className="h-11"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Ligne 4 : Nombre de machines + Nombre d'employés */}
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={control}
            name="nombre_machines"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Nombre de machines <span className="text-danger">*</span>
                </FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    type="number"
                    min={1}
                    step={1}
                    placeholder="Ex : 3"
                    disabled={isSubmitting}
                    className="h-11"
                    value={(field.value as number | undefined) ?? ""}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={control}
            name="nombre_employes"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Nombre d&apos;employés{" "}
                  <span className="text-xs font-normal text-muted-foreground">
                    (optionnel)
                  </span>
                </FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    type="number"
                    min={0}
                    step={1}
                    placeholder="Ex : 2"
                    disabled={isSubmitting}
                    className="h-11"
                    value={(field.value as number | string | null | undefined) ?? ""}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Plan souhaité (pleine largeur) */}
        <FormField
          control={control}
          name="plan_souhaite"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Plan souhaité <span className="text-danger">*</span>
              </FormLabel>
              <Select
                onValueChange={field.onChange}
                value={field.value}
                disabled={isSubmitting}
              >
                <FormControl>
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="Sélectionnez un plan" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {PLANS.map((plan) => (
                    <SelectItem key={plan.value} value={plan.value}>
                      {plan.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Message (textarea, pleine largeur) */}
        <FormField
          control={control}
          name="message"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Message{" "}
                <span className="text-xs font-normal text-muted-foreground">
                  (optionnel)
                </span>
              </FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  placeholder="Des besoins spécifiques ?"
                  maxLength={500}
                  rows={4}
                  disabled={isSubmitting}
                  className="resize-none"
                />
              </FormControl>
              <div className="flex items-center justify-between">
                <FormMessage />
                <span className="text-xs text-muted-foreground">
                  {messageValue.length}/500
                </span>
              </div>
            </FormItem>
          )}
        />

        {/* Erreur API (globale) */}
        {submitError && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger/5 p-3 text-sm text-danger"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <span>{submitError}</span>
          </div>
        )}

        {/* Bouton submit — orange (warning) pour matcher le design Stitch */}
        <Button
          type="submit"
          size="lg"
          variant="warning"
          className="w-full"
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="size-4 animate-spin" /> Envoi en cours…
            </>
          ) : (
            <>
              <Send className="size-4" /> Envoyer ma demande
            </>
          )}
        </Button>

        <p className="text-center text-xs text-muted-foreground">
          En envoyant votre demande, vous acceptez d&apos;être contacté par
          OgPressing. Aucun règlement ne se fait en ligne.
        </p>
      </form>
    </Form>
  );
}
