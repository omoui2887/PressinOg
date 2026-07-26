/**
 * OgPressing — ResetPasswordResultDialog (LOT 9.3)
 * -------------------------------------------------
 * Dialog affichant les nouveaux identifiants après une réinitialisation
 * de mot de passe (action "reset_password" sur /api/admin/personnel/[id]).
 *
 * Contenu :
 *   - Message de succès avec le nom de l'employé
 *   - Email + nouveau mot de passe temporaire (avec copie individuelle)
 *   - Bouton "Copier les identifiants" (copie tout en un bloc)
 *   - Lien WhatsApp pré-rempli (wa.me) avec le message contenant les identifiants
 *   - Avertissement : l'employé doit changer ce mot de passe à la prochaine connexion
 */
"use client";

import { useState } from "react";
import {
  CheckCircle2,
  Copy,
  MessageCircle,
  ShieldCheck,
  KeyRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";

export interface ResetPasswordCredentials {
  email: string;
  telephone: string;
  password: string;
  nom_complet: string;
}

interface ResetPasswordResultDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  credentials: ResetPasswordCredentials | null;
}

export function ResetPasswordResultDialog({
  open,
  onOpenChange,
  credentials,
}: ResetPasswordResultDialogProps) {
  if (!credentials) return null;

  function copyAll() {
    if (!credentials) return;
    const text = `Identifiants OgPressing\nEmail: ${credentials.email}\nMot de passe: ${credentials.password}`;
    navigator.clipboard.writeText(text).then(
      () => toast.success("Identifiants copiés"),
      () => toast.error("Impossible de copier")
    );
  }

  function getWhatsAppLink(): string {
    if (!credentials) return "#";
    const phoneDigits = credentials.telephone.replace(/\D/g, "");
    const waPhone = phoneDigits.startsWith("0")
      ? "225" + phoneDigits.slice(1)
      : phoneDigits;
    const message = `Bonjour ${credentials.nom_complet}, votre mot de passe OgPressing a été réinitialisé.\n\nEmail: ${credentials.email}\nNouveau mot de passe: ${credentials.password}\n\nConnectez-vous et changez ce mot de passe à la première connexion.`;
    return `https://wa.me/${waPhone}?text=${encodeURIComponent(message)}`;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="size-5 text-primary" />
            Mot de passe réinitialisé
          </DialogTitle>
          <DialogDescription>
            Nouveaux identifiants pour {credentials.nom_complet}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center justify-center gap-2 rounded-lg border border-secondary/30 bg-secondary/5 p-3 text-center">
            <CheckCircle2 className="size-5 text-secondary" />
            <p className="text-sm font-medium text-foreground">
              Le mot de passe a été réinitialisé avec succès
            </p>
          </div>

          <div className="space-y-2 rounded-lg border bg-muted/30 p-4">
            <CredentialRow label="Email" value={credentials.email} />
            <CredentialRow
              label="Nouveau mot de passe temporaire"
              value={credentials.password}
              mono
            />
          </div>

          <div className="flex items-start gap-2 rounded-md bg-warning/10 p-3 text-xs text-foreground">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-warning" />
            <p>
              L'employé devra changer ce mot de passe à sa prochaine connexion.
              Communiquez ces identifiants de façon sécurisée.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              onClick={copyAll}
              className="flex-1 gap-2"
            >
              <Copy className="size-4" />
              Copier les identifiants
            </Button>
            <a
              href={getWhatsAppLink()}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1"
            >
              <Button className="w-full gap-2 bg-[#25D366] text-white hover:bg-[#1da851]">
                <MessageCircle className="size-4" />
                WhatsApp
              </Button>
            </a>
          </div>

          <Button
            onClick={() => onOpenChange(false)}
            className="w-full"
          >
            Terminer
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CredentialRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="flex items-center justify-between gap-2 rounded-md border bg-background p-2.5">
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p
          className={`truncate text-sm font-medium text-foreground ${
            mono ? "font-mono" : ""
          }`}
        >
          {value}
        </p>
      </div>
      <button
        type="button"
        onClick={copy}
        className="shrink-0 rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
        aria-label={`Copier ${label}`}
      >
        {copied ? (
          <CheckCircle2 className="size-4 text-secondary" />
        ) : (
          <Copy className="size-4" />
        )}
      </button>
    </div>
  );
}
