/**
 * e-pressing — Page de connexion (PHASE 4-a — Luxe Éditorial)
 * ----------------------------------------------------
 * Route : /login
 *
 * Layout split-screen premium "Luxe Éditorial" :
 *   - Desktop (lg+) : panneau gauche navy #080F1F avec aurora animée, motif
 *     textile doré, tagline marketing en Playfair Display, points clés du
 *     SaaS. Panneau droit navy avec le formulaire centré en card glass + coins
 *     dorés (OrnateCorner).
 *   - Mobile : panneau marketing compact en haut (logo + tagline), puis
 *     formulaire plein écran.
 *
 * LOGIQUE INTACTE (cf. version précédente) — AUCUNE modification :
 *   - signInWithPassword via Supabase browser client
 *   - Détermination du rôle : super_admins > personnel > erreur
 *   - Redirection hard via window.location.assign (évite les race
 *     conditions middleware + RSC cross-origin en preview iframe)
 *   - Mot de passe temporaire → /personnel/changer-mot-de-passe
 *   - Compte désactivé → signOut + message FR clair
 *   - Lecture des ?error= transmis par le middleware (one-shot)
 *
 * Phase 4-a : uniquement la couche présentation (JSX + className + imports
 * des composants éditoriaux AuroraBackground / OrnateCorner / DecorativeHeading
 * + variants éditoriaux de Button / Input). Aucune logique touchée.
 */
"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  AlertCircle,
  ShoppingBag,
  ArrowLeft,
  Eye,
  EyeOff,
  Sparkles,
  ShieldCheck,
  Zap,
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
import {
  AuroraBackground,
  OrnateCorner,
} from "@/components/ogpressing/editorial";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import {
  isSupabaseNetworkError,
  SERVICE_UNAVAILABLE_MESSAGE,
} from "@/lib/supabase/error-handling";
import { toast } from "sonner";

/* ------------------------------------------------------------------ */
/* Schéma de validation zod                                            */
/* ------------------------------------------------------------------ */

const loginSchema = z.object({
  email: z.email({ message: "Veuillez saisir un email valide." }),
  password: z.string().min(1, { message: "Le mot de passe est obligatoire." }),
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
        "Votre pressing est suspendu. Contactez le support e-pressing pour réactiver votre abonnement.",
      config_incomplete:
        "Configuration incomplète : les variables d'environnement Supabase ne sont pas configurées. Créez un fichier .env.local avec NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY et SUPABASE_SERVICE_ROLE_KEY pour activer l'authentification.",
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
        // Erreur réseau (Supabase injoignable) → message "service indisponible",
        // et NON "Email ou mot de passe incorrect" qui serait trompeur (les
        // identifiants peuvent être corrects, c'est le serveur qui est down).
        if (isSupabaseNetworkError(authError)) {
          setGlobalError(SERVICE_UNAVAILABLE_MESSAGE);
          toast.error(SERVICE_UNAVAILABLE_MESSAGE);
          return;
        }
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

      // Erreur réseau sur les requêtes de rôle (Supabase injoignable après
      // authentification réussie) → message "service indisponible" au lieu
      // de tomber sur "Compte non reconnu" (qui déconnecterait l'utilisateur
      // à tort). On garde la session active pour qu'un retry puisse réussir.
      if (
        isSupabaseNetworkError(superAdminRes.error) ||
        isSupabaseNetworkError(personnelRes.error)
      ) {
        setGlobalError(SERVICE_UNAVAILABLE_MESSAGE);
        toast.error(SERVICE_UNAVAILABLE_MESSAGE);
        return;
      }

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
    <div className="relative flex min-h-dvh items-stretch justify-center overflow-hidden bg-editorial-navy lg:grid lg:grid-cols-2 lg:gap-0">
      {/* Aurora animée en fond — dégradé conique doré subtil sous tout le contenu */}
      <AuroraBackground intensity="subtle" />

      {/* ===== Panneau marketing (Navy + Or cuivré) ===== */}
      <aside
        aria-hidden
        className="relative hidden overflow-hidden bg-editorial-navy text-editorial-ivory lg:flex lg:flex-col lg:justify-between lg:p-12"
      >
        {/* Motif textile décoratif — grille de points dorés subtile */}
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, #C5A03D 1.5px, transparent 0)",
            backgroundSize: "24px 24px",
          }}
        />
        {/* Halo doré en haut à droite */}
        <div
          className="absolute -right-32 -top-32 size-96 rounded-full bg-editorial-gold/15 blur-3xl motion-reduce:animate-none"
        />
        {/* Halo navy profond en bas à gauche */}
        <div
          className="absolute -bottom-32 -left-32 size-96 rounded-full bg-editorial-navy-deep/60 blur-3xl motion-reduce:animate-none"
        />
        {/* Coins dorés décoratifs (losanges SVG) */}
        <OrnateCorner corners={["tl", "br"]} />

        {/* Logo + marque */}
        <div className="relative z-10 flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-editorial-gold text-editorial-navy">
            <ShoppingBag className="size-5" />
          </span>
          <span className="font-playfair text-xl font-bold tracking-tight">
            e-<span className="text-editorial-gold">pressing</span>
          </span>
        </div>

        {/* Tagline + points clés */}
        <div className="relative z-10 space-y-8">
          <div className="space-y-3">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-editorial-gold/30 bg-editorial-gold/15 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-editorial-gold-pale">
              <Sparkles className="size-3" />
              SaaS de pressing
            </span>
            <h1 className="font-playfair text-3xl font-bold leading-tight tracking-tight text-editorial-ivory sm:text-4xl xl:text-5xl">
              Gérez votre pressing
              <br />
              <span className="text-editorial-gold italic">comme un pro.</span>
            </h1>
            <p className="max-w-md text-base leading-relaxed text-editorial-ivory-dim">
              POS, suivi de production, CRM clients, gestion du personnel
              et du stock — tout réuni dans une interface pensée pour le
              terrain ivoirien.
            </p>
          </div>

          <ul className="space-y-3">
            <li className="flex items-center gap-3 text-sm">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-editorial-gold/15 text-editorial-gold">
                <Zap className="size-4" />
              </span>
              <span className="text-editorial-ivory">
                Enregistrez une commande en moins de 60 secondes.
              </span>
            </li>
            <li className="flex items-center gap-3 text-sm">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-editorial-gold/15 text-editorial-gold">
                <ShieldCheck className="size-4" />
              </span>
              <span className="text-editorial-ivory">
                Suivi QR/code-barres de chaque vêtement, du dépôt au retrait.
              </span>
            </li>
            <li className="flex items-center gap-3 text-sm">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-editorial-gold/15 text-editorial-gold">
                <ShoppingBag className="size-4" />
              </span>
              <span className="text-editorial-ivory">
                Conçu pour mobile, utilisé debout, au comptoir.
              </span>
            </li>
          </ul>
        </div>

        {/* Pied marketing */}
        <div className="relative z-10 text-xs text-editorial-ivory-dim">
          © {new Date().getFullYear()} e-pressing — Côte d&apos;Ivoire
        </div>
      </aside>

      {/* ===== Panneau formulaire ===== */}
      <div className="relative flex flex-1 items-center justify-center px-4 py-10 sm:px-6">
        {/* Décor d'accompagnement (visible mobile + desktop) */}
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-gradient-to-b from-editorial-gold/5 via-transparent to-transparent"
        />
        <div
          aria-hidden
          className="absolute top-0 left-1/2 -z-10 size-[400px] -translate-x-1/2 rounded-full bg-editorial-gold/10 blur-3xl motion-reduce:animate-none"
        />

        <div className="w-full max-w-md">
          {/* Lien retour */}
          <div className="mb-6 text-center">
            {/* <a> (hard nav) — évite le fetch RSC bloqué en cross-origin (Task 22). */}
            <a
              href="/"
              className="inline-flex items-center gap-2 text-sm text-editorial-ivory-dim transition-colors hover:text-editorial-ivory"
              aria-label="Retour à la page d'accueil"
            >
              <ArrowLeft className="size-4" /> Retour à l&apos;accueil
            </a>
          </div>

          {/* Logo mobile (le panneau marketing est masqué sur mobile) */}
          <div className="mb-6 flex items-center justify-center gap-2 lg:hidden">
            <span className="flex size-10 items-center justify-center rounded-xl bg-editorial-gold text-editorial-navy">
              <ShoppingBag className="size-5" />
            </span>
            <span className="font-playfair text-lg font-bold tracking-tight text-editorial-ivory">
              e-<span className="text-editorial-gold-deep">pressing</span>
            </span>
          </div>

          <Card className="editorial-card glass-panel relative group ornate ornate-tl ornate-tr">
            <CardHeader className="text-center">
              <CardTitle className="font-playfair text-2xl font-bold tracking-tight text-editorial-ivory">
                Connexion
              </CardTitle>
              <CardDescription className="text-editorial-ivory-dim">
                Accédez au tableau de bord de votre pressing.
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
                        <FormLabel htmlFor="email" className="text-editorial-ivory-dim">
                          Email
                        </FormLabel>
                        <FormControl>
                          <Input
                            id="email"
                            type="email"
                            variant="editorial"
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
                          <FormLabel htmlFor="password" className="text-editorial-ivory-dim">
                            Mot de passe
                          </FormLabel>
                          {/* <button> (pas <Link>) : c'est une action (toast), pas une navigation. */}
                          <button
                            type="button"
                            className="text-xs text-editorial-gold transition-colors hover:text-editorial-gold-pale"
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
                              variant="editorial"
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
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-editorial-gold transition-colors hover:text-editorial-gold-pale"
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
                      className="flex animate-shake items-start gap-2 rounded-md border border-editorial-danger/30 bg-editorial-danger/5 p-3 text-sm text-editorial-danger motion-reduce:animate-none"
                    >
                      <AlertCircle className="mt-0.5 size-4 shrink-0" />
                      <span>{globalError}</span>
                    </div>
                  )}

                  <Button
                    type="submit"
                    size="lg"
                    variant="editorial"
                    loading={loading}
                    className="w-full"
                  >
                    Se connecter
                  </Button>
                </form>
              </Form>

              <div className="mt-6 rounded-md border border-editorial-gold/20 bg-editorial-gold/5 p-3 text-center text-sm">
                <p className="text-editorial-ivory-dim">
                  Pas encore de compte ?{" "}
                  {/* <a> (hard nav) — évite le fetch RSC bloqué en cross-origin (Task 22). */}
                  <a
                    href="/activation"
                    className="font-medium text-editorial-gold underline-offset-4 transition-colors hover:text-editorial-gold-pale hover:underline"
                  >
                    Activer mon compte
                  </a>
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
