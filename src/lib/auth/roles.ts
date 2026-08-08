/**
 * OgPressing — Helper d'authentification & rôles
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

/** Rôles autorisés à créer des commandes (tout personnel actif). */
export const CAN_CREATE_COMMANDES: PersonnelRole[] = [
  "manager",
  "receptionniste",
  "caissier",
  "comptable",
];

/** Rôles autorisés à annuler une commande. */
export const CAN_CANCEL_COMMANDES: PersonnelRole[] = [
  "manager",
  "receptionniste",
  "caissier",
];

/** Rôles autorisés à modifier la priorité d'une commande. */
export const CAN_CHANGE_PRIORITE: PersonnelRole[] = [
  "manager",
  "receptionniste",
];

/** Rôles autorisés à gérer le personnel (manager uniquement). */
export const CAN_MANAGE_PERSONNEL: PersonnelRole[] = ["manager"];

/** Rôles autorisés à consulter les rapports. */
export const CAN_VIEW_RAPPORTS: PersonnelRole[] = [
  "manager",
  "comptable",
  "receptionniste",
];
