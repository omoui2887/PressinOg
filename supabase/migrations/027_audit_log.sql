-- ============================================================
-- e-pressing — Migration 027 : Audit log (AUDIT-B-13)
-- ============================================================
-- Fichier    : 027_audit_log.sql
-- Version    : 1.0
-- Description : Crée la table `public.audit_log` qui journalise
--               les actions sensibles effectuées par les utilisateurs :
--                 - création / annulation de commande
--                 - changement de rôle du personnel
--                 - suspension / réactivation de pressing
--                 - renouvellement d'abonnement
--                 - désactivation / suppression de personnel
--                 - etc.
--
--   Le journal est exploitable :
--     - par le Super Admin (vue globale SaaS)
--     - par le manager du pressing (vue locale à son pressing)
--
--   L'écriture est réservée au service_role (API routes Next.js),
--   qui bypass la RLS. Aucun client (anon / authenticated) ne peut
--   insérer dans la table → empêche la falsification du journal.
--
-- Schéma :
--   audit_log (
--     id              BIGSERIAL PRIMARY KEY,
--     pressing_id     UUID  → pressing(id) ON DELETE CASCADE,
--     user_id         UUID  → auth.users(id) ON DELETE SET NULL,
--     action          TEXT  NOT NULL,  -- 'create_commande', 'cancel_commande', etc.
--     entity_type     TEXT,            -- 'commande', 'personnel', 'abonnement', 'pressing'
--     entity_id       TEXT,            -- UUID as text (types variables)
--     before_state    JSONB,
--     after_state     JSONB,
--     ip_address      INET,
--     user_agent      TEXT,
--     created_at      TIMESTAMPTZ DEFAULT NOW()
--   )
--
-- Index :
--   - (pressing_id, created_at DESC) → page "Audit log du pressing"
--   - (user_id, created_at DESC)     → page "Mes actions"
--   - (action, created_at DESC)      → filtre par type d'action
--
-- RLS :
--   - SELECT : Super Admin (is_super_admin) OU personnel du pressing
--              (pressing_id = get_pressing_id_utilisateur()).
--   - INSERT : WITH CHECK (false) → bloque tout client. Seul
--              service_role (bypass RLS) peut insérer.
--   - UPDATE / DELETE : pas de policy → interdits par défaut
--                       (RLS deny-by-default).
--
-- IDEMPOTENT : CREATE TABLE IF NOT EXISTS + CREATE INDEX IF NOT
--   EXISTS + CREATE POLICY (DROP IF EXISTS avant CREATE).
--
-- Prérequis :
--   - Migrations 001 (enums) + 002 (tables) exécutées.
--   - Migration 006 (RLS + helpers is_super_admin, get_pressing_id_utilisateur).
-- ============================================================


-- ============================================================
-- 1. CRÉATION DE LA TABLE audit_log
-- ============================================================
CREATE TABLE IF NOT EXISTS public.audit_log (
    id              BIGSERIAL    PRIMARY KEY,
    pressing_id     UUID         REFERENCES public.pressing(id) ON DELETE CASCADE,
    user_id         UUID         REFERENCES auth.users(id) ON DELETE SET NULL,
    action          TEXT         NOT NULL,
    entity_type     TEXT,
    entity_id       TEXT,
    before_state    JSONB,
    after_state     JSONB,
    ip_address      INET,
    user_agent      TEXT,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);


-- ============================================================
-- 2. INDEX
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_audit_log_pressing_id
    ON public.audit_log (pressing_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_user_id
    ON public.audit_log (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_action
    ON public.audit_log (action, created_at DESC);

-- Index secondaire sur entity_type + entity_id (utile pour
-- "lister toutes les actions qui ont touché l'entité X").
CREATE INDEX IF NOT EXISTS idx_audit_log_entity
    ON public.audit_log (entity_type, entity_id)
    WHERE entity_id IS NOT NULL;


-- ============================================================
-- 3. RLS — Row Level Security
-- ============================================================
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
-- Note : pas de FORCE ROW LEVEL SECURITY → le propriétaire (postgres)
-- bypass la RLS, ce qui est nécessaire pour que les TRIGGERS et
-- fonctions SECURITY DEFINER puissent insérer dans le journal sans
-- être bloqués. Le service_role (Next.js API routes) bypass aussi.

-- 3.1 Policy SELECT : Super Admin OU personnel du pressing.
DROP POLICY IF EXISTS audit_log_select_pressing ON public.audit_log;
CREATE POLICY audit_log_select_pressing
  ON public.audit_log
  FOR SELECT
  TO authenticated
  USING (
      public.is_super_admin()
      OR pressing_id = public.get_pressing_id_utilisateur()
  );

-- 3.2 Policy INSERT : interdite aux clients (WITH CHECK false).
--   → seul service_role (bypass RLS) peut insérer.
--   → empêche un client malveillant de falsifier le journal.
DROP POLICY IF EXISTS audit_log_insert_service_only ON public.audit_log;
CREATE POLICY audit_log_insert_service_only
  ON public.audit_log
  FOR INSERT
  TO authenticated, anon
  WITH CHECK (false);

-- 3.3 UPDATE / DELETE : pas de policy → deny by default.
--   (On ne peut PAS modifier ou supprimer une ligne d'audit —
--    immutabilité du journal. Le seul moyen de "purger" est via
--    un TRUNCATE exécuté par postgres directement, ou en DROPant
--    la table — opération Super Admin SQL Editor.)


-- ============================================================
-- 4. GRANTS
-- ============================================================
GRANT SELECT ON public.audit_log TO authenticated;
-- INSERT/UPDATE/DELETE non accordés à authenticated/anon (RLS
-- bloque de toute façon, mais on explicite pour documentation).
-- service_role a tous les droits par défaut (bypass RLS).


-- ============================================================
-- 5. COMMENTAIRES
-- ============================================================
COMMENT ON TABLE public.audit_log IS
    'AUDIT-B-13: journal d''audit des actions sensibles (commandes, personnel, '
    'abonnements, pressings). Lecture : Super Admin + personnel du pressing. '
    'Écriture : service_role uniquement (API routes Next.js). INSERT par '
    'authenticated/anon bloqué via WITH CHECK (false). UPDATE/DELETE interdits '
    '(pas de policy → deny by default).';

COMMENT ON COLUMN public.audit_log.action IS
    'Code d''action normalisé : create_commande, cancel_commande, role_change, '
    'suspend_pressing, reactivate_pressing, renew_abonnement, delete_personnel, '
    'desactive_personnel, reactivate_personnel, etc.';

COMMENT ON COLUMN public.audit_log.entity_type IS
    'Type d''entité touchée : commande, personnel, abonnement, pressing, '
    'client, paiement, etc. Peut être NULL pour les actions globales.';

COMMENT ON COLUMN public.audit_log.entity_id IS
    'UUID (en TEXT) de l''entité touchée. TEXT et non UUID car plusieurs '
    'tables d''entités existent (commandes.id UUID, mais on accepte aussi '
    'des IDs composites dans le futur). NULL si action globale.';

COMMENT ON COLUMN public.audit_log.before_state IS
    'Snapshot JSONB de l''entité AVANT l''action (pour diff). NULL si création.';

COMMENT ON COLUMN public.audit_log.after_state IS
    'Snapshot JSONB de l''entité APRÈS l''action (pour diff). NULL si suppression.';


-- ============================================================
-- Fin de la migration 027_audit_log.sql
-- Récapitulatif :
--   - 1 table `public.audit_log` (10 colonnes)
--   - 4 index (pressing_id, user_id, action, entity_type+entity_id)
--   - RLS ENABLE + 2 policies (SELECT auth+SA, INSERT deny client)
--   - GRANT SELECT TO authenticated
--   - 5 COMMENT ON (table + 4 colonnes)
--   - Idempotent (CREATE IF NOT EXISTS, DROP POLICY IF EXISTS)
-- ============================================================
