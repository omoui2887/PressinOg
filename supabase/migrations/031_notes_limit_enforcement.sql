-- ============================================================
-- OgPressing — Migration 031 : Notes length limit (Phase 4 #19)
-- ============================================================
-- Fichier    : 031_notes_limit_enforcement.sql
-- Version    : 1.0
-- Description : Ajoute un CHECK constraint `check_notes_max_length`
--               sur toutes les tables qui ont une colonne `notes`
--               TEXT, limitant la longueur à 2000 caractères.
--
-- Contexte (Phase 4 #19 — notes slice) :
--   L'agent P4-C a ajouté `.max(2000)` sur les schémas Zod :
--     - createCommandeSchema.notes
--     - patchCommandeSchema.notes
--     - createClientSchema.notes
--     - patchClientSchema.notes
--
--   Un client envoyant `notes > 2000` reçoit maintenant un 400
--   `Données invalides` au lieu de stocker silencieusement le blob
--   illimité.
--
--   La présente migration 031 ajoute une COUCHE DB (CHECK constraint)
--   qui empêche tout UPDATE/INSERT direct en SQL (via SQL Editor ou
--   script) de stocker un `notes` > 2000 caractères. C'est une
--   défense en profondeur : si un dev oublie le `.max(2000)` Zod
--   sur une nouvelle route, ou si un script de migration insère
--   directement en SQL, le CHECK bloque.
--
-- Tables cibles (celles qui ont une colonne `notes` TEXT exact) :
--   - public.commandes.notes       TEXT  (002 §9)
--   - public.clients.notes         TEXT  (002 §7)
--   - public.paiements.notes       TEXT  (002 §12)
--   - public.machines.notes        TEXT  (002 §15)
--
--   (personnel.notes_changement_role et demandes_inscription.
--    notes_traitement sont des colonnes DIFFÉRENTES — non ciblées
--    ici car elles ne sont pas exposées via les schémas Zod P4-C.
--    On reste focalisé sur `notes` exact.)
--
-- Contrainte :
--   CHECK (notes IS NULL OR length(notes) <= 2000)
--
--   Note : `length()` compte en caractères (UTF-8 safe) et non en
--   octets — important pour les accents et emojis (les notes
--   peuvent contenir de l'UTF-8). Pour PostgreSQL, `length(text)`
--   retourne le nombre de caractères (et `octet_length(text)` le
--   nombre d'octets).
--
-- IDEMPOTENT :
--   - DO $$ itère sur les tables cibles.
--   - Vérifie information_schema.columns pour ne pas échouer si une
--     table n'existe pas (au cas où la migration est jouée sur une
--     DB partielle).
--   - DROP CONSTRAINT IF EXISTS avant ADD CONSTRAINT (gère le re-jeu
--     après ajout de la constrainte).
--
-- Prérequis :
--   - Migrations 001 (enums) + 002 (tables) exécutées.
-- ============================================================


-- ============================================================
-- 1. CHECK constraint sur toutes les tables ayant `notes`
-- ============================================================
DO $$
DECLARE
    t TEXT;
    tables_with_notes TEXT[] := ARRAY['commandes', 'clients', 'paiements', 'machines'];
BEGIN
    FOREACH t IN ARRAY tables_with_notes LOOP
        -- Vérifie que la table existe ET a une colonne `notes`
        IF EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = t
              AND column_name = 'notes'
        ) THEN
            EXECUTE format(
                'ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS check_notes_max_length;'
                'ALTER TABLE public.%I ADD CONSTRAINT check_notes_max_length '
                'CHECK (notes IS NULL OR length(notes) <= 2000);',
                t, t
            );
        END IF;
    END LOOP;
END $$;


-- ============================================================
-- 2. Commentaires de migration (documentation)
-- ============================================================
-- Les COMMENT ON COLUMN sont idempotents (écrasent le commentaire
-- précédent s'il existe). On documente la contrainte sur chaque
-- colonne notes.

COMMENT ON COLUMN public.commandes.notes IS
    'Notes libres sur la commande (instructions client, anomalies...). '
    'Phase 4 #19: limité à 2000 caractères (CHECK check_notes_max_length).';

COMMENT ON COLUMN public.clients.notes IS
    'Notes libres sur le client (préférences, historique...). '
    'Phase 4 #19: limité à 2000 caractères (CHECK check_notes_max_length).';

COMMENT ON COLUMN public.paiements.notes IS
    'Notes libres sur le paiement (référence, contexte...). '
    'Phase 4 #19: limité à 2000 caractères (CHECK check_notes_max_length).';

COMMENT ON COLUMN public.machines.notes IS
    'Notes libres sur la machine (état, observations...). '
    'Phase 4 #19: limité à 2000 caractères (CHECK check_notes_max_length).';


-- ============================================================
-- Fin de la migration 031_notes_limit_enforcement.sql
-- Récapitulatif :
--   - 1 DO $$ block itérant sur 4 tables (commandes, clients,
--     paiements, machines)
--   - Pour chaque table : DROP + ADD CHECK constraint
--     check_notes_max_length (notes ≤ 2000 chars)
--   - 4 COMMENT ON COLUMN (documentation)
--   - Idempotent (DROP CONSTRAINT IF EXISTS + information_schema check)
-- ============================================================
