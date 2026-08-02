/**
 * OgPressing — Placeholder de dashboard + bouton déconnexion
 * ----------------------------------------------------------
 * Composant partagé pour les 3 dashboards (super-admin / admin / personnel)
 * en attendant le développement complet des fonctionnalités.
 *
 * Client component car le logout utilise le client browser Supabase.
 */
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ShoppingBag, LogOut, Loader2, ArrowLeft, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { toast } from "sonner";

interface DashboardPlaceholderProps {
  /** Titre affiché en grand */
  title: string;
  /** Rôle affiché dans le badge */
  roleLabel: string;
  /** Description courte du dashboard */
  description: string;
  /** Couleur d'accent du badge (tailwind text-* class) */
  accent?: string;
}

export function DashboardPlaceholder({
  title,
  roleLabel,
  description,
  accent = "text-primary",
}: DashboardPlaceholderProps) {
  const router = useRouter();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [pressingName, setPressingName] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = getSupabaseBrowser();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || cancelled) return;
        setUserEmail(user.email ?? null);

        // Tente de récupérer le pressing du personnel (pour admin/personnel)
        const { data: pers } = await supabase
          .from("personnel")
          .select("pressing_id")
          .eq("user_id", user.id)
          .maybeSingle();
        if (pers?.pressing_id && !cancelled) {
          const { data: p } = await supabase
            .from("pressing")
            .select("nom")
            .eq("id", pers.pressing_id)
            .maybeSingle();
          if (p?.nom && !cancelled) setPressingName(p.nom);
        }
      } catch (e) {
        // Silencieux — l'info est cosmétique
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      const supabase = getSupabaseBrowser();
      await supabase.auth.signOut();
      toast.success("Vous êtes déconnecté.");
      router.push("/");
    } catch {
      toast.error("Erreur lors de la déconnexion.");
      setLoggingOut(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-3xl flex-col items-center justify-center px-4 py-12">
      <Card className="w-full shadow-lg">
        <CardContent className="pt-8">
          <div className="flex flex-col items-center text-center">
            <div className="flex size-14 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <ShoppingBag className="size-7" />
            </div>

            <Badge variant="secondary" className={`mt-4 gap-1 ${accent}`}>
              <Sparkles className="size-3.5" />
              {roleLabel}
            </Badge>

            <h1 className="mt-3 text-2xl font-bold text-foreground sm:text-3xl">{title}</h1>
            <p className="mt-2 max-w-md text-muted-foreground">{description}</p>

            {userEmail && (
              <p className="mt-4 text-sm text-muted-foreground">
                Connecté : <span className="font-medium text-foreground">{userEmail}</span>
              </p>
            )}
            {pressingName && (
              <p className="mt-1 text-sm text-muted-foreground">
                Pressing : <span className="font-medium text-foreground">{pressingName}</span>
              </p>
            )}

            <div className="mt-8 w-full rounded-lg border border-primary/20 bg-primary/5 p-4 text-left">
              <p className="text-sm font-medium text-foreground">
                Dashboard en cours de développement
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Les fonctionnalités de gestion (POS, production, CRM, stock, rapports) arrivent
                dans les prochaines étapes. L&apos;authentification et la navigation par rôle
                sont opérationnelles.
              </p>
            </div>

            <div className="mt-6 flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
              <Button variant="outline" asChild>
                <Link href="/">
                  <ArrowLeft className="size-4" /> Accueil
                </Link>
              </Button>
              <Button
                variant="destructive"
                onClick={handleLogout}
                disabled={loggingOut}
              >
                {loggingOut ? (
                  <><Loader2 className="size-4 animate-spin" /> Déconnexion...</>
                ) : (
                  <><LogOut className="size-4" /> Se déconnecter</>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
