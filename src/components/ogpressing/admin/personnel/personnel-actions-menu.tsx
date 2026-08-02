/**
 * OgPressing — PersonnelActionsMenu (LOT 9.3)
 * --------------------------------------------
 * Menu d'actions (icône 3 points) pour chaque employé de la liste.
 *
 * Actions disponibles selon le contexte de l'employé :
 *   - "Modifier"                          → ouvre EditEmployeeDialog (formulaire pré-rempli)
 *   - "Réinitialiser le mot de passe"     → uniquement si methode_creation = creation_directe
 *                                          → POST { action: "reset_password" }
 *                                          → Affiche ResetPasswordResultDialog avec les nouveaux identifiants
 *   - "Renvoyer l'invitation"             → uniquement si statut = invite_en_attente ET methode = lien_invitation
 *                                          → POST { action: "resend_invitation" }
 *   - "Désactiver le compte"              → si statut ≠ desactive → PATCH { action: "desactiver" }
 *   - "Réactiver le compte"               → si statut = desactive → PATCH { action: "reactiver" }
 *
 * Chaque action destructrice (désactiver, reset password) ou irréversible
 * (resend invitation) demande une confirmation via AlertDialog avant exécution.
 *
 * 🔒 L'API vérifie en défense en profondeur que l'appelant est manager actif
 *    du même pressing. Le verrou anti-lockout (ne pas se désactiver soi-même)
 *    est géré côté API.
 */
"use client";

import { useState, useTransition } from "react";
import {
  MoreHorizontal,
  Pencil,
  KeyRound,
  Send,
  UserX,
  UserCheck,
  Loader2,
  ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { type Employe, ROLE_PERSONNEL_LABELS } from "./personnel-helpers";
import { EditEmployeeDialog } from "./edit-employee-dialog";
import {
  ResetPasswordResultDialog,
  type ResetPasswordCredentials,
} from "./reset-password-result-dialog";

interface PersonnelActionsMenuProps {
  employe: Employe;
  onUpdated?: () => void;
}

type ConfirmAction =
  | "desactiver"
  | "reactiver"
  | "reset_password"
  | "resend_invitation"
  | null;

export function PersonnelActionsMenu({
  employe,
  onUpdated,
}: PersonnelActionsMenuProps) {
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [pending, startTransition] = useTransition();

  // Dialog de modification (ouvert par le menu "Modifier")
  const [editOpen, setEditOpen] = useState(false);

  // Dialog d'affichage des identifiants après reset password
  const [resetCredentials, setResetCredentials] =
    useState<ResetPasswordCredentials | null>(null);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);

  const isDesactive = employe.statut_compte === "desactive";
  const isInvite = employe.statut_compte === "invite_en_attente";
  const isDirectCreation = employe.methode_creation === "creation_directe";

  /* ---- Titre + description de la boîte de confirmation ---- */
  function getConfirmConfig(): {
    title: string;
    description: string;
    actionLabel: string;
    destructive: boolean;
  } {
    switch (confirmAction) {
      case "desactiver":
        return {
          title: "Désactiver ce compte ?",
          description: `${employe.nom_complet} (${ROLE_PERSONNEL_LABELS[employe.role]}) ne pourra plus se connecter. Son historique est conservé. Vous pourrez le réactiver à tout moment.`,
          actionLabel: "Désactiver",
          destructive: true,
        };
      case "reactiver":
        return {
          title: "Réactiver ce compte ?",
          description: `${employe.nom_complet} (${ROLE_PERSONNEL_LABELS[employe.role]}) pourra à nouveau se connecter avec ses identifiants habituels.`,
          actionLabel: "Réactiver",
          destructive: false,
        };
      case "reset_password":
        return {
          title: "Réinitialiser le mot de passe ?",
          description: `Un nouveau mot de passe temporaire sera généré pour ${employe.nom_complet}. L'ancien mot de passe ne fonctionnera plus.`,
          actionLabel: "Réinitialiser",
          destructive: true,
        };
      case "resend_invitation":
        return {
          title: "Renvoyer l'invitation ?",
          description: `Un nouveau lien d'invitation sera envoyé à ${employe.nom_complet}. L'ancien lien (s'il existe) sera invalidé.`,
          actionLabel: "Renvoyer",
          destructive: false,
        };
      default:
        return {
          title: "",
          description: "",
          actionLabel: "",
          destructive: false,
        };
    }
  }

  /* ---- Exécution de l'action confirmée ---- */
  async function executeAction() {
    const action = confirmAction;
    setConfirmAction(null);
    if (!action) return;

    startTransition(async () => {
      try {
        if (action === "desactiver" || action === "reactiver") {
          const res = await fetch(`/api/admin/personnel/${employe.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action }),
          });
          const data = await res.json();
          if (!res.ok || !data.success) {
            throw new Error(data.error || "Erreur lors de la mise à jour");
          }
          toast.success(
            action === "desactiver"
              ? `${employe.nom_complet} a été désactivé`
              : `${employe.nom_complet} a été réactivé`
          );
          onUpdated?.();
        } else if (action === "reset_password") {
          const res = await fetch(`/api/admin/personnel/${employe.id}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action }),
          });
          const data = await res.json();
          if (!res.ok || !data.success) {
            throw new Error(data.error || "Erreur lors de la réinitialisation");
          }
          // Affiche les nouveaux identifiants dans un dialog
          if (data.credentials) {
            setResetCredentials(data.credentials);
            setResetDialogOpen(true);
          }
          toast.success("Mot de passe réinitialisé");
          onUpdated?.();
        } else if (action === "resend_invitation") {
          const res = await fetch(`/api/admin/personnel/${employe.id}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action }),
          });
          const data = await res.json();
          if (!res.ok || !data.success) {
            throw new Error(data.error || "Erreur lors du renvoi");
          }
          toast.success(
            `Invitation renvoyée à ${data.invitedEmail ?? employe.email}`
          );
          onUpdated?.();
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Erreur inattendue";
        toast.error(msg);
      }
    });
  }

  const config = getConfirmConfig();

  return (
    <>
      {/* ---- Menu déroulant ---- */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 shrink-0"
            aria-label={`Actions pour ${employe.nom_complet}`}
            disabled={pending}
          >
            {pending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <MoreHorizontal className="size-4" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="text-xs text-muted-foreground">
            {employe.nom_complet}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />

          {/* Modifier — ouvre le dialog d'édition (mode contrôlé) */}
          <DropdownMenuItem onSelect={() => setEditOpen(true)}>
            <Pencil className="size-4" />
            Modifier
          </DropdownMenuItem>

          {/* Réinitialiser le mot de passe — uniquement creation_directe */}
          {isDirectCreation && (
            <DropdownMenuItem
              onClick={() => setConfirmAction("reset_password")}
              className="text-warning focus:text-warning"
            >
              <KeyRound className="size-4" />
              Réinitialiser le mot de passe
            </DropdownMenuItem>
          )}

          {/* Renvoyer l'invitation — uniquement invite_en_attente + lien_invitation */}
          {isInvite && !isDirectCreation && (
            <DropdownMenuItem
              onClick={() => setConfirmAction("resend_invitation")}
              className="text-warning focus:text-warning"
            >
              <Send className="size-4" />
              Renvoyer l'invitation
            </DropdownMenuItem>
          )}

          <DropdownMenuSeparator />

          {/* Désactiver / Réactiver */}
          {isDesactive ? (
            <DropdownMenuItem
              onClick={() => setConfirmAction("reactiver")}
              className="text-success focus:text-success"
            >
              <UserCheck className="size-4" />
              Réactiver le compte
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              onClick={() => setConfirmAction("desactiver")}
              className="text-danger focus:text-danger"
            >
              <UserX className="size-4" />
              Désactiver le compte
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* ---- Dialog de modification (mode contrôlé, rendu hors du dropdown) ---- */}
      <EditEmployeeDialog
        employe={employe}
        onUpdated={onUpdated}
        open={editOpen}
        onOpenChange={setEditOpen}
      />

      {/* ---- Boîte de confirmation unique pour reset/resend/desactiver/reactiver ---- */}
      <AlertDialog
        open={confirmAction !== null}
        onOpenChange={(open) => {
          if (!open && !pending) setConfirmAction(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {config.destructive && (
                <ShieldAlert className="size-5 text-danger" />
              )}
              {config.title}
            </AlertDialogTitle>
            <AlertDialogDescription>{config.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-2">
            <AlertDialogCancel disabled={pending}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                executeAction();
              }}
              disabled={pending}
              className={
                confirmAction === "reactiver"
                  ? "bg-gradient-success text-success-foreground hover:bg-success/90"
                  : confirmAction === "reset_password" || confirmAction === "resend_invitation"
                  ? "bg-gradient-warning text-warning-foreground hover:bg-warning/90"
                  : config.destructive
                  ? "bg-gradient-danger text-white hover:bg-danger/90"
                  : undefined
              }
            >
              {pending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Traitement…
                </>
              ) : (
                config.actionLabel
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ---- Dialog d'affichage des identifiants après reset password ---- */}
      <ResetPasswordResultDialog
        open={resetDialogOpen}
        onOpenChange={setResetDialogOpen}
        credentials={resetCredentials}
      />
    </>
  );
}
