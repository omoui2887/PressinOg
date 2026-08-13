/**
 * e-pressing — Changement de mot de passe obligatoire (1ère connexion)
 * --------------------------------------------------------------------
 * Route : /personnel/changer-mot-de-passe
 *
 * Cette page est présentée à un membre du personnel dont le compte a été
 * créé avec `mot_de_passe_temporaire = true` (invitation par email ou
 * création directe avec un mot de passe jetable). Le changement est
 * OBLIGATOIRE avant tout accès au dashboard.
 *
 * Flux :
 *   1. Vérifie que l'utilisateur est authentifié (sinon → /login).
 *   2. Vérifie `personnel.mot_de_passe_temporaire` :
 *        - false → l'utilisateur a déjà changé son mot de passe, on le
 *          redirige vers son dashboard (anti-rejeu).
 *        - true  → on affiche le formulaire.
 *   3. Au submit :
 *        a. supabase.auth.updateUser({ password }) — met à jour le mdp
 *           côté Supabase Auth.
 *        b. supabase.from('personnel').update({
 *             mot_de_passe_temporaire: false,
 *             statut_compte: 'actif',           // active les comptes en 'invite_en_attente'
 *             date_activation: now              // trace la 1ère connexion
 *           }).eq('user_id', user.id)
 *        c. Récupère le role pour rediriger :
 *             - manager → /admin/dashboard
 *             - autre   → /personnel/{role}/dashboard
 *        d. Toast succès + window.location.assign (hard navigation, voir Task 17).
 *
 * Sécurité :
 *   - L'UPDATE personnel est soumis à RLS (policy `isolation_pressing`
 *     FOR ALL → WITH CHECK pressing_id = get_pressing_id_utilisateur()).
 *     L'utilisateur ne peut modifier QUE sa propre ligne.
 *   - Si l'utilisateur n'est pas authentifié, le middleware aurait déjà dû
 *     le rediriger ; on ajoute quand même un garde-fou côté client.
 *
 * Design : cohérent avec /login (Card + logo ShoppingBag, bleu primary,
 * mobile-first, cibles tactiles ≥ 44px).
 */
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Loader2,
  AlertCircle,
  ShoppingBag,
  Eye,
  EyeOff,
  KeyRound,
  LogOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { toast } from "sonner";

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

type RolePersonnel =
  | "manager"
  | "receptionniste"
  | "caissier"
  | "laveur"
  | "repassage"
  | "livreur"
  | "comptable";

interface PersonnelRow {
  id: string;
  role: RolePersonnel;
  mot_de_passe_temporaire: boolean | null;
  statut_compte: string | null;
}

/* ------------------------------------------------------------------ */
/* Schéma de validation zod                                           */
/* ------------------------------------------------------------------ */

const passwordSchema = z
  .object({
    password: z
      .string()
      .min(8, { message: "Le mot de passe doit comporter au moins 8 caractères." }),
    confirmPassword: z
      .string()
      .min(1, { message: "Veuillez confirmer votre mot de passe." }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Les deux mots de passe ne correspondent pas.",
    path: ["confirmPassword"],
  });

type PasswordFormValues = z.infer<typeof passwordSchema>;

/* ------------------------------------------------------------------ */
/* États possibles de la page                                         */
/* ------------------------------------------------------------------ */

type PageStatus =
  | { kind: "loading" }
  | { kind: "form" }
  | { kind: "redirecting"; target: string };

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function dashboardForRole(role: RolePersonnel): string {
  return role === "manager"
    ? "/admin/dashboard"
    : `/personnel/${role}/dashboard`;
}

/* ------------------------------------------------------------------ */
/* Composant                                                          */
/* ------------------------------------------------------------------ */

export default function ChangerMotDePassePage() {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [globalError, setGlobalError] = useState("");
  const [status, setStatus] = useState<PageStatus>({ kind: "loading" });

  const form = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      password: "",
      confirmPassword: "",
    },
    mode: "onSubmit",
  });

  /* -------------------- Garde-fou initial -------------------- */

  useEffect(() => {
    let cancelled = false;

    async function checkAccess() {
      const supabase = getSupabaseBrowser();

      // 1. Utilisateur authentifié ?
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) {
        // Pas authentifié → /login
        window.location.assign("/login?next=/personnel/changer-mot-de-passe");
        return;
      }

      // 2. Récupère la ligne personnel (RLS : self).
      const { data: personnel, error: persError } = await supabase
        .from("personnel")
        .select("id, role, mot_de_passe_temporaire, statut_compte")
        .eq("user_id", authData.user.id)
        .maybeSingle();

      if (persError) {
        // Sécurité : ne pas logger l'objet Error complet (stack trace) côté navigateur.
        console.error(
          "[changer-mot-de-passe] Erreur lookup personnel :",
          persError.message
        );
        // On laisse l'utilisateur tenter — s'il n'a vraiment pas de ligne,
        // l'UPDATE échouera silencieusement et le toast d'erreur s'affichera.
      }

      if (cancelled) return;

      // 3. Pas de ligne personnel → on déconnecte et renvoie vers /login
      //    (compte non reconnu, même logique que sur /login).
      if (!personnel) {
        await supabase.auth.signOut();
        window.location.assign("/login?error=compte_non_reconnu");
        return;
      }

      // 4. mot_de_passe_temporaire = false → l'utilisateur a déjà changé son
      //    mot de passe, on le redirige vers son dashboard (anti-rejeu).
      if (personnel.mot_de_passe_temporaire === false) {
        const target = dashboardForRole(personnel.role);
        window.location.assign(target);
        return;
      }

      // 5. Sinon → on affiche le formulaire.
      setStatus({ kind: "form" });
    }

    checkAccess();

    return () => {
      cancelled = true;
    };
  }, []);

  /* -------------------- Soumission du formulaire -------------------- */

  async function onSubmit(values: PasswordFormValues) {
    setGlobalError("");
    setStatus({ kind: "loading" });

    try {
      const supabase = getSupabaseBrowser();

      // Récupère l'utilisateur courant (devrait déjà être authentifié).
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) {
        setGlobalError(
          "Votre session a expiré. Veuillez vous reconnecter."
        );
        setStatus({ kind: "form" });
        // Redirige vers /login après un court délai pour laisser le toast s'afficher.
        setTimeout(() => {
          window.location.assign("/login?next=/personnel/changer-mot-de-passe");
        }, 1200);
        return;
      }

      const userId = authData.user.id;

      // 1. Met à jour le mot de passe côté Supabase Auth.
      const { error: updateAuthError } = await supabase.auth.updateUser({
        password: values.password,
      });

      if (updateAuthError) {
        // Cas rare : "new password should be different from the old password"
        // si Supabase détecte une réutilisation. Message clair, sans jargon.
        const msg = updateAuthError.message.toLowerCase();
        if (msg.includes("different") || msg.includes("same as")) {
          setGlobalError(
            "Le nouveau mot de passe doit être différent de l'ancien."
          );
        } else {
          setGlobalError(
            "Impossible de modifier le mot de passe. Réessayez."
          );
        }
        setStatus({ kind: "form" });
        return;
      }

      // 2. Met à jour le flag côté personnel + active le compte si besoin.
      //    On récupère d'abord la ligne pour connaître le statut et le rôle
      //    avant l'UPDATE (évite une 2e requête après).
      const { data: persBefore } = await supabase
        .from("personnel")
        .select("id, role, statut_compte")
        .eq("user_id", userId)
        .maybeSingle();

      if (!persBefore) {
        // Ne devrait pas arriver (on vient de vérifier dans useEffect), mais
        // on reste prudent : on déconnecte et redirige.
        await supabase.auth.signOut();
        setGlobalError("Compte non reconnu, contactez votre administrateur.");
        setStatus({ kind: "form" });
        return;
      }

      const updatePayload: Record<string, unknown> = {
        mot_de_passe_temporaire: false,
      };

      // Active le compte s'il était en attente d'invitation.
      if (persBefore.statut_compte === "invite_en_attente") {
        updatePayload.statut_compte = "actif";
        updatePayload.date_activation = new Date().toISOString();
      }

      const { error: updatePersError } = await supabase
        .from("personnel")
        .update(updatePayload)
        .eq("user_id", userId);

      if (updatePersError) {
        // Sécurité : ne pas logger l'objet Error complet (stack trace) côté navigateur.
        console.error(
          "[changer-mot-de-passe] Erreur UPDATE personnel :",
          updatePersError.message
        );
        // Le mot de passe a été changé côté Auth, mais on n'a pas pu
        // mettre à jour le flag. L'utilisateur sera de nouveau redirigé
        // ici à la prochaine connexion (mot_de_passe_temporaire toujours true).
        // On l'informe sans paniquer.
        toast.error(
          "Mot de passe modifié côté authentification, mais une erreur est survenue " +
            "lors de la finalisation. Veuillez vous reconnecter."
        );
        await supabase.auth.signOut();
        setTimeout(() => {
          window.location.assign("/login");
        }, 1500);
        return;
      }

      // 3. Redirection vers le dashboard du rôle.
      const target = dashboardForRole(persBefore.role as RolePersonnel);

      toast.success("Mot de passe modifié avec succès");

      // 4. Hard navigation (cf. Task 17 — race condition cookies + RSC preview iframe).
      setStatus({ kind: "redirecting", target });
      window.location.assign(target);
    } catch (err) {
      // Sécurité : ne pas logger l'objet Error complet (stack trace) côté navigateur.
      console.error("[changer-mot-de-passe] Erreur inattendue :", err instanceof Error ? err.message : "erreur");
      setGlobalError("Une erreur est survenue. Réessayez.");
      setStatus({ kind: "form" });
    }
  }

  /* -------------------- Déconnexion manuelle -------------------- */

  async function handleSignOut() {
    const supabase = getSupabaseBrowser();
    await supabase.auth.signOut();
    window.location.assign("/login");
  }

  /* -------------------- Rendu -------------------- */

  const isLoading = status.kind === "loading";
  const isRedirecting = status.kind === "redirecting";
  const showForm = status.kind === "form";
  const submitting = form.formState.isSubmitting;

  return (
    <div className="relative flex min-h-screen items-center justify-center px-4 py-12">
      {/* Décor — cohérent avec /login */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-gradient-to-b from-primary/5 to-background"
      />
      <div
        aria-hidden
        className="absolute top-0 left-1/2 -z-10 size-[400px] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl"
      />

      <div className="w-full max-w-md">
        <Card className="shadow-lg">
          <CardHeader className="text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <ShoppingBag className="size-6" />
            </div>
            <CardTitle className="mt-4 flex items-center justify-center gap-2 text-2xl">
              <KeyRound className="size-5" />
              Changement de mot de passe
            </CardTitle>
            <CardDescription>
              Pour votre sécurité, définissez un nouveau mot de passe avant
              d&apos;accéder à votre espace.
            </CardDescription>
          </CardHeader>

          <CardContent>
            {/* État chargement / redirection — on n'affiche pas le formulaire */}
            {(isLoading || isRedirecting) && !showForm && (
              <div className="flex flex-col items-center justify-center gap-3 py-12">
                <Loader2 className="size-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">
                  {isRedirecting
                    ? "Redirection vers votre tableau de bord..."
                    : "Vérification de votre compte..."}
                </p>
              </div>
            )}

            {/* Formulaire de changement de mot de passe */}
            {showForm && (
              <Form {...form}>
                <form
                  onSubmit={form.handleSubmit(onSubmit)}
                  className="space-y-4"
                  noValidate
                >
                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel htmlFor="password">
                          Nouveau mot de passe
                        </FormLabel>
                        <div className="relative">
                          <FormControl>
                            <Input
                              id="password"
                              type={showPassword ? "text" : "password"}
                              placeholder="••••••••"
                              autoComplete="new-password"
                              className="h-11 pr-10"
                              disabled={submitting}
                              aria-invalid={
                                !!form.formState.errors.password || undefined
                              }
                              {...field}
                            />
                          </FormControl>
                          <button
                            type="button"
                            onClick={() => setShowPassword((s) => !s)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
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
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="confirmPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel htmlFor="confirmPassword">
                          Confirmer le mot de passe
                        </FormLabel>
                        <div className="relative">
                          <FormControl>
                            <Input
                              id="confirmPassword"
                              type={showConfirm ? "text" : "password"}
                              placeholder="••••••••"
                              autoComplete="new-password"
                              className="h-11 pr-10"
                              disabled={submitting}
                              aria-invalid={
                                !!form.formState.errors.confirmPassword ||
                                undefined
                              }
                              {...field}
                            />
                          </FormControl>
                          <button
                            type="button"
                            onClick={() => setShowConfirm((s) => !s)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            aria-label={
                              showConfirm
                                ? "Masquer le mot de passe"
                                : "Afficher le mot de passe"
                            }
                            tabIndex={-1}
                          >
                            {showConfirm ? (
                              <EyeOff className="size-4" />
                            ) : (
                              <Eye className="size-4" />
                            )}
                          </button>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Indicateur de complexité minimum */}
                  <p className="text-xs text-muted-foreground">
                    Minimum 8 caractères. Choisissez un mot de passe unique,
                    différent de votre mot de passe temporaire.
                  </p>

                  {globalError && (
                    <div
                      role="alert"
                      className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger/5 p-3 text-sm text-danger"
                    >
                      <AlertCircle className="mt-0.5 size-4 shrink-0" />
                      <span>{globalError}</span>
                    </div>
                  )}

                  <Button
                    type="submit"
                    size="lg"
                    className="w-full"
                    disabled={submitting}
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />{" "}
                        Modification...
                      </>
                    ) : (
                      "Définir mon mot de passe"
                    )}
                  </Button>
                </form>
              </Form>
            )}

            {/* Lien de déconnexion — visible uniquement sur le formulaire */}
            {showForm && (
              <div className="mt-6 text-center">
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-danger"
                >
                  <LogOut className="size-3.5" />
                  Se déconnecter
                </button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Lien retour page de connexion (visible uniquement pendant le loading) */}
        {(isLoading || isRedirecting) && !showForm && (
          <div className="mt-4 text-center">
            <Link
              href="/login"
              className="text-xs text-muted-foreground hover:text-primary"
            >
              Retour à la page de connexion
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
