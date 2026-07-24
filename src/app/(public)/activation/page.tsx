/**
 * OgPressing — Page d'activation
 * ------------------------------
 * Route : /activation
 *
 * Le prospect reçoit un code PRS-XXXX-XXXX (usage unique, 7 jours) après
 * règlement physique. Il saisit ici ce code + ses informations de compte
 * pour créer son pressing et son compte admin.
 *
 * POST /api/public/activation → crée pressing + auth user + personnel + abonnement,
 * marque le code comme utilisé.
 */
"use client";

import { useState, type FormEvent, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Loader2,
  AlertCircle,
  ShoppingBag,
  ArrowLeft,
  Ticket,
  UserPlus,
  Store,
  Eye,
  EyeOff,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";

type Status = "idle" | "submitting" | "success";

interface FormState {
  code: string;
  nom_complet: string;
  email: string;
  password: string;
  confirmPassword: string;
  nom_pressing: string;
  telephone: string;
  ville: string;
  commune: string;
}

const INITIAL: FormState = {
  code: "",
  nom_complet: "",
  email: "",
  password: "",
  confirmPassword: "",
  nom_pressing: "",
  telephone: "",
  ville: "",
  commune: "",
};

/**
 * Formate la saisie du code au format PRS-XXXX-XXXX.
 * Accepte les caractères alphanumériques (sans I/O/0/1 selon PROJECT_CONTEXT §6).
 */
function formatCode(raw: string): string {
  // Garde seulement les caractères valides (A-Z 2-9, on tolère aussi I O 0 1 pour la saisie)
  const cleaned = raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    // Si l'utilisateur n'a pas tapé le préfixe PRS, on l'ajoute virtuellement
    .replace(/^PRS/, "");
  const chunk1 = cleaned.slice(0, 4);
  const chunk2 = cleaned.slice(4, 8);
  let out = "PRS-";
  if (chunk1) out += chunk1;
  if (chunk2) out += "-" + chunk2;
  return out;
}

export default function ActivationPage() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(INITIAL);
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Validation locale (mot de passe)
  const passwordMismatch = useMemo(
    () =>
      form.confirmPassword.length > 0 && form.password !== form.confirmPassword,
    [form.password, form.confirmPassword]
  );

  function update<K extends keyof FormState>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus("submitting");
    setErrorMsg("");

    if (passwordMismatch) {
      setErrorMsg("Les mots de passe ne correspondent pas.");
      setStatus("idle");
      return;
    }

    try {
      const res = await fetch("/api/public/activation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: form.code,
          nom_complet: form.nom_complet,
          email: form.email,
          password: form.password,
          nom_pressing: form.nom_pressing,
          telephone: form.telephone,
          ville: form.ville,
          commune: form.commune,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Activation impossible. Vérifiez votre code.");
      }
      setStatus("success");
      toast.success("Compte activé ! Vous pouvez vous connecter.");
    } catch (err) {
      setStatus("idle");
      setErrorMsg(err instanceof Error ? err.message : "Erreur inconnue.");
    }
  }

  if (status === "success") {
    return (
      <div className="relative flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-12">
        <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-b from-secondary/5 to-background" />
        <Card className="w-full max-w-md shadow-lg">
          <CardContent className="pt-8 text-center">
            <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-secondary/15">
              <CheckCircle2 className="size-9 text-secondary" />
            </div>
            <h1 className="mt-4 text-2xl font-bold text-foreground">
              Activation réussie !
            </h1>
            <p className="mt-2 text-muted-foreground">
              Votre pressing <strong className="text-foreground">{form.nom_pressing}</strong> a été
              créé. Votre période d&apos;essai de 7 jours commence maintenant.
            </p>
            <div className="mt-6 space-y-3">
              <Button
                size="lg"
                className="w-full"
                onClick={() => router.push("/login")}
              >
                Se connecter à mon compte
              </Button>
              <Button variant="outline" className="w-full" asChild>
                <Link href="/">Retour à l&apos;accueil</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="relative min-h-[calc(100vh-4rem)] px-4 py-12">
      <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-b from-primary/5 to-background" />

      <div className="mx-auto max-w-2xl">
        <div className="mb-6 text-center">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" /> Retour à l&apos;accueil
          </Link>
        </div>

        <div className="mb-8 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <ShoppingBag className="size-6" />
          </div>
          <h1 className="mt-4 text-3xl font-bold text-foreground">Activez votre pressing</h1>
          <p className="mt-2 text-muted-foreground">
            Saisissez votre code d&apos;activation (PRS-XXXX-XXXX) et vos informations
            pour créer votre compte.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Section 1 : Code d'activation */}
          <Card>
            <CardContent className="pt-6">
              <div className="mb-4 flex items-center gap-2">
                <Ticket className="size-5 text-primary" />
                <h2 className="text-lg font-semibold text-foreground">
                  Code d&apos;activation
                </h2>
              </div>
              <div className="space-y-2">
                <Label htmlFor="code">
                  Code <span className="text-danger">*</span>
                </Label>
                <Input
                  id="code"
                  value={form.code}
                  onChange={(e) => update("code", formatCode(e.target.value))}
                  placeholder="PRS-XXXX-XXXX"
                  required
                  autoComplete="off"
                  className="h-12 font-mono text-lg tracking-wider"
                  maxLength={13}
                />
                <p className="text-xs text-muted-foreground">
                  Code fourni par OgPressing après règlement. Usage unique, valide 7 jours.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Section 2 : Compte admin */}
          <Card>
            <CardContent className="pt-6">
              <div className="mb-4 flex items-center gap-2">
                <UserPlus className="size-5 text-primary" />
                <h2 className="text-lg font-semibold text-foreground">
                  Votre compte administrateur
                </h2>
              </div>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="nom_complet">
                    Nom complet <span className="text-danger">*</span>
                  </Label>
                  <Input
                    id="nom_complet"
                    value={form.nom_complet}
                    onChange={(e) => update("nom_complet", e.target.value)}
                    placeholder="Ex : Awa Koné"
                    required
                    autoComplete="name"
                    className="h-11"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">
                    Email <span className="text-danger">*</span>
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    value={form.email}
                    onChange={(e) => update("email", e.target.value)}
                    placeholder="vous@pressing.ci"
                    required
                    autoComplete="email"
                    className="h-11"
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="password">
                      Mot de passe <span className="text-danger">*</span>
                    </Label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        value={form.password}
                        onChange={(e) => update("password", e.target.value)}
                        placeholder="Min. 8 caractères"
                        required
                        minLength={8}
                        autoComplete="new-password"
                        className="h-11 pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((s) => !s)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        aria-label={showPassword ? "Masquer" : "Afficher"}
                        tabIndex={-1}
                      >
                        {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">
                      Confirmer <span className="text-danger">*</span>
                    </Label>
                    <Input
                      id="confirmPassword"
                      type={showPassword ? "text" : "password"}
                      value={form.confirmPassword}
                      onChange={(e) => update("confirmPassword", e.target.value)}
                      placeholder="Répétez le mot de passe"
                      required
                      minLength={8}
                      autoComplete="new-password"
                      className={`h-11 ${passwordMismatch ? "border-danger focus-visible:border-danger" : ""}`}
                    />
                  </div>
                </div>
                {passwordMismatch && (
                  <p className="text-xs text-danger">Les mots de passe ne correspondent pas.</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Section 3 : Pressing */}
          <Card>
            <CardContent className="pt-6">
              <div className="mb-4 flex items-center gap-2">
                <Store className="size-5 text-primary" />
                <h2 className="text-lg font-semibold text-foreground">
                  Informations du pressing
                </h2>
              </div>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="nom_pressing">
                    Nom du pressing <span className="text-danger">*</span>
                  </Label>
                  <Input
                    id="nom_pressing"
                    value={form.nom_pressing}
                    onChange={(e) => update("nom_pressing", e.target.value)}
                    placeholder="Ex : Pressing Cocody"
                    required
                    autoComplete="organization"
                    className="h-11"
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="telephone">
                      Téléphone <span className="text-danger">*</span>
                    </Label>
                    <Input
                      id="telephone"
                      type="tel"
                      value={form.telephone}
                      onChange={(e) => update("telephone", e.target.value)}
                      placeholder="07 00 00 00 00"
                      required
                      autoComplete="tel"
                      className="h-11"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ville">Ville</Label>
                    <Input
                      id="ville"
                      value={form.ville}
                      onChange={(e) => update("ville", e.target.value)}
                      placeholder="Abidjan"
                      className="h-11"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="commune">Commune / Quartier</Label>
                  <Input
                    id="commune"
                    value={form.commune}
                    onChange={(e) => update("commune", e.target.value)}
                    placeholder="Cocody"
                    className="h-11"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {errorMsg && (
            <div className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger/5 p-3 text-sm text-danger">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={status === "submitting" || passwordMismatch}
          >
            {status === "submitting" ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Activation en cours...
              </>
            ) : (
              "Activer mon pressing"
            )}
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            En activant votre compte, vous acceptez les conditions d&apos;utilisation
            d&apos;OgPressing. La période d&apos;essai de 7 jours débute à l&apos;activation.
          </p>
        </form>
      </div>
    </div>
  );
}
