-- ============================================================
-- OgPressing — Migration 028 : Cascade désactivation personnel (AUDIT-B-10)
-- ============================================================
-- Fichier    : 028_cascade_suspension_personnel.sql
-- Version    : 1.0
-- Description : Crée un TRIGGER DB-level qui désactive automatiquement
--               tout le personnel actif d'un pressing quand
--               `pressing.statut` passe à 'suspendu'.
--
-- Contexte (AUDIT-B-10) :
--   L'agent P4-D a implémenté la cascade côté API route
--   (`PATCH /api/super-admin/abonnements/[id]` action='suspendre')
--   → UPDATE `personnel` SET statut_compte='desactive', actif=false,
--     date_desactivation=NOW(), notes_changement_role=...
--     WHERE pressing_id=? AND statut_compte='actif'.
--
--   La présente migration 028 ajoute une COUCHE DB (trigger
--   AFTER UPDATE OF statut ON pressing) qui fait le même travail.
--   C'est une défense en profondeur : si un Super Admin modifie
--   directement `pressing.statut='suspendu'` via SQL Editor ou
--   si une autre route API le fait sans cascade, le trigger
--   garantit quand même la désactivation du personnel.
--
-- Comportement :
--   - Déclencheur : AFTER UPDATE OF statut ON pressing, FOR EACH ROW.
--   - Condition : NEW.statut::text = 'suspendu' AND OLD.statut::text <> 'suspendu'
--     (on ne déclenche PAS si on passe de suspendu à suspendu, ni
--      si on sort de suspendu — c'est l'activation/réactivation
--      qui ne réactive PAS le personnel automatiquement, cf. P4-D).
--   - Action : UPDATE personnel SET statut_compte='desactive',
--              actif=false, date_desactivation=NOW(),
--              notes_changement_role = COALESCE(..., '') || note
--              WHERE pressing_id = NEW.id AND statut_compte='actif'.
--
-- Sécurité :
--   - Fonction SECURITY DEFINER (nécessaire pour bypasser la RLS
--     sur `personnel` — le trigger s'exécute dans le contexte du
--     propriétaire postgres).
--   - SET search_path = public (durcissement anti-search_path
--     injection, recommandation Supabase).
--   - La fonction n'est PAS callable via /rpc/ (PostgREST n'expose
--     que les fonctions scalaires/table, pas RETURNS TRIGGER) →
--     pas de surface d'attaque.
--
-- Idempotence :
--   - CREATE OR REPLACE FUNCTION (ré-exécutable).
--   - DROP TRIGGER IF EXISTS avant CREATE TRIGGER.
--   - COMMENT ON FUNCTION (écrase le commentaire précédent).
--
-- Prérequis :
--   - Migrations 001 (enums) + 002 (tables) exécutées.
--   - Migration 025 (notes_changement_role column sur personnel).
-- ============================================================


-- ============================================================
-- 1. Fonction trigger cascade_desactivation_personnel
-- ============================================================
CREATE OR REPLACE FUNCTION public.cascade_desactivation_personnel()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- On n'agit QUE sur la transition (non-suspendu → suspendu).
    -- Cast ::text sur les comparaisons d'enum pour éviter 22P02
    -- "invalid input syntax for type enum" si le runtime ne peut
    -- pas inférer le type enum depuis une requête paramétrée.
    IF (NEW.statut::text = 'suspendu' AND OLD.statut::text <> 'suspendu') THEN
        UPDATE public.personnel
        SET statut_compte = 'desactive',
            actif = false,
            date_desactivation = NOW(),
            notes_changement_role = COALESCE(notes_changement_role, '') ||
                E'\n[Désactivé automatiquement par trigger - suspension pressing ' ||
                NEW.id::text || ' le ' || NOW()::text || E']'
        WHERE pressing_id = NEW.id
          AND statut_compte::text = 'actif';
    END IF;

    RETURN NEW;
END;
$$;

-- ⚠️  CORRECTIF : le COMMENT ON FUNCTION DOIT se terminer par un ';'
--     (le point-virgule manquant provoquait l'erreur 42601
--     "syntax error at or near DROP" au niveau du DROP TRIGGER
--     suivant — le parseur SQL ne voyait pas la fin du COMMENT).
COMMENT ON FUNCTION public.cascade_desactivation_personnel() IS
    'AUDIT-B-10: cascade désactivation personnel when pressing.statut becomes suspendu. '
    'Défense en profondeur côté DB (le complément de la cascade applicative côté API, agent P4-D).';


-- ============================================================
-- 2. Trigger trg_cascade_suspension_personnel
-- ============================================================
DROP TRIGGER IF EXISTS trg_cascade_suspension_personnel ON public.pressing;

CREATE TRIGGER trg_cascade_suspension_personnel
    AFTER UPDATE OF statut ON public.pressing
    FOR EACH ROW
    EXECUTE FUNCTION public.cascade_desactivation_personnel();


-- ============================================================
-- Fin de la migration 028_cascade_suspension_personnel.sql
-- Récapitulatif :
--   - 1 fonction SECURITY DEFINER cascade_desactivation_personnel()
--   - 1 trigger AFTER UPDATE OF statut sur pressing
--   - Aucun DROP TABLE / DROP COLUMN
--   - Idempotent (CREATE OR REPLACE + DROP TRIGGER IF EXISTS)
-- ============================================================
