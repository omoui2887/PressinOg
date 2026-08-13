/**
 * e-pressing — Helpers partagés pour le module Services (LOT 11.1)
 * ----------------------------------------------------------------
 * Constantes (types de service + icônes illustratives), formatage
 * (FCFA via @/lib/utils/format), et types partagés entre services-page /
 * services-list / dialogs.
 *
 * Référence spec : LOT 11.1 — prompt 11.1.
 *
 * 🎨 ILLUSTRATIONS (LOT 11.1+) : chaque type de service est associé à une
 *    icône Lucide représentative, affichée dans la liste des services, les
 *    dialogues d'ajout/modification, et le wizard de commande (dropdown
 *    service). Cela offre une cohérence visuelle avec le catalogue d'articles
 *    (qui utilise des illustrations PNG) sans nécessiter de fichiers images
 *    supplémentaires pour les services.
 */
import {
  Droplets,
  Wind,
  Sparkles,
  SprayCan,
  Shirt,
  type LucideIcon,
} from "lucide-react";

/**
 * Types de service (enum DB `type_service`).
 * L'ordre du tableau définit l'ordre d'affichage des groupes dans la liste.
 *
 * `icon` : icône Lucide illustrant visuellement la catégorie de service.
 *   - lavage          → Droplets (eau)
 *   - repassage       → Wind (vapeur / flux d'air du fer)
 *   - laver_repasser  → Shirt (lavage + repassage combinés)
 *   - nettoyage_sec   → Sparkles (éclat du nettoyage à sec)
 *   - detachage       → SprayCan (spray détachant)
 *   - blanchisserie   → Shirt (vêtement blanchi)
 */
export const TYPES_SERVICES = [
  {
    value: "lavage",
    label: "Lavage",
    badgeClass: "bg-primary/10 text-primary border-primary/20",
    icon: Droplets,
  },
  {
    value: "repassage",
    label: "Repassage",
    badgeClass: "bg-secondary/10 text-secondary border-secondary/20",
    icon: Wind,
  },
  {
    value: "laver_repasser",
    label: "Laver-Repasser",
    badgeClass: "bg-chart-4/10 text-chart-4 border-chart-4/20",
    icon: Shirt,
  },
  {
    value: "nettoyage_sec",
    label: "Nettoyage à sec",
    badgeClass: "bg-chart-3/10 text-chart-3 border-chart-3/20",
    icon: Sparkles,
  },
  {
    value: "detachage",
    label: "Détachage",
    badgeClass: "bg-warning/10 text-warning border-warning/20",
    icon: SprayCan,
  },
  {
    value: "blanchisserie",
    label: "Blanchisserie",
    badgeClass: "bg-chart-5/10 text-chart-5 border-chart-5/20",
    icon: Shirt,
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

/** Icône Lucide d'un type de service. Retourne `Sparkles` par défaut. */
export function typeServiceIcon(value: string): LucideIcon {
  return TYPES_SERVICES.find((t) => t.value === value)?.icon ?? Sparkles;
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
