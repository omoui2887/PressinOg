/**
 * e-pressing — Helpers partagés module Pressing config (LOT 11.2)
 * ----------------------------------------------------------------
 * Constantes (jours semaine, plans & statuts d'abonnement), types
 * partagés, et helpers de conversion entre le format DB (jsonb horaires)
 * et le state du formulaire Horaires.
 *
 * Référence spec : LOT 11.2 — /admin/pressing (3 onglets : infos,
 * horaires, abonnement).
 */

/* ----------------------- Jours de la semaine ----------------------- */

export const JOURS_SEMAINE = [
  { key: "lundi", label: "Lundi" },
  { key: "mardi", label: "Mardi" },
  { key: "mercredi", label: "Mercredi" },
  { key: "jeudi", label: "Jeudi" },
  { key: "vendredi", label: "Vendredi" },
  { key: "samedi", label: "Samedi" },
  { key: "dimanche", label: "Dimanche" },
] as const;

export type JourKey = (typeof JOURS_SEMAINE)[number]["key"];

/* ----------------------- Plans & statuts abonnement ----------------------- */

export const PLANS_ABONNEMENT = [
  { value: "starter", label: "Starter" },
  { value: "pro", label: "Pro" },
  { value: "business", label: "Business" },
] as const;

export type PlanAbonnementValue = (typeof PLANS_ABONNEMENT)[number]["value"];

/** Libellé français d'un plan depuis sa valeur DB. */
export function planLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return PLANS_ABONNEMENT.find((p) => p.value === value)?.label ?? value;
}

export const STATUTS_ABONNEMENT = [
  {
    value: "essai",
    label: "Essai",
    badgeClass: "bg-warning/10 text-warning border-warning/30",
  },
  {
    value: "actif",
    label: "Actif",
    badgeClass: "bg-secondary/10 text-secondary border-secondary/30",
  },
  {
    value: "suspendu",
    label: "Suspendu",
    badgeClass: "bg-danger/10 text-danger border-danger/30",
  },
  {
    value: "expire",
    label: "Expiré",
    badgeClass: "bg-muted text-muted-foreground border-border",
  },
] as const;

export type StatutAbonnementValue =
  (typeof STATUTS_ABONNEMENT)[number]["value"];

/** Libellé français d'un statut d'abonnement depuis sa valeur DB. */
export function statutAbonnementLabel(
  value: string | null | undefined
): string {
  if (!value) return "—";
  return STATUTS_ABONNEMENT.find((s) => s.value === value)?.label ?? value;
}

/** Classes Tailwind pour le badge d'un statut d'abonnement. */
export function statutAbonnementBadgeClass(
  value: string | null | undefined
): string {
  if (!value) return "bg-muted text-muted-foreground border-border";
  return (
    STATUTS_ABONNEMENT.find((s) => s.value === value)?.badgeClass ??
    "bg-muted text-muted-foreground border-border"
  );
}

/* ----------------------- Coordonnées Super Admin ----------------------- */

/** Numéro affiché (format humain). */
export const SUPER_ADMIN_PHONE = "+225 05 76 10 32 77";

/**
 * Lien WhatsApp direct vers le Super Admin.
 *
 * wa.me attend le format international sans `+` ni espaces :
 *   "+225 05 76 10 32 77" → "2250576103277" → https://wa.me/2250576103277
 */
export const SUPER_ADMIN_WHATSAPP = "https://wa.me/2250576103277";

/* ----------------------- Types partagés ----------------------- */

/** Ligne `pressing` (champs utiles pour la page de configuration). */
export interface PressingInfo {
  id: string;
  nom: string;
  telephone: string | null;
  email: string | null;
  adresse: string | null;
  ville: string | null;
  commune: string | null;
  logo_url: string | null;
  horaires: Record<string, string | null> | null;
  statut: string | null;
  date_activation: string | null;
}

/** Ligne `abonnements` la plus récente du pressing (champs affichés). */
export interface AbonnementInfo {
  id: string;
  plan: string;
  statut: string;
  date_debut: string;
  date_fin: string | null;
  montant_mensuel: number;
}

/* ----------------------- State formulaire Horaires ----------------------- */

/** Représentation d'un jour dans le state formulaire Horaires. */
export interface JourHoraire {
  /** true = le pressing est fermé ce jour-là. */
  ferme: boolean;
  /** Heure d'ouverture "HH:MM" (24h). */
  ouverture: string;
  /** Heure de fermeture "HH:MM" (24h). */
  fermeture: string;
}

/** State complet des 7 jours de la semaine pour le formulaire Horaires. */
export interface HorairesState {
  lundi: JourHoraire;
  mardi: JourHoraire;
  mercredi: JourHoraire;
  jeudi: JourHoraire;
  vendredi: JourHoraire;
  samedi: JourHoraire;
  dimanche: JourHoraire;
}

/** Construit un JourHoraire par défaut (08:00–18:00, ouvert). */
function defaultJourOuvert(): JourHoraire {
  return { ferme: false, ouverture: "08:00", fermeture: "18:00" };
}

/** Construit un JourHoraire fermé par défaut. */
function defaultJourFerme(): JourHoraire {
  return { ferme: true, ouverture: "08:00", fermeture: "18:00" };
}

/**
 * Convertit le jsonb `horaires` de la DB en state formulaire.
 *
 * Format DB attendu : `{ "lundi": "08:00-18:00", "dimanche": null }`
 *   - valeur `"HH:MM-HH:MM"` → jour ouvert avec ouverture/fermeture
 *   - valeur `null` → jour fermé
 *
 * Si `horaires` est `null` (jamais renseigné), on renvoie des valeurs par
 * défaut raisonnables pour un pressing ivoirien :
 *   - Lundi → Samedi : 08:00–18:00 (ouvert)
 *   - Dimanche : Fermé
 */
export function horairesToState(
  horaires: Record<string, string | null> | null
): HorairesState {
  const state: HorairesState = {
    lundi: defaultJourOuvert(),
    mardi: defaultJourOuvert(),
    mercredi: defaultJourOuvert(),
    jeudi: defaultJourOuvert(),
    vendredi: defaultJourOuvert(),
    samedi: defaultJourOuvert(),
    dimanche: defaultJourFerme(),
  };

  if (!horaires || typeof horaires !== "object") return state;

  for (const jour of JOURS_SEMAINE) {
    const raw = horaires[jour.key];
    if (raw === null || raw === undefined || raw === "") {
      state[jour.key] = {
        ferme: true,
        ouverture: "08:00",
        fermeture: "18:00",
      };
      continue;
    }
    if (typeof raw === "string") {
      // Format attendu "HH:MM-HH:MM"
      const match = raw.match(/^(\d{2}:\d{2})-(\d{2}:\d{2})$/);
      if (match) {
        state[jour.key] = {
          ferme: false,
          ouverture: match[1],
          fermeture: match[2],
        };
      }
      // Sinon : valeur mal formée, on garde le défaut
    }
  }

  return state;
}

/**
 * Convertit le state formulaire en jsonb pour la colonne `pressing.horaires`.
 *
 * Pour chaque jour :
 *   - `ferme: true`  → `null` (le pressing est fermé)
 *   - `ferme: false` → `"HH:MM-HH:MM"` (plage horaire)
 */
export function horairesToDB(
  state: HorairesState
): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const jour of JOURS_SEMAINE) {
    const j = state[jour.key];
    if (!j || j.ferme) {
      out[jour.key] = null;
    } else {
      out[jour.key] = `${j.ouverture}-${j.fermeture}`;
    }
  }
  return out;
}
