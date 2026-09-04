-- ============================================================
-- Migration 048 : Correctifs de sécurité suite audit complet
-- ------------------------------------------------------------
-- Bugs identifiés lors de l'audit en profondeur (Task A-DB) :
--
--   C2 — codes_activation lisible par ANON (tous les codes exposés)
--   H1 — get_pressing_id_utilisateur ne filtre pas actif/statut_compte
--   M1 — calculer_statut_paiement_commande ne filtre pas statut_row='actif'
--
-- Note : H2 (paiements_update) et H3 (isolation_pressing) sont déjà
--   mitigés par le fix H1 — un personnel désactivé ne peut plus
--   obtenir son pressing_id via get_pressing_id_utilisateur(), ce qui
--   bloque l'accès RLS à toutes les tables tenant-scoped.
-- ============================================================

-- ============================================================
-- C2 : Restreindre l'accès public aux codes d'activation
-- ------------------------------------------------------------
-- AVANT : policy code_read_public ALLOW SELECT TO anon USING (true)
-- → n'importe qui sur internet pouvait lister TOUS les codes d'activation.
-- APRÈS : anon ne peut SELECT que les codes non utilisés ET non expirés.
-- (Le flow d'activation /api/public/activation/verify-code utilise le
--  service_role qui bypass RLS, donc cette restriction ne casse pas
--  l'activation.)
-- ============================================================
DROP POLICY IF EXISTS code_read_public ON public.codes_activation;
DROP POLICY IF EXISTS code_read_public_anon ON public.codes_activation;

CREATE POLICY code_read_public_anon
  ON public.codes_activation
  FOR SELECT
  TO anon
  USING (
    utilise = false
    AND (date_expiration IS NULL OR date_expiration > NOW())
  );

-- ============================================================
-- H1 : get_pressing_id_utilisateur doit filtrer actif + statut_compte
-- ------------------------------------------------------------
-- AVANT : retournait le pressing_id même si actif=false ou
-- statut_compte='desactive'. Un personnel désactivé pouvait ainsi
-- bypasser RLS via des appels REST directs.
-- APRÈS : filtre actif=true AND statut_compte='actif' (aligné avec
-- current_pressing_id).
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_pressing_id_utilisateur()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT p.pressing_id
  FROM public.personnel p
  WHERE p.user_id = auth.uid()
    AND p.actif = true
    AND p.statut_compte = 'actif'
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.get_pressing_id_utilisateur() IS
  'Retourne le pressing_id du personnel connecté (actif + statut_compte=actif uniquement). SECURITY DEFINER pour bypass RLS sur personnel.';

-- ============================================================
-- M1 : calculer_statut_paiement_commande doit filtrer statut_row='actif'
-- ------------------------------------------------------------
-- AVANT : sommait tous les paiements sans filtrer statut_row →
-- incohérent avec le trigger (migration 047) qui filtre actif.
-- APRÈS : filtre AND statut_row = 'actif'.
-- ============================================================
-- DROP nécessaire car l'ancienne version utilisait "commande_id" comme
-- nom de paramètre (et non "p_commande_id"), PostgreSQL refuse de
-- changer le nom d'un paramètre via CREATE OR REPLACE.
DROP FUNCTION IF EXISTS public.calculer_statut_paiement_commande(UUID);

CREATE FUNCTION public.calculer_statut_paiement_commande(p_commande_id UUID)
RETURNS statut_paiement_commande
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_total_paye     INTEGER := 0;
  v_montant_total  INTEGER;
BEGIN
  SELECT COALESCE(SUM(montant), 0)
    INTO v_total_paye
    FROM public.paiements
   WHERE commande_id = p_commande_id
     AND statut_row = 'actif';

  SELECT montant_total INTO v_montant_total
    FROM public.commandes
   WHERE id = p_commande_id;

  IF NOT FOUND OR v_montant_total IS NULL THEN
    RETURN 'non_paye';
  END IF;

  IF v_total_paye <= 0 THEN
    RETURN 'non_paye';
  ELSIF v_total_paye < v_montant_total THEN
    RETURN 'partiel';
  ELSE
    RETURN 'paye';
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
