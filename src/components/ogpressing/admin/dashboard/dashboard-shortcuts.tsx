/**
 * OgPressing — DashboardShortcuts (LOT 6.2)
 * -------------------------------------------
 * Section "Raccourcis" du /admin/dashboard : 3 grosses cards cliquables.
 *
 *   1. "Nouvelle commande" → navigation vers /admin/commandes/nouvelle
 *      (icône Plus, couleur primary, mis en avant visuellement)
 *   2. "Scanner QR" → ouvre le scanner de commande par QR Code.
 *      ⚠️ La logique de scan sera développée dans le Lot 7 — pour l'instant,
 *      un toast informe l'utilisateur que la fonctionnalité arrive.
 *   3. "Ajouter un client" → ouvre le formulaire client en modal
 *      (réutilise <NewClientDialog />)
 *
 * Client component : gestion du toast (sonner) + du state d'ouverture du
 * dialog NewClientDialog. Les données du dashboard sont récupérées côté
 * serveur (page parent) ; ce composant ne fait aucun fetch.
 *
 * Navigation cross-page : on utilise <a href> (hard navigation) plutôt que
 * <Link> pour éviter le fetch RSC bloqué en cross-origin iframe (cf. worklog
 * Task 23). Le bouton "Scanner QR" reste un <button> (pas de navigation).
 */
"use client";

import { Plus, QrCode, UserPlus, ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { NewClientDialog } from "@/components/ogpressing/admin/clients/new-client-dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function DashboardShortcuts() {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {/* 1. Nouvelle commande — mis en avant (couleur primary) */}
      <a
        href="/admin/commandes/nouvelle"
        className="group focus:outline-none"
        aria-label="Nouvelle commande"
      >
        <Card
          className={cn(
            "relative h-full overflow-hidden border-primary/40 bg-primary text-primary-foreground",
            "transition-all hover:-translate-y-0.5 hover:shadow-lg hover:border-primary",
            "focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          )}
        >
          {/* Décor d'accent en haut à droite */}
          <div
            aria-hidden
            className="pointer-events-none absolute -right-8 -top-8 size-32 rounded-full bg-primary-foreground/10 blur-2xl"
          />
          <div className="relative flex h-full flex-col gap-3 p-5">
            <div className="flex items-center justify-between">
              <span className="flex size-12 items-center justify-center rounded-xl bg-primary-foreground/15 text-primary-foreground">
                <Plus className="size-6" />
              </span>
              <ArrowRight className="size-5 text-primary-foreground/70 transition-transform group-hover:translate-x-1" />
            </div>
            <div className="space-y-1">
              <p className="text-lg font-bold leading-tight">Nouvelle commande</p>
              <p className="text-sm text-primary-foreground/80">
                Enregistrer une commande client
              </p>
            </div>
          </div>
        </Card>
      </a>

      {/* 2. Scanner QR — toast "Bientôt disponible (Lot 7)" */}
      <button
        type="button"
        onClick={() =>
          toast.info("Scanner QR — bientôt disponible", {
            description:
              "La logique de scan de commande par QR Code sera développée dans le Lot 7.",
          })
        }
        aria-label="Scanner QR"
        className="group focus:outline-none"
      >
        <Card
          className={cn(
            "relative h-full overflow-hidden border-border bg-card text-card-foreground",
            "transition-all hover:-translate-y-0.5 hover:shadow-lg hover:border-primary/40",
            "focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          )}
        >
          <div className="relative flex h-full flex-col gap-3 p-5">
            <div className="flex items-center justify-between">
              <span className="flex size-12 items-center justify-center rounded-xl bg-muted text-foreground">
                <QrCode className="size-6" />
              </span>
              <ArrowRight className="size-5 text-muted-foreground transition-transform group-hover:translate-x-1" />
            </div>
            <div className="space-y-1">
              <p className="text-lg font-bold leading-tight">Scanner QR</p>
              <p className="text-sm text-muted-foreground">
                Retrouver une commande par QR Code
              </p>
            </div>
          </div>
        </Card>
      </button>

      {/* 3. Ajouter un client — ouvre NewClientDialog */}
      <NewClientDialog
        trigger={
          <button
            type="button"
            aria-label="Ajouter un client"
            className="group focus:outline-none"
          >
            <Card
              className={cn(
                "relative h-full overflow-hidden border-border bg-card text-card-foreground",
                "transition-all hover:-translate-y-0.5 hover:shadow-lg hover:border-primary/40",
                "focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              )}
            >
              <div className="relative flex h-full flex-col gap-3 p-5">
                <div className="flex items-center justify-between">
                  <span className="flex size-12 items-center justify-center rounded-xl bg-secondary/10 text-secondary">
                    <UserPlus className="size-6" />
                  </span>
                  <ArrowRight className="size-5 text-muted-foreground transition-transform group-hover:translate-x-1" />
                </div>
                <div className="space-y-1">
                  <p className="text-lg font-bold leading-tight">
                    Ajouter un client
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Créer une fiche client
                  </p>
                </div>
              </div>
            </Card>
          </button>
        }
      />
    </div>
  );
}
