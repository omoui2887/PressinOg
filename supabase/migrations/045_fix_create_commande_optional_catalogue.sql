-- ============================================================
-- Migration 045 : Fix RPC create_commande_atomic + nullable catalogue_article_id
-- ------------------------------------------------------------
-- BUG : La RPC create_commande_atomic exigeait catalogue_article_id
-- obligatoire (RAISE EXCEPTION 'catalogue_article_id est requis'),
-- mais le POS peut ne pas l'envoyer quand l'article n'est pas résolu
-- depuis le catalogue. De plus, couleur/etat n'avaient pas de fallback
-- si absents du payload frontend.
--
-- FIX :
--   1. catalogue_article_id devient OPTIONNEL dans la validation RPC.
--      Quand absent, le prix est résolu via services.prix (fallback).
--   2. couleur : fallback sur 'autre' si invalide/absente (au lieu de
--      RAISE EXCEPTION).
--   3. etat : fallback sur 'bon' si invalide/absent.
--   4. catalogue_article_nom : fallback sur le nom du service si absent.
--   5. Fetch catalogue/tarifs rendus conditionnels (skip si aucun
--      catalogue_id fourni).
--   6. ALTER TABLE articles_vetements : DROP NOT NULL sur
--      catalogue_article_id (la migration 014 l'avait mis NOT NULL,
--      mais c'était trop restrictif pour les articles sans catalogue).
-- ============================================================

-- 1. Rendre catalogue_article_id nullable (était NOT NULL depuis migration 014)
ALTER TABLE public.articles_vetements
  ALTER COLUMN catalogue_article_id DROP NOT NULL;

-- 2. La RPC create_commande_atomic est recréée avec les fixes de validation.
--    Le source complet (récupéré depuis pg_get_functiondef puis patché) est
--    appliqué séparément car trop volumineux pour être inline ici.
--    Les changements par rapport à la version 038 :
--      - catalogue_article_id n'est plus obligatoire
--      - couleur/etat ont des fallbacks au lieu de RAISE EXCEPTION
--      - fetch catalogue/tarifs conditionnels
--      - fallback catalogue_nom sur nom du service

NOTIFY pgrst, 'reload schema';
