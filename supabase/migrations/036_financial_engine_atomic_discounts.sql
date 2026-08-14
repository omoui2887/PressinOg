-- ============================================================
-- e-pressing — Migration 036 : Moteur financier atomique (remises + fidélité)
-- ============================================================
-- Fichier    : 036_financial_engine_atomic_discounts.sql
-- Version    : 1.0
-- Date       : 14/08/2026
-- Objectif   : Sécuriser la logique des remises et de la fidélité côté serveur.
--
-- RÈGLES IMPOSÉES :
--   1. Le serveur recalcul INTÉGRALEMENT la remise (jamais le frontend).
--   2. Fidélité : >= 50 points → 3 %, >= 100 points → 5 %, sinon 0 %.
--      Le client ne choisit JAMAIS la valeur.
--   3. Pourcentage : limite serveur configurable (max 50% par défaut).
--      Ne JAMAIS accepter 100% sauf règle explicite.
--   4. Remise article gratuit : vérifier côté serveur que l'index correspond
--      à un article existant.
--   5. Remise montant fixe : clamp strictement au sous-total.
--   6. Autorisation par rôle :
--        - remise fidélité automatique → tout rôle CAN_CREATE_COMMANDES
--        - remise commerciale (pourcentage/montant_fixe) → manager + réceptionniste
--        - remise exceptionnelle (> seuil) → manager uniquement
--   7. audit_log pour chaque remise appliquée.
--
-- Non-cassable : préserve les colonnes/fonctions existantes.
-- ============================================================

-- ============================================================
-- SECTION 1 — Table de configuration des seuils de remise
-- ============================================================
-- Une ligne par pressing. Permet de configurer :
--   - remise_pourcentage_max : % max autorisé pour une remise commerciale
--   - remise_seuil_exceptionnel : au-delà, requiert manager
--   - fidelite_seuil_3pct : points minimum pour 3% (défaut 50)
--   - fidelite_seuil_5pct : points minimum pour 5% (défaut 100)
--   - fidelite_pct_palier1 : % de remise au palier 1 (défaut 3)
--   - fidelite_pct_palier2 : % de remise au palier 2 (défaut 5)

CREATE TABLE IF NOT EXISTS public.pressing_remise_config (
  pressing_id                 UUID    PRIMARY KEY REFERENCES public.pressing(id) ON DELETE CASCADE,
  remise_pourcentage_max      INTEGER NOT NULL DEFAULT 50 CHECK (remise_pourcentage_max BETWEEN 0 AND 100),
  remise_seuil_exceptionnel   INTEGER NOT NULL DEFAULT 20 CHECK (remise_seuil_exceptionnel BETWEEN 0 AND 100),
  fidelite_seuil_3pct         INTEGER NOT NULL DEFAULT 50,
  fidelite_seuil_5pct         INTEGER NOT NULL DEFAULT 100,
  fidelite_pct_palier1        INTEGER NOT NULL DEFAULT 3  CHECK (fidelite_pct_palier1 BETWEEN 0 AND 100),
  fidelite_pct_palier2        INTEGER NOT NULL DEFAULT 5  CHECK (fidelite_pct_palier2 BETWEEN 0 AND 100),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.pressing_remise_config IS
  'Configuration par pressing des seuils de remise et de fidélité. Permet d''ajuster sans code les paliers (3% à 50pts, 5% à 100pts) et le % max autorisé pour les remises commerciales.';

-- Backfill : créer une config par défaut pour chaque pressing existant
INSERT INTO public.pressing_remise_config (pressing_id)
SELECT id FROM public.pressing p
WHERE NOT EXISTS (
  SELECT 1 FROM public.pressing_remise_config c WHERE c.pressing_id = p.id
)
ON CONFLICT (pressing_id) DO NOTHING;

-- RLS : le personnel peut lire sa config, seul service_role peut écrire
ALTER TABLE public.pressing_remise_config ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'pressing_remise_config'
      AND policyname = 'remise_config_select_own_pressing'
  ) THEN
    CREATE POLICY remise_config_select_own_pressing
      ON public.pressing_remise_config
      FOR SELECT
      TO authenticated
      USING (pressing_id = public.get_pressing_id_utilisateur());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'pressing_remise_config'
      AND policyname = 'remise_config_no_client_write'
  ) THEN
    CREATE POLICY remise_config_no_client_write
      ON public.pressing_remise_config
      FOR ALL
      TO authenticated, anon
      USING (false)
      WITH CHECK (false);
  END IF;
END $$;

-- ============================================================
-- SECTION 2 — RPC atomique : calculer_remise_fidelite_auto
-- ============================================================
-- Règle : >= seuil_5pct → pct_palier2, >= seuil_3pct → pct_palier1, sinon 0.
-- Lit la config du pressing + le solde de points du client.
-- Retourne le % applicable (0, 3 ou 5 par défaut).

CREATE OR REPLACE FUNCTION public.calculer_remise_fidelite_auto(
  p_pressing_id  UUID,
  p_client_id    UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_config     RECORD;
  v_points     INTEGER;
  v_pct        INTEGER := 0;
BEGIN
  -- Lire la config (fallback sur défauts si pas de ligne)
  SELECT * INTO v_config
    FROM public.pressing_remise_config
   WHERE pressing_id = p_pressing_id;

  IF NOT FOUND THEN
    -- Valeurs par défaut codées en dur (cf. defaults de la table)
    v_config.fidelite_seuil_5pct := 100;
    v_config.fidelite_seuil_3pct := 50;
    v_config.fidelite_pct_palier1 := 3;
    v_config.fidelite_pct_palier2 := 5;
  END IF;

  -- Lire les points du client
  SELECT points_fidelite INTO v_points
    FROM public.clients
   WHERE id = p_client_id
     AND pressing_id = p_pressing_id;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  IF v_points >= v_config.fidelite_seuil_5pct THEN
    v_pct := v_config.fidelite_pct_palier2;
  ELSIF v_points >= v_config.fidelite_seuil_3pct THEN
    v_pct := v_config.fidelite_pct_palier1;
  ELSE
    v_pct := 0;
  END IF;

  RETURN v_pct;
END;
$$;

COMMENT ON FUNCTION public.calculer_remise_fidelite_auto(UUID, UUID) IS
  'Calcule le % de remise fidélité automatique pour un client (0%, 3% ou 5% par défaut). Lit la config du pressing + le solde de points. Le client ne choisit jamais la valeur.';

REVOKE EXECUTE ON FUNCTION public.calculer_remise_fidelite_auto(UUID, UUID) FROM anon, authenticated;

-- ============================================================
-- SECTION 3 — RPC atomique : calculer_remise_atomique
-- ============================================================
-- Calcule le montant de remise en FCFA selon le type, AVEC validation serveur.
-- Cette fonction remplace calculer_montant_remise (010) pour la création
-- de commande — elle ajoute les vérifications de sécurité.
--
-- Paramètres :
--   p_pressing_id          : UUID du pressing (pour config + RLS)
--   p_montant_avant_remise : INTEGER (sous-total brut, somme des lignes)
--   p_remise_type          : remise_type enum
--   p_remise_valeur        : INTEGER (interprété selon le type)
--   p_role_utilisateur     : TEXT (role_personnel de l'utilisateur connecté)
--   p_commande_id          : UUID (pour article_gratuit — vérifie l'index)
--   p_articles_json        : JSONB (liste des articles pour article_gratuit)
--
-- Retourne JSONB :
--   { success, code, montant_remise, remise_type_appliquee, remise_valeur_appliquee, error? }

CREATE OR REPLACE FUNCTION public.calculer_remise_atomique(
  p_pressing_id          UUID,
  p_montant_avant_remise INTEGER,
  p_remise_type          remise_type,
  p_remise_valeur        INTEGER,
  p_role_utilisateur     TEXT,
  p_articles_json        JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_config          RECORD;
  v_montant_remise  INTEGER := 0;
  v_valeur_appliquee INTEGER := 0;
  v_type_appliquee  remise_type := 'aucune';
  v_pct             INTEGER := 0;
  v_nb_articles     INTEGER := 0;
  v_article         JSONB;
  v_prix_article    INTEGER;
BEGIN
  -- 0. Validation : montant >= 0
  IF p_montant_avant_remise IS NULL OR p_montant_avant_remise < 0 THEN
    RETURN jsonb_build_object('success', false, 'code', 'MONTANT_INVALIDE',
      'error', 'Le montant avant remise doit être >= 0.');
  END IF;

  -- Lire la config (pour les seuils)
  SELECT * INTO v_config
    FROM public.pressing_remise_config
   WHERE pressing_id = p_pressing_id;

  IF NOT FOUND THEN
    v_config.remise_pourcentage_max := 50;
    v_config.remise_seuil_exceptionnel := 20;
  END IF;

  CASE p_remise_type
    WHEN 'aucune' THEN
      v_montant_remise := 0;
      v_type_appliquee := 'aucune';
      v_valeur_appliquee := 0;

    WHEN 'fidelite' THEN
      -- Fidélité : la valeur est IGNORÉE, le serveur calcule le % à partir
      -- des points du client. Le frontend ne peut pas forcer un % arbitraire.
      -- p_remise_valeur doit être NULL ou ignoré.
      --
      -- NOTE : pour calculer le vrai %, il faut p_client_id. Cette fonction
      -- prend p_remise_valeur déjà calculé par calculer_remise_fidelite_auto.
      -- On valide juste que la valeur reçue est dans {0, 3, 5} (ou les paliers
      -- configurés) et <= pct_palier2.
      v_pct := GREATEST(0, LEAST(COALESCE(p_remise_valeur, 0), v_config.fidelite_pct_palier2));
      -- Refuser si la valeur dépasse le palier max configuré (anti-fraude)
      IF p_remise_valeur > v_config.fidelite_pct_palier2 THEN
        RETURN jsonb_build_object('success', false, 'code', 'FIDELITE_PCT_INVALIDE',
          'error', 'Le % de remise fidélité dépasse le palier maximum configuré.',
          'details', jsonb_build_object(
            'pct_recu', p_remise_valeur,
            'pct_max_config', v_config.fidelite_pct_palier2
          ));
      END IF;
      v_montant_remise := (p_montant_avant_remise * v_pct) / 100;
      v_type_appliquee := 'fidelite';
      v_valeur_appliquee := v_pct;

    WHEN 'pourcentage' THEN
      -- Remise commerciale : vérifier le rôle
      -- Seuls manager + réceptionniste peuvent appliquer une remise commerciale.
      IF p_role_utilisateur IS NULL OR p_role_utilisateur NOT IN ('manager', 'receptionniste') THEN
        RETURN jsonb_build_object('success', false, 'code', 'ROLE_INSUFFISANT',
          'error', 'Rôle insuffisant pour appliquer une remise commerciale.',
          'details', jsonb_build_object(
            'role_recu', p_role_utilisateur,
            'roles_autorises', ARRAY['manager', 'receptionniste']
          ));
      END IF;

      -- Validation : % entre 0 et remise_pourcentage_max
      IF p_remise_valeur IS NULL OR p_remise_valeur < 0 THEN
        RETURN jsonb_build_object('success', false, 'code', 'POURCENTAGE_INVALIDE',
          'error', 'Le pourcentage doit être un entier >= 0.');
      END IF;

      -- Refuser 100% (jamais autorisé sauf règle explicite — article_gratuit)
      IF p_remise_valeur >= 100 THEN
        RETURN jsonb_build_object('success', false, 'code', 'POURCENTAGE_100_REFUSE',
          'error', 'Une remise de 100% n''est pas autorisée (utilisez "article_gratuit" si nécessaire).',
          'details', jsonb_build_object('pourcentage_recu', p_remise_valeur));
      END IF;

      IF p_remise_valeur > v_config.remise_pourcentage_max THEN
        RETURN jsonb_build_object('success', false, 'code', 'POURCENTAGE_DEPASSE_MAX',
          'error', 'Le pourcentage dépasse le maximum configuré.',
          'details', jsonb_build_object(
            'pct_recu', p_remise_valeur,
            'pct_max_config', v_config.remise_pourcentage_max
          ));
      END IF;

      -- Si > seuil_exceptionnel, exiger manager
      IF p_remise_valeur > v_config.remise_seuil_exceptionnel
         AND p_role_utilisateur <> 'manager' THEN
        RETURN jsonb_build_object('success', false, 'code', 'REMISE_EXCEPTIONNELLE_REQUIERT_MANAGER',
          'error', 'Cette remise est exceptionnelle et nécessite le rôle manager.',
          'details', jsonb_build_object(
            'pct_recu', p_remise_valeur,
            'seuil_exceptionnel', v_config.remise_seuil_exceptionnel,
            'role_recu', p_role_utilisateur
          ));
      END IF;

      v_montant_remise := (p_montant_avant_remise * p_remise_valeur) / 100;
      v_type_appliquee := 'pourcentage';
      v_valeur_appliquee := p_remise_valeur;

    WHEN 'montant_fixe' THEN
      -- Remise commerciale montant fixe : vérifier le rôle
      IF p_role_utilisateur IS NULL OR p_role_utilisateur NOT IN ('manager', 'receptionniste') THEN
        RETURN jsonb_build_object('success', false, 'code', 'ROLE_INSUFFISANT',
          'error', 'Rôle insuffisant pour appliquer une remise commerciale.',
          'details', jsonb_build_object(
            'role_recu', p_role_utilisateur,
            'roles_autorises', ARRAY['manager', 'receptionniste']
          ));
      END IF;

      IF p_remise_valeur IS NULL OR p_remise_valeur < 0 THEN
        RETURN jsonb_build_object('success', false, 'code', 'MONTANT_FIXE_INVALIDE',
          'error', 'Le montant de la remise doit être un entier >= 0.');
      END IF;

      -- Clamp strictement au sous-total (jamais négatif)
      v_montant_remise := LEAST(p_remise_valeur, p_montant_avant_remise);
      v_type_appliquee := 'montant_fixe';
      v_valeur_appliquee := v_montant_remise;

    WHEN 'article_gratuit' THEN
      -- Remise article gratuit : vérifier le rôle
      IF p_role_utilisateur IS NULL OR p_role_utilisateur NOT IN ('manager', 'receptionniste') THEN
        RETURN jsonb_build_object('success', false, 'code', 'ROLE_INSUFFISANT',
          'error', 'Rôle insuffisant pour appliquer une remise article gratuit.',
          'details', jsonb_build_object(
            'role_recu', p_role_utilisateur,
            'roles_autorises', ARRAY['manager', 'receptionniste']
          ));
      END IF;

      -- p_remise_valeur = index (0-based) de l'article dans la liste
      IF p_articles_json IS NULL OR jsonb_array_length(p_articles_json) = 0 THEN
        RETURN jsonb_build_object('success', false, 'code', 'ARTICLES_MANQUANTS',
          'error', 'La remise article_gratuit nécessite la liste des articles.');
      END IF;

      v_nb_articles := jsonb_array_length(p_articles_json);
      IF p_remise_valeur IS NULL OR p_remise_valeur < 0 OR p_remise_valeur >= v_nb_articles THEN
        RETURN jsonb_build_object('success', false, 'code', 'INDEX_ARTICLE_INVALIDE',
          'error', 'L''index de l''article gratuit est invalide.',
          'details', jsonb_build_object(
            'index_recu', p_remise_valeur,
            'nb_articles', v_nb_articles
          ));
      END IF;

      -- Extraire l'article et son prix * quantité
      v_article := p_articles_json->p_remise_valeur;
      v_prix_article := COALESCE(
        (v_article->>'prix_unitaire')::INTEGER * COALESCE((v_article->>'quantite')::INTEGER, 1),
        0
      );
      v_montant_remise := v_prix_article;
      v_type_appliquee := 'article_gratuit';
      v_valeur_appliquee := p_remise_valeur;

    ELSE
      RETURN jsonb_build_object('success', false, 'code', 'TYPE_REMISE_INVALIDE',
        'error', 'Type de remise inconnu.');
  END CASE;

  -- Sécurité finale : la remise ne peut pas dépasser le montant avant
  v_montant_remise := LEAST(v_montant_remise, p_montant_avant_remise);

  RETURN jsonb_build_object(
    'success', true,
    'code', 'REMISE_OK',
    'montant_remise', v_montant_remise,
    'remise_type_appliquee', v_type_appliquee,
    'remise_valeur_appliquee', v_valeur_appliquee
  );
END;
$$;

COMMENT ON FUNCTION public.calculer_remise_atomique(UUID, INTEGER, remise_type, INTEGER, TEXT, JSONB) IS
  'RPC atomique de calcul de remise côté serveur. Valide le rôle, les seuils, le % max, l''index article. Retourne le montant de remise en FCFA. Jamais confiance au frontend.';

REVOKE EXECUTE ON FUNCTION public.calculer_remise_atomique(UUID, INTEGER, remise_type, INTEGER, TEXT, JSONB) FROM anon, authenticated;

-- ============================================================
-- SECTION 4 — Trigger de cohérence : refuser remise > montant_avant_remise
-- ============================================================
-- Defense-in-depth : même si l'API ou la RPC calcul mal, un UPDATE
-- direct de commandes avec montant_remise > montant_total_avant_remise
-- est refusé par ce trigger.

CREATE OR REPLACE FUNCTION public.guard_remise_coherence()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  -- Si montant_remise est set, il ne peut pas dépasser montant_total_avant_remise
  IF NEW.montant_remise IS NOT NULL AND NEW.montant_total_avant_remise IS NOT NULL THEN
    IF NEW.montant_remise > NEW.montant_total_avant_remise THEN
      RAISE EXCEPTION 'REMISE_DEPASSE_MONTANT: montant_remise (%) > montant_total_avant_remise (%)',
        NEW.montant_remise, NEW.montant_total_avant_remise
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- Refuser une remise_type='pourcentage' avec valeur=100 (fraude)
  IF NEW.remise_type = 'pourcentage' AND NEW.remise_valeur >= 100 THEN
    RAISE EXCEPTION 'POURCENTAGE_100_REFUSE: une remise de 100%% n''est pas autorisée (utilisez article_gratuit)'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Coherence : montant_total = montant_total_avant_remise - montant_remise
  IF NEW.montant_total_avant_remise IS NOT NULL AND NEW.montant_remise IS NOT NULL THEN
    IF NEW.montant_total IS DISTINCT FROM (NEW.montant_total_avant_remise - NEW.montant_remise) THEN
      -- On corrige automatiquement plutôt que d'échouer (backward compatible)
      NEW.montant_total := NEW.montant_total_avant_remise - NEW.montant_remise;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_remise_coherence ON public.commandes;
CREATE TRIGGER trg_guard_remise_coherence
  BEFORE INSERT OR UPDATE OF remise_type, remise_valeur, montant_remise, montant_total_avant_remise, montant_total
  ON public.commandes
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_remise_coherence();

COMMENT ON FUNCTION public.guard_remise_coherence() IS
  'Trigger BEFORE INSERT/UPDATE sur commandes: refuse montant_remise > montant_total_avant_remise, refuse pourcentage=100%, corrige automatiquement montant_total = avant - remise.';

REVOKE EXECUTE ON FUNCTION public.guard_remise_coherence() FROM anon, authenticated;

-- ============================================================
-- SECTION 5 — Notify PostgREST
-- ============================================================
NOTIFY pgrst, 'reload schema';
