/**
 * OgPressing — Types partagés pour la page /super-admin/demandes
 * --------------------------------------------------------------
 * Définit les types des demandes d'inscription tels que retournés par
 * l'API `/api/super-admin/demandes` (GET), ainsi que les libellés et helpers
 * de mapping statut → variante visuelle (badge) utilisés à plusieurs endroits.
 *
 * Ce fichier est un module pur (pas de JSX, pas de "use client") → importable
 * côté client comme côté serveur.
 */
import type { StatusVariant } from "@/components/shared";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type StatutDemande =
  | "en_attente"
  | "contactee"
  | "validee"
  | "refusee";

export type PlanSouhaite = "starter" | "pro" | "business" | "indecis";

/** Code d'activation joint à la demande (1:N, on garde le plus récent). */
export interface CodeActivationLight {
  code: string;
  date_expiration: string | null;
  utilise: boolean;
  created_at: string;
}

/** Une demande d'inscription telle que sérialisée par l'API. */
export interface DemandeInscription {
  id: string;
  nom_gerant: string;
  nom_pressing: string;
  telephone: string;
  email: string | null;
  ville: string | null;
  commune: string | null;
  message: string | null;
  statut: StatutDemande;
  traite_par: string | null;
  date_traitement: string | null;
  notes_traitement: string | null;
  notes_super_admin: string | null;
  nombre_machines: number | null;
  nombre_employes: number | null;
  plan_souhaite: string | null;
  created_at: string;
  updated_at: string;
  /** Dernier code d'activation généré pour cette demande (ou null). */
  code_activation: CodeActivationLight | null;
}

/** Réponse du GET /api/super-admin/demandes. */
export interface DemandesApiResponse {
  success: boolean;
  data: DemandeInscription[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  error?: string;
}

/** Réponse du POST /api/super-admin/demandes/[id]/generer-code. */
export interface GenererCodeApiResponse {
  success: boolean;
  data?: {
    code: string;
    date_expiration: string | null;
    demande_id: string;
    deja_existant?: boolean;
  };
  error?: string;
}

/** Réponse du PATCH /api/super-admin/demandes/[id]. */
export interface PatchDemandeApiResponse {
  success: boolean;
  data?: DemandeInscription;
  error?: string;
}

/* ------------------------------------------------------------------ */
/*  Libellés & mappings                                                */
/* ------------------------------------------------------------------ */

export const STATUT_LABELS: Record<StatutDemande, string> = {
  en_attente: "En attente",
  contactee: "Contactée",
  validee: "Validée",
  refusee: "Refusée",
};

export const STATUT_VARIANTS: Record<StatutDemande, StatusVariant> = {
  en_attente: "warning",
  contactee: "info",
  validee: "success",
  refusee: "danger",
};

export const PLAN_LABELS: Record<string, string> = {
  starter: "Starter",
  pro: "Pro",
  business: "Business",
  indecis: "Indécis",
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Formate un numéro de téléphone pour le lien wa.me :
 *   - retire tous les caractères non numériques
 *   - si commence par 225 → retourne tel quel (déjà international CI)
 *   - si commence par 0 (format local CI) → remplace le 0 par 225
 *   - sinon retourne les chiffres tels quels
 */
export function formatPhoneForWhatsApp(phone: string): string {
  const digits = (phone || "").replace(/\D/g, "");
  if (digits.startsWith("225")) return digits;
  if (digits.startsWith("0")) return "225" + digits.slice(1);
  return digits;
}

/** Construit l'URL wa.me avec un message pré-rempli. */
export function buildWhatsAppUrl(phone: string, message: string): string {
  const formatted = formatPhoneForWhatsApp(phone);
  return `https://wa.me/${formatted}?text=${encodeURIComponent(message)}`;
}

/**
 * Construit le message WhatsApp par défaut pour l'envoi d'un code d'activation.
 */
export function buildCodeWhatsAppMessage(code: string): string {
  return `Bonjour, votre code d'activation OgPressing est : ${code}. Il expirera dans 7 jours. Rendez-vous sur https://ogpressing.com/activation pour activer votre compte.`;
}
