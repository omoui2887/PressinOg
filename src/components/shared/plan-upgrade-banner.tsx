/**
 * OgPressing — <PlanUpgradeBanner> (PRD §16)
 * ------------------------------------------
 * Bannière d'information affichée quand une feature n'est pas disponible
 * dans le plan courant (Starter). N'empêche PAS la navigation : l'utilisateur
 * peut toujours consulter la page, mais l'action principale est désactivée.
 *
 * Comportement :
 *   - Affiche un encart "warning" (ambre) avec un message FR clair.
 *   - Invite l'utilisateur à contacter le Super Admin pour passer au plan Pro.
 *
 * Utilisée par les pages scanner-qr (réceptionniste + manager) quand le plan
 * Starter bloque la feature `qr_scan`.
 *
 * Pas de logique de blocage ici — c'est l'appelant qui décide de désactiver
 * son bouton d'action. La bannière est purement informative.
 */
"use client";

import { Sparkles, AlertTriangle } from "lucide-react";
import {
  Card,
  CardContent,
} from "@/components/ui/card";

export interface PlanUpgradeBannerProps {
  /** Nom FR de la feature bloquée (ex : "le scan QR Code", "l'export Excel"). */
  featureLabel: string;
  /** Classe Tailwind additionnelle pour wrapper. */
  className?: string;
}

export function PlanUpgradeBanner({
  featureLabel,
  className,
}: PlanUpgradeBannerProps) {
  return (
    <Card
      role="status"
      aria-live="polite"
      className={`border-warning/40 bg-warning/5 ${className ?? ""}`}
    >
      <CardContent className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-warning/15 text-warning">
            <AlertTriangle className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">
              {featureLabel} nécessite le plan Pro
            </p>
            <p className="text-xs text-muted-foreground">
              Votre abonnement Starter ne donne pas accès à {featureLabel}.
              Contactez le support OgPressing pour passer au plan Pro ou
              Business et activer cette fonctionnalité.
            </p>
          </div>
        </div>
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Sparkles className="size-5" />
        </span>
      </CardContent>
    </Card>
  );
}
