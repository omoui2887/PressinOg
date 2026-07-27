/**
 * OgPressing — Helpers partagés pour le module Services (LOT 11.1)
 * ----------------------------------------------------------------
 * Constantes (types de service), formatage (FCFA via @/lib/utils/format),
 * et types partagés entre services-page / services-list / dialogs.
 *
 * Référence spec : LOT 11.1 — prompt 11.1.
 */

/**
 * Types de service (enum DB `type_service`).
 * L'ordre du tableau définit l'ordre d'affichage des groupes dans la liste.
 */
export const TYPES_SERVICES = [
  {
    value: "lavage",
    label: "Lavage",
    badgeClass: "bg-primary/10 text-primary border-primary/20",
  },
  {
    value: "repassage",
    label: "Repassage",
    badgeClass: "bg-secondary/10 text-secondary border-secondary/20",
  },
  {
    value: "nettoyage_sec",
    label: "Nettoyage à sec",
    badgeClass: "bg-chart-3/10 text-chart-3 border-chart-3/20",
  },
  {
    value: "detachage",
    label: "Détachage",
    badgeClass: "bg-warning/10 text-warning border-warning/20",
  },
  {
    value: "blanchisserie",
    label: "Blanchisserie",
    badgeClass: "bg-chart-5/10 text-chart-5 border-chart-5/20",
  },
] as const;

export type TypeServiceValue = (typeof TYPES_SERVICES)[number]["value"];

/** Label d'un type de service depuis sa valeur DB. */
export function typeServiceLabel(value: string): string {
  return TYPES_SERVICES.find((t) => t.value === value)?.label ?? value;
}

/** Classe badge d'un type de service. */
export function typeServiceBadgeClass(value: string): string {
  return (
    TYPES_SERVICES.find((t) => t.value === value)?.badgeClass ??
    "bg-muted text-muted-foreground border-border"
  );
}

/* ----------------------- Types partagés ----------------------- */

/** Service renvoyé par `GET /api/admin/services` (toutes les colonnes). */
export interface ServiceItem {
  id: string;
  type: string;
  nom: string;
  prix: number;
  duree_estimee: string | null;
  actif: boolean;
  created_at: string;
  updated_at: string;
}
