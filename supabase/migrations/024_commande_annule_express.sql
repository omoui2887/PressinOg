-- ============================================================
-- e-pressing — Migration 024 : Annulation commande + express + idempotence
-- ============================================================
-- Fichier    : 024_commande_annule_express.sql
-- Version    : 1.0
-- Description : 3 correctifs Phase-1 sur le module commandes :
--               #5  — ajout de la valeur 'annule' à l'enum statut_commande
--                     pour permettre l'annulation d'une commande.
--               #2  — ajout de la colonne `priorite` (TEXT 'normal' ou
--                     'express') pour gérer la file d'attente express.
--               #15 — ajout de la colonne `idempotence_key` (TEXT) +
--                     index unique partiel sur (pressing_id, idempotence_key)
--                     pour rendre la création de commande idempotente.
-- ============================================================

-- ------------------------------------------------------------
-- #5 : Ajout de la valeur 'annule' à l'enum statut_commande
-- ------------------------------------------------------------
-- Permet d'annuler une commande (depuis l'API PATCH /commandes/[id]).
-- L'annulation n'est possible que pour les statuts 'recu' ou
-- 'en_traitement' (logique applicative côté API, pas en base).
ALTER TYPE public.statut_commande ADD VALUE IF NOT EXISTS 'annule';

-- ------------------------------------------------------------
-- #2 : Colonne priorite (TEXT 'normal' | 'express')
-- ------------------------------------------------------------
-- La valeur par défaut est 'normal' pour toutes les commandes existantes.
ALTER TABLE public.commandes ADD COLUMN IF NOT EXISTS priorite TEXT NOT NULL DEFAULT 'normal';

-- CHECK constraint : seules les valeurs 'normal' et 'express' sont autorisées.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'commandes_priorite_check') THEN
    ALTER TABLE public.commandes ADD CONSTRAINT commandes_priorite_check
      CHECK (priorite IN ('normal', 'express'));
  END IF;
END $$;

COMMENT ON COLUMN public.commandes.priorite IS 'Priorité de la commande: normal (défaut) ou express (traitement prioritaire)';

-- ------------------------------------------------------------
-- #15 : Idempotence pour la création de commande
-- ------------------------------------------------------------
-- Colonne optionnelle : si le client fournit une idempotence_key
-- (UUID généré côté client), on peut vérifier en O(1) si la commande
-- a déjà été créée pour ce (pressing_id, key) et ainsi éviter les
-- doublons en cas de retry réseau ou double-clic.
ALTER TABLE public.commandes ADD COLUMN IF NOT EXISTS idempotence_key TEXT;

-- Index unique PARTIEL : seules les lignes avec idempotence_key non NULL
-- sont indexées. Plusieurs commandes sans idempotence_key peuvent coexister
-- (NULL n'est pas considéré comme égal à NULL en SQL standard).
CREATE UNIQUE INDEX IF NOT EXISTS idx_commandes_idempotence
  ON public.commandes (pressing_id, idempotence_key)
  WHERE idempotence_key IS NOT NULL;

COMMENT ON COLUMN public.commandes.idempotence_key IS 'Clé d''idempotence fournie par le client pour éviter les doublons à la création (retry réseau, double-clic). NULL = pas d''idempotence.';
