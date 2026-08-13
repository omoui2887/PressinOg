/**
 * e-pressing — SubscriptionBanner
 * --------------------------------
 * Bannière d'avertissement affichée en haut de toutes les pages Admin quand
 * l'abonnement du pressing connecté est expiré ou suspendu.
 *
 * ⚠️ Non bloquante pour le MVP : purement visuelle. Le Super Admin peut
 * être contacté au +225 05 76 10 32 77 pour renouveler l'abonnement.
 *
 * Server-renderable (pas de "use client", pas de hooks) — peut être rendu
 * depuis le layout serveur sans frontière client supplémentaire.
 */
import { AlertTriangle, Phone } from "lucide-react";

interface SubscriptionBannerProps {
  /** "expire" | "suspendu" — adapte le message affiché. */
  variant: "expire" | "suspendu";
}

const MESSAGES: Record<SubscriptionBannerProps["variant"], string> = {
  expire:
    "⚠️ Votre abonnement a expiré, contactez le Super Admin au +225 05 76 10 32 77 pour le renouveler.",
  suspendu:
    "⚠️ Votre abonnement est suspendu, contactez le Super Admin au +225 05 76 10 32 77 pour le régulariser.",
};

export function SubscriptionBanner({ variant }: SubscriptionBannerProps) {
  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-foreground shadow-sm"
    >
      <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
      <div className="flex-1">
        <p className="font-medium">{MESSAGES[variant]}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          L&apos;accès à votre espace pressing reste disponible pendant cette
          période, mais veuillez régulariser votre situation dès que possible.
        </p>
      </div>
      <a
        href="tel:+2250576103277"
        className="hidden shrink-0 items-center gap-1.5 rounded-md bg-warning px-3 py-1.5 text-xs font-semibold text-warning-foreground transition-colors hover:bg-warning/90 sm:inline-flex"
      >
        <Phone className="size-3.5" />
        Appeler
      </a>
    </div>
  );
}
