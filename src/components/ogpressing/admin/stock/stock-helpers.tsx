/**
 * OgPressing — Helpers partagés pour le module Stock (LOT 10)
 * ------------------------------------------------------------
 * Constantes (catégories, unités), formatage (quantité, dates, FCFA),
 * et calcul du statut d'alerte d'un produit.
 *
 * Référence spec : LOT 10 — prompt 10.1 & 10.2.
 */

/** Catégories de biodétergents (enum DB `categorie_produit_stock`). */
export const CATEGORIES = [
  { value: "detergent", label: "Détergent", badgeClass: "bg-primary/10 text-primary border-primary/20" },
  { value: "adoucissant", label: "Adoucissant", badgeClass: "bg-secondary/10 text-secondary border-secondary/20" },
  { value: "detacheur", label: "Détacheur", badgeClass: "bg-chart-5/10 text-chart-5 border-chart-5/20" },
  { value: "desinfectant", label: "Désinfectant", badgeClass: "bg-warning/10 text-warning border-warning/20" },
  { value: "javel", label: "Eau de Javel", badgeClass: "bg-chart-3/10 text-chart-3 border-chart-3/20" },
  { value: "savon", label: "Savon", badgeClass: "bg-foreground/10 text-foreground border-foreground/20" },
] as const;

/** Unités de mesure (enum DB `unite_stock`). */
export const UNITES = [
  { value: "litre", label: "Litre", short: "L" },
  { value: "kg", label: "Kilogramme", short: "kg" },
] as const;

export type CategorieValue = (typeof CATEGORIES)[number]["value"];
export type UniteValue = (typeof UNITES)[number]["value"];

/** Label d'une catégorie depuis sa valeur DB. */
export function categorieLabel(value: string): string {
  return CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

/** Classe badge d'une catégorie. */
export function categorieBadgeClass(value: string): string {
  return (
    CATEGORIES.find((c) => c.value === value)?.badgeClass ??
    "bg-muted text-muted-foreground border-border"
  );
}

/** Label court d'une unité (L ou kg). */
export function uniteShort(value: string): string {
  return UNITES.find((u) => u.value === value)?.short ?? value;
}

/** Label long d'une unité. */
export function uniteLabel(value: string): string {
  return UNITES.find((u) => u.value === value)?.label ?? value;
}

/* ----------------------- Statut d'alerte stock ----------------------- */

export type StockLevel = "critical" | "warning" | "ok";

export interface StockStatus {
  level: StockLevel;
  emoji: string;
  label: string;
  /** Classes Tailwind pour le badge (fond + texte). */
  badgeClass: string;
}

/**
 * Calcule le statut visuel d'un produit selon spec LOT 10.1 :
 *   - 🔴 critical : quantite_actuelle < seuil_alerte
 *   - 🟡 warning  : quantite_actuelle < 2 × seuil_alerte (mais ≥ seuil)
 *   - ✅ ok       : sinon
 *
 * Si seuil_alerte = 0, on considère toujours ok (pas d'alerte configurée).
 */
export function getStockStatus(
  quantite: number,
  seuil: number
): StockStatus {
  if (seuil <= 0) {
    return {
      level: "ok",
      emoji: "✅",
      label: "OK",
      badgeClass: "bg-secondary/10 text-secondary border-secondary/20",
    };
  }
  if (quantite < seuil) {
    return {
      level: "critical",
      emoji: "🔴",
      label: "Stock critique",
      badgeClass: "bg-danger/10 text-danger border-danger/30",
    };
  }
  if (quantite < 2 * seuil) {
    return {
      level: "warning",
      emoji: "🟡",
      label: "Stock bas",
      badgeClass: "bg-warning/10 text-warning border-warning/30",
    };
  }
  return {
    level: "ok",
    emoji: "✅",
    label: "OK",
    badgeClass: "bg-secondary/10 text-secondary border-secondary/20",
  };
}

/* ----------------------- Statut d'expiration ----------------------- */

export type ExpirationLevel = "expired" | "soon" | "ok" | "none";

export interface ExpirationStatus {
  level: ExpirationLevel;
  label: string;
  badgeClass: string;
}

/**
 * Statut d'expiration d'un produit.
 *   - expired : date dépassée
 *   - soon    : expire dans les 30 prochains jours
 *   - ok      : expire dans > 30 jours
 *   - none    : pas de date d'expiration renseignée
 */
export function getExpirationStatus(
  dateExpiration: string | null | undefined
): ExpirationStatus {
  if (!dateExpiration) {
    return { level: "none", label: "", badgeClass: "" };
  }
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const exp = new Date(dateExpiration + "T00:00:00");
  const diffDays = Math.floor(
    (exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (diffDays < 0) {
    return {
      level: "expired",
      label: "Expiré",
      badgeClass: "bg-danger/10 text-danger border-danger/30",
    };
  }
  if (diffDays <= 30) {
    return {
      level: "soon",
      label: `Expire dans ${diffDays}j`,
      badgeClass: "bg-warning/10 text-warning border-warning/30",
    };
  }
  return {
    level: "ok",
    label: "",
    badgeClass: "",
  };
}

/* ----------------------- Formatage ----------------------- */

/**
 * Formate une quantité avec son unité : "5,00 L" ou "3,50 kg".
 * Utilise la virgule décimale (français).
 */
export function formatQuantite(qte: number | string, unite: string): string {
  const n = typeof qte === "string" ? parseFloat(qte) : qte;
  if (Number.isNaN(n)) return `0,00 ${uniteShort(unite)}`;
  const formatted = n.toFixed(2).replace(".", ",");
  return `${formatted} ${uniteShort(unite)}`;
}

/** Formate un nombre FCFA : "12 500 FCFA" (séparateur milliers = espace). */
export function formatFCFA(amount: number | string | null | undefined): string {
  if (amount === null || amount === undefined || amount === "") return "—";
  const n = typeof amount === "string" ? parseInt(amount, 10) : amount;
  if (Number.isNaN(n)) return "—";
  return `${n.toLocaleString("fr-FR").replace(/\u202f/g, " ")} FCFA`;
}

/** Formate une date ISO en "JJ/MM/AAAA". */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const jj = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const aaaa = d.getFullYear();
  return `${jj}/${mm}/${aaaa}`;
}

/** Formate une date ISO en "JJ/MM/AAAA HH:mm". */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const jj = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const aaaa = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${jj}/${mm}/${aaaa} ${hh}:${min}`;
}

/* ----------------------- Types partagés ----------------------- */

export interface ProduitStock {
  id: string;
  pressing_id: string;
  nom: string;
  categorie: string;
  unite: string;
  quantite_actuelle: number | string;
  seuil_alerte: number | string;
  prix_achat_unitaire: number | null;
  fournisseur: string | null;
  fds_url: string | null;
  date_expiration: string | null;
  created_at: string;
  updated_at: string;
}

export interface MouvementStock {
  id: string;
  produit_id: string;
  type_mouvement: "entree" | "sortie" | "ajustement";
  quantite: number | string;
  motif: string | null;
  date_mouvement: string;
  enregistre_par: string | null;
  commande_id: string | null;
  created_at: string;
  // Champs JOIN (renvoyés par l'API mouvements)
  produit_nom?: string;
  produit_unite?: string;
  enregistre_par_nom?: string | null;
  commande_ticket?: string | null;
}
