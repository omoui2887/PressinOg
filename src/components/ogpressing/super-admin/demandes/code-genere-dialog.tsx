/**
 * e-pressing — CodeGenereDialog
 * ------------------------------
 * Dialog affiché après génération d'un code d'activation pour une demande.
 * Présente :
 *   - Le code au format PRS-XXXX-XXXX (grand, monospace, encadré)
 *   - La date d'expiration (J+7)
 *   - Un bouton "Copier le code" (clipboard + toast feedback)
 *   - Un bouton "Envoyer par WhatsApp" (ouvre wa.me avec message pré-rempli)
 *   - Un bouton "Fermer"
 *
 * Le dialog est contrôlé par le parent (open/onOpenChange). Il reçoit le code
 * + la date d'expiration + le téléphone du prospect (pour WhatsApp).
 */
"use client";

import { useState } from "react";
import {
  Check,
  Copy,
  MessageCircle,
  Sparkles,
  CalendarClock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  buildCodeWhatsAppMessage,
  buildWhatsAppUrl,
} from "./types";

interface CodeGenereDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  code: string | null;
  dateExpiration: string | null;
  telephone: string;
}

export function CodeGenereDialog({
  open,
  onOpenChange,
  code,
  dateExpiration,
  telephone,
}: CodeGenereDialogProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopier() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast.success("Code copié dans le presse-papiers");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback : sélection manuelle via prompt (rare, navigateurs non
      // sécurisés ou permissions refusées).
      try {
        window.prompt("Copiez le code ci-dessous :", code);
      } catch {
        toast.error("Impossible de copier le code");
      }
    }
  }

  function handleWhatsApp() {
    if (!code) return;
    const url = buildWhatsAppUrl(
      telephone,
      buildCodeWhatsAppMessage(code)
    );
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) setCopied(false);
        onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-secondary/15 text-secondary">
              <Sparkles className="size-4" />
            </span>
            Code d&apos;activation généré
          </DialogTitle>
          <DialogDescription>
            Transmettez ce code au prospect par WhatsApp ou autre canal. Il est
            valable 7 jours et à usage unique.
          </DialogDescription>
        </DialogHeader>

        {/* Encadré code */}
        <div className="rounded-lg border border-secondary/30 bg-secondary/5 p-4 text-center">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Code
          </p>
          <p className="mt-1 font-mono text-2xl font-bold tracking-widest text-foreground sm:text-3xl">
            {code ?? "—"}
          </p>
          {dateExpiration && (
            <p className="mt-2 flex items-center justify-center gap-1 text-xs text-muted-foreground">
              <CalendarClock className="size-3" />
              Expire le {formatDate(dateExpiration)}
            </p>
          )}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            onClick={handleCopier}
            variant="outline"
            className="w-full gap-2"
          >
            {copied ? (
              <>
                <Check className="size-4 text-secondary" />
                Code copié
              </>
            ) : (
              <>
                <Copy className="size-4" />
                Copier le code
              </>
            )}
          </Button>
          <Button
            onClick={handleWhatsApp}
            className="w-full gap-2"
            style={{ backgroundColor: "#25D366", color: "white" }}
          >
            <MessageCircle className="size-4" />
            Envoyer par WhatsApp
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Formatage date JJ/MM/AAAA HH:mm (sans import de date-fns). */
function formatDate(dateISO: string): string {
  const d = new Date(dateISO);
  if (Number.isNaN(d.getTime())) return "—";
  const jj = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const aaaa = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${jj}/${mm}/${aaaa} à ${hh}:${min}`;
}
