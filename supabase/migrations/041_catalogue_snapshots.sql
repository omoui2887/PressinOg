-- ============================================================
-- Migration 041 — Snapshots d'historique des commandes
-- ============================================================
-- Objectif :
--   Les commandes historiques doivent conserver un SNAPSHOT des
--   informations de l'article du catalogue au moment de la commande,
--   INDEPENDAMMENT de l'évolution future du catalogue (renommage,
--   changement de slug, désactivation).
--
--   La spécification utilisateur dit :
--     "Un article déjà utilisé dans des commandes historiques ne doit
--      jamais être supprimé physiquement. Utiliser actif=false.
--      Les commandes historiques doivent conserver leur snapshot :
--      nom, service, prix, article."
--
--   - prix    → DEJA snapshot dans commande_lignes.prix_unitaire
--               (migré par 002_tables.sql — non touché ici).
--   - article → articles_vetements.catalogue_article_id (FK ON DELETE
--               RESTRICT — l'article ne peut pas être supprimé s'il est
--               référencé). L'ID est donc préservé, mais le NOM et le
--               SLUG ne le sont pas. On ajoute ici 2 colonnes snapshot.
--   - nom     → articles_vetements.catalogue_article_nom_snapshot (NEW)
--   - service → commande_lignes.service_nom_snapshot (NEW)
--
--   Plus un trigger BEFORE INSERT pour auto-remplir les snapshots sur
--   les futures commandes (au cas où l'app ne le ferait pas — robustesse).
--
-- ⚙️ IDEMPOTENT : ADD COLUMN IF NOT EXISTS + CREATE TRIGGER IF NOT EXISTS.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Colonnes snapshot sur articles_vetements
-- ------------------------------------------------------------
-- Stocke le nom + slug du catalogue_article au moment de l'INSERT.
-- Si le Super Admin renomme plus tard l'article dans le catalogue,
-- les anciennes commandes affichent toujours le nom d'origine.
-- ------------------------------------------------------------
ALTER TABLE public.articles_vetements
  ADD COLUMN IF NOT EXISTS catalogue_article_nom_snapshot TEXT;

ALTER TABLE public.articles_vetements
  ADD COLUMN IF NOT EXISTS catalogue_article_slug_snapshot TEXT;

COMMENT ON COLUMN public.articles_vetements.catalogue_article_nom_snapshot IS
  'Snapshot du nom du catalogue_article au moment de la commande. Préservé même si l''article est renommé ou désactivé ultérieurement. Rempli par trigger trg_articles_vetements_catalogue_snapshot.';

COMMENT ON COLUMN public.articles_vetements.catalogue_article_slug_snapshot IS
  'Snapshot du slug du catalogue_article au moment de la commande. Préservé même si l''article est renommé.';

-- ------------------------------------------------------------
-- 2. Colonne snapshot service_nom sur commande_lignes
-- ------------------------------------------------------------
-- Stocke le nom du service au moment de la commande. Si le pressing
-- renomme son service, les anciennes commandes gardent le nom d'origine.
-- ------------------------------------------------------------
ALTER TABLE public.commande_lignes
  ADD COLUMN IF NOT EXISTS service_nom_snapshot TEXT;

COMMENT ON COLUMN public.commande_lignes.service_nom_snapshot IS
  'Snapshot du nom du service au moment de la commande. Préservé même si le service est renommé. Rempli par trigger trg_commande_lignes_service_snapshot.';

-- ------------------------------------------------------------
-- 3. Backfill des lignes existantes
-- ------------------------------------------------------------
-- Pour les commandes déjà en base, on remplit les snapshots depuis
-- l'état actuel du catalogue (best-effort : si l'article a déjà été
-- renommé, on prend le nom actuel — c'est le mieux qu'on puisse faire
-- rétroactivement).
-- ------------------------------------------------------------
UPDATE public.articles_vetements av
SET catalogue_article_nom_snapshot = ca.nom,
    catalogue_article_slug_snapshot = ca.slug
FROM public.catalogue_articles ca
WHERE av.catalogue_article_id = ca.id
  AND av.catalogue_article_nom_snapshot IS NULL;

UPDATE public.commande_lignes cl
SET service_nom_snapshot = s.nom
FROM public.services s
WHERE cl.service_id = s.id
  AND cl.service_nom_snapshot IS NULL;

-- ------------------------------------------------------------
-- 4. Trigger BEFORE INSERT sur articles_vetements
-- ------------------------------------------------------------
-- Auto-remplit les snapshots si l'app ne les fournit pas (robustesse).
-- Si l'app fournit déjà une valeur, on la respecte (NEWDATA IS NULL check).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.populate_catalogue_article_snapshot()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_nom  TEXT;
  v_slug TEXT;
BEGIN
  IF NEW.catalogue_article_id IS NOT NULL AND NEW.catalogue_article_nom_snapshot IS NULL THEN
    SELECT nom, slug INTO v_nom, v_slug
    FROM public.catalogue_articles
    WHERE id = NEW.catalogue_article_id;
    NEW.catalogue_article_nom_snapshot  := v_nom;
    NEW.catalogue_article_slug_snapshot := v_slug;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_articles_vetements_catalogue_snapshot
  ON public.articles_vetements;

CREATE TRIGGER trg_articles_vetements_catalogue_snapshot
  BEFORE INSERT ON public.articles_vetements
  FOR EACH ROW EXECUTE FUNCTION public.populate_catalogue_article_snapshot();

COMMENT ON FUNCTION public.populate_catalogue_article_snapshot() IS
  'Auto-remplit catalogue_article_nom_snapshot et catalogue_article_slug_snapshot sur articles_vetements lors de l''INSERT, depuis le catalogue courant. Garantie de snapshot même si l''app oublie de les fournir.';

-- ------------------------------------------------------------
-- 5. Trigger BEFORE INSERT sur commande_lignes
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.populate_service_nom_snapshot()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_nom TEXT;
BEGIN
  IF NEW.service_id IS NOT NULL AND NEW.service_nom_snapshot IS NULL THEN
    SELECT nom INTO v_nom FROM public.services WHERE id = NEW.service_id;
    NEW.service_nom_snapshot := v_nom;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_commande_lignes_service_snapshot
  ON public.commande_lignes;

CREATE TRIGGER trg_commande_lignes_service_snapshot
  BEFORE INSERT ON public.commande_lignes
  FOR EACH ROW EXECUTE FUNCTION public.populate_service_nom_snapshot();

COMMENT ON FUNCTION public.populate_service_nom_snapshot() IS
  'Auto-remplit service_nom_snapshot sur commande_lignes lors de l''INSERT, depuis le service courant.';

-- ------------------------------------------------------------
-- 6. Grant + RLS (les snapshots suivent les policies de leur table)
-- ------------------------------------------------------------
-- Aucun changement RLS nécessaire : les colonnes snapshot héritent
-- des policies déjà définies sur articles_vetements et commande_lignes
-- (isolation par pressing_id).
-- ------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;

-- ============================================================
-- Fin migration 041
-- ============================================================
