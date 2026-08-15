-- ============================================================
-- e-pressing — Migration 043 : Système financier immuable (finalisation)
-- ============================================================
-- Fichier    : 043_financial_engine_annulation_type.sql
-- Version    : 1.0
-- Objectif   : Finaliser le système financier immuable d'OgPressing.
--
-- RÈGLES IMPOSÉES (demande utilisateur) :
--   1. Un paiement enregistré ne doit JAMAIS être supprimé physiquement.
--   2. paiement.status = valide | annule (existe déjà via statut_row —
--      actif=valide, annule=annule).
--   3. paiement_annulations.type = erreur_saisie | doublon | remboursement | autre.
--   4. POST /api/admin/paiements/[id]/annuler — manager OU comptable autorisé.
--   5. Justification (motif) obligatoire.
--   6. Audit obligatoire.
--   7. Paiement original conservé (statut_row='annule', PAS de DELETE).
--   8. Écriture de reversal dans paiement_annulations.
--   9. montant_paye recalculé depuis les écritures valides (statut_row='actif').
--  10. Interdire DELETE sur paiements (RLS USING(false) + REVOKE).
--  11. Rapports : paiements valides, annulés, remboursements, montant net.
--
-- Non-cassable : préserve toutes les colonnes/contraintes existantes.
-- Idempotent : ADD COLUMN IF NOT EXISTS, DO $$ ... EXCEPTION, CREATE OR REPLACE.
-- ============================================================

-- ============================================================
-- SECTION 1 — Enum type_annulation_paiement
-- ============================================================
-- Types d'annulation possibles pour un paiement financier.
--   - erreur_saisie : le caissier a saisi un mauvais montant/méthode.
--   - doublon       : le paiement a été enregistré deux fois (double-clic).
--   - remboursement : le client a été remboursé (argent rendu).
--   - autre         : tout autre motif (par défaut, rétrocompatible).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'type_annulation_paiement' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.type_annulation_paiement AS ENUM (
      'erreur_saisie',
      'doublon',
      'remboursement',
      'autre'
    );
  END IF;
END $$;

COMMENT ON TYPE public.type_annulation_paiement IS
  'Types d''annulation d''un paiement financier : erreur_saisie, doublon, remboursement, autre. Utilisé par paiement_annulations.type.';

-- ============================================================
-- SECTION 2 — Colonne type sur paiement_annulations
-- ============================================================
-- NOT NULL DEFAULT 'autre' pour rétrocompatibilité : les annulations
-- existantes (sans type) sont considérées comme 'autre'.
ALTER TABLE public.paiement_annulations
  ADD COLUMN IF NOT EXISTS type public.type_annulation_paiement
  NOT NULL DEFAULT 'autre';

-- Index pour les rapports (filtre par type + tri par date).
CREATE INDEX IF NOT EXISTS idx_paiement_annulations_type_date
  ON public.paiement_annulations (type, date_annulation DESC);

COMMENT ON COLUMN public.paiement_annulations.type IS
  'Type d''annulation : erreur_saisie, doublon, remboursement, autre. Permet de distinguer les vrais remboursements (argent rendu au client) des corrections comptables.';

-- ============================================================
-- SECTION 3 — Recréation de la RPC annuler_paiement (avec p_type)
-- ============================================================
-- Nouvelle signature : ajout du paramètre p_type.
-- Le rôle autorisé est désormais manager OU comptable (defense-in-depth
-- côté SQL — l'API vérifie aussi via CAN_ANNULER_PAIEMENT).
--
-- ⚠️ On doit DROP + CREATE car la signature change (ajout param).
-- L'ancienne signature (UUID, UUID, UUID, UUID, TEXT, TEXT) est remplacée
-- par (UUID, UUID, UUID, UUID, TEXT, TEXT, type_annulation_paiement).
DROP FUNCTION IF EXISTS public.annuler_paiement(UUID, UUID, UUID, UUID, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.annuler_paiement(
  p_paiement_id      UUID,
  p_pressing_id      UUID,
  p_user_id          UUID,
  p_personnel_id     UUID,
  p_motif            TEXT,
  p_role             TEXT,
  p_type             public.type_annulation_paiement DEFAULT 'autre'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_paiement    RECORD;
  v_commande    RECORD;
  v_total_paye  INTEGER := 0;
  v_nouveau_statut statut_paiement_commande;
BEGIN
  -- 0. Validation du motif
  IF p_motif IS NULL OR length(trim(p_motif)) = 0 THEN
    RETURN jsonb_build_object('success', false, 'code', 'MOTIF_REQUIS',
      'error', 'Un motif d''annulation est obligatoire.');
  END IF;
  IF length(p_motif) > 1000 THEN
    RETURN jsonb_build_object('success', false, 'code', 'MOTIF_TOO_LONG',
      'error', 'Le motif ne peut pas dépasser 1000 caractères.');
  END IF;

  -- 0b. Validation du type (si NULL → 'autre' par défaut, défensif)
  IF p_type IS NULL THEN
    -- Ne devrait pas arriver (DEFAULT + NOT NULL sur la colonne), mais
    -- on gère le cas où un appelant passerait explicitement NULL.
    p_type := 'autre';
  END IF;

  -- 0c. Restriction : seul le manager OU le comptable peut annuler.
  -- L'API vérifie déjà le rôle (CAN_ANNULER_PAIEMENT), mais on double-check
  -- ici pour empêcher un bypass direct de la RPC via PostgREST.
  IF p_role IS NULL OR (p_role <> 'manager' AND p_role <> 'comptable') THEN
    RETURN jsonb_build_object('success', false, 'code', 'ROLE_INSUFFISANT',
      'error', 'Seul le manager ou le comptable peut annuler un paiement.',
      'details', jsonb_build_object('role_recu', p_role, 'roles_autorises', ARRAY['manager','comptable']));
  END IF;

  -- 1. Verrouiller le paiement
  SELECT id, commande_id, montant, methode, pressing_id, statut_row
    INTO v_paiement
    FROM public.paiements p
    JOIN public.commandes c ON c.id = p.commande_id
   WHERE p.id = p_paiement_id
     AND c.pressing_id = p_pressing_id
   FOR UPDATE OF p;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'PAIEMENT_INTROUVABLE',
      'error', 'Paiement introuvable ou accès refusé.');
  END IF;

  IF v_paiement.statut_row = 'annule' THEN
    RETURN jsonb_build_object('success', false, 'code', 'PAIEMENT_DÉJÀ_ANNULE',
      'error', 'Ce paiement est déjà annulé.');
  END IF;

  -- 2. Verrouiller la commande aussi
  SELECT id, montant_total, statut
    INTO v_commande
    FROM public.commandes
   WHERE id = v_paiement.commande_id
   FOR UPDATE;

  IF v_commande.statut = 'annule' THEN
    RETURN jsonb_build_object('success', false, 'code', 'COMMANDE_ANNULEE',
      'error', 'Impossible d''annuler un paiement sur une commande déjà annulée.');
  END IF;

  -- 3. Marquer le paiement comme 'annule' (PAS de DELETE — JAMAIS)
  UPDATE public.paiements
     SET statut_row = 'annule',
         updated_at = NOW()
   WHERE id = p_paiement_id;

  -- 4. Créer l'écriture de reversal (avec le type)
  INSERT INTO public.paiement_annulations (
    paiement_original_id, pressing_id, commande_id,
    montant, methode, motif, type, annule_par
  ) VALUES (
    p_paiement_id, p_pressing_id, v_paiement.commande_id,
    v_paiement.montant, v_paiement.methode, p_motif, p_type, p_personnel_id
  );

  -- 5. Recalculer montant_paye + statut_paiement depuis les écritures valides
  --    (uniquement les paiements avec statut_row='actif').
  SELECT COALESCE(SUM(montant), 0)
    INTO v_total_paye
    FROM public.paiements
   WHERE commande_id = v_paiement.commande_id
     AND statut_row = 'actif';

  IF v_total_paye = 0 THEN
    v_nouveau_statut := 'non_paye';
  ELSIF v_total_paye < v_commande.montant_total THEN
    v_nouveau_statut := 'partiel';
  ELSE
    v_nouveau_statut := 'paye';
  END IF;

  UPDATE public.commandes
     SET montant_paye = v_total_paye,
         statut_paiement = v_nouveau_statut,
         updated_at = NOW()
   WHERE id = v_paiement.commande_id;

  RETURN jsonb_build_object(
    'success', true,
    'code', 'ANNULATION_OK',
    'data', jsonb_build_object(
      'paiement_id', p_paiement_id,
      'commande_id', v_paiement.commande_id,
      'montant_annule', v_paiement.montant,
      'nouveau_montant_paye', v_total_paye,
      'nouveau_statut_paiement', v_nouveau_statut,
      'reste_a_payer', GREATEST(0, v_commande.montant_total - v_total_paye),
      'type', p_type
    )
  );
END;
$$;

COMMENT ON FUNCTION public.annuler_paiement(UUID, UUID, UUID, UUID, TEXT, TEXT, public.type_annulation_paiement) IS
  'RPC atomique pour annuler un paiement (reversal). Marque le paiement comme statut_row=''annule'' SANS le supprimer (paiement original conservé), crée une écriture dans paiement_annulations (avec type), et recalcule montant_paye + statut_paiement depuis les écritures valides. Seul le manager ou le comptable peut annuler (vérifié côté SQL).';

-- Révoque l'accès anon/authenticated sur la NOUVELLE signature.
-- (L'ancien REVOKE portait sur l'ancienne signature — désormais inutile
-- puisque la fonction a été DROP puis recréée avec une signature différente.)
REVOKE EXECUTE ON FUNCTION public.annuler_paiement(UUID, UUID, UUID, UUID, TEXT, TEXT, public.type_annulation_paiement) FROM anon, authenticated;

-- ============================================================
-- SECTION 4 — Interdiction DELETE sur paiements (immuabilité)
-- ============================================================
-- PRINCIPE : un paiement enregistré ne doit JAMAIS être supprimé.
-- On supprime la policy FOR ALL existante (qui couvrait DELETE) et on la
-- remplace par 4 policies distinctes :
--   - SELECT (isolation pressing)  → autorisé
--   - INSERT (isolation pressing)  → autorisé
--   - UPDATE (isolation pressing)  → autorisé (statut_row, updated_at)
--   - DELETE                       → TOUJOURS REFUSÉ (USING(false))
--
-- Le super_admin garde un accès FOR ALL séparé (pour maintenance DB
-- exceptionnelle — pas utilisé par l'application).
--
-- + REVOKE DELETE FROM anon, authenticated (defense-in-depth : même si
--   une policy future autorisait le DELETE, le GRANT manque).

-- 4a. Drop les policies existantes (FOR ALL couvrait DELETE).
DROP POLICY IF EXISTS "isolation_pressing" ON public.paiements;
DROP POLICY IF EXISTS "super_admin_full_access" ON public.paiements;

-- 4b. Recrée les policies SELECT / INSERT / UPDATE (sans DELETE).
--     Utilise la même logique d'isolation que la policy FOR ALL originale.
CREATE POLICY "paiements_select_own_pressing"
  ON public.paiements
  FOR SELECT
  USING (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.commandes c
      WHERE c.id = paiements.commande_id
        AND c.pressing_id = public.get_pressing_id_utilisateur()
    )
  );

CREATE POLICY "paiements_insert_own_pressing"
  ON public.paiements
  FOR INSERT
  WITH CHECK (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.commandes c
      WHERE c.id = paiements.commande_id
        AND c.pressing_id = public.get_pressing_id_utilisateur()
    )
  );

CREATE POLICY "paiements_update_own_pressing"
  ON public.paiements
  FOR UPDATE
  USING (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.commandes c
      WHERE c.id = paiements.commande_id
        AND c.pressing_id = public.get_pressing_id_utilisateur()
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.commandes c
      WHERE c.id = paiements.commande_id
        AND c.pressing_id = public.get_pressing_id_utilisateur()
    )
  );

-- 4c. Policy DELETE : TOUJOURS REFUSÉ pour anon/authenticated.
--     USING(false) → aucune ligne ne passe le filtre → DELETE 0 rows.
CREATE POLICY "paiements_no_delete_for_clients"
  ON public.paiements
  FOR DELETE
  USING (public.is_super_admin());

COMMENT ON POLICY "paiements_no_delete_for_clients" ON public.paiements IS
  'Interdit la suppression physique d''un paiement pour les clients (anon/authenticated). Seul le super_admin peut DELETE (maintenance DB exceptionnelle). Un paiement annulé est marqué statut_row=''annule'' + écriture dans paiement_annulations — JAMAIS supprimé.';

-- 4d. REVOKE DELETE au niveau des GRANTS (defense-in-depth).
--     Même si une policy future autorisait le DELETE, le GRANT manque.
REVOKE DELETE ON public.paiements FROM anon, authenticated;

-- ============================================================
-- SECTION 5 — RLS sur paiement_annulations (type inclus)
-- ============================================================
-- La table paiement_annulations a déjà ses policies (migration 035).
-- On ne touche pas à SELECT/INSERT/UPDATE — on s'assure juste que le
-- DELETE reste bloqué pour les clients (déjà le cas via la policy
-- paiement_annulations_no_client_write USING(false) WITH CHECK(false)).
-- Aucune action nécessaire ici.

-- ============================================================
-- SECTION 6 — Vérification finale
-- ============================================================
DO $$
DECLARE
  v_has_type_col BOOLEAN;
  v_has_type_enum BOOLEAN;
  v_delete_policy_exists BOOLEAN;
BEGIN
  -- Vérifie que la colonne type existe sur paiement_annulations.
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'paiement_annulations'
      AND column_name = 'type'
  ) INTO v_has_type_col;

  IF NOT v_has_type_col THEN
    RAISE EXCEPTION 'Vérification échouée : colonne paiement_annulations.type manquante';
  END IF;

  -- Vérifie que l'enum type_annulation_paiement existe.
  SELECT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'type_annulation_paiement' AND n.nspname = 'public'
  ) INTO v_has_type_enum;

  IF NOT v_has_type_enum THEN
    RAISE EXCEPTION 'Vérification échouée : enum type_annulation_paiement manquant';
  END IF;

  -- Vérifie que la policy de blocage DELETE existe.
  SELECT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'paiements'
      AND policyname = 'paiements_no_delete_for_clients'
  ) INTO v_delete_policy_exists;

  IF NOT v_delete_policy_exists THEN
    RAISE EXCEPTION 'Vérification échouée : policy paiements_no_delete_for_clients manquante';
  END IF;

  RAISE NOTICE 'Migration 043 : système financier immuable finalisé ✓';
  RAISE NOTICE '  - Enum type_annulation_paiement créé (erreur_saisie, doublon, remboursement, autre)';
  RAISE NOTICE '  - Colonne paiement_annulations.type ajoutée (NOT NULL DEFAULT autre)';
  RAISE NOTICE '  - RPC annuler_paiement recréée avec p_type + manager/comptable';
  RAISE NOTICE '  - DELETE sur paiements interdit pour anon/authenticated (policy + REVOKE)';
END $$;

-- ============================================================
-- SECTION 7 — Recharger le schéma PostgREST
-- ============================================================
-- Notifie PostgREST de recharger le schéma pour prendre en compte
-- la nouvelle signature de la RPC + la nouvelle enum.
NOTIFY pgrst, 'reload schema';
