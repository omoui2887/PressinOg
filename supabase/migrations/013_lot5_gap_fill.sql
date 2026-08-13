-- ============================================================
-- e-pressing — Migration 013 : Gap-fill LOT 5 (Dashboard Super Admin)
-- ============================================================
-- Fichier    : 013_lot5_gap_fill.sql
-- Version    : 1.0
-- Date       : 25/07/2026
-- Description : Comble l'écart identifié par l'audit LOT 5 entre le
--               spec (upload/05-dashboard-super-admin.md — prompt 5.2)
--               et le schéma actuel :
--
--   SECTION 1 — Colonne manquante demandes_inscription.notes_super_admin
--     Le spec LOT 5 prompt 5.2 exige, dans le panneau de détails d'une
--     demande (Sheet), un champ Textarea "Notes internes" dont le
--     contenu est sauvegardé dans `demandes_inscription.notes_super_admin`.
--     Cette colonne n'existe pas encore → on l'ajoute (TEXT, nullable).
--
-- Prérequis :
--   - Migrations 001 → 012 exécutées ✅
--
-- Idempotent : ADD COLUMN IF NOT EXISTS + COMMENT IS
-- ============================================================


-- ============================================================
-- SECTION 1 — Colonne demandes_inscription.notes_super_admin
-- ============================================================
-- Spec LOT 5 prompt 5.2 :
--   "Un champ Textarea 'Notes internes' (sauvegardé dans
--    demandes_inscription.notes_super_admin)"
--
-- Valeurs : TEXT libre, NULL si aucune note. Modifiable par le Super
-- Admin uniquement (RLS policy super_admin_full_access déjà en place
-- sur demandes_inscription via migration 006).
-- ============================================================

-- 1.1. Ajout de la colonne (idempotent).
ALTER TABLE public.demandes_inscription
    ADD COLUMN IF NOT EXISTS notes_super_admin TEXT;

-- 1.2. Commentaire pour audit futur.
COMMENT ON COLUMN public.demandes_inscription.notes_super_admin IS
    'Notes internes du Super Admin sur cette demande d''inscription (contexte, suivi commercial, etc.). NULL si aucune note. Renseigné via le panneau de détails de la page /super-admin/demandes. Migration 013 (LOT 5 audit).';


-- ============================================================
-- Fin de la migration 013
-- Vérifications post-déploiement (à exécuter dans SQL Editor Supabase) :
--
-- 1. Colonne présente :
--    SELECT column_name, data_type, is_nullable
--      FROM information_schema.columns
--     WHERE table_name = 'demandes_inscription'
--       AND column_name = 'notes_super_admin';
--    → doit retourner 1 ligne avec data_type='text', is_nullable='YES'
-- ============================================================
