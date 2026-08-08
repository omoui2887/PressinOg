/**
 * OgPressing — Page « Compte suspendu » (AUDIT-B-04)
 * ---------------------------------------------------
 * Route : /compte-suspendu  (groupe (public))
 *
 * Affichée par le middleware (`src/lib/supabase/middleware.ts` section 5.6)
 * quand l'abonnement courant d'un pressing a `statut='suspendu'` (le
 * super-admin OgPressing a suspendu l'abonnement, par exemple pour défaut de
 * paiement ou abus).
 *
 * NB : cette page gère la suspension d'ABONNEMENT. La suspension de PRESSING
 * (`pressing.statut='suspendu'`) est gérée plus tôt dans le middleware
 * (section 5.5) qui déconnecte immédiatement l'utilisateur.
 *
 * La page :
 *   - explique que l'abonnement est suspendu
 *   - propose un lien WhatsApp vers le support OgPressing pour régulariser
 *   - permet à l'utilisateur de se déconnecter (bouton « Se déconnecter »)
 *
 * Style : carte centrée sur fond navy avec aurora animée (cohérent avec la
 * page /login et /activation-expiree).
 */
"use client";

import { useState } from "react";
import {
  ShoppingBag,
  Ban,
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

export default function CompteSuspenduPage() {
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
        "[compte-suspendu] Erreur signOut :",
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
            <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-editorial-danger/15 text-editorial-danger">
              <Ban className="size-6" />
            </div>
            <CardTitle className="font-playfair text-2xl font-bold tracking-tight text-editorial-ivory">
              Compte suspendu
            </CardTitle>
            <CardDescription className="text-editorial-ivory-dim">
              L&apos;abonnement de votre pressing a été suspendu.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <p className="text-center text-sm leading-relaxed text-editorial-ivory-dim">
              L&apos;accès à votre espace OgPressing est temporairement
              désactivé. Cette suspension peut faire suite à un retard de
              paiement ou à une décision de notre équipe. Pour régulariser la
              situation et réactiver votre abonnement, contactez notre support
              via WhatsApp — nous vous aiderons à reprendre votre activité
              dans les meilleurs délais.
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
