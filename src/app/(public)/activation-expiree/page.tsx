/**
 * OgPressing — Page « Essai expiré » (AUDIT-B-05)
 * ------------------------------------------------
 * Route : /activation-expiree  (groupe (public))
 *
 * Affichée par le middleware (`src/lib/supabase/middleware.ts` section 5.6)
 * quand l'abonnement courant d'un pressing est en `essai` ET que la date_fin
 * est dépassée (les 7 jours d'essai sont écoulés sans activation d'un plan
 * payant).
 *
 * La page :
 *   - explique que l'essai de 7 jours est terminé
 *   - propose un lien WhatsApp vers le support OgPressing pour activer un plan
 *   - permet à l'utilisateur de se déconnecter (bouton « Se déconnecter »)
 *
 * Style : carte centrée sur fond navy avec aurora animée (cohérent avec la
 * page /login — voir `src/app/(public)/login/page.tsx`).
 */
"use client";

import { useState } from "react";
import {
  ShoppingBag,
  Clock,
  MessageCircle,
  LogOut,
  ArrowLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  AuroraBackground,
  OrnateCorner,
} from "@/components/ogpressing/editorial";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { toast } from "sonner";

/** Numéro WhatsApp support OgPressing (format international sans +). */
const WHATSAPP_SUPPORT_URL = "https://wa.me/2250576103277";
const WHATSAPP_SUPPORT_DISPLAY = "+225 05 76 10 32 77";

export default function ActivationExpireePage() {
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      const supabase = getSupabaseBrowser();
      await supabase.auth.signOut();
      // Hard navigation vers /login (évite les race conditions middleware).
      window.location.assign("/login");
    } catch (err) {
      console.error(
        "[activation-expiree] Erreur signOut :",
        err instanceof Error ? err.message : "erreur"
      );
      toast.error("Impossible de se déconnecter. Réessayez.");
      setSigningOut(false);
    }
  }

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-editorial-navy px-4 py-10 sm:px-6">
      {/* Aurora animée en fond — dégradé conique doré subtil */}
      <AuroraBackground intensity="subtle" />

      {/* Décor d'accompagnement */}
      <div
        aria-hidden
        className="absolute top-0 left-1/2 -z-10 size-[400px] -translate-x-1/2 rounded-full bg-editorial-gold/10 blur-3xl motion-reduce:animate-none"
      />

      <div className="w-full max-w-md">
        {/* Lien retour + logo mobile */}
        <div className="mb-6 text-center">
          <a
            href="/"
            className="inline-flex items-center gap-2 text-sm text-editorial-ivory-dim transition-colors hover:text-editorial-ivory"
            aria-label="Retour à la page d'accueil"
          >
            <ArrowLeft className="size-4" /> Retour à l&apos;accueil
          </a>
        </div>

        <div className="mb-6 flex items-center justify-center gap-2 lg:hidden">
          <span className="flex size-10 items-center justify-center rounded-xl bg-editorial-gold text-editorial-navy">
            <ShoppingBag className="size-5" />
          </span>
          <span className="font-playfair text-lg font-bold tracking-tight text-editorial-ivory">
            Og<span className="text-editorial-gold-deep">Pressing</span>
          </span>
        </div>

        <Card className="editorial-card glass-panel relative group ornate ornate-tl ornate-tr">
          <OrnateCorner corners={["tl", "br"]} />
          <CardHeader className="text-center">
            <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-editorial-gold/15 text-editorial-gold">
              <Clock className="size-6" />
            </div>
            <CardTitle className="font-playfair text-2xl font-bold tracking-tight text-editorial-ivory">
              Essai expiré
            </CardTitle>
            <CardDescription className="text-editorial-ivory-dim">
              Votre période d&apos;essai gratuite de 7 jours est terminée.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <p className="text-center text-sm leading-relaxed text-editorial-ivory-dim">
              Pour continuer à utiliser OgPressing et retrouver l&apos;accès à
              vos commandes, clients et statistiques, activez un plan
              d&apos;abonnement. Contactez notre équipe support via WhatsApp —
              nous vous accompagnons dans le choix du plan adapté à votre
              pressing (Starter, Pro ou Business).
            </p>

            <div className="rounded-md border border-editorial-gold/20 bg-editorial-gold/5 p-4 text-center">
              <p className="text-xs uppercase tracking-wider text-editorial-gold-pale">
                Support OgPressing
              </p>
              <p className="mt-1 font-mono text-base font-semibold text-editorial-ivory">
                {WHATSAPP_SUPPORT_DISPLAY}
              </p>
            </div>

            <div className="flex flex-col gap-3">
              <Button
                type="button"
                size="lg"
                variant="editorial"
                className="w-full"
                onClick={() => {
                  window.open(WHATSAPP_SUPPORT_URL, "_blank", "noopener");
                }}
              >
                <MessageCircle className="size-4" />
                Contacter le support
              </Button>

              <Button
                type="button"
                size="lg"
                variant="editorialGhost"
                className="w-full"
                loading={signingOut}
                onClick={handleSignOut}
              >
                <LogOut className="size-4" />
                Se déconnecter
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
