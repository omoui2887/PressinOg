/**
 * OgPressing — /personnel/receptionniste/scanner-qr (REC-1)
 * ---------------------------------------------------------
 * Page "Scanner QR" du réceptionniste.
 *
 * Affiche un en-tête + une carte descriptive + un bouton "Ouvrir le scanner"
 * qui ouvre le <QRScanner /> partagé (dialog html5-qrcode). Au scan réussi,
 * la chaîne décodée est interprétée :
 *   - Si JSON avec `commande_id` → redirige directement vers la page détail.
 *   - Si JSON avec `numero_commande` (sans id) → fetch API pour récupérer l'ID.
 *   - Sinon → traite la chaîne comme un numero_commande → fetch API.
 *
 * La redirection va vers /personnel/receptionniste/commandes/{id} (page détail
 * variante réceptionniste, qui réutilise <CommandeDetail basePath=... />).
 *
 * 🚫 PLAN GATING (PRD §16) :
 *   - Plan Starter : scan QR interdit. La page reste accessible mais le
 *     bouton "Ouvrir le scanner" est désactivé (avec tooltip explicatif) et
 *     une bannière "Passez au plan Pro" est affichée.
 *   - Plan Pro / Business : comportement normal.
 *
 * 🔒 SÉCURITÉ : le layout (personnel)/layout.tsx vérifie déjà l'auth + le
 *    rôle. La RLS isole par pressing_id côté API : une commande étrangère au
 *    pressing renverra 0 résultat → toast "Commande introuvable".
 */
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Camera,
  Keyboard,
  QrCode,
  ShieldCheck,
  ShoppingCart,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PlanUpgradeBanner } from "@/components/shared";
import { toast } from "sonner";

// 🚀 PERF : QRScanner importe `html5-qrcode` (~50KB) au niveau module.
// Lazy-load via next/dynamic avec ssr:false → le bundle n'est téléchargé
// que si l'utilisateur ouvre réellement le scanner (clic sur "Ouvrir le scanner").
const QRScanner = dynamic(
  () =>
    import("@/components/shared/qr-scanner").then((m) => m.QRScanner),
  { ssr: false, loading: () => null }
);

const BASE_PATH = "/personnel/receptionniste";

interface CommandesLookupItem {
  id: string;
}
interface CommandesLookupResponse {
  success: boolean;
  data: CommandesLookupItem[];
  error?: string;
}

interface PlanResponse {
  success: boolean;
  data?: {
    plan: "starter" | "pro" | "business";
    features: {
      export_xlsx: boolean;
      fds_upload: boolean;
      qr_scan: boolean;
    };
    historyMonths: number | null;
  };
  error?: string;
}

export default function PersonnelReceptionnisteScannerPage() {
  const router = useRouter();
  const [scannerOpen, setScannerOpen] = useState(false);
  const [qrScanAllowed, setQrScanAllowed] = useState<boolean | null>(null);

  // Récupère le plan du pressing pour le gating de la feature qr_scan.
  // Non-bloquant : tant que `qrScanAllowed === null`, on affiche le bouton
  // (état par défaut autorisé) pour ne pas casser l'UX en cas d'erreur réseau.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/personnel/plan", { cache: "no-store" });
        const json: PlanResponse = await res.json();
        if (!cancelled && json.success && json.data) {
          setQrScanAllowed(json.data.features.qr_scan);
        } else if (!cancelled) {
          // En cas d'erreur, on autorise par défaut (fail-open) — la route
          // de lookup derrière le scanner applique RLS de toute façon.
          setQrScanAllowed(true);
        }
      } catch {
        if (!cancelled) setQrScanAllowed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const isStarter = qrScanAllowed === false;

  /**
   * Handler du QR scanner : interprète la chaîne décodée.
   *   - Si JSON avec `commande_id` → redirige directement.
   *   - Si JSON avec `numero_commande` (sans id) → fetch API pour l'ID.
   *   - Sinon → traite la chaîne comme un numero_commande → fetch API.
   *
   * La vérification d'appartenance au pressing est garantie par RLS côté API.
   */
  async function handleScanSuccess(decoded: string) {
    let commandeId: string | null = null;
    let searchQuery: string | null = null;

    try {
      const parsed = JSON.parse(decoded) as Record<string, unknown>;
      if (typeof parsed.commande_id === "string") {
        commandeId = parsed.commande_id;
      } else if (typeof parsed.numero_ticket === "string") {
        // PRD §13.1 : `numero_ticket` est le nom du champ dans le payload QR.
        searchQuery = parsed.numero_ticket;
      } else if (typeof parsed.numero_commande === "string") {
        // Rétro-compat : anciens tickets imprimés avant FIX-WAVE1-B
        // utilisaient `numero_commande` comme clé JSON.
        searchQuery = parsed.numero_commande;
      }
    } catch {
      // Pas du JSON → on traite la chaîne comme un numero_commande brut.
      searchQuery = decoded.trim();
    }

    // Si on a déjà l'ID, on redirige en confiance : RLS bloque la page détail
    // si la commande n'appartient pas au pressing (la SELECT renverra null).
    if (commandeId) {
      router.push(`${BASE_PATH}/commandes/${commandeId}`);
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
        console.error("[receptionniste/scanner-qr] Erreur lookup scan:", err);
      }
    }

    if (commandeId) {
      router.push(`${BASE_PATH}/commandes/${commandeId}`);
    } else {
      toast.error("Commande introuvable", {
        description:
          "Le QR Code ou numéro ne correspond à aucune commande de votre pressing.",
      });
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <Button
            variant="ghost"
            size="icon"
            asChild
            aria-label="Retour au tableau de bord"
          >
            <Link href={`${BASE_PATH}/dashboard`}>
              <ArrowLeft className="size-5" />
            </Link>
          </Button>
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
              <QrCode className="size-6 text-primary" />
              Scanner QR
            </h1>
            <p className="text-sm text-muted-foreground">
              Retrouvez une commande en scannant son QR Code ou en saisissant
              son numéro de ticket.
            </p>
          </div>
        </div>
      </div>

      {/* Bannière d'upgrade si plan Starter (PRD §16) */}
      {isStarter && (
        <PlanUpgradeBanner featureLabel="le scan QR Code" />
      )}

      {/* Carte d'action principale */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Camera className="size-5 text-primary" />
            Scanner le QR Code d&apos;une commande
          </CardTitle>
          <CardDescription>
            Le scanner utilise la caméra arrière de votre appareil. Pointez-la
            vers le QR Code imprimé sur le ticket client pour ouvrir
            directement la fiche commande.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            En cas d&apos;échec caméra (permissions, appareil sans caméra), le
            scanner bascule automatiquement en saisie manuelle.
          </p>
          {isStarter ? (
            <Tooltip>
              <TooltipTrigger asChild>
                {/* span intermédiaire pour permettre le tooltip sur un bouton disabled */}
                <span tabIndex={0} aria-disabled="true">
                  <Button
                    type="button"
                    size="lg"
                    disabled
                    className="shrink-0 cursor-not-allowed opacity-60"
                  >
                    <Camera className="size-5" />
                    Ouvrir le scanner
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                Fonctionnalité non disponible dans votre plan Starter.
                Passez au plan Pro pour activer le scan QR Code.
              </TooltipContent>
            </Tooltip>
          ) : (
            <Button
              type="button"
              size="lg"
              onClick={() => setScannerOpen(true)}
              className="shrink-0"
            >
              <Camera className="size-5" />
              Ouvrir le scanner
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Aide contextuelle */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="bg-muted/30">
          <CardContent className="flex flex-col gap-2 p-4">
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Camera className="size-5" />
            </span>
            <p className="text-sm font-semibold text-foreground">Caméra</p>
            <p className="text-xs text-muted-foreground">
              Autorisez l&apos;accès caméra lorsque le navigateur le demande.
            </p>
          </CardContent>
        </Card>
        <Card className="bg-muted/30">
          <CardContent className="flex flex-col gap-2 p-4">
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Keyboard className="size-5" />
            </span>
            <p className="text-sm font-semibold text-foreground">
              Saisie manuelle
            </p>
            <p className="text-xs text-muted-foreground">
              Saisissez un numéro comme CMD-20260725-8571.
            </p>
          </CardContent>
        </Card>
        <Card className="bg-muted/30">
          <CardContent className="flex flex-col gap-2 p-4">
            <span className="flex size-9 items-center justify-center rounded-lg bg-secondary/10 text-secondary">
              <ShieldCheck className="size-5" />
            </span>
            <p className="text-sm font-semibold text-foreground">
              Sécurisé par RLS
            </p>
            <p className="text-xs text-muted-foreground">
              Une commande hors pressing ne sera jamais accessible.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Raccourci : nouvelle commande */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="flex flex-col items-start gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <ShoppingCart className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">
                Rechercher une commande manuellement
              </p>
              <p className="text-xs text-muted-foreground">
                Accédez à la liste complète pour filtrer par statut, paiement ou
                numéro de ticket.
              </p>
            </div>
          </div>
          <Button asChild variant="outline" size="sm" className="shrink-0">
            <Link href={`${BASE_PATH}/commandes`}>Voir la liste</Link>
          </Button>
        </CardContent>
      </Card>

      {/* QR Scanner dialog — rendu même en Starter (inerte car bouton bloqué) */}
      <QRScanner
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        onScanSuccess={handleScanSuccess}
      />
    </div>
  );
}
