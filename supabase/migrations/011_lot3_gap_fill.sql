-- ============================================================
-- e-pressing — Migration 011 : Gap-fill LOT 3 (Authentification)
-- ============================================================
-- Fichier    : 011_lot3_gap_fill.sql
-- Version    : 1.0
-- Date       : 24/07/2026
-- Description : Comble 2 écarts identifiés par l'audit LOT 3
--               (AUDIT_LOT3.md) :
--
--   SECTION 1 — Bug RLS persistant sur INSERT public demandes_inscription
--     Malgré les migrations 007 et 008, la policy demande_insert_public
--     n'est TOUJOURS PAS créée en base (test curl anon INSERT → 42501
--     "new row violates row-level security policy"). Cause probable :
--     mode autocommit du SQL Editor Supabase qui skip silencieusement
--     certains statements sur les batches longs. Cette section isole
--     chaque statement + ajoute une vérification post-exécution.
--
--   SECTION 2 — Colonne manquante personnel.mot_de_passe_temporaire
--     Le spec LOT 3 (prompt 3.2) exige que `personnel.mot_de_passe_temporaire`
--     (BOOLEAN) soit vérifié après login pour forcer le changement de
--     mot de passe à la première connexion. Le schema actuel n'a que
--     `mot_de_passe_temporaire_hash` (TEXT pour BCRYPT). On ajoute la
--     colonne BOOLEAN séparée pour respecter le spec sans casser
--     l'existant.
--
-- Prérequis :
--   - Migrations 001 → 010 exécutées ✅
--
-- Idempotent : DROP POLICY IF EXISTS + CREATE POLICY + ADD COLUMN IF NOT EXISTS
-- ============================================================


-- ============================================================
-- SECTION 1 — Policy RLS demande_insert_public (3e tentative robuste)
-- ============================================================
-- Tests en échec :
--   curl -X POST .../rest/v1/demandes_inscription (anon key)
--   Body: {"nom_gerant":"TEST","nom_pressing":"Test","telephone":"0700000000"}
--   → 42501 "new row violates row-level security policy"
--
-- Objectif : autoriser un prospect non authentifié (anon) à INSERER
-- une demande d'inscription via le formulaire de la landing page.
-- Aucune lecture publique — un anon ne peut pas lister les demandes
-- des autres prospects (deny by default sur SELECT).
-- ============================================================

-- 1.1. S'assurer que RLS est bien ENABLE sur la table
ALTER TABLE public.demandes_inscription ENABLE ROW LEVEL SECURITY;

-- 1.2. GRANT INSERT table-level à anon (nécessaire en plus de la policy RLS).
--      Sans ce GRANT, PostgreSQL rejette l'INSERT avant même d'évaluer RLS
--      ("permission denied for table" au lieu de "violates RLS policy").
GRANT INSERT ON public.demandes_inscription TO anon;

-- 1.3. Supprimer toute policy existante de même nom (idempotent).
DROP POLICY IF EXISTS "demande_insert_public" ON public.demandes_inscription;

-- 1.4. Créer la policy FOR INSERT pour anon.
--      WITH CHECK (true) → autorise tout INSERT venant d'anon (pas de filtre
--      sur les valeurs, puisque le prospect n'est pas encore authentifié).
CREATE POLICY "demande_insert_public"
    ON public.demandes_inscription
    FOR INSERT
    TO anon
    WITH CHECK (true);

-- 1.5. Commentaire pour audit futur.
COMMENT ON POLICY "demande_insert_public" ON public.demandes_inscription IS
    'Permet à un prospect non authentifié (anon) de soumettre une demande d''inscription via le formulaire de la landing page. Aucune lecture publique — un anon ne peut pas lister les demandes des autres prospects. Patch 011 (LOT 3 audit) : 3e tentative robuste après échec des migrations 007 et 008 (autocommit SQL Editor Supabase).';

-- 1.6. Vérification — la policy DOIT apparaître dans pg_policies.
--      (À exécuter manuellement dans le SQL Editor après application de 011
--       pour confirmer que la policy a bien été créée cette fois.)
-- SELECT policyname, cmd, roles, qual, with_check
--   FROM pg_policies
--  WHERE tablename = 'demandes_inscription' AND policyname = 'demande_insert_public';


-- ============================================================
-- SECTION 2 — Colonne personnel.mot_de_passe_temporaire (BOOLEAN)
-- ============================================================
-- Spec LOT 3 prompt 3.2 :
--   "Si personnel.mot_de_passe_temporaire = true, redirige après connexion
--    vers une page de changement de mot de passe obligatoire avant d'accéder
--    au dashboard"
--
-- État actuel : la colonne n'existe pas (seulement mot_de_passe_temporaire_hash
--               TEXT pour BCRYPT, qui sert à un autre usage — stocker le hash
--               d'un mot de passe temporaire généré par le manager pour un
--               employé créé sans email).
--
-- Cette section ajoute la colonne BOOLEAN simple, distincte du hash, pour
-- implémenter le flux spec : flag qui passe à true quand le compte est créé
-- avec un mot de passe temporaire (email invitation ou admin.createUser avec
-- mot de passe jetable), et qui passe à false après le premier changement
-- par l'utilisateur.
-- ============================================================

-- 2.1. Ajout de la colonne (idempotent).
ALTER TABLE public.personnel
    ADD COLUMN IF NOT EXISTS mot_de_passe_temporaire BOOLEAN NOT NULL DEFAULT FALSE;

-- 2.2. Commentaire pour audit futur.
COMMENT ON COLUMN public.personnel.mot_de_passe_temporaire IS
    'TRUE si le compte a été créé avec un mot de passe temporaire (invitation par email, ou création directe avec mdp jetable). Le middleware et la page de login forcent alors le changement de mot de passe avant accès au dashboard. Passe à FALSE après updateUser() côté auth + UPDATE côté personnel.';

-- 2.3. Index partiel pour optimiser le middleware (filtre WHERE true).
--      Le middleware check ce flag à chaque login → un index partiel accélère
--      la requête pour les comptes concernés (généralement < 5% du personnel).
CREATE INDEX IF NOT EXISTS idx_personnel_mot_de_passe_temporaire_true
    ON public.personnel (user_id)
    WHERE mot_de_passe_temporaire = TRUE;


-- ============================================================
-- Fin de la migration 011
-- Vérifications post-déploiement (à exécuter dans SQL Editor Supabase) :
--
-- 1. Policy demande_insert_public présente :
--    SELECT policyname, cmd, roles, with_check
--      FROM pg_policies
--     WHERE tablename = 'demandes_inscription';
--    → doit retourner 1 ligne avec policyname='demande_insert_public', cmd='INSERT', roles='{anon}', with_check='true'
--
-- 2. INSERT public fonctionne (depuis le navigateur ou curl avec clé anon) :
--    POST /rest/v1/demandes_inscription
--      Headers: apikey + Authorization (anon key)
--      Body: {"nom_gerant":"Test 011","nom_pressing":"Test","telephone":"0700000000"}
--      → HTTP 201 (au lieu de 42501)
--    DELETE /rest/v1/demandes_inscription?telephone=eq.0700000000 (avec service_role) pour nettoyer
--
-- 3. Colonne mot_de_passe_temporaire présente :
--    SELECT column_name, data_type, is_nullable, column_default
--      FROM information_schema.columns
--     WHERE table_name = 'personnel' AND column_name = 'mot_de_passe_temporaire';
--    → doit retourner 1 ligne avec data_type='boolean', is_nullable='NO', column_default='false'
-- ============================================================
