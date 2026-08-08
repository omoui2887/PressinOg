/**
 * OgPressing — Schémas Zod pour /api/super-admin/abonnements (AUDIT #9).
 * --------------------------------------------------------------------------
 * Validation défense-en-profondeur pour les routes :
 *   - POST /api/super-admin/abonnements/[id]/renouveler
 *   - PATCH /api/super-admin/abonnements/[id]
 *
 * Appliqués en PREMIER (gate) avant la logique métier existante (super admin
 * check, vérification abonnement, calcul date_fin, AUDIT-B-09 réactivation
 * pressing, etc.).
 *
 * Adaptations vs le spec d'origine :
 *   - `renouvelerAbonnementSchema` : le body réel n'envoie pas `plan` ni
 *     `date_paiement` (le plan est lu depuis l'abonnement existant, la date
 *     de paiement est NOW() côté serveur). On rend `plan` et `date_paiement`
 *     optionnels. Le body réel utilise `justificatif_url` (pas `justificatif_path`)
 *     — on accepte les deux noms pour rester proche du spec.
 *   - `patchAbonnementSchema` : correspond au body réel tel quel.
 */
import { z } from "zod";

export const planAbonnementSchema = z.enum(["starter", "pro", "business"]);

export const renouvelerAbonnementSchema = z
  .object({
    // Optionnel : le plan est lu depuis l'abonnement existant côté serveur.
    plan: planAbonnementSchema.optional(),
    duree_mois: z.number().int().min(1).max(12),
    montant: z.number().int().nonnegative().max(10_000_000),
    methode: z.enum(["especes", "mobile_money", "carte_bancaire", "virement"]),
    reference: z.string().max(200).optional(),
    // Optionnel : la route utilise NOW() si absent.
    date_paiement: z.string().optional(),
    // Le body réel utilise `justificatif_url` — on accepte les deux noms.
    justificatif_path: z.string().max(500).optional(),
    justificatif_url: z.string().max(500).optional(),
  })
  .passthrough();

export const patchAbonnementSchema = z
  .object({
    action: z.enum(["changer_plan", "suspendre", "reactiver"]),
    plan: planAbonnementSchema.optional(),
    raison: z.string().max(500).optional(),
  })
  .passthrough();
