/**
 * e-pressing — Personnel helpers (librairie partagée)
 * ----------------------------------------------------
 * Définitions de types + libellés + badges pour le module Personnel.
 * Centralise la logique de couleur des rôles et statuts afin d'assurer
 * une cohérence visuelle entre la liste (table/cards) et le menu d'actions.
 *
 * Rôles (PRD §3.3) : 7 valeurs — chacune avec une couleur sémantique distincte.
 * Statuts (PRD §3.5) : 3 valeurs — actif (vert), invite_en_attente (orange),
 *   desactive (gris).
 */
import {
  BadgeCheck,
  Clock,
  Ban,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type RolePersonnel =
  | "manager"
  | "receptionniste"
  | "caissier"
  | "laveur"
  | "repassage"
  | "livreur"
  | "comptable";

export type StatutComptePersonnel =
  | "actif"
  | "invite_en_attente"
  | "desactive";

export type MethodeCreationPersonnel = "creation_directe" | "lien_invitation";

export interface Employe {
  id: string;
  nom_complet: string;
  email: string | null;
  telephone: string | null;
  role: RolePersonnel;
  methode_creation: MethodeCreationPersonnel;
  statut_compte: StatutComptePersonnel;
  date_invitation: string | null;
  date_activation: string | null;
  date_desactivation: string | null;
  actif: boolean;
  created_at: string;
  // Champs caissier (AUDIT 9.7 — migration 019 + 030).
  // ⚠️  Depuis la migration 030, modes_paiement_autorises est NULLABLE :
  //     NULL pour les non-caissiers, array pour les caissiers.
  // Optionnels car la liste des employés peut provenir d'un SELECT qui
  // ne projette pas ces colonnes (rétro-compatibilité).
  modes_paiement_autorises?: string[] | null;
  nom_affiche_recu?: string | null;
  seuil_alerte_impaye?: number;
}

/**
 * Modes de paiement autorisés dans le champ `modes_paiement_autorises`
 * (AUDIT 9.7 — migration 019). L'ordre est utilisé pour l'affichage
 * des checkboxes dans la dialog d'édition.
 *
 * Fix (FIX-WAVE1-A #8) — PRD §5.2 + §18.5 : seules 3 méthodes de paiement
 * sont conformes (especes, mobile_money, carte_bancaire). Avant ce fix,
 * on avait aussi "carte", "cheque", "virement" qui ne pouvaient JAMAIS
 * passer la validation `METHODES_VALID` côté API (3 valeurs PRD) → dead
 * values, jamais encaissables. On les retire donc de l'enum.
 */
export const MODES_PAIEMENT_CAISSIER = [
  "especes",
  "mobile_money",
  "carte_bancaire",
] as const;

export type ModePaiementCaissier = (typeof MODES_PAIEMENT_CAISSIER)[number];

export const MODE_PAIEMENT_LABELS: Record<ModePaiementCaissier, string> = {
  especes: "Espèces",
  mobile_money: "Mobile Money",
  carte_bancaire: "Carte bancaire",
};

/** Seuil par défaut si la colonne seuil_alerte_impaye est absente/null. */
export const SEUIL_ALERTE_IMPAYE_DEFAUT = 5000;

/** Modes autorisés par défaut (tous) — utilisé à l'init du formulaire. */
export const MODES_AUTORISES_DEFAUT: ModePaiementCaissier[] = [
  ...MODES_PAIEMENT_CAISSIER,
];

// ---- Libellés des rôles ----
export const ROLE_PERSONNEL_LABELS: Record<RolePersonnel, string> = {
  manager: "Manager",
  receptionniste: "Réceptionniste",
  caissier: "Caissier",
  laveur: "Laveur",
  repassage: "Repassage",
  livreur: "Livreur",
  comptable: "Comptable",
};

// ---- Couleurs des badges de rôle (variantes shadcn + classes utilitaires) ----
// Chaque rôle a une teinte distincte pour repérage visuel rapide.
export const ROLE_BADGE_CLASSES: Record<RolePersonnel, string> = {
  manager:
    "bg-primary/10 text-primary border-primary/20 hover:bg-primary/15",
  receptionniste:
    "bg-secondary/10 text-secondary border-secondary/20 hover:bg-secondary/15",
  caissier:
    "bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900",
  laveur:
    "bg-cyan-100 text-cyan-800 border-cyan-200 hover:bg-cyan-200 dark:bg-cyan-950/40 dark:text-cyan-300 dark:border-cyan-900",
  repassage:
    "bg-rose-100 text-rose-800 border-rose-200 hover:bg-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900",
  livreur:
    "bg-emerald-100 text-emerald-800 border-emerald-200 hover:bg-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900",
  comptable:
    "bg-violet-100 text-violet-800 border-violet-200 hover:bg-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-900",
};

export function RoleBadge({ role }: { role: RolePersonnel }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "whitespace-nowrap font-medium",
        ROLE_BADGE_CLASSES[role]
      )}
    >
      {ROLE_PERSONNEL_LABELS[role]}
    </Badge>
  );
}

// ---- Libellés + couleurs des statuts de compte ----
export const STATUT_LABELS: Record<StatutComptePersonnel, string> = {
  actif: "Actif",
  invite_en_attente: "Invitation en attente",
  desactive: "Désactivé",
};

export const STATUT_ICONS: Record<StatutComptePersonnel, LucideIcon> = {
  actif: BadgeCheck,
  invite_en_attente: Clock,
  desactive: Ban,
};

export const STATUT_BADGE_CLASSES: Record<StatutComptePersonnel, string> = {
  actif:
    "bg-secondary/10 text-secondary border-secondary/20 hover:bg-secondary/15",
  invite_en_attente:
    "bg-warning/10 text-warning border-warning/20 hover:bg-warning/15",
  desactive:
    "bg-muted text-muted-foreground border-border hover:bg-muted/80",
};

export function StatutBadge({ statut }: { statut: StatutComptePersonnel }) {
  const Icon = STATUT_ICONS[statut];
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1 whitespace-nowrap font-medium",
        STATUT_BADGE_CLASSES[statut]
      )}
    >
      <Icon className="size-3" />
      {STATUT_LABELS[statut]}
    </Badge>
  );
}

// ---- Formatage des dates ----
export function formatDateShort(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(new Date(iso));
  } catch {
    return "—";
  }
}
