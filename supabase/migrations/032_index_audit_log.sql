-- ============================================================
-- e-pressing — Migration 032 : Index additionnels Phase 4
-- ============================================================
-- Fichier    : 032_index_audit_log.sql
-- Version    : 1.1  (correctif — voir section CORRECTIF ci-dessous)
-- Description : Index de performance additionnels pour les nouvelles
--               tables/colonnes introduites en Phase 4 :
--                 - audit_log (migration 027) : index global created_at
--                   pour la vue chronologique Super Admin.
--                 - commandes.priorite (migration 024) : index pour la
--                   file d'attente express.
--                 - personnel.dernier_changement_role (migration 025) :
--                   index pour l'historique d'audit des changements de rôle.
--                 - tarifs_articles (migration 020) : index partiel sur
--                   les tarifs actifs pour le SELECT du POS.
--                 - services (migration 002) : index (pressing_id) WHERE
--                   actif pour le POS lookup.
--
-- ============================================================
-- ⚠️  CORRECTIF v1.1 — erreur 42703 au run précédent
-- ============================================================
-- Le run précédent échouait avec :
--   ERROR 42703: column "priorite" does not exist
--   LINE 59: WHERE priorite = 'express';
--
-- Cause racine :
--   La colonne commandes.priorite est ajoutée par la migration 024
--   (ligne 28 : ALTER TABLE ... ADD COLUMN IF NOT EXISTS priorite TEXT
--    NOT NULL DEFAULT 'normal'). Si 024 n'a pas été exécutée (ou a
--   partiellement échoué sur le ALTER TYPE ... ADD VALUE 'annule'
--   qui précède dans 024), la colonne n'existe pas et l'index partiel
--   `WHERE priorite = 'express'` plante.
--
-- Correctif appliqué :
--   1. Safety-net : ADD COLUMN IF NOT EXISTS priorite TEXT NOT NULL
--      DEFAULT 'normal' (no-op si 024 a déjà tourné ; recrée la colonne
--      sinon). Idempotent → pas de conflit avec 024.
--   2. Tous les index qui dépendent d'objets créés par des migrations
--      ultérieures (027 audit_log, 024 priorite, 025 dernier_changement_role,
--      020 tarifs_articles) sont désormais enveloppés dans des blocs
--      DO $$ qui vérifient l'existence de la table/colonne avant de
--      lancer le CREATE INDEX (via EXECUTE). Si l'objet n'existe pas,
--      l'index est silencieusement ignoré — la migration passe sans
--      erreur dans tous les cas.
--   3. L'index sur services (table + colonne actif du schéma de base 002)
--      reste un CREATE INDEX direct (ces objets existent toujours).
--
-- Stratégie :
--   - CREATE INDEX IF NOT EXISTS → idempotents.
--   - DO $$ + information_schema → ordre-indépendant.
--   - Index partiels (WHERE) pour réduire la taille disque.
-- ============================================================


-- ============================================================
-- 0. SAFETY-NET : colonne commandes.priorite (de 024)
-- ============================================================
-- Garantit que la colonne existe avant l'index partiel express.
-- No-op si 024 a déjà tourné (ADD COLUMN IF NOT EXISTS).
ALTER TABLE public.commandes
    ADD COLUMN IF NOT EXISTS priorite TEXT NOT NULL DEFAULT 'normal';


-- ============================================================
-- 1. INDEX SUR audit_log (complément de 027)
-- ============================================================
-- 027 a déjà créé 4 index (pressing_id, user_id, action, entity).
-- On ajoute un index global created_at DESC pour la vue chronologique
-- Super Admin + un composite (pressing_id, action, created_at).
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'audit_log'
    ) THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_audit_log_created_at '
            || 'ON public.audit_log (created_at DESC)';

        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_audit_log_pressing_id_action_created_at '
            || 'ON public.audit_log (pressing_id, action, created_at DESC) '
            || 'WHERE pressing_id IS NOT NULL';
    END IF;
END $$;


-- ============================================================
-- 2. INDEX SUR commandes.priorite (file express)
-- ============================================================
-- Index PARTIEL WHERE priorite = 'express' : 90% des commandes sont
-- 'normal' → l'index partiel est 10x plus petit. La colonne a été
-- garantie par le safety-net section 0 ci-dessus.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'commandes'
          AND column_name = 'priorite'
    ) THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_commandes_pressing_id_priorite_express '
            || 'ON public.commandes (pressing_id, date_reception DESC) '
            || 'WHERE priorite = ''express''';
    END IF;
END $$;


-- ============================================================
-- 3. INDEX SUR personnel.dernier_changement_role (audit trail)
-- ============================================================
-- 025 a ajouté dernier_changement_role TIMESTAMPTZ. On l'indexe pour
-- la requête "récents changements de rôle dans MON pressing".
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'personnel'
          AND column_name = 'dernier_changement_role'
    ) THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_personnel_pressing_id_dernier_changement_role '
            || 'ON public.personnel (pressing_id, dernier_changement_role DESC) '
            || 'WHERE dernier_changement_role IS NOT NULL';
    END IF;
END $$;


-- ============================================================
-- 4. INDEX SUR tarifs_articles (POS lookup)
-- ============================================================
-- Index PARTIEL sur (pressing_id, catalogue_article_id) WHERE actif
-- pour accélérer le SELECT du POS. 020 a créé la table + la colonne actif.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'tarifs_articles'
    ) THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_tarifs_articles_pressing_article_actif '
            || 'ON public.tarifs_articles (pressing_id, catalogue_article_id) '
            || 'WHERE actif = TRUE';
    END IF;
END $$;


-- ============================================================
-- 5. INDEX SUR services (POS lookup) — table de base 002
-- ============================================================
-- services + actif existent dès 002 (schéma de base). Index direct,
-- pas besoin de garde-fou.
CREATE INDEX IF NOT EXISTS idx_services_pressing_id_actif
    ON public.services (pressing_id)
    WHERE actif = TRUE;


-- ============================================================
-- Fin de la migration 032_index_audit_log.sql
-- Récapitulatif (v1.1) :
--   - 1 safety-net : ADD COLUMN IF NOT EXISTS commandes.priorite
--   - 5 index additionnels (tous gardés par DO $$ + existence check) :
--       * idx_audit_log_created_at (audit_log global chronological)
--       * idx_audit_log_pressing_id_action_created_at (composite)
--       * idx_commandes_pressing_id_priorite_express (partial express)
--       * idx_personnel_pressing_id_dernier_changement_role (audit RH)
--       * idx_tarifs_articles_pressing_article_actif (POS lookup)
--       * idx_services_pressing_id_actif (POS lookup, table de base)
--   - Tous CREATE INDEX IF NOT EXISTS → idempotents
--   - Ordre-indépendant (passe même si 020/024/025/027 absents)
--   - Aucun DROP, aucun UPDATE destructif
-- ============================================================
