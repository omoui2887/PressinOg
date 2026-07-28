/**
 * OgPressing — ServicesList (LOT 11.1)
 * -------------------------------------
 * Liste des services regroupés par type.
 *
 * Affichage :
 *   - Desktop (md+) : un Table par groupe (Nom | Prix unitaire | Statut | Actions)
 *   - Mobile : cards par service
 *
 * Groupes dans l'ordre défini par TYPES_SERVICES (Lavage, Repassage, Nettoyage
 * à sec, Détachage, Blanchisserie). Chaque groupe a un en-tête avec le label
 * + badge + compteur.
 */
"use client";

import { Sparkles, Pencil } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatFCFA } from "@/lib/utils/format";
import {
  TYPES_SERVICES,
  typeServiceBadgeClass,
  typeServiceLabel,
  type ServiceItem,
} from "./services-helpers";

interface ServicesListProps {
  services: ServiceItem[];
  loading: boolean;
  onToggle: (s: ServiceItem) => void;
  onEdit: (s: ServiceItem) => void;
}

export function ServicesList({
  services,
  loading,
  onToggle,
  onEdit,
}: ServicesListProps) {
  if (loading) {
    return (
      <div className="space-y-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-3">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-12 w-full rounded-lg" />
            <Skeleton className="h-12 w-full rounded-lg" />
          </div>
        ))}
      </div>
    );
  }

  if (services.length === 0) {
    return (
      <EmptyState
        icon={Sparkles}
        title="Aucun service"
        description="Aucun service configuré. Ajoutez votre premier service."
      />
    );
  }

  // Regroupe les services par type, en suivant l'ordre de TYPES_SERVICES.
  const grouped = TYPES_SERVICES.map((t) => ({
    type: t,
    items: services.filter((s) => s.type === t.value),
  })).filter((g) => g.items.length > 0);

  // Services dont le type ne serait pas dans l'enum (sécurité)
  const orphelins = services.filter(
    (s) => !TYPES_SERVICES.some((t) => t.value === s.type)
  );

  return (
    <div className="space-y-6">
      {grouped.map(({ type, items }) => (
        <section key={type.value} className="space-y-3">
          {/* En-tête du groupe */}
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={cn("font-medium", type.badgeClass)}
            >
              {type.label}
            </Badge>
            <span className="text-sm text-muted-foreground">
              {items.length} service{items.length > 1 ? "s" : ""}
            </span>
          </div>

          {/* Vue desktop : tableau */}
          <div className="hidden overflow-hidden rounded-lg border md:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-[40%]">Nom</TableHead>
                  <TableHead className="text-right">Prix unitaire</TableHead>
                  <TableHead className="text-center">Statut</TableHead>
                  <TableHead className="w-32 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((s) => (
                  <TableRow
                    key={s.id}
                    className={cn(!s.actif && "bg-muted/30 opacity-70")}
                  >
                    <TableCell className="font-medium text-foreground">
                      {s.nom}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {formatFCFA(s.prix)}
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="inline-flex items-center gap-2">
                        <Switch
                          checked={s.actif}
                          onCheckedChange={() => onToggle(s)}
                          aria-label="Activer/désactiver"
                        />
                        <span
                          className={cn(
                            "text-xs font-medium",
                            s.actif
                              ? "text-secondary"
                              : "text-muted-foreground"
                          )}
                        >
                          {s.actif ? "Actif" : "Inactif"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onEdit(s)}
                      >
                        <Pencil className="size-4" />
                        Modifier
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Vue mobile : cards */}
          <div className="space-y-3 md:hidden">
            {items.map((s) => (
              <Card
                key={s.id}
                className={cn(
                  "p-4",
                  !s.actif && "bg-muted/30 opacity-70"
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-foreground">{s.nom}</p>
                    <p className="mt-0.5 text-lg font-bold tabular-nums text-foreground">
                      {formatFCFA(s.prix)}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between border-t pt-3">
                  <div className="inline-flex items-center gap-2">
                    <Switch
                      checked={s.actif}
                      onCheckedChange={() => onToggle(s)}
                      aria-label="Activer/désactiver"
                    />
                    <span
                      className={cn(
                        "text-xs font-medium",
                        s.actif
                          ? "text-secondary"
                          : "text-muted-foreground"
                      )}
                    >
                      {s.actif ? "Actif" : "Inactif"}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onEdit(s)}
                  >
                    <Pencil className="size-4" />
                    Modifier
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </section>
      ))}

      {/* Orphelins (type inconnu — sécurité, ne devrait pas arriver) */}
      {orphelins.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="font-medium">
              Autres
            </Badge>
            <span className="text-sm text-muted-foreground">
              {orphelins.length} service{orphelins.length > 1 ? "s" : ""}
            </span>
          </div>
          <div className="space-y-3 md:hidden">
            {orphelins.map((s) => (
              <Card key={s.id} className="p-4">
                <p className="font-semibold text-foreground">{s.nom}</p>
                <p className="mt-1 text-sm tabular-nums">
                  {formatFCFA(s.prix)} ·{" "}
                  <span className="text-muted-foreground">
                    {typeServiceLabel(s.type)}
                  </span>
                </p>
              </Card>
            ))}
          </div>
          <div className="hidden overflow-hidden rounded-lg border md:block">
            <Table>
              <TableBody>
                {orphelins.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.nom}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatFCFA(s.prix)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onEdit(s)}
                      >
                        <Pencil className="size-4" />
                        Modifier
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      )}
    </div>
  );
}
