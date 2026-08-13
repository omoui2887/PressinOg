/**
 * e-pressing — Helpers partagés pour la page Abonnements
 * ------------------------------------------------------
 * Libellés français + helpers de mapping pour les statuts, plans et méthodes
 * de paiement des abonnements.
 *
 * Centralisé ici pour éviter la duplication entre la table, le dialog de
 * renouvellement, les filtres et la bannière d'alerte.
 */

export type StatutAbonnement = "essai" | "actif" | "suspendu" | "expire";
export type PlanAbonnement = "starter" | "pro" | "business";
export type MethodePaiement = "especes" | "mobile_money" | "carte_bancaire";

export const STATUT_LABELS: Record<StatutAbonnement, string> = {
  essai: "Essai",
  actif: "Actif",
  suspendu: "Suspendu",
  expire: "Expiré",
};

/**
 * Variante visuelle (StatusBadge) selon le statut.
 *   - essai     → warning (orange)
 *   - actif     → success (vert)
 *   - suspendu  → danger (rouge)
 *   - expire    → danger (rouge)
 */
export const STATUT_VARIANTS: Record<
  StatutAbonnement,
  "neutral" | "info" | "success" | "warning" | "danger"
> = {
  essai: "warning",
  actif: "success",
  suspendu: "danger",
  expire: "danger",
};

export const PLAN_LABELS: Record<PlanAbonnement, string> = {
  starter: "Starter",
  pro: "Pro",
  business: "Business",
};

/** Tarifs mensuels en FCFA — conformes à landing/pricing.tsx. */
export const PLAN_MONTANTS: Record<PlanAbonnement, number> = {
  starter: 9900,
  pro: 24900,
  business: 49900,
};

export const METHODE_LABELS: Record<MethodePaiement, string> = {
  especes: "Espèces",
  mobile_money: "Mobile Money",
  carte_bancaire: "Carte bancaire",
};

/** Type principal d'un abonnement renvoyé par /api/super-admin/abonnements. */
export interface Abonnement {
  id: string;
  pressing_id: string;
  plan: PlanAbonnement;
  statut: StatutAbonnement;
  date_debut: string;
  date_fin: string | null;
  montant_mensuel: number;
  mode_paiement_derniere_echeance: MethodePaiement | null;
  date_derniere_echeance: string | null;
  reference_paiement: string | null;
  justificatif_url: string | null;
  enregistre_par: string | null;
  created_at: string;
  updated_at: string;
  // Relation embedded PostgREST : `pressing!inner(id, nom, ville)`
  pressing: {
    id: string;
    nom: string;
    ville: string | null;
  };
}

/** Réponse complète du GET /api/super-admin/abonnements. */
export interface AbonnementsApiResponse {
  success: boolean;
  data: Abonnement[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  stats: {
    starter: number;
    pro: number;
    business: number;
  };
  alertes: {
    expireBientot: number;
    expires: number;
  };
  error?: string;
}

/** Vrai si la date_fin est dans moins de 3 jours (et future). */
export function isExpireBientot(dateFin: string | null): boolean {
  if (!dateFin) return false;
  const fin = new Date(dateFin).getTime();
  const now = Date.now();
  if (fin <= now) return false;
  const troisJours = 3 * 24 * 60 * 60 * 1000;
  return fin - now < troisJours;
}

/** Vrai si la date_fin est déjà dépassée. */
export function isExpire(dateFin: string | null): boolean {
  if (!dateFin) return false;
  return new Date(dateFin).getTime() < Date.now();
}
