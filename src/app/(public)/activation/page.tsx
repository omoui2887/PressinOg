/**
 * OgPressing — Page d'activation (PROMPT 3.3 — version 2 étapes)
 * --------------------------------------------------------------
 * Route : /activation  (groupe (public))
 *
 * Flux en 2 étapes avec stepper visuel :
 *
 *   ÉTAPE 1 — Vérification du code (POST /api/public/activation/verify-code)
 *     • Un seul champ "Code d'activation" (PRS-XXXX-XXXX, MAJ auto)
 *     • Vérifie : code existe, non utilisé, non expiré
 *     • Si valide : mémorise { code, code_id, plan } et passe à l'étape 2
 *
 *   ÉTAPE 2 — Création du compte Admin (react-hook-form + zod)
 *     • Banner highlight : "🎉 Vous bénéficiez d'un essai gratuit de 7 jours"
 *     • Champs : nom_pressing, ville (Select), commune, email, password
 *                (+ œil), confirmPassword, nom_responsable, prenom_responsable,
 *                telephone
 *     • POST /api/public/activation (route existante, non modifiée) qui crée
 *       user Auth + pressing + personnel (manager) + abonnement (essai 7 j) +
 *       marque le code comme utilisé.
 *     • Succès → auto-connexion signInWithPassword() côté client puis
 *       window.location.href = "/admin/dashboard" (pas router.push).
 *
 * ⚠️ RLS : la vérification du code doit se faire côté serveur (service_role)
 *    car `anon` ne peut SELECT que (code, utilise) sur codes_activation.
 */
"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Loader2,
  AlertCircle,
  ShoppingBag,
  ArrowLeft,
  Ticket,
  Eye,
  EyeOff,
  PartyPopper,
  Store,
  ShieldCheck,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

import { getSupabaseBrowser } from "@/lib/supabase/client";
import type { PlanAbonnement } from "@/lib/types";

/* -------------------------------------------------------------------------- */
/*  Constantes                                                                */
/* -------------------------------------------------------------------------- */

/** Villes de Côte d'Ivoire proposées dans le dropdown (PROMPT 3.3). */
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

/** Regex du format de code d'activation PRS-XXXX-XXXX. */
const CODE_REGEX = /^PRS-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

/** Numéro WhatsApp support OgPressing (renvoyé dans les messages d'erreur). */
const WHATSAPP_SUPPORT = "+225 05 76 10 32 77";

/* -------------------------------------------------------------------------- */
/*  Schéma ZOD — Étape 1 (code)                                               */
/* -------------------------------------------------------------------------- */

const codeSchema = z.object({
  code: z
    .string()
    .min(1, "Veuillez saisir votre code d'activation.")
    .regex(CODE_REGEX, "Format attendu : PRS-XXXX-XXXX."),
});

type CodeValues = z.infer<typeof codeSchema>;

/* -------------------------------------------------------------------------- */
/*  Schéma ZOD — Étape 2 (création du compte)                                 */
/* -------------------------------------------------------------------------- */

const compteSchema = z
  .object({
    nom_pressing: z
      .string()
      .min(2, "Le nom du pressing doit comporter au moins 2 caractères.")
      .max(100, "Le nom du pressing ne doit pas dépasser 100 caractères."),
    ville: z
      .string()
      .min(1, "Veuillez sélectionner votre ville."),
    commune: z
      .string()
      .max(100, "La commune / quartier ne doit pas dépasser 100 caractères.")
      .optional(),
    email: z
      .string()
      .min(1, "L'email est requis.")
      .email("L'email n'est pas valide."),
    password: z
      .string()
      .min(8, "Le mot de passe doit comporter au moins 8 caractères."),
    confirmPassword: z
      .string()
      .min(8, "La confirmation doit comporter au moins 8 caractères."),
    nom_responsable: z
      .string()
      .min(2, "Le nom doit comporter au moins 2 caractères.")
      .max(50, "Le nom ne doit pas dépasser 50 caractères."),
    prenom_responsable: z
      .string()
      .min(2, "Le prénom doit comporter au moins 2 caractères.")
      .max(50, "Le prénom ne doit pas dépasser 50 caractères."),
    telephone: z
      .string()
      .min(1, "Le téléphone est requis.")
      .refine((v) => /^\+?[\d\s\-().]{8,20}$/.test(v) && v.replace(/[\s\-().]/g, "").replace(/^\+/, "").length >= 8, {
        message: "Le téléphone doit contenir entre 8 et 20 chiffres.",
      }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Les mots de passe ne correspondent pas.",
    path: ["confirmPassword"],
  });

type CompteValues = z.infer<typeof compteSchema>;

/* -------------------------------------------------------------------------- */
/*  Helper — formatage du code en PRS-XXXX-XXXX                               */
/* -------------------------------------------------------------------------- */

/**
 * Formate la saisie du code au format PRS-XXXX-XXXX.
 * Force les MAJUSCULES, supprime les caractères non alphanumériques,
 * ajoute automatiquement le préfixe "PRS-" et les tirets.
 */
function formatCode(raw: string): string {
  const cleaned = raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    // Si l'utilisateur n'a pas tapé le préfixe PRS, on le retire avant reformatage
    .replace(/^PRS/, "");
  const chunk1 = cleaned.slice(0, 4);
  const chunk2 = cleaned.slice(4, 8);
  let out = "PRS-";
  if (chunk1) out += chunk1;
  if (chunk2) out += "-" + chunk2;
  return out;
}

/* -------------------------------------------------------------------------- */
/*  Types locaux                                                              */
/* -------------------------------------------------------------------------- */

interface VerifiedCode {
  code: string;
  code_id: string;
  plan: PlanAbonnement;
}

/* -------------------------------------------------------------------------- */
/*  Composant — Stepper visuel                                                */
/* -------------------------------------------------------------------------- */

function Stepper({ current }: { current: 1 | 2 }) {
  return (
    <div className="mx-auto mb-8 w-full max-w-xs">
      <div className="flex items-center">
        {/* Pastille 1 */}
        <div className="flex flex-col items-center">
          <div
            className={`flex size-10 items-center justify-center rounded-full text-sm font-semibold transition-colors ${
              current >= 1
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
            }`}
            aria-current={current === 1 ? "step" : undefined}
          >
            {current > 1 ? <ShieldCheck className="size-5" /> : "1"}
          </div>
        </div>

        {/* Ligne de séparation */}
        <div
          className={`h-0.5 flex-1 transition-colors ${
            current > 1 ? "bg-primary" : "bg-muted"
          }`}
          aria-hidden
        />

        {/* Pastille 2 */}
        <div className="flex flex-col items-center">
          <div
            className={`flex size-10 items-center justify-center rounded-full text-sm font-semibold transition-colors ${
              current >= 2
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
            }`}
            aria-current={current === 2 ? "step" : undefined}
          >
            2
          </div>
        </div>
      </div>

      {/* Labels sous les pastilles */}
      <div className="mt-2 flex items-center justify-between text-center text-xs text-muted-foreground">
        <span className="flex-1">
          {current === 1 ? (
            <strong className="text-foreground">Étape 1/2</strong>
          ) : (
            "Étape 1/2"
          )}
          <br />
          Vérification du code
        </span>
        <span className="flex-1">
          {current === 2 ? (
            <strong className="text-foreground">Étape 2/2</strong>
          ) : (
            "Étape 2/2"
          )}
          <br />
          Création du compte
        </span>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Page                                                                      */
/* -------------------------------------------------------------------------- */

export default function ActivationPage() {
  const [step, setStep] = useState<1 | 2>(1);
  const [verified, setVerified] = useState<VerifiedCode | null>(null);

  // États de l'étape 1
  const [codeValue, setCodeValue] = useState("");
  const [codeError, setCodeError] = useState("");
  const [codeLoading, setCodeLoading] = useState(false);

  // États de l'étape 2
  const [submitError, setSubmitError] = useState("");
  const [submitLoading, setSubmitLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Formulaire react-hook-form + zod pour l'étape 2
  const form = useForm<CompteValues>({
    resolver: zodResolver(compteSchema),
    defaultValues: {
      nom_pressing: "",
      ville: "",
      commune: "",
      email: "",
      password: "",
      confirmPassword: "",
      nom_responsable: "",
      prenom_responsable: "",
      telephone: "",
    },
    mode: "onBlur",
  });

  /* ----------------------- Étape 1 : vérification ----------------------- */

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    setCodeError("");

    // Validation locale du format
    const parsed = codeSchema.safeParse({ code: codeValue });
    if (!parsed.success) {
      setCodeError(parsed.error.issues[0]?.message ?? "Code invalide.");
      return;
    }

    setCodeLoading(true);
    try {
      const res = await fetch("/api/public/activation/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: codeValue }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        // On affiche tel quel le message renvoyé par l'API (déjà en français,
        // inclut le numéro WhatsApp pour les codes invalides/expirés).
        setCodeError(data.error ?? "Ce code n'est pas valide ou a expiré.");
        return;
      }

      // Code valide → on mémorise et passe à l'étape 2
      setVerified({
        code: codeValue,
        code_id: data.data.code_id,
        plan: data.data.plan as PlanAbonnement,
      });
      setStep(2);
    } catch {
      setCodeError(
        "Impossible de vérifier le code pour le moment. Réessayez dans quelques instants."
      );
    } finally {
      setCodeLoading(false);
    }
  }

  /** Permet à l'utilisateur de revenir à l'étape 1 pour modifier le code. */
  function backToStep1() {
    setStep(1);
    setSubmitError("");
  }

  /* ----------------------- Étape 2 : création --------------------------- */

  async function onSubmit(values: CompteValues) {
    setSubmitError("");
    setSubmitLoading(true);

    // Concaténation nom + prénom → nom_complet (colonne unique en DB)
    const nomComplet = `${values.prenom_responsable} ${values.nom_responsable}`.trim();

    try {
      const res = await fetch("/api/public/activation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: verified?.code ?? codeValue,
          nom_complet: nomComplet,
          email: values.email,
          password: values.password,
          nom_pressing: values.nom_pressing,
          telephone: values.telephone,
          ville: values.ville,
          commune: values.commune ?? "",
        }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        const errMsg: string = data.error ?? "Activation impossible.";

        // Cas particulier : code devenu invalide entre les 2 étapes (rare,
        // ex : utilisé par quelqu'un d'autre entre-temps) → retour étape 1.
        if (
          errMsg.toLowerCase().includes("code") &&
          (errMsg.toLowerCase().includes("déjà été utilisé") ||
            errMsg.toLowerCase().includes("expiré") ||
            errMsg.toLowerCase().includes("invalide"))
        ) {
          setStep(1);
          setVerified(null);
          setCodeError(errMsg);
          return;
        }

        setSubmitError(errMsg);
        return;
      }

      // Succès → auto-connexion côté client puis redirection
      const supabase = getSupabaseBrowser();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: values.email,
        password: values.password,
      });

      if (signInError) {
        // Le compte est créé mais l'auto-connexion a échoué. On prévient
        // l'utilisateur et on le redirige vers /login en fallback.
        toast.error(
          "Compte créé mais la connexion automatique a échoué. Veuillez vous connecter manuellement."
        );
        window.location.href = "/login";
        return;
      }

      toast.success(
        "Bienvenue sur OgPressing ! Votre essai gratuit de 7 jours commence maintenant."
      );

      // window.location.href (et non router.push) pour forcer le rechargement
      // complet et initialiser correctement la session côté serveur.
      window.location.href = "/admin/dashboard";
    } catch {
      setSubmitError(
        "Une erreur inattendue est survenue. Veuillez réessayer dans quelques instants."
      );
    } finally {
      setSubmitLoading(false);
    }
  }

  /* ----------------------- Rendu ---------------------------------------- */

  return (
    <div className="relative min-h-[calc(100vh-4rem)] px-4 py-10 sm:py-12">
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-gradient-to-b from-primary/5 via-background to-background"
      />

      <div className="mx-auto w-full max-w-2xl">
        {/* Lien retour accueil */}
        <div className="mb-6">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" /> Retour à l&apos;accueil
          </Link>
        </div>

        {/* En-tête */}
        <div className="mb-8 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <ShoppingBag className="size-6" />
          </div>
          <h1 className="mt-4 text-2xl font-bold text-foreground sm:text-3xl">
            Activez votre pressing
          </h1>
          <p className="mt-2 text-sm text-muted-foreground sm:text-base">
            Saisissez votre code d&apos;activation (PRS-XXXX-XXXX) puis vos
            informations pour créer votre compte.
          </p>
        </div>

        {/* Stepper */}
        <Stepper current={step} />

        {/* ----------------------- ÉTAPE 1 ----------------------- */}
        {step === 1 && (
          <Card className="shadow-sm">
            <CardContent className="p-6">
              <div className="mb-5 flex items-center gap-2">
                <Ticket className="size-5 text-primary" />
                <h2 className="text-lg font-semibold text-foreground">
                  Vérification du code
                </h2>
              </div>

              <form onSubmit={handleVerifyCode} className="space-y-4">
                <div className="space-y-2">
                  <label
                    htmlFor="code"
                    className="text-sm font-medium text-foreground"
                  >
                    Code d&apos;activation{" "}
                    <span className="text-danger">*</span>
                  </label>
                  <Input
                    id="code"
                    value={codeValue}
                    onChange={(e) => {
                      setCodeValue(formatCode(e.target.value));
                      if (codeError) setCodeError("");
                    }}
                    placeholder="PRS-XXXX-XXXX"
                    autoComplete="off"
                    inputMode="text"
                    autoCapitalize="characters"
                    spellCheck={false}
                    className="h-12 font-mono text-lg tracking-wider"
                    maxLength={13}
                    aria-invalid={!!codeError}
                    aria-describedby={codeError ? "code-error" : undefined}
                    disabled={codeLoading}
                  />
                  <p className="text-xs text-muted-foreground">
                    Code fourni par OgPressing après règlement. Usage unique,
                    valide 7 jours.
                  </p>
                </div>

                {codeError && (
                  <Alert variant="destructive" id="code-error">
                    <AlertCircle className="size-4" />
                    <AlertDescription>{codeError}</AlertDescription>
                  </Alert>
                )}

                <Button
                  type="submit"
                  size="lg"
                  className="w-full"
                  disabled={codeLoading || codeValue.length < 13}
                >
                  {codeLoading ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Vérification...
                    </>
                  ) : (
                    "Vérifier le code"
                  )}
                </Button>

                <p className="text-center text-xs text-muted-foreground">
                  Pas de code ? Contactez OgPressing au{" "}
                  <a
                    href={`https://wa.me/${WHATSAPP_SUPPORT.replace(/[^0-9]/g, "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-primary underline-offset-2 hover:underline"
                  >
                    {WHATSAPP_SUPPORT}
                  </a>{" "}
                  par WhatsApp.
                </p>
              </form>
            </CardContent>
          </Card>
        )}

        {/* ----------------------- ÉTAPE 2 ----------------------- */}
        {step === 2 && (
          <div className="space-y-6">
            {/* Banner highlight — essai gratuit */}
            <Card className="border-secondary/30 bg-secondary/10">
              <CardContent className="flex items-center gap-3 p-4 sm:p-5">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary/15">
                  <PartyPopper className="size-5 text-secondary" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">
                    🎉 Vous bénéficiez d&apos;un essai gratuit de 7 jours
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Plan{" "}
                    <strong className="capitalize text-foreground">
                      {verified?.plan ?? "starter"}
                    </strong>{" "}
                    — toutes les fonctionnalités débloquées pendant la période
                    d&apos;essai. Aucune carte requise.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="space-y-6"
              >
                {/* Card : Pressing */}
                <Card>
                  <CardContent className="p-6">
                    <div className="mb-5 flex items-center gap-2">
                      <Store className="size-5 text-primary" />
                      <h2 className="text-lg font-semibold text-foreground">
                        Informations du pressing
                      </h2>
                    </div>

                    <div className="space-y-4">
                      <FormField
                        control={form.control}
                        name="nom_pressing"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>
                              Nom du pressing{" "}
                              <span className="text-danger">*</span>
                            </FormLabel>
                            <FormControl>
                              <Input
                                placeholder="Ex : Pressing Cocody"
                                autoComplete="organization"
                                className="h-11"
                                disabled={submitLoading}
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div className="grid gap-4 sm:grid-cols-2">
                        <FormField
                          control={form.control}
                          name="ville"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>
                                Ville <span className="text-danger">*</span>
                              </FormLabel>
                              <Select
                                value={field.value}
                                onValueChange={field.onChange}
                                disabled={submitLoading}
                              >
                                <FormControl>
                                  <SelectTrigger className="h-11 w-full">
                                    <SelectValue placeholder="Sélectionnez votre ville" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {VILLES_CI.map((v) => (
                                    <SelectItem key={v} value={v}>
                                      {v}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="commune"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Commune / Quartier</FormLabel>
                              <FormControl>
                                <Input
                                  placeholder="Ex : Cocody Riviera"
                                  className="h-11"
                                  disabled={submitLoading}
                                  {...field}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Card : Compte administrateur */}
                <Card>
                  <CardContent className="p-6">
                    <div className="mb-5 flex items-center gap-2">
                      <ShieldCheck className="size-5 text-primary" />
                      <h2 className="text-lg font-semibold text-foreground">
                        Compte administrateur
                      </h2>
                    </div>

                    <div className="space-y-4">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <FormField
                          control={form.control}
                          name="prenom_responsable"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>
                                Prénom du responsable{" "}
                                <span className="text-danger">*</span>
                              </FormLabel>
                              <FormControl>
                                <Input
                                  placeholder="Ex : Awa"
                                  autoComplete="given-name"
                                  className="h-11"
                                  disabled={submitLoading}
                                  {...field}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="nom_responsable"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>
                                Nom du responsable{" "}
                                <span className="text-danger">*</span>
                              </FormLabel>
                              <FormControl>
                                <Input
                                  placeholder="Ex : Koné"
                                  autoComplete="family-name"
                                  className="h-11"
                                  disabled={submitLoading}
                                  {...field}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <FormField
                          control={form.control}
                          name="email"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>
                                Email <span className="text-danger">*</span>
                              </FormLabel>
                              <FormControl>
                                <Input
                                  type="email"
                                  placeholder="vous@pressing.ci"
                                  autoComplete="email"
                                  className="h-11"
                                  disabled={submitLoading}
                                  {...field}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="telephone"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>
                                Téléphone{" "}
                                <span className="text-danger">*</span>
                              </FormLabel>
                              <FormControl>
                                <Input
                                  type="tel"
                                  placeholder="07 00 00 00 00"
                                  autoComplete="tel"
                                  className="h-11"
                                  disabled={submitLoading}
                                  {...field}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <FormField
                          control={form.control}
                          name="password"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>
                                Mot de passe{" "}
                                <span className="text-danger">*</span>
                              </FormLabel>
                              <FormControl>
                                <div className="relative">
                                  <Input
                                    type={showPassword ? "text" : "password"}
                                    placeholder="Min. 8 caractères"
                                    autoComplete="new-password"
                                    className="h-11 pr-10"
                                    disabled={submitLoading}
                                    {...field}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => setShowPassword((s) => !s)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                                    aria-label={
                                      showPassword
                                        ? "Masquer le mot de passe"
                                        : "Afficher le mot de passe"
                                    }
                                    tabIndex={-1}
                                  >
                                    {showPassword ? (
                                      <EyeOff className="size-4" />
                                    ) : (
                                      <Eye className="size-4" />
                                    )}
                                  </button>
                                </div>
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="confirmPassword"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>
                                Confirmation du mot de passe{" "}
                                <span className="text-danger">*</span>
                              </FormLabel>
                              <FormControl>
                                <Input
                                  type={showPassword ? "text" : "password"}
                                  placeholder="Répétez le mot de passe"
                                  autoComplete="new-password"
                                  className="h-11"
                                  disabled={submitLoading}
                                  {...field}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Erreur globale de soumission */}
                {submitError && (
                  <Alert variant="destructive">
                    <AlertCircle className="size-4" />
                    <AlertDescription>{submitError}</AlertDescription>
                  </Alert>
                )}

                {/* Boutons d'action */}
                <div className="space-y-3">
                  <Button
                    type="submit"
                    size="lg"
                    className="w-full"
                    disabled={submitLoading}
                  >
                    {submitLoading ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        Création en cours...
                      </>
                    ) : (
                      "Créer mon compte"
                    )}
                  </Button>

                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full"
                    onClick={backToStep1}
                    disabled={submitLoading}
                  >
                    <ArrowLeft className="size-4" />
                    Modifier le code d&apos;activation
                  </Button>
                </div>

                <p className="text-center text-xs text-muted-foreground">
                  En activant votre compte, vous acceptez les conditions
                  d&apos;utilisation d&apos;OgPressing. La période d&apos;essai
                  de 7 jours débute à l&apos;activation.
                </p>
              </form>
            </Form>
          </div>
        )}
      </div>
    </div>
  );
}
