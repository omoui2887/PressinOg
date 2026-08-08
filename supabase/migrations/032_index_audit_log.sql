-- ============================================================
-- OgPressing — Migration 032 : Index additionnels Phase 4
-- ============================================================
-- Fichier    : 032_index_audit_log.sql
-- Version    : 1.0
-- Description : Index de performance additionnels pour les nouvelles
--               tables/colonnes introduites en Phase 4 :
--                 - audit_log (migration 027) : index global created_at
--                   pour la vue chronologique Super Admin.
--                 - commandes.priorite (migration 024) : index pour la
--                   file d'attente express.
--                 - personnel.dernier_changement_role (migration 025) :
--                   index pour l'historique d'audit des changements de rôle.
--                 - tarifs_articles (migration 020) : déjà couvert, on
--                   ajoute un index partiel sur les tarifs actifs pour
--                   le SELECT du POS.
--
-- Stratégie :
--   - Tous les index sont CREATE INDEX IF NOT EXISTS → idempotents.
--   - Index partiels (WHERE) pour réduire la taille disque et accélérer
--     les requêtes fréquentes (90% des SELECT filtre actif=TRUE par ex.).
--
-- Prérequis :
--   - Migrations 001 → 027 exécutées.
--   - audit_log existe (027).
--   - commandes.priorite existe (024).
--   - personnel.dernier_changement_role existe (025).
--   - tarifs_articles existe (020).
-- ============================================================


-- ============================================================
-- 1. INDEX SUR audit_log (complément de 027)
-- ============================================================
-- 027 a déjà créé 4 index (pressing_id, user_id, action, entity).
-- On ajoute un index global created_at DESC pour la vue chronologique
-- Super Admin ("toutes les actions récentes tous pressings confondus").
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at
    ON public.audit_log (created_at DESC);

-- Index composite (pressing_id, action, created_at) pour la vue
-- "toutes les annulations de commande de MON pressing ce mois".
CREATE INDEX IF NOT EXISTS idx_audit_log_pressing_id_action_created_at
    ON public.audit_log (pressing_id, action, created_at DESC)
    WHERE pressing_id IS NOT NULL;


-- ============================================================
-- 2. INDEX SUR commandes.priorite (file express)
-- ============================================================
-- 024 a ajouté la colonne priorite TEXT ('normal' | 'express').
-- 024 n'a pas créé d'index sur priorite → on en ajoute un partiel
-- pour la file d'attente express ("toutes les commandes express
-- en cours de traitement de MON pressing").
-- Index PARTIEL WHERE priorite = 'express' (90% des commandes sont
-- 'normal' → l'index partiel est 10x plus petit).
CREATE INDEX IF NOT EXISTS idx_commandes_pressing_id_priorite_express
    ON public.commandes (pressing_id, date_reception DESC)
    WHERE priorite = 'express';


-- ============================================================
-- 3. INDEX SUR personnel.dernier_changement_role (audit trail)
-- ============================================================
-- 025 a ajouté dernier_changement_role TIMESTAMPTZ. On l'indexe pour
-- la requête "récents changements de rôle dans MON pressing"
-- (page audit / traçabilité RH).
CREATE INDEX IF NOT EXISTS idx_personnel_pressing_id_dernier_changement_role
    ON public.personnel (pressing_id, dernier_changement_role DESC)
    WHERE dernier_changement_role IS NOT NULL;


-- ============================================================
-- 4. INDEX SUR tarifs_articles (POS lookup)
-- ============================================================
-- 020 a déjà créé 3 index (pressing_id, catalogue_article_id,
-- unique pressing+article+type). On ajoute un index PARTIEL sur
-- (pressing_id, catalogue_article_id) WHERE actif = TRUE pour
-- accélérer le SELECT du POS : "donne-moi tous les tarifs actifs
-- de l'article X pour MON pressing".
CREATE INDEX IF NOT EXISTS idx_tarifs_articles_pressing_article_actif
    ON public.tarifs_articles (pressing_id, catalogue_article_id)
    WHERE actif = TRUE;


-- ============================================================
-- 5. INDEX SUR services (POS lookup)
-- ============================================================
-- 022 garantit les 5 services standards par pressing. Pour le POS,
-- la requête "donne-moi tous les services actifs de MON pressing"
-- est très fréquente. 004 a créé idx_services_actif (partial sur
-- actif=TRUE), mais pas d'index sur (pressing_id, actif). On l'ajoute.
CREATE INDEX IF NOT EXISTS idx_services_pressing_id_actif
    ON public.services (pressing_id)
    WHERE actif = TRUE;


-- ============================================================
-- Fin de la migration 032_index_audit_log.sql
-- Récapitulatif :
--   - 5 index additionnels :
--       * idx_audit_log_created_at (audit_log global chronological)
--       * idx_audit_log_pressing_id_action_created_at (composite)
--       * idx_commandes_pressing_id_priorite_express (partial express)
--       * idx_personnel_pressing_id_dernier_changement_role (audit RH)
--       * idx_tarifs_articles_pressing_article_actif (POS lookup)
--       * idx_services_pressing_id_actif (POS lookup)
--   - Tous CREATE INDEX IF NOT EXISTS → idempotents
--   - Aucun DROP, aucun UPDATE destructif
-- ============================================================
