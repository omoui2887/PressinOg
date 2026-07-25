-- ============================================================
-- OgPressing — Migration 012 : Gap-fill LOT 4 (Landing Page)
-- ============================================================
-- Fichier    : 012_lot4_gap_fill.sql
-- Version    : 1.0
-- Date       : 25/07/2026
-- Description : Comble 1 écart identifié par l'audit LOT 4
--               (AUDIT_LOT4.md) :
--
--   SECTION 1 — Colonne manquante demandes_inscription.plan_souhaite
--     Le spec LOT 4 prompt 4.2 exige un champ "Plan souhaité"
--     (dropdown : Starter, Pro, Business, "Je ne sais pas encore")
--     dans le formulaire d'inscription de la landing page.
--     La table demandes_inscription n'a pas de colonne correspondante.
--     On ajoute plan_souhaite TEXT (valeurs : starter|pro|business|indecis).
--
--   SECTION 2 — Vérification idempotente des colonnes 010
--     Re-applique ADD COLUMN IF NOT EXISTS sur nombre_machines et
--     nombre_employes (au cas où la migration 010 n'aurait pas été
--     appliquée par l'utilisateur — non bloquant).
--
-- Prérequis :
--   - Migrations 001 → 011 exécutées ✅
--   - Migration 010 (SECTION 1) recommandée mais non obligatoire
--     (SECTION 2 du présent fichier re-applique idempotent si besoin)
--
-- Idempotent : ADD COLUMN IF NOT EXISTS + CREATE INDEX IF NOT EXISTS
-- ============================================================


-- ============================================================
-- SECTION 1 — Colonne demandes_inscription.plan_souhaite
-- ============================================================
-- Spec LOT 4 prompt 4.2 :
--   "Plan souhaité (dropdown pré-rempli si l'utilisateur a cliqué sur
--    un plan spécifique depuis la section tarifs, sinon vide : Starter,
--    Pro, Business, 'Je ne sais pas encore')"
--
-- Valeurs attendues (TEXT plutôt que ENUM pour éviter une migration
-- de type supplémentaire — l'API route validera l'énumération) :
--   - 'starter'
--   - 'pro'
--   - 'business'
--   - 'indecis'   (correspond à "Je ne sais pas encore")
--   - NULL        (si l'utilisateur n'a rien sélectionné)
-- ============================================================

-- 1.1. Ajout de la colonne (idempotent).
ALTER TABLE public.demandes_inscription
    ADD COLUMN IF NOT EXISTS plan_souhaite TEXT;

-- 1.2. Commentaire pour audit futur.
COMMENT ON COLUMN public.demandes_inscription.plan_souhaite IS
    'Plan tarifaire souhaité par le prospect (starter | pro | business | indecis). NULL si non renseigné. Renseigné par le formulaire d''inscription de la landing page. Migration 012 (LOT 4 audit).';

-- 1.3. Index partiel pour faciliter le reporting Super Admin
--      (filtrer les demandes par plan souhaité).
CREATE INDEX IF NOT EXISTS idx_demandes_inscription_plan_souhaite
    ON public.demandes_inscription (plan_souhaite)
    WHERE plan_souhaite IS NOT NULL;


-- ============================================================
-- SECTION 2 — Vérification idempotente des colonnes 010
-- ============================================================
-- Si la migration 010 n'a pas été appliquée (ou partiellement),
-- ces 2 colonnes manquent. On les re-crée ici en idempotent pour
-- garantir que le formulaire d'inscription peut les remplir.
-- ============================================================

ALTER TABLE public.demandes_inscription
    ADD COLUMN IF NOT EXISTS nombre_machines INTEGER;

ALTER TABLE public.demandes_inscription
    ADD COLUMN IF NOT EXISTS nombre_employes INTEGER;

COMMENT ON COLUMN public.demandes_inscription.nombre_machines IS
    'Nombre de machines du pressing prospect (renseigné par le prospect dans le formulaire d''inscription). NULL si non renseigné.';

COMMENT ON COLUMN public.demandes_inscription.nombre_employes IS
    'Nombre d''employés du pressing prospect. NULL si non renseigné.';


-- ============================================================
-- Fin de la migration 012
-- Vérifications post-déploiement (à exécuter dans SQL Editor Supabase) :
--
-- 1. Colonnes présentes :
--    SELECT column_name, data_type
--      FROM information_schema.columns
--     WHERE table_name = 'demandes_inscription'
--       AND column_name IN ('plan_souhaite', 'nombre_machines', 'nombre_employes');
--    → doit retourner 3 lignes (text, integer, integer)
--
-- 2. INSERT de test (à nettoyer ensuite) :
--    INSERT INTO demandes_inscription
--      (nom_gerant, nom_pressing, telephone, email, ville, commune,
--       nombre_machines, nombre_employes, plan_souhaite)
--    VALUES
--      ('Test 012', 'Pressing Test', '0700000000', 'test@012.com',
--       'Abidjan', 'Cocody', 3, 2, 'pro');
--    DELETE FROM demandes_inscription WHERE email = 'test@012.com';
-- ============================================================
