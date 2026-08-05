-- ============================================================
-- OgPressing — Migration 020 : Tarifs par article (par pressing)
-- ============================================================
-- Fichier    : 020_tarifs_articles.sql
-- Version    : 1.0
-- Description : Crée la table `tarifs_articles` qui permet à chaque
--               pressing de définir un PRIX SPÉCIFIQUE par article du
--               catalogue × type de service (lavage, repassage, etc.).
--
--   Exemple : Chemise + Lavage = 500 FCFA
--             Manteau + Nettoyage à sec = 3500 FCFA
--             Robe + Repassage = 800 FCFA
--
--   Sans tarif spécifique → le POS utilise le prix générique du
--   service (table `services`).
--
-- ⚠️  SÉCURITÉ :
--   - Lecture (SELECT) : tout personnel actif du pressing (RLS sur
--     pressing_id via la fonction de résolution du pressing courant).
--   - Écriture (INSERT/UPDATE/DELETE) : réservée au MANAGER (admin du
--     pressing) uniquement.
--   - Le Super Admin global peut tout faire (via service_role).
--
-- IDEMPOTENT : CREATE TABLE IF NOT EXISTS + ON CONFLICT DO NOTHING +
--   ADD COLUMN IF NOT EXISTS + CREATE POLICY IF NOT EXISTS.
-- ============================================================


-- ============================================================
-- 1. CRÉATION DE LA TABLE tarifs_articles
-- ============================================================
CREATE TABLE IF NOT EXISTS public.tarifs_articles (
    id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    pressing_id             UUID        NOT NULL REFERENCES public.pressing(id) ON DELETE CASCADE,
    catalogue_article_id    UUID        NOT NULL REFERENCES public.catalogue_articles(id) ON DELETE CASCADE,
    type_service            type_service NOT NULL,
    prix                    INTEGER     NOT NULL,  -- FCFA, >= 0
    duree_estimee           INTERVAL,
    actif                   BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index pour accélérer la recherche des tarifs d'un pressing
CREATE INDEX IF NOT EXISTS idx_tarifs_articles_pressing
    ON public.tarifs_articles (pressing_id, actif);

-- Index pour la recherche par article
CREATE INDEX IF NOT EXISTS idx_tarifs_articles_article
    ON public.tarifs_articles (catalogue_article_id, type_service);

-- Contrainte d'unicité : un seul tarif par (pressing, article, type_service)
-- (les variations de prix se font par UPDATE, pas par doublons)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_tarifs_articles_pressing_article_type
    ON public.tarifs_articles (pressing_id, catalogue_article_id, type_service);


-- ============================================================
-- 2. RLS SUR tarifs_articles
-- ============================================================
--   - SELECT : tout personnel actif du pressing peut lire les tarifs
--     (pour le POS / wizard de commande).
--   - INSERT / UPDATE / DELETE : réservés au MANAGER (admin du pressing).
-- ============================================================
ALTER TABLE public.tarifs_articles ENABLE ROW LEVEL SECURITY;

-- Helper : récupère le pressing_id de l'utilisateur courant via la table
-- personnel. Retourne NULL si l'utilisateur n'est pas un personnel actif.
-- (Créée en SECURITY DEFINER pour contourner la RLS sur `personnel` elle-même.)
CREATE OR REPLACE FUNCTION public.current_pressing_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT p.pressing_id
  FROM public.personnel p
  JOIN auth.users u ON u.id = p.user_id
  WHERE u.id = auth.uid()
    AND p.actif = TRUE
    AND p.statut_compte = 'actif'
  LIMIT 1;
$$;

-- Helper : vérifie si l'utilisateur courant est un MANAGER actif de son pressing
CREATE OR REPLACE FUNCTION public.is_pressing_manager()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.personnel p
    JOIN auth.users u ON u.id = p.user_id
    WHERE u.id = auth.uid()
      AND p.actif = TRUE
      AND p.statut_compte = 'actif'
      AND p.role = 'manager'
  );
$$;

-- Policy SELECT : tout personnel actif du pressing peut lire
DROP POLICY IF EXISTS tarifs_articles_select_pressing ON public.tarifs_articles;
CREATE POLICY tarifs_articles_select_pressing
  ON public.tarifs_articles
  FOR SELECT
  TO authenticated
  USING (pressing_id = public.current_pressing_id());

-- Policy WRITE : seul le MANAGER du pressing peut écrire
DROP POLICY IF EXISTS tarifs_articles_write_manager ON public.tarifs_articles;
CREATE POLICY tarifs_articles_write_manager
  ON public.tarifs_articles
  FOR ALL
  TO authenticated
  USING (pressing_id = public.current_pressing_id() AND public.is_pressing_manager())
  WITH CHECK (pressing_id = public.current_pressing_id() AND public.is_pressing_manager());


-- ============================================================
-- 3. GRANTS
-- ============================================================
GRANT SELECT ON public.tarifs_articles TO authenticated;


-- ============================================================
-- 4. TRIGGER updated_at automatique
-- ============================================================
DROP TRIGGER IF EXISTS trg_tarifs_articles_set_updated_at ON public.tarifs_articles;

CREATE TRIGGER trg_tarifs_articles_set_updated_at
  BEFORE UPDATE ON public.tarifs_articles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();


-- ============================================================
-- Fin de la migration 020_tarifs_articles.sql
-- ============================================================
