/**
 * e-pressing — ServicesPage (client orchestrator) — LOT 11.1
 * ----------------------------------------------------------
 * Page /admin/services : gestion des tarifs par catégorie de service.
 *
 * Fonctionnalités :
 *   - Liste de tous les services du pressing (actifs + inactifs), regroupés
 *     par type
 *   - Switch shadcn/ui pour activer/désactiver un service directement dans
 *     la liste (optimistic update + toast)
 *   - Bouton "+ Ajouter un service" (dialog) : nom, type, prix
 *   - Bouton "Modifier" sur chaque service (dialog) : nom + prix
 *
 * Données via GET /api/admin/services?all=true (RLS isole par pressing).
 * Le wizard de commande (LOT 7) appelle la même API sans ?all=true, donc
 * il ne voit que les services actifs — un service désactivé n'apparaît
 * plus dans le dropdown de création de commande.
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Tag } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ViewToggle } from "@/components/shared";
import { useViewMode } from "@/hooks/use-view-mode";
import { ServicesList } from "./services-list";
import { AddServiceDialog } from "./add-service-dialog";
import { EditServiceDialog } from "./edit-service-dialog";
import { DeleteServiceDialog } from "./delete-service-dialog";
import type { ServiceItem } from "./services-helpers";

export function ServicesPage() {
  const { viewMode, setViewMode } = useViewMode("services");
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [loading, setLoading] = useState(true);

  // États dialogs
  const [addOpen, setAddOpen] = useState(false);
  const [editService, setEditService] = useState<ServiceItem | null>(null);
  const [deleteService, setDeleteService] = useState<ServiceItem | null>(null);

  const fetchServices = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/services?all=true", {
        cache: "no-store",
      });
      const data = await res.json();
      if (data.success) {
        setServices(data.data as ServiceItem[]);
      } else {
        setServices([]);
      }
    } catch {
      setServices([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchServices();
  }, [fetchServices]);

  /** Bascule l'état actif d'un service (optimistic + PATCH). */
  async function handleToggle(service: ServiceItem) {
    const nouveauStatut = !service.actif;
    // Optimistic update : on inverse immédiatement l'état dans la liste.
    setServices((prev) =>
      prev.map((s) => (s.id === service.id ? { ...s, actif: nouveauStatut } : s))
    );
    try {
      const res = await fetch(`/api/admin/services/${service.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actif: nouveauStatut }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Erreur lors de la mise à jour");
      }
      toast.success(
        nouveauStatut ? "Service activé" : "Service désactivé",
        {
          description: `${service.nom} est maintenant ${
            nouveauStatut ? "actif" : "inactif"
          }.`,
        }
      );
    } catch (err) {
      // Rollback : on remet l'ancien état
      setServices((prev) =>
        prev.map((s) =>
          s.id === service.id ? { ...s, actif: service.actif } : s
        )
      );
      toast.error("Échec de la mise à jour", {
        description: err instanceof Error ? err.message : "Erreur inconnue",
      });
      // Re-fetch pour rester cohérent côté serveur
      fetchServices();
    }
  }

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <Tag className="size-6 text-primary" />
            Services
          </h1>
          <p className="text-sm text-muted-foreground">
            Catalogue des services et tarifs par catégorie. Les services
            désactivés n&apos;apparaissent plus dans le wizard de commande.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ViewToggle value={viewMode} onChange={setViewMode} />
          <Button onClick={() => setAddOpen(true)} className="h-11">
            <Plus className="mr-2 size-4" />
            Ajouter un service
          </Button>
        </div>
      </div>

      {/* Liste regroupée par type */}
      <ServicesList
        services={services}
        loading={loading}
        viewMode={viewMode}
        onToggle={handleToggle}
        onEdit={(s) => setEditService(s)}
        onDelete={(s) => setDeleteService(s)}
      />

      {/* Dialogs */}
      <AddServiceDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onCreated={fetchServices}
        existingTypes={services.map((s) => s.type)}
      />
      <EditServiceDialog
        service={editService}
        open={editService !== null}
        onOpenChange={(o) => !o && setEditService(null)}
        onUpdated={fetchServices}
      />
      <DeleteServiceDialog
        service={deleteService}
        open={deleteService !== null}
        onOpenChange={(o) => !o && setDeleteService(null)}
        onDeleted={fetchServices}
      />
    </div>
  );
}
