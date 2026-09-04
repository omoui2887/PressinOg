/**
 * e-pressing — Schémas Zod pour /api/admin/commandes (AUDIT_SECURITE.md #9).
 * --------------------------------------------------------------------------
 * Validation défense-en-profondeur pour les routes POST (création) et PATCH
 * (mise à jour partielle) des commandes. Ces schémas sont appliqués en PREMIER
 * (gate) avant la validation métier existante (rôle, idempotence, retry
 * numero_commande, services actifs, etc.) qui reste inchangée.
 *
 * ⚠️ Les schémas utilisent `.passthrough()` pour accepter les champs
 * supplémentaires envoyés par le client (ex : `remise`, `acompte`, champs
 * d'article comme `service_id`, `catalogue_article_nom`, `couleur`, `etat`…)
 * sans les rejeter. La validation métier côté route continue de s'exécuter
 * sur le body original pour préserver tout le comportement existant.
 *
 * #19 — notes slice : `notes` est contraint à `.max(2000)` dans les deux
 * schémas (création + PATCH), satisfaisant l'audit #19 (les notes clients
 * sont tronquées à 2000 caractères max, empêchant un client malveillant de
 * stocker un blob illimité dans la base).
 */
import { z } from "zod";

export const prioriteSchema = z.enum(["normal", "express"]).default("normal");
export type Priorite = z.infer<typeof prioriteSchema>;

/**
 * Schéma de validation pour POST /api/admin/commandes.
 *
 * Champs strictement validés :
 *   - client_id : UUID valide
 *   - articles : tableau non vide d'objets avec `catalogue_article_id` (UUID)
 *     et `quantite` (entier > 0, ≤ 999). Les autres champs d'article
 *     (`service_id`, `catalogue_article_nom`, `couleur`, `etat`, etc.) sont
 *     validés par la logique métier existante dans la route.
 *   - date_pret_prevue : chaîne ISO parsable
 *   - priorite : 'normal' | 'express' (défaut 'normal')
 *   - notes : ≤ 2000 caractères (#19)
 *   - idempotence_key : ≤ 200 caractères (#15)
 *
 * Les champs `montant_remise`, `montant_acompte`, etc. (présents dans le
 * spec d'origine) restent optionnels — le body réel utilise des objets
 * imbriqués `remise: { type, valeur }` et `acompte: { montant, methode,
 * reference }` qui restent acceptés via `.passthrough()`.
 */
export const createCommandeSchema = z
  .object({
    client_id: z.string().uuid("client_id invalide"),
    /**
     * `service_id` est optionnel au niveau top-level (le body réel met le
     * `service_id` dans chaque article, pas au top-level). On garde le champ
     * dans le schéma pour rester proche du spec d'origine, mais optionnel.
     */
    service_id: z.string().uuid("service_id invalide").optional(),
    articles: z
      .array(
        z
          .object({
            catalogue_article_id: z.string().uuid(),
            quantite: z.number().int().positive().max(999),
            /**
             * `prix_unitaire` est optionnel côté client : dans l'implémentation
             * actuelle, le prix est récupéré côté serveur depuis `services.prix`
             * (sécurité — le client ne peut pas fixer le prix). Le champ est
             * conservé dans le schéma pour permettre une future évolution.
             */
            prix_unitaire: z.number().nonnegative().max(1_000_000).optional(),
            preferences: z.record(z.string(), z.string()).optional(),
          })
          .passthrough()
      )
      .min(1, "Au moins un article est obligatoire"),
    montant_remise: z.number().nonnegative().max(10_000_000).optional(),
    raison_remise: z.string().max(500).optional(),
    montant_acompte: z.number().nonnegative().max(10_000_000).optional(),
    methode_acompte: z
      .enum(["especes", "mobile_money", "carte_bancaire"])
      .optional(),
    reference_acompte: z.string().max(200).optional(),
    date_pret_prevue: z
      .string()
      .refine((v) => !isNaN(Date.parse(v)), "date_pret_prevue invalide"),
    priorite: prioriteSchema.optional(),
    notes: z.string().max(2000).optional(),
    idempotence_key: z.string().max(200).optional(),
  })
  .passthrough();

/**
 * Schéma de validation pour PATCH /api/admin/commandes/[id].
 *
 * Champs strictement validés (tous optionnels — PATCH partiel) :
 *   - statut : 'recu' | 'en_traitement' | 'pret' | 'livre' | 'paye' | 'annule'
 *   - priorite : 'normal' | 'express'
 *   - notes : ≤ 2000 caractères (#19)
 *   - expected_updated_at : chaîne optionnelle pour le verrou optimiste (#6)
 */
export const patchCommandeSchema = z
  .object({
    // ✅ AUDIT A-CODE H6 : "paye" est un StatutPaiement, pas un StatutCommande.
    //   Remplacé par les vraies valeurs de l'enum statut_commande (migration 024).
    statut: z
      .enum([
        "recu",
        "en_traitement",
        "lave",
        "repasse",
        "pret",
        "en_livraison",
        "livre",
        "retire",
        "annule",
      ])
      .optional(),
    priorite: prioriteSchema.optional(),
    notes: z.string().max(2000).optional(),
    expected_updated_at: z.string().optional(),
  })
  .passthrough();
