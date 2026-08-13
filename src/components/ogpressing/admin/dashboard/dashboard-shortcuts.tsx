/**
 * e-pressing — DashboardShortcuts (LOT 6.2 + LOT 7.6)
 * -----------------------------------------------------
 * Section "Raccourcis" du /admin/dashboard : 3 grosses cards cliquables.
 *
 *   1. "Nouvelle commande" → navigation vers /admin/commandes/nouvelle
 *      (icône Plus, couleur primary, mis en avant visuellement)
 *   2. "Scanner QR" → ouvre le QRScanner dialog (LOT 7.6). Au scan réussi,
 *      parse le JSON payload ou recherche par numero_commande, puis
 *      redirige vers /admin/commandes/{id}.
 *   3. "Ajouter un client" → ouvre le formulaire client en modal
 *      (réutilise <NewClientDialog />)
 *
 * Client component : gestion du QRScanner dialog + state d'ouverture du
 * dialog NewClientDialog. Les données du dashboard sont récupérées côté
 * serveur (page parent) ; ce composant ne fait aucun fetch au montage.
 *
 * Navigation cross-page : on utilise <a href> (hard navigation) plutôt que
 * <Link> pour éviter le fetch RSC bloqué en cross-origin iframe (cf. worklog
 * Task 23). Les boutons "Scanner QR" et "Ajouter un client" restent des
 * <button> (pas de navigation directe — ils ouvrent un dialog).
 */
"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Plus, QrCode, UserPlus, ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { NewClientDialog } from "@/components/ogpressing/admin/clients/new-client-dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// 🚀 PERF : QRScanner importe `html5-qrcode` (~50KB) au niveau module.
// Lazy-load via next/dynamic avec ssr:false → le bundle n'est téléchargé
// que si l'utilisateur ouvre réellement le scanner (clic sur "Scanner QR").
const QRScanner = dynamic(
  () =>
    import("@/components/shared/qr-scanner").then((m) => m.QRScanner),
  { ssr: false, loading: () => null }
);

interface CommandesLookupItem {
  id: string;
}
interface CommandesLookupResponse {
  success: boolean;
  data: CommandesLookupItem[];
  error?: string;
}

interface DashboardShortcutsProps {
  /** Base path for navigation links. Defaults to "/admin".
   *  Set to "/personnel/receptionniste" (or other role) for personnel variants. */
  basePath?: string;
}

export function DashboardShortcuts({ basePath = "/admin" }: DashboardShortcutsProps = {}) {
  const [scannerOpen, setScannerOpen] = useState(false);

  /**
   * Handler du QR scanner : interprète la chaîne décodée.
   *   - Si JSON avec `commande_id` → redirige directement.
   *   - Si JSON avec `numero_commande` → fetch API pour récupérer l'ID.
   *   - Sinon → traite la chaîne comme un numero_commande → fetch API.
   */
  async function handleScanSuccess(decoded: string) {
    let commandeId: string | null = null;
    let searchQuery: string | null = null;

    try {
      const parsed = JSON.parse(decoded) as Record<string, unknown>;
      if (typeof parsed.commande_id === "string") {
        commandeId = parsed.commande_id;
      } else if (typeof parsed.numero_commande === "string") {
        searchQuery = parsed.numero_commande;
      }
    } catch {
      searchQuery = decoded.trim();
    }

    if (commandeId) {
      // Redirige en confiance : RLS bloque la page détail si la commande
      // n'appartient pas au pressing.
      window.location.href = `${basePath}/commandes/${commandeId}`;
      return;
    }

    if (searchQuery) {
      try {
        const res = await fetch(
          `/api/admin/commandes?q=${encodeURIComponent(
            searchQuery
          )}&pageSize=1`,
          { cache: "no-store" }
        );
        const data: CommandesLookupResponse = await res.json();
        if (data.success && data.data.length > 0) {
          commandeId = data.data[0].id;
        }
      } catch (err) {
        console.error("[dashboard] Erreur lookup scan:", err);
      }
    }

    if (commandeId) {
      window.location.href = `${basePath}/commandes/${commandeId}`;
    } else {
      toast.error("Commande introuvable", {
        description:
          "Le QR Code ou numéro ne correspond à aucune commande de votre pressing.",
      });
    }
  }

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        {/* 1. Nouvelle commande — mis en avant (couleur primary) */}
        <a
          href={`${basePath}/commandes/nouvelle`}
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
                <p className="text-lg font-bold leading-tight">
                  Nouvelle commande
                </p>
                <p className="text-sm text-primary-foreground/80">
                  Enregistrer une commande client
                </p>
              </div>
            </div>
          </Card>
        </a>

        {/* 2. Scanner QR — ouvre le QRScanner dialog (LOT 7.6) */}
        <button
          type="button"
          onClick={() => setScannerOpen(true)}
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

      {/* QR Scanner dialog (LOT 7.6) */}
      <QRScanner
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        onScanSuccess={handleScanSuccess}
      />
    </>
  );
}
