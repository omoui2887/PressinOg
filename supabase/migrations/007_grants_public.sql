-- ============================================================
-- OgPressing — Migration 007 : GRANTs & policies publics (patch 006)
-- ============================================================
-- Fichier    : 007_grants_public.sql
-- Version    : 1.0
-- Date       : 24/07/2026
-- Description : Correctif post-006 — s'assure que le funnel public
--               d'acquisition fonctionne :
--                 1. anon peut INSERER une demande d'inscription
--                    (formulaire de la landing page)
--                 2. anon peut LIRE (code, utilise) dans codes_activation
--                    (page de vérification d'un code d'activation)
--
-- Contexte : après application de 006, un test comportemental a révélé
--            que l'INSERT public sur demandes_inscription échouait avec
--            "42501: new row violates row-level security policy". Les
--            autres policies (isolation tenant, SELECT codes) fonctionnent.
--            Cause probable : la policy demande_insert_public n'a pas été
--            créée lors du run 006 (mode autocommit du SQL Editor →
--            exécution partielle possible). Ce patch recrée la policy
--            manquante + ajoute les GRANT table-level explicites (au cas
--            où Supabase ne les aurait pas auto-appliqués sur les tables
--            créées via SQL brut en 002).
--
-- Prérequis :
--   - Migrations 001 → 006 exécutées ✅
--
-- Idempotent : DROP POLICY IF EXISTS + CREATE POLICY + GRANT (no-op si déjà).
-- ============================================================


-- ============================================================
-- SECTION 1 : demandes_inscription — INSERT public (anon)
-- ============================================================
-- Le formulaire de la landing page (prospect non authentifié) doit
-- pouvoir créer une demande d'inscription. Aucune lecture/modification
-- publique : un anon ne peut pas lister les demandes des autres.
-- ============================================================

-- 1.1. GRANT table-level INSERT à anon (nécessaire en plus de la policy RLS).
--      Sans ce GRANT, PostgreSQL rejette l'INSERT avant même d'évaluer RLS.
GRANT INSERT ON public.demandes_inscription TO anon;

-- 1.2. Recréer la policy RLS (idempotent).
--      FOR INSERT TO anon WITH CHECK (true) → autorise tout INSERT venant d'anon.
DROP POLICY IF EXISTS "demande_insert_public" ON public.demandes_inscription;
CREATE POLICY "demande_insert_public" ON public.demandes_inscription
    FOR INSERT
    TO anon
    WITH CHECK (true);


-- ============================================================
-- SECTION 2 : codes_activation — SELECT public (anon, colonnes limitées)
-- ============================================================
-- La page d'activation vérifie la validité d'un code saisi. anon doit
-- pouvoir lire UNIQUEMENT les colonnes "code" et "utilise" (pas les
-- colonnes sensibles comme pressing_id_cible, date_expiration, etc.).
-- ============================================================

-- 2.1. GRANT column-level SELECT (déjà fait en 006, re-affirmé ici).
REVOKE SELECT ON public.codes_activation FROM anon;
GRANT SELECT (code, utilise) ON public.codes_activation TO anon;

-- 2.2. Recréer la policy RLS SELECT pour anon (idempotent).
DROP POLICY IF EXISTS "code_read_public" ON public.codes_activation;
CREATE POLICY "code_read_public" ON public.codes_activation
    FOR SELECT
    TO anon
    USING (true);


-- ============================================================
-- Fin de la migration 007_grants_public.sql
-- Vérification post-déploiement (depuis le navigateur avec la clé anon) :
--   POST /rest/v1/demandes_inscription
--     Body: {"nom_gerant":"X","nom_pressing":"Y","telephone":"0700000000"}
--     → HTTP 201 ✅
--   GET /rest/v1/codes_activation?select=code,utilise&limit=1
--     → HTTP 200 ✅
--   GET /rest/v1/codes_activation?select=pressing_id_cible&limit=1
--     → HTTP 42501 "permission denied" ✅ (column-level enforced)
-- ============================================================
