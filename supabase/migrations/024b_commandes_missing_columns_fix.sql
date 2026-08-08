-- ============================================================
-- OgPressing — Migration 024b : Correctif colonnes manquantes commandes
-- ============================================================
-- Fichier    : 024b_commandes_missing_columns_fix.sql
-- Version    : 1.0
-- Description : Applique les parties de la migration 024 qui n'ont pas
--               été exécutées sur la base de production. Diagnostiqué
--               via l'erreur PGRST204 "Could not find the 'idempotence_key'
--               column of 'commandes' in the schema cache" lors de la
--               création d'une commande (POST /api/admin/commandes).
--
-- Contexte :
--   La migration 024 (024_commande_annule_express.sql) contient 3 parties :
--     #5  — ALTER TYPE statut_commande ADD VALUE 'annule'
--     #2  — ALTER TABLE commandes ADD COLUMN priorite TEXT
--     #15 — ALTER TABLE commandes ADD COLUMN idempotence_key TEXT + index
--
--   Lors du run précédent, 024 n'est pas passée complètement (probablement
--   l'ALTER TYPE qui a échoué dans une transaction, empêchant la suite).
--   La migration 032 a ajouté un safety-net pour `priorite` (ADD COLUMN
--   IF NOT EXISTS) → priorite existe. Mais `idempotence_key` et la valeur
--   'annule' de l'enum manquent toujours.
--
--   Cette migration 024b applique ces 2 éléments manquants de façon
--   idempotente, indépendamment de l'état de 024.
--
-- ⚠️  L'ALTER TYPE ... ADD VALUE ne peut PAS être exécuté dans une
--     transaction (PostgreSQL limitation). Chaque statement doit être
--     exécuté séparément dans le SQL Editor (ou la migration doit être
--     lancée avec autocommit).
--
-- Idempotence :
--   - ADD VALUE IF NOT EXISTS (no-op si 'annule' existe déjà)
--   - ADD COLUMN IF NOT EXISTS (no-op si idempotence_key existe)
--   - CREATE UNIQUE INDEX IF NOT EXISTS
-- ============================================================


-- ============================================================
-- 1. Ajout de la valeur 'annule' à l'enum statut_commande
-- ============================================================
-- Permet d'annuler une commande (depuis PATCH /api/admin/commandes/[id]).
-- ⚠️  Ne pas wrapper dans une transaction — ADD VALUE doit être autocommit.
ALTER TYPE public.statut_commande ADD VALUE IF NOT EXISTS 'annule';


-- ============================================================
-- 2. Colonne idempotence_key (#15)
-- ============================================================
-- Colonne optionnelle : si le client fournit une idempotence_key
-- (UUID généré côté client), on peut vérifier en O(1) si la commande
-- a déjà été créée pour ce (pressing_id, key) et ainsi éviter les
-- doublons en cas de retry réseau ou double-clic.
ALTER TABLE public.commandes
    ADD COLUMN IF NOT EXISTS idempotence_key TEXT;


-- ============================================================
-- 3. Index unique PARTIEL pour l'idempotence
-- ============================================================
-- Seules les lignes avec idempotence_key non NULL sont indexées.
-- Plusieurs commandes sans idempotence_key peuvent coexister
-- (NULL n'est pas considéré comme égal à NULL en SQL standard).
CREATE UNIQUE INDEX IF NOT EXISTS idx_commandes_idempotence
    ON public.commandes (pressing_id, idempotence_key)
    WHERE idempotence_key IS NOT NULL;


-- ============================================================
-- 4. Commentaire
-- ============================================================
COMMENT ON COLUMN public.commandes.idempotence_key IS
    'Clé d''idempotence fournie par le client pour éviter les doublons à la création (retry réseau, double-clic). NULL = pas d''idempotence.';


-- ============================================================
-- Fin de la migration 024b_commandes_missing_columns_fix.sql
-- Récapitulatif :
--   - 1 valeur d'enum ajoutée : statut_commande 'annule'
--   - 1 colonne ajoutée : commandes.idempotence_key TEXT
--   - 1 index unique partiel : idx_commandes_idempotence
--   - 1 COMMENT ON COLUMN
--   - Idempotent (ADD VALUE IF NOT EXISTS, ADD COLUMN IF NOT EXISTS,
--     CREATE INDEX IF NOT EXISTS)
-- ============================================================
