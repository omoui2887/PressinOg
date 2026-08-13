-- ============================================================
-- e-pressing — Migration 008 : Correctif robuste policy demande_insert_public
-- ============================================================
-- Fichier    : 008_correctif_policy_demande.sql
-- Version    : 1.0
-- Date       : 24/07/2026
-- Description : Correctif post-007 — la policy demande_insert_public
--               n'a pas été créée lors du run 007 (bug autocommit du
--               SQL Editor Supabase, même symptôme qu'en 006).
--               Ce patch isole chaque statement pour garantir l'exécution.
--
-- Symptôme :
--   anon INSERT INTO demandes_inscription → HTTP 42501
--   "new row violates row-level security policy for table demandes_inscription"
--   (prouve que GRANT INSERT est OK mais la policy FOR INSERT est absente)
--
-- Prérequis :
--   - Migrations 001 → 007 exécutées ✅
--
-- Idempotent : DROP POLICY IF EXISTS + CREATE POLICY (no-op si déjà).
-- ============================================================


-- 1. S'assurer que RLS est bien activée sur la table (au cas où).
ALTER TABLE public.demandes_inscription ENABLE ROW LEVEL SECURITY;

-- 2. GRANT INSERT table-level à anon (déjà fait en 007, re-affirmé).
GRANT INSERT ON public.demandes_inscription TO anon;

-- 3. Supprimer toute policy existante de même nom (idempotent).
DROP POLICY IF EXISTS "demande_insert_public" ON public.demandes_inscription;

-- 4. Créer la policy FOR INSERT pour anon.
--    WITH CHECK (true) → autorise tout INSERT venant d'anon (pas de filtre
--    sur les valeurs, puisque le prospect n'est pas encore authentifié).
CREATE POLICY "demande_insert_public"
    ON public.demandes_inscription
    FOR INSERT
    TO anon
    WITH CHECK (true);

-- 5. Commentaire pour audit futur.
COMMENT ON POLICY "demande_insert_public" ON public.demandes_inscription IS
    'Permet à un prospect non authentifié (anon) de soumettre une demande d''inscription via le formulaire de la landing page. Aucune lecture publique — un anon ne peut pas lister les demandes des autres prospects.';


-- ============================================================
-- Fin de la migration 008
-- Vérification post-déploiement (depuis le navigateur ou curl avec la clé anon) :
--   POST /rest/v1/demandes_inscription
--     Headers: apikey + Authorization (anon key)
--     Body: {"nom_gerant":"Test","nom_pressing":"Test Pressing","telephone":"0700000000"}
--     → HTTP 201 ✅ (au lieu de 42501)
-- ============================================================
