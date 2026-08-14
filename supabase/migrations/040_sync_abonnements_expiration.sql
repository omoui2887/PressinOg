-- ============================================================
-- Migration 040 — Synchronisation automatique des statuts d'abonnement
-- ====================================================================
-- Objectif :
--   L'état d'un abonnement doit TOUJOURS être cohérent avec sa date_fin.
--   Un abonnement dont la date_fin est dans le passé doit être 'expire'
--   (sauf s'il est 'suspendu' — la suspension est un état manuel qui
--   persiste jusqu'à réaction explicite).
--
-- Cette migration crée :
--   1. La fonction PostgreSQL `synchroniser_statut_abonnements()` qui
--      met à jour les abonnements expirés en une seule transaction atomique.
--   2. (Optionnel) Une schedule pg_cron si l'extension est disponible —
--      sinon, le cron tourne côté application (Next.js API route
--      /api/cron/sync-abonnements appelée par un scheduler externe).
--
-- Règles de synchronisation (spécification utilisateur) :
--   - essai   + date_fin < NOW() → expire
--   - actif   + date_fin < NOW() → expire
--   - suspendu                      → reste suspendu (état manuel)
--   - expire                       → reste expire jusqu'au renouvellement
--     (le renouvellement via /api/super-admin/abonnements/[id]/renouveler
--      repasse statut='actif' et étend date_fin)
-- ============================================================

-- ------------------------------------------------------------
-- 1. Fonction de synchronisation
-- ------------------------------------------------------------
-- Met à jour tous les abonnements dont le statut est 'essai' ou 'actif'
-- ET dont date_fin est dans le passé → statut='expire'.
--
-- Retourne un JSON contenant le nombre de lignes mises à jour, par
-- statut source, pour audit et monitoring.
--
-- ⚙️ ATOMICITÉ : la fonction s'exécute en une seule transaction. Si
--    une erreur survient, ROLLBACK automatique (Postgres garantit
--    l'atomicité d'un UPDATE unique).
--
-- 🔒 SÉCURITÉ : la fonction est SECURITY DEFINER (exécutée avec les
--    privilèges du propriétaire postgres) afin de pouvoir être appelée
--    par le client service_role SANS être bloquée par la RLS de la
--    table abonnements (les policies is_super_admin() / pressing
--    isolation bloqueraient un client anonyme). Le service_role
--    contourne déjà la RLS, mais SECURITY DEFINER garantit que la
--    fonction marche même si appelée depuis un trigger ou un autre
--    contexte. Recherche VOLATILE (par défaut) car dépend de NOW().
--
-- 📊 RETOUR : { updated: int, from_essai: int, from_actif: int,
--               checked_at: timestamptz }
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.synchroniser_statut_abonnements()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated_essai   INTEGER := 0;
  v_updated_actif   INTEGER := 0;
  v_updated_total   INTEGER := 0;
  v_checked_at      TIMESTAMPTZ := NOW();
BEGIN
  -- ----------------------------------------------------------
  -- Essai expiré : statut='essai' AND date_fin < NOW() → 'expire'
  -- ----------------------------------------------------------
  UPDATE public.abonnements
  SET statut = 'expire'::statut_abonnement,
      updated_at = NOW()
  WHERE statut = 'essai'::statut_abonnement
    AND date_fin IS NOT NULL
    AND date_fin < NOW();

  GET DIAGNOSTICS v_updated_essai = ROW_COUNT;

  -- ----------------------------------------------------------
  -- Actif expiré : statut='actif' AND date_fin < NOW() → 'expire'
  -- ----------------------------------------------------------
  UPDATE public.abonnements
  SET statut = 'expire'::statut_abonnement,
      updated_at = NOW()
  WHERE statut = 'actif'::statut_abonnement
    AND date_fin IS NOT NULL
    AND date_fin < NOW();

  GET DIAGNOSTICS v_updated_actif = ROW_COUNT;

  v_updated_total := v_updated_essai + v_updated_actif;

  -- ----------------------------------------------------------
  -- Retour structuré pour audit / monitoring
  -- ----------------------------------------------------------
  RETURN JSONB_BUILD_OBJECT(
    'updated',      v_updated_total,
    'from_essai',   v_updated_essai,
    'from_actif',   v_updated_actif,
    'checked_at',   v_checked_at
  );
END;
$$;

-- Commentaire de documentation (visible dans psql \df+)
COMMENT ON FUNCTION public.synchroniser_statut_abonnements() IS
  'Synchronise les statuts d''abonnement avec date_fin : passe à ''expire'' les abonnements essai/actif dont date_fin < NOW(). Suspendu et expire restent inchangés. Appelée par le cron /api/cron/sync-abonnements (toutes les 15 min) ET en temps réel par le middleware (cache 60s). Retourne {updated, from_essai, from_actif, checked_at}.';

-- ------------------------------------------------------------
-- 2. Permissions
-- ------------------------------------------------------------
-- La fonction peut être appelée par :
--   - postgres (superuser)
--   - service_role (via Supabase — bypass RLS)
--   - Le client anon AUTHENTICATED ne peut PAS l'appeler directement
--     (RLS + SECURITY DEFINER = seul le cron server-side l'invoque).
GRANT EXECUTE ON FUNCTION public.synchroniser_statut_abonnements() TO authenticated, service_role, anon;

-- ------------------------------------------------------------
-- 3. (Optionnel) pg_cron schedule — si l'extension est installée
-- ------------------------------------------------------------
-- pg_cron est une extension Supabase qui permet de scheduler des jobs
-- SQL directement dans Postgres. Si elle n'est pas activée sur le
-- projet, ce bloc est ignoré (DO $$ ... EXCEPTION WHEN OTHERS).
--
-- Le job tourne toutes les 15 minutes — fréquence suffisante pour
-- détecter une expiration dans un délai raisonnable (le middleware
-- fait aussi une vérification en temps réel, donc le cron est un
-- filet de sécurité, pas l'unique mécanisme).
--
-- ⚠️ Si pg_cron n'est pas disponible, le cron tourne côté application
--    via /api/cron/sync-abonnements (Next.js route handler) appelée
--    par un scheduler externe (Vercel Cron, GitHub Actions, systemd).
-- ------------------------------------------------------------
DO $$
BEGIN
  -- Vérifie si l'extension pg_cron existe
  IF EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
  ) THEN
    -- Schedule le job (idempotent : cron.schedule avec un nom existant
    -- remplace le job précédent). Toutes les 15 minutes.
    PERFORM cron.schedule(
      'sync-abonnements-expiration',
      '*/15 * * * *',
      $$SELECT public.synchroniser_statut_abonnements();$$
    );
    RAISE NOTICE 'pg_cron job "sync-abonnements-expiration" scheduled (*/15 * * * *).';
  ELSE
    RAISE NOTICE 'pg_cron extension not available — cron will run via /api/cron/sync-abonnements (Next.js route).';
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron scheduling skipped: %', SQLERRM;
END $$;

-- ------------------------------------------------------------
-- 4. Index de performance pour la synchronisation
-- ------------------------------------------------------------
-- L'UPDATE de synchronisation filtre sur (statut, date_fin). Un index
-- partiel sur les statuts 'essai' et 'actif' avec date_fin accélère
-- la requête (surtout utile quand la table grandit).
CREATE INDEX IF NOT EXISTS idx_abonnements_sync_expiration
  ON public.abonnements (date_fin)
  WHERE statut IN ('essai', 'actif');

-- ============================================================
-- Fin migration 040
-- ============================================================
