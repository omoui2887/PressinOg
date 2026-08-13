-- ============================================================
-- e-pressing — Migration 034 : Index sur commandes.created_at
-- ============================================================
-- Fichier    : 034_index_commandes_created_at.sql
-- Version    : 1.0
-- Description : Ajoute un index composite sur (pressing_id, created_at DESC)
--               pour accélérer le hot path GET /api/admin/commandes qui
--               filtre par pressing_id + historyCutoff et trie par
--               created_at DESC.
--
-- Contexte (FIX-WAVE1-A #11 — DEEP-AUDIT-1 issue HIGH #7) :
--   La migration 004_indexes.sql avait créé un index sur
--   (pressing_id, date_reception DESC) — mais la route API filtre sur
--   `created_at` (pas `date_reception`), donc l'index existant n'est pas
--   utilisé. La route fait un sequential scan + sort sur toutes les
--   commandes du pressing, ce qui se dégrade quand la base grossit.
--
--   Cet index couvre :
--     - GET /api/admin/commandes (liste paginée avec cutoff + tri DESC)
--     - GET /api/admin/rapports/{commandes,remises,paiements,impayes}*
--       (filtrent sur created_at depuis le cutoff du plan)
--
--   (*) paiements filtre sur date_paiement, mais la commande parent filtre
--       sur created_at — l'index bénéficie aux jointures.
--
-- ⚠️ Idempotent : CREATE INDEX IF NOT EXISTS.
-- ============================================================


-- ============================================================
-- 1. Index composite (pressing_id, created_at DESC)
-- ============================================================
-- Couvre le pattern d'accès majoritaire :
--   WHERE pressing_id = $1 AND created_at >= $2
--   ORDER BY created_at DESC
-- LIMIT $pageSize OFFSET $offset
--
-- Le DESC dans la définition de l'index permet à PostgreSQL de parcourir
-- l'index dans l'ordre inverse (matching le ORDER BY created_at DESC)
-- sans faire un sort séparé.
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_commandes_created_at
    ON public.commandes (pressing_id, created_at DESC);


-- ============================================================
-- Fin de la migration 034_index_commandes_created_at.sql
-- Récapitulatif :
--   - 1 index composite (pressing_id, created_at DESC) sur commandes.
--   - Idempotent (CREATE INDEX IF NOT EXISTS).
--   - Aucun DROP INDEX / DROP TABLE.
-- ============================================================
