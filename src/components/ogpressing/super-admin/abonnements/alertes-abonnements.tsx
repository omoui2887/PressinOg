/**
 * OgPressing — AlertesAbonnements
 * --------------------------------
 * Bannière d'alerte affichée en haut de la liste des abonnements.
 *
 * Affiche 2 types d'alertes (cumulables) :
 *   - "X abonnement(s) à renouveler bientôt" (date_fin dans moins de 3 jours)
 *   - "X abonnement(s) expiré(s)" (date_fin déjà dépassée)
 *
 * Couleurs :
 *   - bientôt  → warning (orange) — peut être renouvelé proactivement
 *   - expirés  → danger (rouge) — situation critique
 *
 * Si aucun abonnement n'est concerné → ne rend rien (null).
 */
"use client";

import { AlertTriangle, CalendarClock, CalendarX } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

interface AlertesAbonnementsProps {
  /** Nombre d'abonnements dont la date_fin est dans moins de 3 jours (future). */
  expireBientot: number;
  /** Nombre d'abonnements dont la date_fin est déjà dépassée. */
  expires: number;
  className?: string;
}

export function AlertesAbonnements({
  expireBientot,
  expires,
  className,
}: AlertesAbonnementsProps) {
  if (expireBientot === 0 && expires === 0) return null;

  return (
    <div className={cn("space-y-2", className)}>
      {expireBientot > 0 && (
        <Alert className="border-warning/40 bg-warning/10 text-warning-foreground">
          <CalendarClock className="text-warning" />
          <AlertTitle className="text-warning">
            {expireBientot} abonnement
            {expireBientot > 1 ? "s" : ""} à renouveler bientôt
          </AlertTitle>
          <AlertDescription className="text-muted-foreground">
            Ces abonnements expirent dans moins de 3 jours. Renouvelez-les
            dès maintenant pour éviter une interruption de service.
          </AlertDescription>
        </Alert>
      )}

      {expires > 0 && (
        <Alert className="border-danger/40 bg-danger/10 text-danger-foreground">
          <CalendarX className="text-danger" />
          <AlertTitle className="flex items-center gap-2 text-danger">
            <AlertTriangle className="size-4" />
            {expires} abonnement{expires > 1 ? "s" : ""} expiré
            {expires > 1 ? "s" : ""}
          </AlertTitle>
          <AlertDescription className="text-muted-foreground">
            Ces abonnements ont une date de fin dépassée. Le pressing
            concerné n&apos;a plus accès à la plateforme. Renouvelez ou
            suspendez le compte.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
