-- ============================================================
-- e-pressing — Migration 029 : Workflow transitions guard (AUDIT-B-08)
-- ============================================================
-- Fichier    : 029_workflow_transitions_guard.sql
-- Version    : 1.0
-- Description : Ajoute un TRIGGER DB-level qui bloque les transitions
--               de `commandes.statut` invalides (ex: 'livre' →
--               'en_traitement', 'annule' → 'recu').
--
-- Contexte (AUDIT-B-08) :
--   L'agent P4-D a implémenté la matrice de transitions côté TypeScript
--   (`src/lib/workflow/commande-statut.ts` → TRANSITIONS_COMMANDE_AUTORISEES)
--   et un guard côté API (`PATCH /api/admin/commandes/[id]` → 409
--   INVALID_TRANSITION).
--
--   La présente migration 029 ajoute une COUCHE DB (trigger BEFORE
--   UPDATE OF statut ON commandes) qui fait le même travail. C'est
--   une défense en profondeur : si un dev fait un UPDATE direct en
--   SQL (via SQL Editor Supabase ou un script de migration), le
--   trigger bloque la transition invalide en levant une exception
--   (check_violation).
--
-- Matrice de transitions (alignée sur P4-D — 9 statuts commande) :
--   recu          → en_traitement, lave, repasse, pret, en_livraison,
--                   livre, retire, annule
--   en_traitement → lave, repasse, pret, en_livraison, livre, retire,
--                   annule
--   lave          → repasse, pret, en_livraison, livre, retire, annule
--   repasse       → pret, en_livraison, livre, retire, annule
--   pret          → en_livraison, livre, retire
--   en_livraison  → livre, retire
--   livre         → [] (TERMINAL)
--   retire        → [] (TERMINAL)
--   annule        → [] (TERMINAL)
--
--   Note : 'paye' n'est PAS un statut_commande — c'est un
--   statut_paiement_commande (colonne `statut_paiement`). La matrice
--   ne couvre QUE les 9 valeurs de `statut_commande` (recu,
--   en_traitement, lave, repasse, pret, en_livraison, livre, retire,
--   annule — l'enum original + 'annule' ajouté par la migration 024).
--
-- Comportement :
--   - Déclencheur : BEFORE UPDATE OF statut ON commandes, FOR EACH ROW.
--   - Si NEW.statut IS DISTINCT FROM OLD.statut → on vérifie que la
--     transition est dans la matrice. Sinon RAISE EXCEPTION
--     (ERRCODE = 'check_violation') → l'UPDATE est annulé.
--   - No-op (NEW.statut = OLD.statut) → toujours autorisé.
--   - INSERT (nouvelle commande) → trigger ne se déclenche pas
--     (c'est BEFORE UPDATE, pas BEFORE INSERT).
--
-- Sécurité :
--   - Fonction SECURITY DEFINER (trigger s'exécute en tant que
--     propriétaire postgres — nécessaire pour les triggers BEFORE).
--   - SET search_path = public (durcissement anti-injection).
--   - La fonction n'est PAS callable via /rpc/ (RETURNS TRIGGER).
--   - Cast ::text sur les comparaisons d'enum (évite 22P02).
--
-- Idempotence :
--   - CREATE OR REPLACE FUNCTION (ré-exécutable).
--   - DROP TRIGGER IF EXISTS avant CREATE TRIGGER.
--   - COMMENT ON FUNCTION (écrase le commentaire précédent).
--
-- Prérequis :
--   - Migrations 001 (enums) + 002 (tables) exécutées.
--   - Migration 024 (enum 'annule' ajouté à statut_commande).
-- ============================================================


-- ============================================================
-- 1. Fonction trigger check_commande_statut_transition
-- ============================================================
CREATE OR REPLACE FUNCTION public.check_commande_statut_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    allowed_targets TEXT[];
BEGIN
    -- No-op : NEW.statut = OLD.statut → toujours autorisé (utile pour
    -- les PATCH qui ne changent pas le statut mais valident quand même).
    -- IS DISTINCT FROM gère correctement le cas NULL (ne devrait pas
    -- arriver car statut est NOT NULL, mais par sécurité).
    IF NEW.statut IS DISTINCT FROM OLD.statut THEN
        -- Matrice alignée sur src/lib/workflow/commande-statut.ts (P4-D).
        -- Cast ::text sur OLD.statut pour la comparaison CASE (sinon
        -- PostgreSQL peut lever 22P02 si le runtime ne peut pas inférer
        -- le type enum depuis une valeur paramétrée).
        allowed_targets := CASE OLD.statut::text
            WHEN 'recu' THEN ARRAY[
                'en_traitement', 'lave', 'repasse', 'pret',
                'en_livraison', 'livre', 'retire', 'annule'
            ]::text[]
            WHEN 'en_traitement' THEN ARRAY[
                'lave', 'repasse', 'pret',
                'en_livraison', 'livre', 'retire', 'annule'
            ]::text[]
            WHEN 'lave' THEN ARRAY[
                'repasse', 'pret', 'en_livraison',
                'livre', 'retire', 'annule'
            ]::text[]
            WHEN 'repasse' THEN ARRAY[
                'pret', 'en_livraison', 'livre', 'retire', 'annule'
            ]::text[]
            WHEN 'pret' THEN ARRAY[
                'en_livraison', 'livre', 'retire'
            ]::text[]
            WHEN 'en_livraison' THEN ARRAY['livre', 'retire']::text[]
            WHEN 'livre' THEN ARRAY[]::text[]    -- TERMINAL
            WHEN 'retire' THEN ARRAY[]::text[]   -- TERMINAL
            WHEN 'annule' THEN ARRAY[]::text[]   -- TERMINAL
            ELSE ARRAY[]::text[]  -- statut source inconnu → refus défensif
        END;

        -- Cast ::text sur NEW.statut pour la comparaison ANY()
        -- (même rationale que pour OLD.statut).
        IF NOT (NEW.statut::text = ANY(allowed_targets)) THEN
            RAISE EXCEPTION 'Transition de statut invalide: % → %',
                OLD.statut::text, NEW.statut::text
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.check_commande_statut_transition() IS
    'AUDIT-B-08: empêche les transitions de statut invalides sur commandes '
    '(defense-in-depth côté DB). Matrice alignée sur '
    'src/lib/workflow/commande-statut.ts (P4-D). Lève check_violation si '
    'la transition n''est pas dans la matrice. No-op (NEW.statut = OLD.statut) '
    'toujours autorisé.';


-- ============================================================
-- 2. Trigger trg_check_commande_statut_transition
-- ============================================================
DROP TRIGGER IF EXISTS trg_check_commande_statut_transition ON public.commandes;

CREATE TRIGGER trg_check_commande_statut_transition
    BEFORE UPDATE OF statut ON public.commandes
    FOR EACH ROW
    EXECUTE FUNCTION public.check_commande_statut_transition();


-- ============================================================
-- Fin de la migration 029_workflow_transitions_guard.sql
-- Récapitulatif :
--   - 1 fonction SECURITY DEFINER check_commande_statut_transition()
--   - 1 trigger BEFORE UPDATE OF statut sur commandes
--   - Matrice 9×9 alignée sur P4-D (TS-side)
--   - Aucun DROP TABLE / DROP COLUMN
--   - Idempotent (CREATE OR REPLACE + DROP TRIGGER IF EXISTS)
-- ============================================================
