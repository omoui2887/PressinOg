/**
 * e-pressing — Helper d'authentification & rôles
 * ==============================================
 * Centralise la récupération du personnel courant et la vérification
 * des rôles pour les Route Handlers / Server Components.
 *
 * 🔒 SÉCURITÉ :
 *   - `getCurrentPersonnel()` lit le user Supabase Auth puis la table
 *     `personnel` (filtrée par `user_id`). RLS isole déjà par pressing.
 *   - Les helpers `isPersonnelActive` / `hasRole` sont des fonctions
 *     pures qui ne font aucune I/O — faciles à tester et à réutiliser.
 *
 * Usage typique dans un Route Handler :
 *   const supabase = await getSupabaseServer();
 *   const me = await getCurrentPersonnel(supabase);
 *   if (!me) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
 *   if (!isPersonnelActive(me)) return NextResponse.json({ error: "Compte inactif" }, { status: 403 });
 *   if (!hasRole(me, CAN_CREATE_COMMANDES)) {
 *     return NextResponse.json({ error: "Rôle insuffisant" }, { status: 403 });
 *   }
 */
import { SupabaseClient } from "@supabase/supabase-js";

/** Rôles possibles du personnel (enum `role_personnel` en base). */
export type PersonnelRole =
  | "manager"
  | "receptionniste"
  | "caissier"
  | "laveur"
  | "repassage"
  | "livreur"
  | "comptable";

/** Personnel authentifié — sous-ensemble typé de la table `personnel`. */
export interface AuthPersonnel {
  id: string;
  pressing_id: string;
  role: PersonnelRole;
  actif: boolean;
  statut_compte: string;
}

/**
 * Récupère le personnel authentifié courant.
 * @returns `null` si non authentifié ou personnel introuvable.
 */
export async function getCurrentPersonnel(
  supabase: SupabaseClient
): Promise<AuthPersonnel | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("personnel")
    .select("id, pressing_id, role, actif, statut_compte")
    .eq("user_id", user.id)
    .maybeSingle();
  return data as AuthPersonnel | null;
}

/**
 * Vérifie qu'un personnel est actif.
 * Un compte est actif si `actif === true` ET `statut_compte === 'actif'`.
 */
export function isPersonnelActive(p: AuthPersonnel | null): boolean {
  return !!p && p.actif === true && p.statut_compte === "actif";
}

/** Vérifie qu'un personnel possède l'un des rôles autorisés. */
export function hasRole(
  p: AuthPersonnel | null,
  allowed: PersonnelRole[]
): boolean {
  return !!p && (allowed as string[]).includes(p.role);
}

/* -------------------------------------------------------------------------- */
/*  RÔLES AUTORISÉS PAR OPÉRATION                                              */
/* -------------------------------------------------------------------------- */

/**
 * Rôles autorisés à créer des commandes.
 *
 * Fix (FIX-WAVE1-A #6) — PRD §3.4 matrice "Créer commande" : ✅ Admin/Manager/
 * Réceptionniste, ❌ Caissier, ❌ Comptable. Avant ce fix, le code autorisait
 * à tort le caissier et le comptable. L'admin pressing a le rôle "manager"
 * côté `personnel` (cf. trigger de seed) — il n'y a pas de rôle "admin"
 * distinct dans l'enum `role_personnel`.
 */
export const CAN_CREATE_COMMANDES: PersonnelRole[] = [
  "manager",
  "receptionniste",
];

/** Rôles autorisés à annuler une commande. */
export const CAN_CANCEL_COMMANDES: PersonnelRole[] = [
  "manager",
  "receptionniste",
  "caissier",
];

/**
 * Rôles autorisés à marquer une commande comme retirée (PRD §6.4) :
 * "retire — Récept./Caissier — Client retiré au pressing". Le manager
 * (admin pressing) est inclus pour override/intervention manuelle.
 * Fix (FIX-WAVE1-A #2).
 */
export const CAN_RETIRER_COMMANDES: PersonnelRole[] = [
  "manager",
  "receptionniste",
  "caissier",
];

/** Rôles autorisés à modifier la priorité d'une commande. */
export const CAN_CHANGE_PRIORITE: PersonnelRole[] = [
  "manager",
  "receptionniste",
];

/** Rôles autorisés à encaisser un paiement (acompte ou solde final) sur
 *  une commande. FIX-ENCAISSE-ADMIN : avant ce fix, seul le caissier pouvait
 *  encaisser (endpoint /api/personnel/caissier/encaisser restreint à
 *  role="caissier"). Le manager et le réceptionniste peuvent désormais
 *  encaisser aussi — utile pour régler le solde d'une commande partiellement
 *  payée directement depuis la page détail (sans passer par l'interface
 *  caissier dédiée). Le comptable reste exclu (rôle consultatif). */
export const CAN_ENCAISSER_PAIEMENT: PersonnelRole[] = [
  "manager",
  "receptionniste",
  "caissier",
];

/** Rôles autorisés à gérer le personnel (manager uniquement). */
export const CAN_MANAGE_PERSONNEL: PersonnelRole[] = ["manager"];

/** Rôles autorisés à consulter les rapports. */
export const CAN_VIEW_RAPPORTS: PersonnelRole[] = [
  "manager",
  "comptable",
  "receptionniste",
];

/* -------------------------------------------------------------------------- */
/*  AUTORISATIONS REMISES (moteur financier atomique — migration 036)         */
/* -------------------------------------------------------------------------- */

/**
 * Rôles autorisés à appliquer une remise commerciale (pourcentage ou
 * montant_fixe). Le caissier ne peut PAS appliquer de remise — il ne fait
 * qu'encaisser. Le manager et le réceptionniste peuvent accorder une
 * remise commerciale dans la limite du seuil configuré
 * (pressing_remise_config.remise_pourcentage_max, défaut 50%).
 */
export const CAN_APPLIQUER_REMISE_COMMERCIALE: PersonnelRole[] = [
  "manager",
  "receptionniste",
];

/**
 * Rôles autorisés à appliquer une remise article gratuit (Xème article offert).
 * Même matrice que la remise commerciale : manager + réceptionniste.
 */
export const CAN_APPLIQUER_REMISE_ARTICLE_GRATUIT: PersonnelRole[] = [
  "manager",
  "receptionniste",
];

/**
 * Rôles autorisés à appliquer une remise fidélité automatique.
 * La remise fidélité est calculée côté serveur (calculer_remise_fidelite_auto)
 * à partir des points du client — l'utilisateur ne choisit pas la valeur.
 * Tout rôle pouvant créer une commande peut activer la remise fidélité
 * (le % est déterminé par le palier du client, pas par l'opérateur).
 */
export const CAN_APPLIQUER_REMISE_FIDELITE: PersonnelRole[] = [
  ...CAN_CREATE_COMMANDES,
];

/**
 * Rôles autorisés à appliquer une remise EXCEPTIONNELLE (au-delà du seuil
 * `remise_seuil_exceptionnel`, défaut 20%). Seul le manager peut.
 * Le réceptionniste est limité au seuil standard.
 */
export const CAN_APPLIQUER_REMISE_EXCEPTIONNELLE: PersonnelRole[] = ["manager"];

/**
 * Rôles autorisés à ANNULER un paiement financier (reversal).
 * Seul le manager peut corriger une erreur de caisse — le caissier et
 * le réceptionniste peuvent encaisser mais pas annuler.
 * La RPC SQL `annuler_paiement` vérifie ce rôle côté DB (defense-in-depth).
 */
export const CAN_ANNULER_PAIEMENT: PersonnelRole[] = ["manager"];

/* -------------------------------------------------------------------------- */
/*  AUTORISATIONS ASSIGNATION (moteur d'assignation — migration 037)           */
/* -------------------------------------------------------------------------- */

/**
 * Rôles autorisés à assigner / réassigner / désassigner un article de
 * production à un employé. Seul le manager peut répartir le travail
 * entre les employés de production.
 * La RPC SQL `assigner_article_atomic` vérifie ce rôle côté DB
 * (defense-in-depth) — un laveur qui tenterait d'appeler la RPC
 * directement se ferait refuser par le SQL.
 */
export const CAN_ASSIGNER_ARTICLES: PersonnelRole[] = ["manager"];

/**
 * Rôles de production qui peuvent RECEVOIR une assignation de tâche.
 * caissier, receptionniste et comptable sont des rôles non-production
 * et ne peuvent JAMAIS être assignés à une tâche de lavage/repassage/
 * livraison. Le manager est inclus car il peut intervenir manuellement
 * sur n'importe quel poste.
 */
export const ROLES_PRODUCTION_ASSIGNABLES: ReadonlySet<PersonnelRole> =
  new Set(["manager", "laveur", "repassage", "livreur"]);

/**
 * Vérifie qu'un rôle est un rôle de production assignable (peut recevoir
 * une tâche). Utilisé côté TS pour filtrer la liste du personnel dans
 * le dropdown d'assignation (la RPC SQL vérifie aussi côté DB).
 */
export function isRoleProductionAssignable(
  role: PersonnelRole | string | null | undefined
): boolean {
  if (!role) return false;
  return ROLES_PRODUCTION_ASSIGNABLES.has(role as PersonnelRole);
}
