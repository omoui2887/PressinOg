/**
 * OgPressing — Page de connexion
 * ------------------------------
 * Route : /login
 *
 * Formulaire email + mot de passe. Utilise le client browser Supabase
 * (signInWithPassword) qui pose la session dans les cookies automatiquement.
 *
 * Après connexion : détermine le rôle (super_admin / manager / autre personnel)
 * et redirige vers le bon dashboard.
 */
"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Loader2, AlertCircle, ShoppingBag, ArrowLeft, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { toast } from "sonner";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const supabase = getSupabaseBrowser();

      // 1. Authentification
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (authError || !data.user) {
        setError("Email ou mot de passe incorrect.");
        setLoading(false);
        return;
      }

      // 2. Déterminer le rôle pour la redirection
      //    (RLS : l'utilisateur peut lire sa propre ligne dans super_admins / personnel)
      const userId = data.user.id;

      const [{ data: superAdmin }, { data: personnel }] = await Promise.all([
        supabase
          .from("super_admins")
          .select("id")
          .eq("user_id", userId)
          .eq("actif", true)
          .maybeSingle(),
        supabase
          .from("personnel")
          .select("id, role, pressing_id, actif, statut_compte")
          .eq("user_id", userId)
          .maybeSingle(),
      ]);

      if (superAdmin) {
        toast.success("Bienvenue, Super Admin !");
        // ⚠️ Navigation hard (window.location.href) au lieu de router.push :
        //    - garantit que le middleware voie le cookie de session fraîchement
        //      posé (évite les race conditions Supabase + Next.js App Router)
        //    - contourne le blocage cross-origin des fetchs RSC /_next/* dans
        //      le preview iframe (sinon router.push échoue silencieusement et
        //      la page reste figée sur "Connexion...")
        //    - le navigateur affiche son propre indicateur de chargement
        window.location.href = "/super-admin/dashboard";
        return;
      }

      if (personnel) {
        if (!personnel.actif || personnel.statut_compte === "desactive") {
          await supabase.auth.signOut();
          setError("Votre compte est désactivé. Contactez votre administrateur.");
          setLoading(false);
          return;
        }
        // Le manager = accès admin pressing ; les autres rôles = dashboard personnel
        const target =
          personnel.role === "manager" ? "/admin/dashboard" : "/personnel";
        toast.success("Connexion réussie !");
        // Même raison que ci-dessus : hard navigation obligatoire après login.
        window.location.href = target;
        return;
      }

      // Aucun profil trouvé — compte auth mais pas de ligne métier
      await supabase.auth.signOut();
      setError(
        "Votre compte n'est rattaché à aucun pressing. Contactez l'administrateur de votre pressing."
      );
      setLoading(false);
    } catch (err) {
      console.error("[login] Erreur inattendue :", err);
      setError("Une erreur est survenue. Réessayez.");
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-12">
      {/* Décor */}
      <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-b from-primary/5 to-background" />
      <div
        aria-hidden
        className="absolute top-0 left-1/2 -z-10 size-[400px] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl"
      />

      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" /> Retour à l&apos;accueil
          </Link>
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
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="vous@pressing.ci"
                  required
                  autoComplete="email"
                  className="h-11"
                  disabled={loading}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Mot de passe</Label>
                  <Link
                    href="#"
                    className="text-xs text-muted-foreground hover:text-primary"
                    onClick={(e) => {
                      e.preventDefault();
                      toast.info("Contactez votre administrateur pour réinitialiser votre mot de passe.");
                    }}
                  >
                    Mot de passe oublié ?
                  </Link>
                </div>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    autoComplete="current-password"
                    className="h-11 pr-10"
                    disabled={loading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger/5 p-3 text-sm text-danger">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" />
                  <span>{error}</span>
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

            <div className="mt-6 rounded-md border border-primary/20 bg-primary/5 p-3 text-center text-sm">
              <p className="text-muted-foreground">
                Pas encore de compte ?{" "}
                <Link href="/#inscription" className="font-medium text-primary hover:underline">
                  Inscrivez votre pressing
                </Link>
              </p>
            </div>

            <div className="mt-4 text-center">
              <Link
                href="/activation"
                className="text-xs text-muted-foreground hover:text-primary"
              >
                J&apos;ai un code d&apos;activation
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
