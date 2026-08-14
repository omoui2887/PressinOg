-- ============================================================
-- e-pressing — Migration 039 : Système de casiers uniques
-- ============================================================
-- Fichier    : 039_casiers_uniques.sql
-- Version    : 1.0
-- Objectif   : Garantir que deux articles ne JAMAIS occupent
--              simultanément le même casier dans le même pressing.
--
-- PROBLÈME (avant cette migration) :
--   La colonne `articles_vetements.zone_stockage` (migration 015)
--   stockait le code du casier directement sur l'article, SANS aucune
--   contrainte d'unicité. Conséquences :
--     - Deux articles pouvaient avoir zone_stockage='A1' simultanément
--       (aucun empêchement DB ou applicatif).
--     - Aucun historique d'affectation (qui a rangé quoi, quand,
--       libéré quand, par qui).
--     - Aucune transaction atomique : l'affectation se faisait via
--       un PATCH article (UPDATE simple) → race condition possible.
--     - Aucune libération structurée : on NULL-ifiait zone_stockage
--       sans tracer qui/libération.
--
-- SOLUTION :
--   1. Table `casiers` (catalogue des casiers physiques du pressing)
--      avec UNIQUE(pressing_id, code) — un code est unique par pressing.
--   2. Table `casier_affectations` (journal d'affectation) avec :
--        - Index partiel UNIQUE sur casier_id WHERE statut='actif'
--          → un casier = UNE affectation active max (contrainte DB).
--        - Index partiel UNIQUE sur article_id WHERE statut='actif'
--          → un article = UNE affectation active max (contrainte DB).
--   3. RPC `assigner_casier_atomic(...)` — transaction atomique :
--        - SELECT FOR UPDATE sur le casier (verrou ligne)
--        - Vérifie pressing_id + casier.actif
--        - Vérifie pas d'affectation active sur le casier (sinon CASIER_OCCUPE)
--        - Auto-libère l'ancienne affectation si l'article était déjà rangé
--        - INSERT nouvelle affectation
--        - UPDATE articles_vetements.zone_stockage (rétro-compatibilité)
--        - audit_log
--   4. RPC `liberer_casier_atomic(...)` — libération atomique :
--        - SELECT FOR UPDATE sur l'affectation active
--        - UPDATE statut='libere', libere_le=NOW()
--        - UPDATE articles_vetements.zone_stockage=NULL
--        - audit_log
--   5. Trigger `trigger_auto_liberer_casier` sur articles_vetements :
--        BEFORE UPDATE — si NEW.statut IN ('retire','livre') ET
--        OLD.statut NOT IN ('retire','livre'), libère automatiquement
--        le casier (defense-in-depth : même si l'app oublie de libérer,
--        le trigger le fait).
--   6. Migration des données existantes : pour chaque article avec
--      zone_stockage NOT NULL ET statut='pret', on crée un casier
--      (si absent) + une affectation active.
--   7. RLS : isolation par pressing_id (comme toutes les tables métier).
--
-- SÉCURITÉ :
--   - RPC SECURITY INVOKER + REVOKE EXECUTE FROM anon/authenticated :
--     seul service_role (API routes via getSupabaseAdmin()) peut appeler.
--   - p_pressing_id est vérifié côté SQL (defense-in-depth).
--   - Le frontend ne fait qu'afficher les disponibilités — il ne peut
--     PAS assigner directement (pas de INSERT/UPDATE sur casier_affectations
--     via le client anon/authenticated, seulement via la RPC service_role).
--
-- NON-CASSABLE :
--   - CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS,
--     CREATE OR REPLACE FUNCTION, DO $$.
--   - La colonne zone_stockage n'est PAS supprimée (rétro-compatibilité
--     pour le code existant qui la lit — elle est maintenue synchro par
--     les RPC).
--   - Les triggers existants ne sont PAS supprimés.
-- ============================================================


-- ============================================================
-- SECTION 1 — Table `casiers` (catalogue des casiers physiques)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.casiers (
    id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    pressing_id  UUID         NOT NULL REFERENCES public.pressing(id) ON DELETE CASCADE,
    code         TEXT         NOT NULL,
    zone         TEXT         DEFAULT NULL,
    actif        BOOLEAN      NOT NULL DEFAULT true,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- UNIQUE(pressing_id, code) — un code de casier est unique par pressing.
-- C'est la contrainte fondamentale : deux casiers du même pressing ne
-- peuvent pas avoir le même code 'A1'.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'casiers_pressing_code_key'
      AND conrelid = 'public.casiers'::regclass
  ) THEN
    ALTER TABLE public.casiers
      ADD CONSTRAINT casiers_pressing_code_key UNIQUE (pressing_id, code);
  END IF;
END $$;

-- Index pour accélérer la lookup par pressing + code (utilisé par la RPC).
CREATE INDEX IF NOT EXISTS idx_casiers_pressing_code
  ON public.casiers (pressing_id, code);

-- Index pour lister les casiers d'un pressing par zone.
CREATE INDEX IF NOT EXISTS idx_casiers_pressing_zone
  ON public.casiers (pressing_id, zone);

-- CHECK : code non-vide, alphanumérique (cohérent avec chk_zone_stockage_format
-- de la migration 015).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'casiers_code_format_check'
      AND conrelid = 'public.casiers'::regclass
  ) THEN
    ALTER TABLE public.casiers
      ADD CONSTRAINT casiers_code_format_check CHECK (
        length(btrim(code)) BETWEEN 1 AND 10
        AND code ~ '^[A-Za-z0-9]+$'
      );
  END IF;
END $$;

-- updated_at trigger (garde la colonne sync à chaque UPDATE)
CREATE OR REPLACE FUNCTION public.touch_casiers_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_casiers_touch_updated_at ON public.casiers;
CREATE TRIGGER trg_casiers_touch_updated_at
  BEFORE UPDATE ON public.casiers
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_casiers_updated_at();


-- ============================================================
-- SECTION 2 — Table `casier_affectations` (journal d'affectation)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.casier_affectations (
    id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    casier_id    UUID         NOT NULL REFERENCES public.casiers(id) ON DELETE CASCADE,
    article_id   UUID         NOT NULL REFERENCES public.articles_vetements(id) ON DELETE CASCADE,
    pressing_id  UUID         NOT NULL REFERENCES public.pressing(id) ON DELETE CASCADE,
    affecte_le   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    affecte_par  UUID         DEFAULT NULL REFERENCES public.personnel(id) ON DELETE SET NULL,
    libere_le    TIMESTAMPTZ  DEFAULT NULL,
    libere_par   UUID         DEFAULT NULL REFERENCES public.personnel(id) ON DELETE SET NULL,
    statut       TEXT         NOT NULL DEFAULT 'actif',
    motif        TEXT         DEFAULT NULL,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- CHECK : statut ∈ {'actif','libere'} (enum simple en TEXT pour éviter
-- un nouveau type pg_type — cohérent avec le pattern de la codebase
-- qui utilise des CHECK constraints plutôt que des enums pour les
-- statuts simples).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'casier_affectations_statut_check'
      AND conrelid = 'public.casier_affectations'::regclass
  ) THEN
    ALTER TABLE public.casier_affectations
      ADD CONSTRAINT casier_affectations_statut_check CHECK (
        statut IN ('actif', 'libere')
      );
  END IF;
END $$;

-- CHECK : si statut='libere', libere_le doit être non-null.
-- (si statut='actif', libere_le DOIT être null.)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'casier_affectations_coherence_check'
      AND conrelid = 'public.casier_affectations'::regclass
  ) THEN
    ALTER TABLE public.casier_affectations
      ADD CONSTRAINT casier_affectations_coherence_check CHECK (
        (statut = 'actif'  AND libere_le IS NULL)
        OR
        (statut = 'libere' AND libere_le IS NOT NULL)
      );
  END IF;
END $$;

-- ============================================================
-- CONTRAINTE CLÉ : une seule affectation ACTIVE par casier.
-- Index partiel UNIQUE → au niveau DB, deux INSERT concurrents avec
-- le même casier_id ET statut='actif' lèveront une unique_violation
-- (23505). C'est la garantie d'unicité ABSOLUE, même si un script
-- SQL brut court-circuite la RPC.
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS idx_casier_affectations_unique_active_casier
  ON public.casier_affectations (casier_id)
  WHERE statut = 'actif';

-- ============================================================
-- CONTRAINTE CLÉ : une seule affectation ACTIVE par article.
-- Un article ne peut pas être dans deux casiers en même temps.
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS idx_casier_affectations_unique_active_article
  ON public.casier_affectations (article_id)
  WHERE statut = 'actif';

-- Index pour l'historique (listing par casier ou par pressing).
CREATE INDEX IF NOT EXISTS idx_casier_affectations_casier_created
  ON public.casier_affectations (casier_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_casier_affectations_pressing_statut
  ON public.casier_affectations (pressing_id, statut);

CREATE INDEX IF NOT EXISTS idx_casier_affectations_article
  ON public.casier_affectations (article_id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_casier_affectations_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_casier_affectations_touch_updated_at ON public.casier_affectations;
CREATE TRIGGER trg_casier_affectations_touch_updated_at
  BEFORE UPDATE ON public.casier_affectations
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_casier_affectations_updated_at();


-- ============================================================
-- SECTION 3 — RLS (Row Level Security)
-- ============================================================
-- Même pattern que toutes les tables métier : isolation par pressing_id.
-- Le personnel ne voit/manipule que les casiers de SON pressing.

ALTER TABLE public.casiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.casier_affectations ENABLE ROW LEVEL SECURITY;

-- Casiers : SELECT/INSERT/UPDATE/DELETE par pressing
DROP POLICY IF EXISTS casiers_select_isolation ON public.casiers;
CREATE POLICY casiers_select_isolation ON public.casiers
  FOR SELECT USING (
    is_super_admin() OR pressing_id = get_pressing_id_utilisateur()
  );

DROP POLICY IF EXISTS casiers_insert_isolation ON public.casiers;
CREATE POLICY casiers_insert_isolation ON public.casiers
  FOR INSERT WITH CHECK (
    is_super_admin() OR pressing_id = get_pressing_id_utilisateur()
  );

DROP POLICY IF EXISTS casiers_update_isolation ON public.casiers;
CREATE POLICY casiers_update_isolation ON public.casiers
  FOR UPDATE USING (
    is_super_admin() OR pressing_id = get_pressing_id_utilisateur()
  );

DROP POLICY IF EXISTS casiers_delete_isolation ON public.casiers;
CREATE POLICY casiers_delete_isolation ON public.casiers
  FOR DELETE USING (
    is_super_admin() OR pressing_id = get_pressing_id_utilisateur()
  );

-- Casier_affectations : SELECT par pressing
-- INSERT/UPDATE : seulement via service_role (la RPC). On bloque
-- l'INSERT direct depuis le client anon/authenticated — l'affectation
-- DOIT passer par la RPC assigner_casier_atomic (qui vérifie l'unicité).
DROP POLICY IF EXISTS casier_affectations_select_isolation ON public.casier_affectations;
CREATE POLICY casier_affectations_select_isolation ON public.casier_affectations
  FOR SELECT USING (
    is_super_admin() OR pressing_id = get_pressing_id_utilisateur()
  );

-- INSERT/UPDATE/DELETE : denied pour anon/authenticated (WITH CHECK false).
-- Seul service_role (bypass RLS) peut écrire — via la RPC.
DROP POLICY IF EXISTS casier_affectations_insert_deny ON public.casier_affectations;
CREATE POLICY casier_affectations_insert_deny ON public.casier_affectations
  FOR INSERT WITH CHECK (false);

DROP POLICY IF EXISTS casier_affectations_update_deny ON public.casier_affectations;
CREATE POLICY casier_affectations_update_deny ON public.casier_affectations
  FOR UPDATE USING (false);

DROP POLICY IF EXISTS casier_affectations_delete_deny ON public.casier_affectations;
CREATE POLICY casier_affectations_delete_deny ON public.casier_affectations
  FOR DELETE USING (false);


-- ============================================================
-- SECTION 4 — RPC `assigner_casier_atomic`
-- ============================================================
-- Transaction atomique d'affectation d'un article à un casier.
--
-- Étapes (TOUTES en une transaction SQL) :
--   1. Validation : pressing_id, casier_code, article_id non-null
--   2. SELECT FOR UPDATE sur le casier (verrou la ligne → sérialise
--      les affectations concurrentes sur le même casier)
--   3. Vérifie casier.pressing_id = p_pressing_id (cross-tenant)
--   4. Vérifie casier.actif = true
--   5. Vérifie l'article appartient au pressing (cross-tenant)
--   6. SELECT FOR UPDATE sur l'affectation active du casier :
--      si existe → CASIER_OCCUPE (avec détails sur l'article courant)
--   7. SELECT FOR UPDATE sur l'affectation active de l'article :
--      si existe → auto-libère l'ancienne affectation (déplacement)
--   8. INSERT nouvelle affectation (statut='actif')
--   9. UPDATE articles_vetements SET zone_stockage=code, date_rangeement=NOW(),
--      rangee_par=p_affecte_par (rétro-compatibilité pour code existant)
--  10. INSERT audit_log
--  11. COMMIT (RETURN JSONB)
--
-- En cas d'erreur à N'IMPORTE QUELLE étape : RAISE EXCEPTION → ROLLBACK.
--
-- CONCURRENCE :
--   Deux requêtes simultanées sur A1 : la 1re obtient le SELECT FOR UPDATE
--   sur le casier, la 2e est BLOQUÉE jusqu'au COMMIT de la 1re. Après COMMIT,
--   la 2re voit l'affectation active → CASIER_OCCUPE. Une seule réussit.
--   Même si le SELECT FOR UPDATE était contourné, l'index partiel UNIQUE
--   sur (casier_id WHERE statut='actif') lèverait unique_violation 23505.

CREATE OR REPLACE FUNCTION public.assigner_casier_atomic(
  p_pressing_id    UUID,
  p_casier_code    TEXT,
  p_article_id     UUID,
  p_affecte_par    UUID   DEFAULT NULL,
  p_zone           TEXT   DEFAULT NULL,
  p_ip_address     INET   DEFAULT NULL,
  p_user_agent     TEXT   DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_casier        RECORD;
  v_article       RECORD;
  v_old_affect    RECORD;
  v_affect_id     UUID;
  v_now           TIMESTAMPTZ := NOW();
BEGIN
  -- ---------- 0. Validation des paramètres ----------
  IF p_pressing_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'PRESSING_ID_REQUIS');
  END IF;
  IF p_casier_code IS NULL OR btrim(p_casier_code) = '' THEN
    RETURN jsonb_build_object('success', false, 'code', 'CASIER_CODE_REQUIS');
  END IF;
  IF p_article_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'ARTICLE_ID_REQUIS');
  END IF;

  -- ---------- 1. SELECT FOR UPDATE sur le casier ----------
  -- Verrou la ligne casier pour la durée de la transaction.
  -- Les autres transactions concurrentes sur le même casier sont BLOQUÉES.
  SELECT id, pressing_id, code, zone, actif INTO v_casier
  FROM public.casiers
  WHERE pressing_id = p_pressing_id
    AND code = btrim(p_casier_code)
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'CASIER_INTROUVABLE',
      'details', jsonb_build_object('casier_code', p_casier_code));
  END IF;

  -- ---------- 2. Vérifications ----------
  IF v_casier.pressing_id != p_pressing_id THEN
    -- Cross-tenant (ne devrait pas arriver grâce à la clause WHERE, mais
    -- defense-in-depth).
    RETURN jsonb_build_object('success', false, 'code', 'CASIER_PRESSING_MISMATCH');
  END IF;

  IF v_casier.actif = false THEN
    RETURN jsonb_build_object('success', false, 'code', 'CASIER_INACTIF',
      'details', jsonb_build_object('casier_id', v_casier.id, 'code', v_casier.code));
  END IF;

  -- Vérifie que l'article appartient au pressing (via la commande)
  SELECT av.id, av.statut, av.commande_id, av.zone_stockage INTO v_article
  FROM public.articles_vetements av
  INNER JOIN public.commandes c ON c.id = av.commande_id
  WHERE av.id = p_article_id
    AND c.pressing_id = p_pressing_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'ARTICLE_INTROUVABLE',
      'details', jsonb_build_object('article_id', p_article_id));
  END IF;

  -- L'article doit être au statut 'pret' pour être rangé dans un casier
  -- (un article en lavage/repassage n'est pas encore en stockage).
  -- On accepte aussi 'repasse' (transition vers pret) pour la flexibilité.
  IF v_article.statut NOT IN ('pret', 'repasse') THEN
    RETURN jsonb_build_object('success', false, 'code', 'ARTICLE_STATUT_INVALIDE',
      'details', jsonb_build_object('statut', v_article.statut,
        'statuts_valides', ARRAY['pret', 'repasse']));
  END IF;

  -- ---------- 3. Vérifie pas d'affectation active sur le casier ----------
  SELECT id, article_id INTO v_old_affect
  FROM public.casier_affectations
  WHERE casier_id = v_casier.id
    AND statut = 'actif'
  FOR UPDATE;

  IF FOUND THEN
    -- Le casier est déjà occupé. On ne libère PAS automatiquement —
    -- l'utilisateur doit explicitement libérer le casier avant de
    -- réaffecter (pour éviter les erreurs silencieuses).
    RETURN jsonb_build_object('success', false, 'code', 'CASIER_OCCUPE',
      'details', jsonb_build_object(
        'casier_id', v_casier.id,
        'casier_code', v_casier.code,
        'article_occupe_id', v_old_affect.article_id,
        'affectation_id', v_old_affect.id
      ));
  END IF;

  -- ---------- 4. Auto-libère l'ancienne affectation de l'article ----------
  -- Si l'article était déjà rangé dans un autre casier, on le libère
  -- (déplacement vers le nouveau casier). C'est une opération de
  -- "réaffectation" — un article ne peut être que dans un seul casier.
  SELECT id, casier_id INTO v_old_affect
  FROM public.casier_affectations
  WHERE article_id = p_article_id
    AND statut = 'actif'
  FOR UPDATE;

  IF FOUND THEN
    UPDATE public.casier_affectations
    SET statut = 'libere',
        libere_le = v_now,
        libere_par = p_affecte_par,
        motif = 'Réaffectation vers le casier ' || v_casier.code,
        updated_at = v_now
    WHERE id = v_old_affect.id;
  END IF;

  -- ---------- 5. INSERT nouvelle affectation ----------
  INSERT INTO public.casier_affectations (
    casier_id, article_id, pressing_id,
    affecte_le, affecte_par, statut
  ) VALUES (
    v_casier.id, p_article_id, p_pressing_id,
    v_now, p_affecte_par, 'actif'
  )
  RETURNING id INTO v_affect_id;

  -- ---------- 6. UPDATE articles_vetements (rétro-compatibilité) ----------
  -- Maintient zone_stockage synchro pour le code existant qui lit
  -- directement cette colonne (casiers-grid, production-file, etc.).
  UPDATE public.articles_vetements
  SET zone_stockage = v_casier.code,
      date_rangeement = v_now,
      rangee_par = p_affecte_par,
      updated_at = v_now
  WHERE id = p_article_id;

  -- ---------- 7. audit_log ----------
  INSERT INTO public.audit_log (
    pressing_id, user_id, action, entity_type, entity_id,
    after_state, ip_address, user_agent
  ) VALUES (
    p_pressing_id,
    NULL, -- user_id non disponible dans la RPC (le service TS le log aussi)
    'casier_assign',
    'casier',
    v_casier.id::text,
    jsonb_build_object(
      'casier_code', v_casier.code,
      'article_id', p_article_id,
      'affectation_id', v_affect_id,
      'affecte_par', p_affecte_par,
      'ancienne_affectation_liberee', FOUND AND v_old_affect.id IS NOT NULL
    ),
    p_ip_address,
    p_user_agent
  );

  -- ---------- 8. Succès ----------
  RETURN jsonb_build_object(
    'success', true,
    'code', 'CASIER_ASSIGNE',
    'data', jsonb_build_object(
      'affectation_id', v_affect_id,
      'casier_id', v_casier.id,
      'casier_code', v_casier.code,
      'article_id', p_article_id,
      'affecte_le', v_now
    )
  );
END $$;

COMMENT ON FUNCTION public.assigner_casier_atomic(
  UUID, TEXT, UUID, UUID, TEXT, INET, TEXT
) IS
  'RPC atomique d''affectation d''un article à un casier. Verrouille le casier (SELECT FOR UPDATE), vérifie l''unicité, auto-libère l''ancien casier de l''article si nécessaire, insère l''affectation + met à jour zone_stockage + audit_log. SECURITY INVOKER — appelée par service_role uniquement.';

REVOKE EXECUTE ON FUNCTION public.assigner_casier_atomic(
  UUID, TEXT, UUID, UUID, TEXT, INET, TEXT
) FROM anon, authenticated;


-- ============================================================
-- SECTION 5 — RPC `liberer_casier_atomic`
-- ============================================================
-- Libère un casier (clôture l'affectation active).
--
-- Étapes :
--   1. SELECT FOR UPDATE sur le casier
--   2. SELECT FOR UPDATE sur l'affectation active du casier
--   3. UPDATE affectation SET statut='libere', libere_le=NOW()
--   4. UPDATE articles_vetements SET zone_stockage=NULL
--   5. audit_log

CREATE OR REPLACE FUNCTION public.liberer_casier_atomic(
  p_pressing_id   UUID,
  p_casier_code   TEXT,
  p_libere_par    UUID   DEFAULT NULL,
  p_motif         TEXT   DEFAULT NULL,
  p_ip_address    INET   DEFAULT NULL,
  p_user_agent    TEXT   DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_casier     RECORD;
  v_affect     RECORD;
  v_now        TIMESTAMPTZ := NOW();
BEGIN
  IF p_pressing_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'PRESSING_ID_REQUIS');
  END IF;
  IF p_casier_code IS NULL OR btrim(p_casier_code) = '' THEN
    RETURN jsonb_build_object('success', false, 'code', 'CASIER_CODE_REQUIS');
  END IF;

  -- ---------- 1. SELECT FOR UPDATE sur le casier ----------
  SELECT id, pressing_id, code, actif INTO v_casier
  FROM public.casiers
  WHERE pressing_id = p_pressing_id
    AND code = btrim(p_casier_code)
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'CASIER_INTROUVABLE',
      'details', jsonb_build_object('casier_code', p_casier_code));
  END IF;

  -- ---------- 2. SELECT FOR UPDATE sur l'affectation active ----------
  SELECT id, article_id, affecte_le INTO v_affect
  FROM public.casier_affectations
  WHERE casier_id = v_casier.id
    AND statut = 'actif'
  FOR UPDATE;

  IF NOT FOUND THEN
    -- Pas d'affectation active → casier déjà libre. Idempotent : succès.
    RETURN jsonb_build_object(
      'success', true,
      'code', 'CASIER_DEJA_LIBRE',
      'data', jsonb_build_object(
        'casier_id', v_casier.id,
        'casier_code', v_casier.code
      )
    );
  END IF;

  -- ---------- 3. UPDATE affectation ----------
  UPDATE public.casier_affectations
  SET statut = 'libere',
      libere_le = v_now,
      libere_par = p_libere_par,
      motif = COALESCE(p_motif, 'Libération manuelle'),
      updated_at = v_now
  WHERE id = v_affect.id;

  -- ---------- 4. UPDATE articles_vetements ----------
  UPDATE public.articles_vetements
  SET zone_stockage = NULL,
      date_rangeement = NULL,
      rangee_par = NULL,
      updated_at = v_now
  WHERE id = v_affect.article_id;

  -- ---------- 5. audit_log ----------
  INSERT INTO public.audit_log (
    pressing_id, user_id, action, entity_type, entity_id,
    before_state, after_state, ip_address, user_agent
  ) VALUES (
    p_pressing_id,
    NULL,
    'casier_release',
    'casier',
    v_casier.id::text,
    jsonb_build_object(
      'casier_code', v_casier.code,
      'article_id', v_affect.article_id,
      'affectation_id', v_affect.id,
      'affecte_le', v_affect.affecte_le
    ),
    jsonb_build_object(
      'casier_code', v_casier.code,
      'libere_le', v_now,
      'libere_par', p_libere_par,
      'motif', COALESCE(p_motif, 'Libération manuelle')
    ),
    p_ip_address,
    p_user_agent
  );

  RETURN jsonb_build_object(
    'success', true,
    'code', 'CASIER_LIBERE',
    'data', jsonb_build_object(
      'casier_id', v_casier.id,
      'casier_code', v_casier.code,
      'article_id', v_affect.article_id,
      'libere_le', v_now
    )
  );
END $$;

COMMENT ON FUNCTION public.liberer_casier_atomic(
  UUID, TEXT, UUID, TEXT, INET, TEXT
) IS
  'RPC atomique de libération d''un casier. Clôture l''affectation active, met à jour zone_stockage=NULL, audit_log. Idempotente (CASIER_DEJA_LIBRE si pas d''affectation active). SECURITY INVOKER — appelée par service_role uniquement.';

REVOKE EXECUTE ON FUNCTION public.liberer_casier_atomic(
  UUID, TEXT, UUID, TEXT, INET, TEXT
) FROM anon, authenticated;

-- RPC utilitaire : libère par article_id (utilisé par le trigger + auto-release)
CREATE OR REPLACE FUNCTION public.liberer_casier_par_article_atomic(
  p_article_id    UUID,
  p_motif         TEXT   DEFAULT 'Libération automatique (retrait/livraison)',
  p_libere_par    UUID   DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_affect   RECORD;
  v_now      TIMESTAMPTZ := NOW();
BEGIN
  SELECT id, casier_id, pressing_id INTO v_affect
  FROM public.casier_affectations
  WHERE article_id = p_article_id
    AND statut = 'actif'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN; -- pas d'affectation active → rien à faire (idempotent)
  END IF;

  UPDATE public.casier_affectations
  SET statut = 'libere',
      libere_le = v_now,
      libere_par = p_libere_par,
      motif = p_motif,
      updated_at = v_now
  WHERE id = v_affect.id;

  UPDATE public.articles_vetements
  SET zone_stockage = NULL,
      date_rangeement = NULL,
      rangee_par = NULL,
      updated_at = v_now
  WHERE id = p_article_id;

  INSERT INTO public.audit_log (
    pressing_id, action, entity_type, entity_id,
    before_state, after_state
  ) VALUES (
    v_affect.pressing_id,
    'casier_release',
    'casier',
    v_affect.casier_id::text,
    jsonb_build_object('article_id', p_article_id, 'affectation_id', v_affect.id),
    jsonb_build_object('libere_le', v_now, 'motif', p_motif)
  );
END $$;

COMMENT ON FUNCTION public.liberer_casier_par_article_atomic(
  UUID, TEXT, UUID
) IS
  'RPC utilitaire de libération de casier par article_id. Utilisée par le trigger auto-release et les routes retirer/livrer. Idempotente. SECURITY INVOKER.';

REVOKE EXECUTE ON FUNCTION public.liberer_casier_par_article_atomic(
  UUID, TEXT, UUID
) FROM anon, authenticated;


-- ============================================================
-- SECTION 6 — Trigger auto-release sur articles_vetements
-- ============================================================
-- Defense-in-depth : si l'article passe à un statut terminal
-- ('retire' ou 'livre') et que son casier n'a pas été libéré
-- explicitement, le trigger le libère automatiquement.
--
-- Cela garantit que JAMAIS un casier ne reste occupé par un article
-- qui a déjà quitté le pressing.

CREATE OR REPLACE FUNCTION public.auto_liberer_casier_on_terminal_statut()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  -- Seulement si on passe D'un statut non-terminal À un statut terminal
  IF NEW.statut IN ('retire', 'livre')
     AND OLD.statut NOT IN ('retire', 'livre') THEN
    -- Libère le casier associé à cet article (si un casier est actif)
    PERFORM public.liberer_casier_par_article_atomic(
      NEW.id,
      CASE
        WHEN NEW.statut = 'retire' THEN 'Libération automatique (retrait client)'
        WHEN NEW.statut = 'livre'  THEN 'Libération automatique (livraison)'
        ELSE 'Libération automatique'
      END,
      NULL
    );
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_auto_liberer_casier ON public.articles_vetements;
CREATE TRIGGER trg_auto_liberer_casier
  BEFORE UPDATE OF statut ON public.articles_vetements
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_liberer_casier_on_terminal_statut();


-- ============================================================
-- SECTION 7 — Migration des données existantes (zone_stockage → casiers)
-- ============================================================
-- Pour chaque article avec zone_stockage NOT NULL ET statut='pret',
-- on crée un casier (si absent) + une affectation active (si absente).
-- Idempotent : peut être re-exécuté sans duplication.

-- 7.1. Crée les casiers manquants à partir des zone_stockage existants
INSERT INTO public.casiers (pressing_id, code, zone, actif)
SELECT DISTINCT
  c.pressing_id,
  av.zone_stockage AS code,
  SUBSTRING(av.zone_stockage FROM '^[A-Za-z]+') AS zone,
  true
FROM public.articles_vetements av
INNER JOIN public.commandes c ON c.id = av.commande_id
WHERE av.zone_stockage IS NOT NULL
  AND btrim(av.zone_stockage) <> ''
  AND av.statut = 'pret'
  AND NOT EXISTS (
    SELECT 1 FROM public.casiers ca
    WHERE ca.pressing_id = c.pressing_id
      AND ca.code = av.zone_stockage
  )
ON CONFLICT DO NOTHING;

-- 7.2. Crée les affectations actives manquantes
INSERT INTO public.casier_affectations (casier_id, article_id, pressing_id, affecte_le, affecte_par, statut)
SELECT
  ca.id,
  av.id,
  ca.pressing_id,
  COALESCE(av.date_rangeement, av.updated_at, NOW()),
  av.rangee_par,
  'actif'
FROM public.articles_vetements av
INNER JOIN public.commandes c ON c.id = av.commande_id
INNER JOIN public.casiers ca ON ca.pressing_id = c.pressing_id
                              AND ca.code = av.zone_stockage
WHERE av.zone_stockage IS NOT NULL
  AND btrim(av.zone_stockage) <> ''
  AND av.statut = 'pret'
  AND NOT EXISTS (
    SELECT 1 FROM public.casier_affectations caf
    WHERE caf.article_id = av.id
      AND caf.statut = 'actif'
  )
ON CONFLICT DO NOTHING;


-- ============================================================
-- SECTION 8 — Seed des casiers par défaut (plan A1-D20)
-- ============================================================
-- Crée le plan par défaut (4 rangées × 20 = 80 casiers) pour chaque
-- pressing existant qui n'a pas encore de casiers. Idempotent.

INSERT INTO public.casiers (pressing_id, code, zone, actif)
SELECT p.id, code, zone, true
FROM public.pressing p
CROSS JOIN (
  SELECT chr(64 + r) AS zone_letter, r AS r
  FROM generate_series(1, 4) AS r
) zones
CROSS JOIN LATERAL (
  SELECT zones.zone_letter || c::text AS code, zones.zone_letter AS zone
  FROM generate_series(1, 20) AS c
) codes
WHERE NOT EXISTS (
  SELECT 1 FROM public.casiers ca
  WHERE ca.pressing_id = p.id
)
ON CONFLICT DO NOTHING;


-- ============================================================
-- SECTION 9 — Notify PostgREST (recharge le cache schema)
-- ============================================================
NOTIFY pgrst, 'reload schema';


-- ============================================================
-- Fin de la migration 039_casiers_uniques.sql
--
-- Récapitulatif :
--   - Table `casiers` : catalogue des casiers physiques avec UNIQUE(pressing_id, code)
--   - Table `casier_affectations` : journal d'affectation avec :
--       * Index partiel UNIQUE sur casier_id WHERE statut='actif'
--       * Index partiel UNIQUE sur article_id WHERE statut='actif'
--   - RPC assigner_casier_atomic : affectation atomique (SELECT FOR UPDATE + INSERT)
--   - RPC liberer_casier_atomic : libération atomique (idempotente)
--   - RPC liberer_casier_par_article_atomic : utilitaire pour auto-release
--   - Trigger trg_auto_liberer_casier : libère auto sur retire/livre
--   - RLS : isolation par pressing (INSERT/UPDATE/DELETE deny pour affectations)
--   - Migration des données existantes (zone_stockage → casiers + affectations)
--   - Seed du plan par défaut A1-D20 pour chaque pressing
--   - Idempotent (CREATE IF NOT EXISTS, OR REPLACE, DO $$)
-- ============================================================
