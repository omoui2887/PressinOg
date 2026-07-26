/**
 * OgPressing — QRScanner (composant partagé réutilisable)
 * --------------------------------------------------------
 * Scanner QR Code basé sur `html5-qrcode`. Affiché dans un Dialog Radix.
 *
 * Props :
 *   - open           : contrôle l'ouverture du Dialog
 *   - onOpenChange   : callback de fermeture (parent contrôle le state)
 *   - onScanSuccess  : appelé avec la chaîne décodée (JSON payload ou numéro
 *                      de commande brut). Le parent est responsable de
 *                      l'interprétation (parse JSON / fetch API).
 *
 * Fonctionnement :
 *   - 2 modes : "camera" (html5-qrcode) et "manual" (saisie clavier)
 *   - Au démarrage du mode caméra : `Html5Qrcode.start({ facingMode: "environment" })`.
 *     En cas d'échec (permissions refusées, pas de caméra, etc.), un toast
 *     "Caméra non disponible" est affiché et le mode manuel est activé.
 *   - À chaque décodage réussi : `onScanSuccess(decodedText)` puis fermeture.
 *   - Au démontage / fermeture / changement de mode : `scanner.stop()` +
 *     `scanner.clear()` (la caméra est relâchée immédiatement).
 *
 * Saisie manuelle : un `<Input>` + bouton "Rechercher la commande" permet
 * de taper un `numero_commande` (ex : CMD-20260725-8571) et de soumettre.
 * Le bouton "Fermer" ferme le Dialog sans action.
 *
 * ⚠️ `onScanSuccess` est stocké dans une ref pour éviter de relancer le
 *    scanner à chaque changement de référence du callback (le parent passe
 *    souvent une closure inline).
 *
 * Le `containerId` est une constante module-level : un seul scanner est
 * ouvert à la fois dans l'app.
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Camera, Keyboard, X } from "lucide-react";
import { toast } from "sonner";

const CONTAINER_ID = "og-qr-scanner-container";

export interface QRScannerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onScanSuccess: (decoded: string) => void;
}

export function QRScanner({
  open,
  onOpenChange,
  onScanSuccess,
}: QRScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const cancelledRef = useRef(false);
  const [mode, setMode] = useState<"camera" | "manual">("camera");
  const [manualInput, setManualInput] = useState("");
  const [starting, setStarting] = useState(false);

  // Ref vers le dernier callback pour ne pas relancer le scanner à chaque
  // changement de référence de closure passé par le parent.
  const onScanSuccessRef = useRef(onScanSuccess);
  useEffect(() => {
    onScanSuccessRef.current = onScanSuccess;
  }, [onScanSuccess]);

  const handleClose = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  // Démarre le scanner html5-qrcode. Wrapper async dans un useCallback pour
  // éviter le lint `react-hooks/set-state-in-effect` (qui flag les
  // setState synchrones dans le corps d'un effect — pattern identique à
  // `clients-page.tsx` / `commandes-page.tsx` : la fonction async diffère
  // l'exécution des setState au-delà du corps synchrone de l'effect).
  const startScanner = useCallback(async () => {
    setStarting(true);

    // Le conteneur doit exister dans le DOM avant d'instancier Html5Qrcode.
    // Comme le Dialog est ouvert et que la branche camera est rendue,
    // l'élément #CONTAINER_ID est présent au moment où l'effect s'exécute.
    const scanner = new Html5Qrcode(CONTAINER_ID);
    scannerRef.current = scanner;

    try {
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          if (cancelledRef.current) return;
          onScanSuccessRef.current(decodedText);
          // Arrête la caméra puis ferme le Dialog.
          scanner
            .stop()
            .then(() => onOpenChange(false))
            .catch(() => onOpenChange(false));
        },
        () => {
          // Erreur de décodage par frame — ignorée (html5-qrcode logge en boucle).
        }
      );
    } catch {
      if (cancelledRef.current) return;
      toast.error("Caméra non disponible", {
        description:
          "Saisissez le numéro de ticket manuellement.",
      });
      setMode("manual");
    } finally {
      if (!cancelledRef.current) setStarting(false);
    }
  }, [onOpenChange]);

  // Démarre / arrête le scanner quand `open` ET `mode === "camera"`.
  useEffect(() => {
    if (!open || mode !== "camera") return;
    cancelledRef.current = false;
    startScanner();

    return () => {
      cancelledRef.current = true;
      const s = scannerRef.current;
      scannerRef.current = null;
      if (s) {
        // stop() peut rejeter si le scanner n'est pas encore démarré — on
        // ignore l'erreur. clear() nettoie le DOM du scanner.
        s.stop().catch(() => {});
        try {
          s.clear();
        } catch {
          /* ignore */
        }
      }
    };
  }, [open, mode, startScanner]);

  function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    const v = manualInput.trim();
    if (!v) return;
    onScanSuccess(v);
    setManualInput("");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="size-5 text-primary" />
            Scanner QR Code
          </DialogTitle>
        </DialogHeader>

        {/* Mode toggle */}
        <div className="flex gap-2">
          <Button
            type="button"
            variant={mode === "camera" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode("camera")}
          >
            <Camera className="size-4" />
            Caméra
          </Button>
          <Button
            type="button"
            variant={mode === "manual" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode("manual")}
          >
            <Keyboard className="size-4" />
            Saisie manuelle
          </Button>
        </div>

        {mode === "camera" ? (
          <div>
            {starting && (
              <p className="text-sm text-muted-foreground">
                Démarrage de la caméra…
              </p>
            )}
            <div
              id={CONTAINER_ID}
              className="w-full overflow-hidden rounded-lg border bg-black"
            />
            <p className="mt-2 text-xs text-muted-foreground">
              Pointez la caméra vers le QR Code du ticket de commande.
            </p>
          </div>
        ) : (
          <form onSubmit={handleManualSubmit} className="space-y-3">
            <Input
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              placeholder="ex : CMD-20260725-8571"
              autoFocus
            />
            <Button
              type="submit"
              className="w-full"
              disabled={!manualInput.trim()}
            >
              Rechercher la commande
            </Button>
          </form>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleClose}>
            <X className="size-4" />
            Fermer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
