/**
 * OgPressing — DeleteServiceDialog (LOT 11.1+)
 * --------------------------------------------
 * Dialogue de confirmation avant suppression définitive d'un service.
 *
 * Au confirm : DELETE /api/admin/services/[id]
 *
 * ⚠️ Si le service est référencé par des commandes existantes, l'API
 *    renvoie 409 et invite l'utilisateur à désactiver le service plutôt
 *    que le supprimer (préserve l'historique des commandes).
 *
 * Référence pattern : stock (pas de delete définitif jusque-là) +
 * super-admin/catalogue (suppression avec confirmation).
 */
"use client";

import { useState } from "react";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatFCFA } from "@/lib/utils/format";
import {
  typeServiceBadgeClass,
  typeServiceIcon,
  typeServiceLabel,
  type ServiceItem,
} from "./services-helpers";

interface DeleteServiceDialogProps {
  service: ServiceItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted?: () => void;
}

export function DeleteServiceDialog({
  service,
  open,
  onOpenChange,
  onDeleted,
}: DeleteServiceDialogProps) {
  const [deleting, setDeleting] = useState(false);

  if (!service) return null;

  async function handleConfirm() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/services/${service!.id}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({ success: false }));
      if (!res.ok || !data.success) {
        throw new Error(
          data.error || "Erreur lors de la suppression du service"
        );
      }
      toast.success("Service supprimé", {
        description: `${service!.nom} a été définitivement supprimé.`,
      });
      onOpenChange(false);
      onDeleted?.();
    } catch (err) {
      let message: string;
      if (err instanceof TypeError && err.message.includes("fetch")) {
        message = "Erreur réseau. Vérifiez votre connexion internet.";
      } else if (err instanceof Error && err.message) {
        message = err.message;
      } else {
        console.error("[delete-service] Erreur inattendue :", err);
        message = "Une erreur est survenue. Veuillez réessayer.";
      }
      toast.error(message);
    } finally {
      setDeleting(false);
    }
  }

  const Icon = typeServiceIcon(service.type);

  return (
    <AlertDialog
      open={open}
      onOpenChange={(o) => {
        if (!deleting) onOpenChange(o);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="size-5 text-danger" />
            Supprimer ce service ?
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <p>
                Vous êtes sur le point de supprimer définitivement le service
                suivant. Cette action est irréversible.
              </p>
              <div className="rounded-md border bg-muted/40 p-3">
                <div className="flex items-center gap-2">
                  <Icon className="size-4 text-muted-foreground" />
                  <span className="font-medium text-foreground">
                    {service.nom}
                  </span>
                  <Badge
                    variant="outline"
                    className={cn(
                      "font-medium",
                      typeServiceBadgeClass(service.type)
                    )}
                  >
                    {typeServiceLabel(service.type)}
                  </Badge>
                </div>
                <p className="mt-1 text-sm tabular-nums text-muted-foreground">
                  {formatFCFA(service.prix)}
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                💡 Si des commandes existantes référencent ce service, la
                suppression sera refusée. Désactivez-le plutôt (via le
                commutateur) pour le retirer du wizard de commande tout en
                préservant l&apos;historique.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Annuler</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              void handleConfirm();
            }}
            disabled={deleting}
            className="bg-gradient-danger text-white hover:bg-danger/90"
          >
            {deleting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Suppression…
              </>
            ) : (
              <>
                <Trash2 className="size-4" />
                Supprimer définitivement
              </>
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
