-- ============================================================
-- e-pressing — Migration 030 : Modes paiement caissier (Phase 4 #13)
-- ============================================================
-- Fichier    : 030_modes_paiement_caissier.sql
-- Version    : 1.0
-- Description : Ajoute la colonne `numero_caisse` à la table
--               `public.personnel` et pose deux CHECK constraints
--               défense-en-profondeur pour garantir que les champs
--               spécifiques caissier (`numero_caisse` et
--               `modes_paiement_autorises`) ne sont pas renseignés
--               pour les autres rôles.
--
-- Contexte (Phase 4 #13 — champs caissier) :
--   La migration 019_champs_caissier.sql a déjà ajouté :
--     - modes_paiement_autorises JSONB NOT NULL DEFAULT '["especes",...]'
--     - nom_affiche_recu TEXT
--     - seuil_alerte_impaye INTEGER NOT NULL DEFAULT 5000
--
--   ⚠️  La colonne `numero_caisse` n'existait PAS — non créée par
--   la migration 019, ni aucune autre. C'était un manque documenté
--   par l'agent P4-D dans le worklog (ligne ~1296).
--
--   Le CHECK constraint sur `modes_paiement_autorises` n'était pas
--   posé non plus (la migration 019 a posé un CHECK sur le FORMAT
--   JSON mais pas sur le ROLE). On l'ajoute ici.
--
--   Note : `modes_paiement_autorises` est NOT NULL DEFAULT '...' en
--   base (019). Le CHECK `modes_paiement_autorises IS NULL OR ...`
--   ne sera donc jamais NULL en pratique pour les lignes existantes,
--   mais il protège contre un futur ALTER qui retirerait le NOT NULL.
--   Pour les rôles non-caissier, on ne peut pas mettre NULL (NOT NULL),
--   mais on peut mettre un array à 1 élément fantôme — le CHECK
--   sur le rôle force donc à ne pas utiliser la valeur. L'applicatif
--   (P4-D) ignore déjà modes_paiement_autorises pour les non-caissiers.
--
-- Schéma :
--   ALTER TABLE public.personnel
--     ADD COLUMN IF NOT EXISTS numero_caisse TEXT;
--
--   CHECK check_numero_caisse_caissier_only:
--     numero_caisse IS NULL OR role::text = 'caissier'
--
--   CHECK check_modes_paiement_caissier_only:
--     -- Si la colonne perd son NOT NULL à l'avenir, ce CHECK force
--     -- à ce qu'un non-caissier n'ait pas de modes_paiement_autorises.
--     modes_paiement_autorises IS NULL OR role::text = 'caissier'
--
-- IDEMPOTENT :
--   - ADD COLUMN IF NOT EXISTS
--   - DO $$ vérifiant pg_constraint avant ADD CONSTRAINT
--   - COMMENT ON COLUMN (écrase le commentaire précédent)
--
-- Prérequis :
--   - Migrations 001 (enums) + 002 (tables) exécutées.
--   - Migration 019 (modes_paiement_autorises + autres champs caissier).
-- ============================================================


-- ============================================================
-- 1. AJOUT DE LA COLONNE numero_caisse
-- ============================================================
ALTER TABLE public.personnel
    ADD COLUMN IF NOT EXISTS numero_caisse TEXT;

COMMENT ON COLUMN public.personnel.numero_caisse IS
    'Phase 4 #13: numéro de caisse assigné au caissier (ex: "Caisse 1"). '
    'NULL pour les autres rôles. CHECK : numero_caisse IS NULL OR role = ''caissier''.';


-- ============================================================
-- 2. CHECK : numero_caisse réservé aux caissiers
-- ============================================================
-- Empêche qu'un non-caissier (manager, receptionniste, etc.) ait un
-- numero_caisse renseigné. Cast ::text sur role::text pour la
-- comparaison (évite 22P02 sur enum paramétré).
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'check_numero_caisse_caissier_only'
    ) THEN
        ALTER TABLE public.personnel
            ADD CONSTRAINT check_numero_caisse_caissier_only
            CHECK (numero_caisse IS NULL OR role::text = 'caissier');
    END IF;
END $$;


-- ============================================================
-- 3. CHECK : modes_paiement_autorises réservé aux caissiers
-- ============================================================
-- Defense-in-depth : même si la colonne est NOT NULL DEFAULT (019),
-- ce CHECK garantit que SI la colonne devient NULLABLE à l'avenir,
-- un non-caissier ne peut pas avoir de modes_paiement_autorises
-- personnalisés (NULL = "pas de restriction spécifique" pour
-- non-caissier). L'applicatif (P4-D, route /api/personnel/caissier/
-- encaisser) ignore déjà cette colonne pour les non-caissiers.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'check_modes_paiement_caissier_only'
    ) THEN
        ALTER TABLE public.personnel
            ADD CONSTRAINT check_modes_paiement_caissier_only
            CHECK (modes_paiement_autorises IS NULL OR role::text = 'caissier');
    END IF;
END $$;


-- ============================================================
-- 4. BACKFILL : NULL sur numero_caisse pour les non-caissiers
-- ============================================================
-- Si des lignes ont été créées avant ce CHECK avec un numero_caisse
-- non-NULL sur un non-caissier (très peu probable, mais par
-- défense), on remet à NULL.
UPDATE public.personnel
SET numero_caisse = NULL
WHERE numero_caisse IS NOT NULL
  AND role::text <> 'caissier';


-- ============================================================
-- Fin de la migration 030_modes_paiement_caissier.sql
-- Récapitulatif :
--   - 1 colonne ajoutée : personnel.numero_caisse TEXT
--   - 2 CHECK constraints :
--       * check_numero_caisse_caissier_only
--       * check_modes_paiement_caissier_only
--   - 1 backfill UPDATE (NULL sur numero_caisse pour non-caissiers)
--   - 1 COMMENT ON COLUMN
--   - Idempotent (ADD COLUMN IF NOT EXISTS, DO $$ + pg_constraint)
-- ============================================================
