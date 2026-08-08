/**
 * OgPressing — Schémas Zod pour /api/admin/personnel (AUDIT_SECURITE.md #9).
 * --------------------------------------------------------------------------
 * Validation défense-en-profondeur pour les routes POST (création employé)
 * et PATCH (cycle de vie : modifier / desactiver / reactiver) du personnel.
 *
 * ⚠️ Comme pour `commande.ts`, ces schémas sont appliqués en PREMIER (gate)
 * avant la validation métier existante (rôle manager, limite plan, anti-
 * doublon email/tel, AUDIT-B-07 last manager, AUDIT-B-11 role change, etc.).
 * La route continue d'utiliser le body original pour préserver le comportement.
 *
 * Adaptations vs le spec d'origine :
 *   - Le body réel du POST utilise `nom` + `prenom` (séparés) + `methode` +
 *     `password`, pas `nom_complet`. Le schéma accepte les DEUX formes
 *     (nom_complet OU nom+prenom) pour rester permissif.
 *   - Le PATCH réel utilise `action: "modifier" | "desactiver" | "reactiver"`
 *     avec `nom` + `prenom` (pas `nom_complet`). Le schéma valide `action`
 *     et accepte les champs supplémentaires via `.passthrough()`.
 *   - Les champs caissier (`modes_paiement_autorises`, `nom_affiche_recu`,
 *     `seuil_alerte_impaye`) restent validés par la logique métier existante
 *     de la route (la condition "est/devient caissier" ne peut pas être
 *     exprimée statiquement dans Zod).
 *
 * #19 — notes slice : la route PATCH "modifier" ne stocke pas de `notes`
 * directement sur `personnel` (les notes sont sur `clients`), mais le schéma
 * valide quand même `raison_desactivation` à `.max(500)` pour éviter un blob.
 */
import { z } from "zod";
import { phoneSchema } from "./phone";

export const rolePersonnelSchema = z.enum([
  "manager",
  "receptionniste",
  "caissier",
  "laveur",
  "repassage",
  "livreur",
  "comptable",
]);

/**
 * Schéma pour POST /api/admin/personnel.
 *
 * Le body réel a la forme :
 *   { methode, nom, prenom, telephone, email?, role, password? }
 *
 * Le spec d'origine utilisait `nom_complet` à la place de `nom`+`prenom`.
 * On accepte les deux formes pour rester proche du spec tout en fonctionnant
 * avec le body réel.
 */
export const createPersonnelSchema = z
  .object({
    methode: z.enum(["creation_directe", "lien_invitation"]),
    // Forme réelle : nom + prenom (le body du wizard de création personnel)
    nom: z.string().min(1).max(100).optional(),
    prenom: z.string().min(1).max(100).optional(),
    // Forme alternative (spec d'origine) — acceptée mais non utilisée par la route
    nom_complet: z.string().min(2).max(100).optional(),
    email: z.string().email("Email invalide").optional(),
    telephone: phoneSchema.optional(),
    role: rolePersonnelSchema,
    password: z.string().min(8).max(200).optional(),
    // Caissier-specific fields (validated by route logic — kept optional here)
    modes_paiement_autorises: z
      .array(z.enum(["especes", "mobile_money", "carte_bancaire"]))
      .optional(),
    numero_caisse: z.string().max(50).optional(),
    // Manager-only flags (for future use)
    peut_modifier_tarifs: z.boolean().optional(),
    peut_supprimer_commandes: z.boolean().optional(),
  })
  .passthrough();

/**
 * Schéma pour PATCH /api/admin/personnel/[id].
 *
 * Le body réel a la forme :
 *   { action: "modifier" | "desactiver" | "reactiver",
 *     nom?, prenom?, telephone?, email?, role?,
 *     modes_paiement_autorises?, nom_affiche_recu?, seuil_alerte_impaye?,
 *     raison_desactivation?, expected_updated_at? }
 *
 * Le spec d'origine utilisait `nom_complet` à la place de `nom`+`prenom`.
 * On accepte les deux formes.
 */
export const patchPersonnelSchema = z
  .object({
    action: z.enum(["modifier", "desactiver", "activer", "reactiver"]),
    // Forme réelle : nom + prenom
    nom: z.string().min(1).max(100).optional(),
    prenom: z.string().min(1).max(100).optional(),
    // Forme alternative (spec d'origine)
    nom_complet: z.string().min(2).max(100).optional(),
    telephone: phoneSchema.optional(),
    email: z.string().email().optional(),
    role: rolePersonnelSchema.optional(),
    modes_paiement_autorises: z
      .array(z.enum(["especes", "mobile_money", "carte_bancaire"]))
      .optional(),
    numero_caisse: z.string().max(50).optional(),
    peut_modifier_tarifs: z.boolean().optional(),
    peut_supprimer_commandes: z.boolean().optional(),
    raison_desactivation: z.string().max(500).optional(),
    expected_updated_at: z.string().optional(),
  })
  .passthrough();
