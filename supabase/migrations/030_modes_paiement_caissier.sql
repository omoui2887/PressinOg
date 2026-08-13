-- ============================================================
-- e-pressing — Migration 030 : Modes paiement caissier (Phase 4 #13)
-- ============================================================
-- Fichier    : 030_modes_paiement_caissier.sql
-- Version    : 1.2  (correctif — voir sections CORRECTIF ci-dessous)
-- Description : Ajoute la colonne `numero_caisse` à la table
--               `public.personnel` et pose deux CHECK constraints
--               défense-en-profondeur pour garantir que les champs
--               spécifiques caissier (`numero_caisse` et
--               `modes_paiement_autorises`) ne sont pas renseignés
--               pour les autres rôles.
--
-- ============================================================
-- ⚠️  CORRECTIF v1.1 — erreur 23514 au run précédent
-- ============================================================
-- Le run précédent échouait avec :
--   ERROR 23514: check constraint "check_modes_paiement_caissier_only"
--   of relation "personnel" is violated by some row
--
-- Cause racine :
--   La migration 019 a créé `modes_paiement_autorises` en
--   NOT NULL DEFAULT '["especes","mobile_money","carte","cheque",
--   "virement"]'::jsonb — donc TOUTES les lignes existantes (y compris
--   les non-caissiers : manager, receptionniste, etc.) ont une valeur
--   NON-NULL. Le CHECK voulu `modes_paiement_autorises IS NULL OR
--   role='caissier'` était donc violé par chaque non-caissier.
--
--   En outre, 019 avait posé un CHECK de FORMAT
--   (`personnel_modes_paiement_autorises_check`) qui exigeait
--   `jsonb_typeof(...)='array' AND jsonb_array_length(...)>0` —
--   incompatible avec une valeur NULL pour les non-caissiers.
--
-- Correctif appliqué (ordre IMPORTANT) :
--   1. DROP CONSTRAINT personnel_modes_paiement_autorises_check (019)
--   2. ALTER COLUMN modes_paiement_autorises DROP NOT NULL
--   3. ALTER COLUMN modes_paiement_autorises SET DEFAULT NULL
--      (les futurs INSERT de non-caissiers hériteront de NULL ;
--       l'applicatif P4-D fournit toujours la liste pour les caissiers)
--   4. Backfill : non-caissiers → NULL, caissiers → liste par défaut
--      si NULL ou array vide
--   5. Re-création d'un CHECK de FORMAT RELÂCHÉ (accepte NULL pour
--      les non-caissiers ; valide le format seulement si non-NULL)
--   6. CHECK check_numero_caisse_caissier_only (déjà OK — numero_caisse
--      est NULLABLE)
--   7. CHECK check_modes_paiement_caissier_only (passe maintenant car
--      les non-caissiers ont NULL)
--
-- Idempotence :
--   - ADD COLUMN IF NOT EXISTS
--   - DROP CONSTRAINT IF EXISTS (ré-exécutable)
--   - ALTER COLUMN ... DROP NOT NULL / SET DEFAULT (sans erreur si déjà fait)
--   - DO $$ + pg_constraint avant ADD CONSTRAINT
--   - UPDATE ... WHERE (ré-exécutable)
-- ============================================================


-- ============================================================
-- 0. NETTOYAGE PRÉALABLE du CHECK de FORMAT 019 (conflit NULL)
-- ============================================================
-- Le CHECK 019 exigeait modes_paiement_autorises NON-NULL et array
-- non-vide. Il entre en conflit avec notre objectif (NULL pour les
-- non-caissiers). On le supprime ; on le recrée plus loin en version
-- relâchée (accepte NULL).
ALTER TABLE public.personnel
    DROP CONSTRAINT IF EXISTS personnel_modes_paiement_autorises_check;


-- ============================================================
-- 1. AJOUT DE LA COLONNE numero_caisse
-- ============================================================
ALTER TABLE public.personnel
    ADD COLUMN IF NOT EXISTS numero_caisse TEXT;

COMMENT ON COLUMN public.personnel.numero_caisse IS
    'Phase 4 #13: numéro de caisse assigné au caissier (ex: "Caisse 1"). '
    'NULL pour les autres rôles. CHECK : numero_caisse IS NULL OR role = ''caissier''.';


-- ============================================================
-- 2. RENDRE modes_paiement_autorises NULLABLE + DEFAULT NULL
-- ============================================================
-- Permet aux non-caissiers d'avoir NULL (au lieu du DEFAULT array
-- hérité de 019). Les caissiers conservent une valeur (fournie par
-- l'applicatif P4-D ou par le backfill ci-dessous).
ALTER TABLE public.personnel
    ALTER COLUMN modes_paiement_autorises DROP NOT NULL;

ALTER TABLE public.personnel
    ALTER COLUMN modes_paiement_autorises SET DEFAULT NULL;


-- ============================================================
-- 3. BACKFILL des données existantes
-- ============================================================
-- 3a. Non-caissiers → NULL (machines à laver, repasseurs, managers...)
--     Ce sont ces lignes qui violaient le CHECK 23514.
UPDATE public.personnel
SET modes_paiement_autorises = NULL
WHERE role::text <> 'caissier';

-- 3b. Caissiers → liste par défaut si NULL ou array vide (garde-fou).
UPDATE public.personnel
SET modes_paiement_autorises = '["especes","mobile_money","carte","cheque","virement"]'::jsonb
WHERE role::text = 'caissier'
  AND (modes_paiement_autorises IS NULL
       OR jsonb_array_length(modes_paiement_autorises) = 0);

-- 3c. numero_caisse → NULL pour les non-caissiers (défense).
UPDATE public.personnel
SET numero_caisse = NULL
WHERE numero_caisse IS NOT NULL
  AND role::text <> 'caissier';


-- ============================================================
-- 4. CHECK de FORMAT RELÂCHÉ sur modes_paiement_autorises
-- ============================================================
-- ⚠️  CORRECTIF v1.2 — erreur 0A000 au run précédent
--   PostgreSQL INTERDIT les sous-requêtes dans les CHECK constraints
--   (erreur 0A000 "cannot use subquery in check constraint"). La
--   version précédente utilisait `NOT EXISTS (SELECT 1 FROM
--   jsonb_array_elements_text(...))` → rejeté par PostgreSQL.
--   La migration 019 originale avait le même bug (jamais réussi à
--   poser ce CHECK).
--
--   Solution : utiliser l'opérateur JSONB `<@` (contained by) qui
--   vérifie que TOUS les éléments du tableau de gauche sont présents
--   dans le tableau de droite. C'est une expression pure (pas de
--   sous-requête), acceptée par PostgreSQL dans un CHECK.
--
--   Exemple :
--     '["especes","carte"]'::jsonb <@ '["especes","mobile_money",
--     "carte","cheque","virement"]'::jsonb  → TRUE
--     '["especes","bitcoin"]'::jsonb <@ '["especes",...]'::jsonb   → FALSE
--
-- Version relâchée du CHECK 019 : accepte NULL (pour les non-caissiers)
-- et valide le format (array non-vide + tous éléments dans l'enum
-- valide) seulement si la valeur est non-NULL.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'personnel_modes_paiement_autorises_check'
    ) THEN
        ALTER TABLE public.personnel
            ADD CONSTRAINT personnel_modes_paiement_autorises_check
            CHECK (
                modes_paiement_autorises IS NULL
                OR (
                    jsonb_typeof(modes_paiement_autorises) = 'array'
                    AND jsonb_array_length(modes_paiement_autorises) > 0
                    AND modes_paiement_autorises <@ '["especes","mobile_money","carte","cheque","virement"]'::jsonb
                )
            );
    END IF;
END $$;


-- ============================================================
-- 5. CHECK : numero_caisse réservé aux caissiers
-- ============================================================
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
-- 6. CHECK : modes_paiement_autorises réservé aux caissiers
-- ============================================================
-- Passe désormais car les non-caissiers ont été backfillés à NULL.
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
-- Fin de la migration 030_modes_paiement_caissier.sql
-- Récapitulatif (v1.2) :
--   - 1 colonne ajoutée : personnel.numero_caisse TEXT
--   - 1 colonne modifiée : modes_paiement_autorises → NULLABLE, DEFAULT NULL
--   - 1 CHECK supprimé puis recréé en version relâchée SANS sous-requête :
--       * personnel_modes_paiement_autorises_check (accepte NULL,
--         valide format + éléments via opérateur JSONB `<@`)
--   - 2 CHECK constraints role-based :
--       * check_numero_caisse_caissier_only
--       * check_modes_paiement_caissier_only
--   - 3 backfills UPDATE (non-caissiers → NULL, caissiers → défaut)
--   - 1 COMMENT ON COLUMN
--   - Idempotent (DROP IF EXISTS, ADD COLUMN IF NOT EXISTS,
--     DO $$ + pg_constraint, ALTER COLUMN ré-exécutable)
-- ============================================================
