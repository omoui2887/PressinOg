/**
 * e-pressing — Schémas Zod pour /api/admin/clients (AUDIT_SECURITE.md #9 + #19).
 * ----------------------------------------------------------------------------
 * Validation défense-en-profondeur pour les routes POST (création) et PATCH
 * (mise à jour partielle) des clients. Appliqués en PREMIER (gate) avant la
 * validation métier existante (rôle manager/réceptionniste, unicité téléphone,
 * normalisation téléphone, etc.) qui reste inchangée.
 *
 * #19 — notes slice : `notes` est contraint à `.max(2000)` dans les deux
 * schémas, empêchant un client malveillant de stocker un blob illimité dans
 * la colonne `clients.notes`. La route tronque également via `.slice(0, 2000)`
 * pour préserver le comportement existant.
 *
 * `telephone` est validé via `phoneSchema` (helper `src/lib/validations/phone.ts`)
 * qui accepte les formats ivoiriens (0709090909, +2250709090909, etc.) et
 * normalise vers +225XXXXXXXXXX.
 *
 * `.passthrough()` : accepte les champs supplémentaires (ex : `points_fidelite`
 * pour POST, `preferences_lavage` pour PATCH) qui sont validés par la logique
 * métier existante dans la route.
 */
import { z } from "zod";
import { phoneSchema } from "./phone";

export const createClientSchema = z
  .object({
    nom_complet: z
      .string()
      .min(2, "Nom trop court")
      .max(100, "Nom trop long"),
    telephone: phoneSchema,
    email: z.string().email("Email invalide").optional().or(z.literal("")),
    adresse: z.string().max(300).optional(),
    notes: z.string().max(2000).optional(),
    preferences: z.record(z.string(), z.string()).optional(),
  })
  .passthrough();

export const patchClientSchema = z
  .object({
    nom_complet: z.string().min(2).max(100).optional(),
    telephone: phoneSchema.optional(),
    email: z.string().email().optional().or(z.literal("")),
    adresse: z.string().max(300).optional(),
    notes: z.string().max(2000).nullable().optional(),
    expected_updated_at: z.string().optional(),
  })
  .passthrough();
