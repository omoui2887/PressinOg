-- ============================================================
-- OgPressing — Migration 009 : vue vue_clients_enrichis
-- ============================================================
-- Vue consolidant pour chaque client :
--   - solde_impaye     : SUM(commandes.montant_total - commandes.montant_paye)
--                        sur les commandes non entièrement payées
--                        (statut_paiement IN ('non_paye','partiel'))
--   - total_depense    : SUM(commandes.montant_total) toutes commandes confondues
--   - nombre_commandes : COUNT(commandes)
--   - derniere_commande: MAX(commandes.created_at) — date de la dernière commande
--
-- ⚠️  La vue hérite du pressing_id de la table clients → RLS s'applique
--      automatiquement (isolation multi-tenant via policy sur clients).
--
-- Utilisation :
--   SELECT * FROM public.vue_clients_enrichis
--   WHERE solde_impaye > 0
--   ORDER BY solde_impaye DESC;
-- ============================================================

DROP VIEW IF EXISTS public.vue_clients_enrichis;

CREATE VIEW public.vue_clients_enrichis AS
SELECT
    c.id,
    c.pressing_id,
    c.nom_complet,
    c.telephone,
    c.email,
    c.adresse,
    c.points_fidelite,
    c.notes,
    c.created_at,
    c.updated_at,
    COALESCE(
        SUM(
            CASE
                WHEN cmd.statut_paiement IN ('non_paye', 'partiel')
                    THEN GREATEST(cmd.montant_total - cmd.montant_paye, 0)
                ELSE 0
            END
        ),
        0
    ) AS solde_impaye,
    COALESCE(SUM(cmd.montant_total), 0) AS total_depense,
    COUNT(cmd.id) AS nombre_commandes,
    MAX(cmd.created_at) AS derniere_commande
FROM public.clients c
LEFT JOIN public.commandes cmd ON cmd.client_id = c.id
GROUP BY c.id, c.pressing_id, c.nom_complet, c.telephone, c.email,
         c.adresse, c.points_fidelite, c.notes, c.created_at, c.updated_at;

-- Commentaire documentaire
COMMENT ON VIEW public.vue_clients_enrichis IS
    'Vue enrichie des clients : solde_impaye, total_depense, nombre_commandes, derniere_commande. Hérite du pressing_id → RLS multi-tenant automatique.';

-- GRANT : la vue est soumise à RLS (security_invoker par défaut en PG15+).
-- Les policies sur `clients` s'appliquent car la vue ne fait que SELECT sur
-- clients + commandes (qui ont leur propre RLS). On accorde SELECT à anon/auth.
GRANT SELECT ON public.vue_clients_enrichis TO anon, authenticated;
