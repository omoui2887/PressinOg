/**
 * OgPressing — Page de connexion
 * ------------------------------
 * Route : /login
 *
 * Formulaire email + mot de passe validé avec react-hook-form + zod.
 * Utilise le client browser Supabase (signInWithPassword) qui pose la
 * session dans les cookies automatiquement.
 *
 * Après connexion réussie, détermine le rôle de l'utilisateur dans cet
 * ordre :
 *   1. Table `super_admins` (actif=true)        → /super-admin/dashboard
 *   2. Table `personnel` (user_id) :
 *        - statut_compte='desactive' OU actif=false → bloquer + signOut
 *        - mot_de_passe_temporaire=true            → /personnel/changer-mot-de-passe
 *        - role='manager'                          → /admin/dashboard
 *        - autre rôle                              → /personnel/{role}/dashboard
 *   3. Aucune correspondance → signOut + erreur "Compte non reconnu"
 *
 * ⚠️ Pattern navigation : `window.location.assign(target)` (et NON
 * router.push) — voir Task 17 du worklog :
 *   - garantit que le middleware voie le cookie de session fraîchement
 *     posé (évite les race conditions Supabase + Next.js App Router)
 *   - contourne le blocage cross-origin des fetchs RSC /_next/* dans
 *     le preview iframe (sinon router.push échoue silencieusement)
 *   - le navigateur affiche son propre indicateur de chargement
 *   - on utilise .assign() plutôt que `window.location.href = ...`
 *     pour satisfaire la règle ESLint react-hooks/immutability
 *     (v7 de eslint-plugin-react-hooks flag les mutations de globals).
 */
"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Loader2,
  AlertCircle,
  ShoppingBag,
  ArrowLeft,
  Eye,
  EyeOff,
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
/* Schéma de validation zod                                            */
/* ------------------------------------------------------------------ */

const loginSchema = z.object({
  email: z.email({ message: "Veuillez saisir un email valide." }),
  password: z.string().min(1, { message: "Le mot de passe est requis." }),
});

type LoginFormValues = z.infer<typeof loginSchema>;

/* ------------------------------------------------------------------ */
/* Types extraits du schéma personnel (subset)                        */
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
  actif: boolean | null;
  statut_compte: string | null;
  mot_de_passe_temporaire: boolean | null;
}

/* ------------------------------------------------------------------ */
/* Composant                                                          */
/* ------------------------------------------------------------------ */

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [globalError, setGlobalError] = useState("");

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
    mode: "onSubmit",
  });

  const loading = form.formState.isSubmitting;

  // Affiche les erreurs transmises par le middleware via ?error=...
  // (ex : compte désactivé, pressing suspendu, accès refusé). One-shot :
  // on ne le réaffiche pas si l'utilisateur re-soumet le formulaire.
  // On lit window.location.search (et non useSearchParams) pour éviter
  // l'exigence de Suspense boundary qui forcerait un CSR bail-out.
  /* eslint-disable react-hooks/set-state-in-effect -- Lecture de window.location (client-only) : doit se faire dans un effet pour éviter une mismatch d'hydratation (window n'existe pas au SSR). */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const code = params.get("error");
    if (!code) return;
    const MESSAGES: Record<string, string> = {
      compte_desactive:
        "Votre compte a été désactivé, contactez votre administrateur.",
      compte_non_actif:
        "Votre compte n'est pas encore activé. Contactez le manager de votre pressing.",
      compte_non_reconnu:
        "Compte non reconnu, contactez votre administrateur.",
      acces_refuse:
        "Accès non autorisé à cet espace. Vous avez été redirigé vers votre tableau de bord.",
      pressing_suspendu:
        "Votre pressing est suspendu. Contactez le support OgPressing pour réactiver votre abonnement.",
    };
    setGlobalError(MESSAGES[code] ?? "Une erreur est survenue. Veuillez réessayer.");
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  /**
   * Construit l'URL du dashboard selon le rôle du personnel.
   * - manager → /admin/dashboard (espace admin pressing)
   * - autre rôle → /personnel/{role}/dashboard
   */
  function dashboardForRole(role: RolePersonnel): string {
    return role === "manager"
      ? "/admin/dashboard"
      : `/personnel/${role}/dashboard`;
  }

  async function onSubmit(values: LoginFormValues) {
    setGlobalError("");
    const supabase = getSupabaseBrowser();

    try {
      // 1. Authentification Supabase
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: values.email.trim().toLowerCase(),
        password: values.password,
      });

      if (authError || !data.user) {
        // Message clair, sans jargon technique (ex : ne pas exposer "Invalid login credentials")
        setGlobalError("Email ou mot de passe incorrect.");
        return;
      }

      const userId = data.user.id;

      // 2. Déterminer le rôle pour la redirection.
      //    RLS : l'utilisateur peut lire sa propre ligne dans super_admins / personnel.
      //    On lance les 2 requêtes en parallèle pour réduire la latence.
      const [superAdminRes, personnelRes] = await Promise.all([
        supabase
          .from("super_admins")
          .select("id")
          .eq("user_id", userId)
          .eq("actif", true)
          .maybeSingle(),
        supabase
          .from("personnel")
          .select(
            "id, role, actif, statut_compte, mot_de_passe_temporaire"
          )
          .eq("user_id", userId)
          .maybeSingle(),
      ]);

      // 2.a Super Admin actif
      if (superAdminRes.data) {
        toast.success("Bienvenue, Super Admin !");
        // Hard navigation via window.location.assign (et non router.push) :
        // garantit que le middleware voie le cookie de session fraîchement
        // posé (évite les race conditions Supabase + Next.js App Router) et
        // contourne le blocage cross-origin des fetchs RSC dans le preview
        // iframe. On utilise .assign() plutôt que `window.location.href = ...`
        // pour satisfaire la règle ESLint react-hooks/immutability.
        window.location.assign("/super-admin/dashboard");
        return;
      }

      // 2.b Personnel
      const personnel: PersonnelRow | null = personnelRes.data as
        | PersonnelRow
        | null;

      if (personnel) {
        // Compte désactivé → on déconnecte et on bloque
        if (
          personnel.actif === false ||
          personnel.statut_compte === "desactive"
        ) {
          await supabase.auth.signOut();
          setGlobalError(
            "Votre compte a été désactivé, contactez votre administrateur."
          );
          return;
        }

        // Mot de passe temporaire → changement obligatoire avant dashboard
        if (personnel.mot_de_passe_temporaire === true) {
          toast.info(
            "Pour votre première connexion, veuillez changer votre mot de passe."
          );
          window.location.assign("/personnel/changer-mot-de-passe");
          return;
        }

        // Redirection selon le rôle
        const target = dashboardForRole(personnel.role);
        toast.success("Connexion réussie !");
        // Hard navigation — voir commentaire ci-dessus (super admin).
        window.location.assign(target);
        return;
      }

      // 3. Aucune correspondance — compte auth mais pas de ligne métier.
      await supabase.auth.signOut();
      setGlobalError(
        "Compte non reconnu, contactez votre administrateur."
      );
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
        // Sécurité : ne pas logger l'objet Error complet (stack trace) côté
        // navigateur — uniquement le message, lisible via F12 mais sans
        // révéler de chemins internes ou de détails Supabase.
        console.error("[login] Erreur inattendue :", err instanceof Error ? err.message : "erreur");
        message = "Une erreur est survenue. Veuillez réessayer.";
      }
      setGlobalError(message);
      toast.error(message);
    }
  }

  /* -------------------- Rendu -------------------- */

  return (
    <div className="relative flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-12">
      {/* Décor */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-gradient-to-b from-primary/5 to-background"
      />
      <div
        aria-hidden
        className="absolute top-0 left-1/2 -z-10 size-[400px] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl"
      />

      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          {/* <a> (hard nav) — évite le fetch RSC bloqué en cross-origin (Task 22). */}
          <a
            href="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" /> Retour à l&apos;accueil
          </a>
        </div>

        <Card className="shadow-lg">
          <CardHeader className="text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <ShoppingBag className="size-6" />
            </div>
            <CardTitle className="mt-4 text-2xl">Connexion</CardTitle>
            <CardDescription>
              Accédez au dashboard de votre pressing.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="space-y-4"
                noValidate
              >
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel htmlFor="email">Email</FormLabel>
                      <FormControl>
                        <Input
                          id="email"
                          type="email"
                          placeholder="vous@pressing.ci"
                          autoComplete="email"
                          className="h-11"
                          disabled={loading}
                          aria-invalid={
                            !!form.formState.errors.email || undefined
                          }
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center justify-between">
                        <FormLabel htmlFor="password">Mot de passe</FormLabel>
                        {/* <button> (pas <Link>) : c'est une action (toast), pas une navigation. */}
                        <button
                          type="button"
                          className="text-xs text-muted-foreground hover:text-primary"
                          onClick={() => {
                            toast.info(
                              "Contactez votre administrateur pour réinitialiser votre mot de passe."
                            );
                          }}
                        >
                          Mot de passe oublié ?
                        </button>
                      </div>
                      <div className="relative">
                        <FormControl>
                          <Input
                            id="password"
                            type={showPassword ? "text" : "password"}
                            placeholder="••••••••"
                            autoComplete="current-password"
                            className="h-11 pr-10"
                            disabled={loading}
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
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Loader2 className="size-4 animate-spin" /> Connexion...
                    </>
                  ) : (
                    "Se connecter"
                  )}
                </Button>
              </form>
            </Form>

            <div className="mt-6 rounded-md border border-primary/20 bg-primary/5 p-3 text-center text-sm">
              <p className="text-muted-foreground">
                Pas encore de compte ?{" "}
                {/* <a> (hard nav) — évite le fetch RSC bloqué en cross-origin (Task 22). */}
                <a
                  href="/activation"
                  className="font-medium text-primary hover:underline"
                >
                  Activer mon compte
                </a>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
