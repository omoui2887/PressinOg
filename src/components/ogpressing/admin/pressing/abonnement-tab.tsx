/**
 * OgPressing — AbonnementTab (LOT 11.2 — onglet 3)
 * --------------------------------------------------
 * Affichage en lecture seule de l'abonnement courant du pressing.
 *
 * Contenu :
 *   - Grille de 4 stats cards : Plan, Statut, Date de fin, Montant mensuel
 *   - Bannière d'avertissement si statut = suspendu ou expire
 *   - Card d'information : "Pour changer de plan ou renouveler, contactez le
 *     Super Admin au +225 05 76 10 32 77" + bouton WhatsApp (wa.me)
 *
 * Pas d'écriture ici (renouvellement = Super Admin via /super-admin/abonnements).
 */
"use client";

import {
  CreditCard,
  Calendar,
  Wallet,
  MessageCircle,
  AlertTriangle,
  Info,
  BadgeCheck,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatFCFA, formatDateOnly } from "@/lib/utils/format";
import {
  AbonnementInfo,
  SUPER_ADMIN_PHONE,
  SUPER_ADMIN_WHATSAPP,
  planLabel,
  statutAbonnementBadgeClass,
  statutAbonnementLabel,
} from "./pressing-helpers";

interface AbonnementTabProps {
  abonnement: AbonnementInfo | null;
  loading: boolean;
}

export function AbonnementTab({ abonnement, loading }: AbonnementTabProps) {
  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
    );
  }

  if (!abonnement) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="size-5 text-primary" />
            Mon abonnement
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-10 text-center">
            <span className="flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Info className="size-7" />
            </span>
            <p className="mt-3 font-medium text-foreground">
              Aucun abonnement actif
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Contactez le Super Admin pour activer votre pressing.
            </p>
          </div>
          <ContactCard />
        </CardContent>
      </Card>
    );
  }

  const statut = abonnement.statut;
  const isSuspendedOrExpired = statut === "suspendu" || statut === "expire";

  return (
    <div className="space-y-4">
      {/* Bannière d'avertissement si suspendu / expiré */}
      {isSuspendedOrExpired && (
        <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/5 p-4">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" />
          <div className="text-sm">
            <p className="font-semibold text-warning">
              Votre abonnement est {statutAbonnementLabel(statut).toLowerCase()}.
            </p>
            <p className="mt-0.5 text-foreground">
              Certaines fonctionnalités peuvent être limitées. Contactez le Super
              Admin pour régulariser votre situation.
            </p>
          </div>
        </div>
      )}

      {/* Grille de 4 stats cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {/* Plan */}
        <Card className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <BadgeCheck className="size-4" />
            <span className="text-xs font-medium">Plan</span>
          </div>
          <p className="mt-2 text-xl font-bold text-foreground">
            {planLabel(abonnement.plan)}
          </p>
          <Badge
            variant="outline"
            className="mt-1 border-primary/30 bg-primary/5 text-primary"
          >
            Offre {planLabel(abonnement.plan)}
          </Badge>
        </Card>

        {/* Statut */}
        <Card className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <CreditCard className="size-4" />
            <span className="text-xs font-medium">Statut</span>
          </div>
          <p className="mt-2 text-xl font-bold text-foreground">
            {statutAbonnementLabel(statut)}
          </p>
          <Badge
            variant="outline"
            className={`mt-1 ${statutAbonnementBadgeClass(statut)}`}
          >
            {statutAbonnementLabel(statut)}
          </Badge>
        </Card>

        {/* Date de fin de période */}
        <Card className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Calendar className="size-4" />
            <span className="text-xs font-medium">Fin de période</span>
          </div>
          <p className="mt-2 text-xl font-bold text-foreground">
            {abonnement.date_fin ? formatDateOnly(abonnement.date_fin) : "Illimité"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {abonnement.date_fin
              ? "Renouvellement à effectuer avant cette date"
              : "Aucune échéance définie"}
          </p>
        </Card>

        {/* Montant mensuel */}
        <Card className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Wallet className="size-4" />
            <span className="text-xs font-medium">Montant mensuel</span>
          </div>
          <p className="mt-2 text-xl font-bold text-foreground">
            {formatFCFA(abonnement.montant_mensuel)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Paiement déclaratif (espèces / Mobile Money)
          </p>
        </Card>
      </div>

      {/* Card d'information + WhatsApp */}
      <ContactCard />
    </div>
  );
}

/** Card d'information : contact Super Admin + bouton WhatsApp. */
function ContactCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Info className="size-4 text-primary" />
          Changer de plan ou renouveler
        </CardTitle>
        <CardDescription>
          Pour modifier votre abonnement, contactez le Super Admin OgPressing.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Super Admin OgPressing</p>
            <p className="text-lg font-bold text-foreground">
              {SUPER_ADMIN_PHONE}
            </p>
          </div>
          <Button
            asChild
            className="bg-secondary text-secondary-foreground hover:bg-secondary/90"
          >
            <a
              href={SUPER_ADMIN_WHATSAPP}
              target="_blank"
              rel="noopener noreferrer"
            >
              <MessageCircle className="size-4" />
              Contacter sur WhatsApp
            </a>
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          💡 Aucun paiement n&apos;est intégré dans l&apos;application. Le règlement
          de votre abonnement s&apos;effectue en dehors de l&apos;app (espèces ou
          Mobile Money), puis le Super Admin enregistre l&apos;échéance pour
          activer ou prolonger votre abonnement.
        </p>
      </CardContent>
    </Card>
  );
}
