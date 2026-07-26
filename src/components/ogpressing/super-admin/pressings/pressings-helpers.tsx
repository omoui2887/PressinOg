/**
 * OgPressing — Pressings helpers (librairie partagée)
 * -----------------------------------------------------
 * Définitions de types + libellés + badges pour le module Super Admin → Pressings.
 *
 * Centralise la logique de couleur des statuts pressing et des plans d'abonnement
 * afin d'assurer une cohérence visuelle entre la liste (table/cards) et la Sheet
 * de détails.
 *
 * Statuts pressing (PRD §3.5) : 3 valeurs — actif (vert), essai (orange),
 * suspendu (rouge).
 * Plans (PRD §16) : starter, pro, business.
 */
import {
  CheckCircle2,
  Sparkles,
  Ban,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

export type StatutPressing = "actif" | "essai" | "suspendu";

export type PlanAbonnement = "starter" | "pro" | "business";

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

/** Pressing tel que renvoyé par GET /api/super-admin/pressings (liste). */
export interface PressingListItem {
  id: string;
  nom: string;
  slug: string | null;
  telephone: string | null;
  email: string | null;
  adresse: string | null;
  ville: string | null;
  commune: string | null;
  logo_url: string | null;
  statut: StatutPressing;
  date_activation: string | null;
  horaires: Record<string, string | null> | null;
  created_at: string;
  updated_at: string;
  plan_actuel: PlanAbonnement | null;
  employes_actifs: number;
  total_commandes: number;
}

/** Abonnement tel que renvoyé par GET /api/super-admin/pressings/[id]. */
export interface Abonnement {
  id: string;
  plan: PlanAbonnement;
  statut: string;
  date_debut: string;
  date_fin: string | null;
  montant_mensuel: number;
  mode_paiement_derniere_echeance: string | null;
  date_derniere_echeance: string | null;
  reference_paiement: string | null;
  justificatif_url: string | null;
  created_at: string;
}

/** Membre du personnel tel que renvoyé par GET /api/super-admin/pressings/[id]. */
export interface PersonnelMembre {
  id: string;
  nom_complet: string;
  email: string | null;
  telephone: string | null;
  role: RolePersonnel;
  statut_compte: StatutComptePersonnel;
  actif: boolean;
  created_at: string;
}

/** Réponse GET /api/super-admin/pressings/[id]. */
export interface PressingDetails extends Omit<PressingListItem, "plan_actuel" | "employes_actifs" | "total_commandes"> {
  date_suspension: string | null;
  motif_suspension: string | null;
  abonnements: Abonnement[];
  personnel: PersonnelMembre[];
  total_commandes: number;
}

/* -------------------------------------------------------------------------- */
/*  Statut pressing — libellés, icônes, badges                                */
/* -------------------------------------------------------------------------- */

export const STATUT_PRESSING_LABELS: Record<StatutPressing, string> = {
  actif: "Actif",
  essai: "Essai",
  suspendu: "Suspendu",
};

export const STATUT_PRESSING_ICONS: Record<StatutPressing, LucideIcon> = {
  actif: CheckCircle2,
  essai: Sparkles,
  suspendu: Ban,
};

export const STATUT_PRESSING_BADGE_CLASSES: Record<StatutPressing, string> = {
  actif: "bg-secondary/10 text-secondary border-secondary/20 hover:bg-secondary/15",
  essai: "bg-warning/10 text-warning border-warning/20 hover:bg-warning/15",
  suspendu: "bg-danger/10 text-danger border-danger/20 hover:bg-danger/15",
};

export function StatutPressingBadge({ statut }: { statut: StatutPressing }) {
  const Icon = STATUT_PRESSING_ICONS[statut];
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1 whitespace-nowrap font-medium",
        STATUT_PRESSING_BADGE_CLASSES[statut]
      )}
    >
      <Icon className="size-3" />
      {STATUT_PRESSING_LABELS[statut]}
    </Badge>
  );
}

/* -------------------------------------------------------------------------- */
/*  Plans — libellés + badges                                                 */
/* -------------------------------------------------------------------------- */

export const PLAN_LABELS: Record<PlanAbonnement, string> = {
  starter: "Starter",
  pro: "Pro",
  business: "Business",
};

export const PLAN_BADGE_CLASSES: Record<PlanAbonnement, string> = {
  starter:
    "bg-muted text-muted-foreground border-border hover:bg-muted/80",
  pro: "bg-primary/10 text-primary border-primary/20 hover:bg-primary/15",
  business:
    "bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900",
};

export function PlanBadge({ plan }: { plan: PlanAbonnement | null }) {
  if (!plan) {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        Aucun
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className={cn(
        "whitespace-nowrap font-medium",
        PLAN_BADGE_CLASSES[plan]
      )}
    >
      {PLAN_LABELS[plan]}
    </Badge>
  );
}

/* -------------------------------------------------------------------------- */
/*  Rôles + statuts compte personnel — libellés (FR)                          */
/* -------------------------------------------------------------------------- */

export const ROLE_PERSONNEL_LABELS: Record<RolePersonnel, string> = {
  manager: "Manager",
  receptionniste: "Réceptionniste",
  caissier: "Caissier",
  laveur: "Laveur",
  repassage: "Repassage",
  livreur: "Livreur",
  comptable: "Comptable",
};

export const STATUT_COMPTE_LABELS: Record<StatutComptePersonnel, string> = {
  actif: "Actif",
  invite_en_attente: "Invité (en attente)",
  desactive: "Désactivé",
};

export const STATUT_COMPTE_BADGE_CLASSES: Record<StatutComptePersonnel, string> = {
  actif: "bg-secondary/10 text-secondary border-secondary/20 hover:bg-secondary/15",
  invite_en_attente:
    "bg-warning/10 text-warning border-warning/20 hover:bg-warning/15",
  desactive: "bg-muted text-muted-foreground border-border hover:bg-muted/80",
};

export function StatutCompteBadge({ statut }: { statut: StatutComptePersonnel }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "whitespace-nowrap font-medium",
        STATUT_COMPTE_BADGE_CLASSES[statut]
      )}
    >
      {STATUT_COMPTE_LABELS[statut]}
    </Badge>
  );
}

/* -------------------------------------------------------------------------- */
/*  Statuts abonnement — libellés                                             */
/* -------------------------------------------------------------------------- */

export const STATUT_ABONNEMENT_LABELS: Record<string, string> = {
  essai: "Essai",
  actif: "Actif",
  suspendu: "Suspendu",
  expire: "Expiré",
};

export const STATUT_ABONNEMENT_BADGE_CLASSES: Record<string, string> = {
  essai: "bg-warning/10 text-warning border-warning/20 hover:bg-warning/15",
  actif: "bg-secondary/10 text-secondary border-secondary/20 hover:bg-secondary/15",
  suspendu: "bg-danger/10 text-danger border-danger/20 hover:bg-danger/15",
  expire: "bg-muted text-muted-foreground border-border hover:bg-muted/80",
};

export function StatutAbonnementBadge({ statut }: { statut: string }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "whitespace-nowrap font-medium",
        STATUT_ABONNEMENT_BADGE_CLASSES[statut] ??
          "bg-muted text-muted-foreground border-border"
      )}
    >
      {STATUT_ABONNEMENT_LABELS[statut] ?? statut}
    </Badge>
  );
}

/* -------------------------------------------------------------------------- */
/*  Méthodes paiement — libellés                                              */
/* -------------------------------------------------------------------------- */

export const METHODE_PAIEMENT_LABELS: Record<string, string> = {
  especes: "Espèces",
  mobile_money: "Mobile Money",
  carte_bancaire: "Carte bancaire",
};

/* -------------------------------------------------------------------------- */
/*  Jours de la semaine — pour l'affichage des horaires                        */
/* -------------------------------------------------------------------------- */

export const JOURS_SEMAINE: { key: string; label: string }[] = [
  { key: "lundi", label: "Lundi" },
  { key: "mardi", label: "Mardi" },
  { key: "mercredi", label: "Mercredi" },
  { key: "jeudi", label: "Jeudi" },
  { key: "vendredi", label: "Vendredi" },
  { key: "samedi", label: "Samedi" },
  { key: "dimanche", label: "Dimanche" },
];

/**
 * Parse l'objet horaires en une liste ordonnée { jour, label, plage }.
 * Les jours non-présents dans l'objet sont affichés avec plage = null ("Fermé").
 */
export function parseHoraires(
  horaires: Record<string, string | null> | null
): { jour: string; label: string; plage: string | null }[] {
  if (!horaires || typeof horaires !== "object") {
    return JOURS_SEMAINE.map((j) => ({
      jour: j.key,
      label: j.label,
      plage: null,
    }));
  }
  return JOURS_SEMAINE.map((j) => ({
    jour: j.key,
    label: j.label,
    plage: horaires[j.key] ?? null,
  }));
}
