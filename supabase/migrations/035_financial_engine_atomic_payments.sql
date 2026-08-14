-- ============================================================
-- e-pressing — Migration 035 : Moteur financier atomique (paiements)
-- ============================================================
-- Fichier    : 035_financial_engine_atomic_payments.sql
-- Version    : 1.0
-- Date       : 14/08/2026
-- Objectif   : Sécuriser le moteur financier — rendre les paiements
--              atomiques, idempotents, et protégés contre la concurrence
--              (double-clic, retry réseau, deux caissiers simultanés).
--
-- RÈGLES IMPOSÉES :
--   1. Le serveur (PostgreSQL) est l'unique autorité financière.
--   2. idempotency_key sur paiements (UUID client, UNIQUE par pressing).
--   3. RPC encaisser_paiement_atomic(...) — tout-en-un atomique :
--        - verrouille la commande FOR UPDATE
--        - vérifie statut + règle acompte/solde
--        - calcule le reste réel
--        - refuse tout dépassement
--        - insère le paiement
--        - recalcul montant_paye + statut_paiement (sans trigger récursif)
--        - retourne le résultat final
--   4. table paiement_annulations (reversal) — JAMAIS de DELETE sur paiements.
--   5. Incrément atomique des points fidélité (sans SELECT + UPDATE).
--
-- Non-cassable : préserve toutes les colonnes/contraintes existantes.
-- Idempotent : ADD COLUMN IF NOT EXISTS, CREATE INDEX IF NOT EXISTS,
--              CREATE OR REPLACE FUNCTION, DO $$ ... EXCEPTION.
-- ============================================================

-- ============================================================
-- SECTION 1 — Colonne idempotency_key sur paiements
-- ============================================================
-- UUID généré côté client. Si la même (pressing_id, idempotency_key)
-- est re-soumise, on retourne le paiement existant sans en créer un nouveau.
-- NULL = pas d'idempotence (backward compatible).

ALTER TABLE public.paiements
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_paiements_idempotency
  ON public.paiements (commande_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

COMMENT ON COLUMN public.paiements.idempotency_key IS
  'Clé d''idempotence fournie par le client (UUID). Permet de retourner le même paiement si la requête est rejouée (double-clic, retry réseau). UNIQUE par commande. NULL = pas d''idempotence.';

-- ============================================================
-- SECTION 2 — Colonne statut_paiement_row sur paiements
-- ============================================================
-- Permet de marquer un paiement comme "annule" sans le supprimer.
-- "actif" = paiement valide (défaut)
-- "annule" = paiement annulé par reversal (voire paiement_annulations)

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'statut_paiement_row' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.statut_paiement_row AS ENUM ('actif', 'annule');
  END IF;
END $$;

ALTER TABLE public.paiements
  ADD COLUMN IF NOT EXISTS statut_row public.statut_paiement_row
  NOT NULL DEFAULT 'actif';

CREATE INDEX IF NOT EXISTS idx_paiements_statut_row
  ON public.paiements (commande_id, statut_row);

COMMENT ON COLUMN public.paiements.statut_row IS
  'Statut du paiement: actif (valide, comptabilisé dans montant_paye) ou annule (reversal, ne compte plus). Les paiements annulés NE SONT JAMAIS SUPPRIMÉS — ils restent pour audit.';

-- ============================================================
-- SECTION 3 — Table paiement_annulations (écritures de reversal)
-- ============================================================
-- PRINCIPE : on ne supprime JAMAIS un paiement financier.
-- Pour corriger une erreur, on crée une écriture d'annulation
-- qui pointe vers le paiement original + motif + utilisateur.

CREATE TABLE IF NOT EXISTS public.paiement_annulations (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  paiement_original_id UUID        NOT NULL REFERENCES public.paiements(id) ON DELETE RESTRICT,
  pressing_id         UUID         NOT NULL REFERENCES public.pressing(id) ON DELETE CASCADE,
  commande_id         UUID         NOT NULL REFERENCES public.commandes(id) ON DELETE CASCADE,
  montant             INTEGER      NOT NULL,  -- montant annulé (copie pour snapshot)
  methode             methode_paiement NOT NULL,  -- copie pour snapshot
  motif               TEXT         NOT NULL,
  annule_par          UUID         REFERENCES public.personnel(id) ON DELETE SET NULL,
  date_annulation     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_paiement_annulations_paiement
  ON public.paiement_annulations (paiement_original_id);
CREATE INDEX IF NOT EXISTS idx_paiement_annulations_commande
  ON public.paiement_annulations (commande_id);
CREATE INDEX IF NOT EXISTS idx_paiement_annulations_pressing
  ON public.paiement_annulations (pressing_id, date_annulation DESC);

COMMENT ON TABLE public.paiement_annulations IS
  'Journal des annulations de paiements (reversal entries). Un paiement annulé n''est jamais supprimé de la table paiements — il est marqué statut_row=''annule'' et une ligne ici trace le motif, l''auteur et la date.';

-- ============================================================
-- SECTION 4 — RLS sur paiement_annulations
-- ============================================================
-- Même politique que paiements : le personnel ne voit/annule que
-- les paiements de son propre pressing. INSERT/UPDATE/DELETE bloqués
-- côté client (seul service_role peut écrire, via getSupabaseAdmin()).

ALTER TABLE public.paiement_annulations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'paiement_annulations'
      AND policyname = 'paiement_annulations_select_own_pressing'
  ) THEN
    CREATE POLICY paiement_annulations_select_own_pressing
      ON public.paiement_annulations
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.commandes c
          WHERE c.id = paiement_annulations.commande_id
            AND c.pressing_id = public.get_pressing_id_utilisateur()
        )
      );
  END IF;
END $$;

-- INSERT/UPDATE/DELETE bloqués côté client (service_role only, comme audit_log)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'paiement_annulations'
      AND policyname = 'paiement_annulations_no_client_write'
  ) THEN
    CREATE POLICY paiement_annulations_no_client_write
      ON public.paiement_annulations
      FOR ALL
      TO authenticated, anon
      USING (false)
      WITH CHECK (false);
  END IF;
END $$;

-- ============================================================
-- SECTION 5 — RPC atomique : encaisser_paiement_atomic
-- ============================================================
-- Cette fonction fait TOUT en une seule transaction SQL :
--   1. Verrouille la commande (SELECT ... FOR UPDATE)
--   2. Vérifie que la commande n'est pas annulée/terminée
--   3. Vérifie l'idempotency_key (si fournie, retourne le paiement existant)
--   4. Calcule le reste réel (montant_total - SUM(paiements actifs))
--   5. Refuse si montant > reste + tolérance 1 FCFA
--   6. Vérifie la règle acompte/solde (statut commande requis)
--   7. INSERT le paiement
--   8. Recalcule montant_paye + statut_paiement (sans trigger)
--   9. Incrémente atomiquement clients.points_fidelite
--  10. Retourne le résultat complet
--
-- SECURITY INVOKER : la fonction hérite des droits de l'appelant.
-- L'appelant est service_role (route handler API), qui bypass RLS.
-- Les contrôles de pressing_id sont explicites (defense-in-depth).

CREATE OR REPLACE FUNCTION public.encaisser_paiement_atomic(
  p_commande_id      UUID,
  p_pressing_id      UUID,
  p_user_id          UUID,            -- auth.users.id (pour audit)
  p_personnel_id     UUID,            -- personnel.id (pour paiements.enregistre_par)
  p_montant          INTEGER,
  p_methode          methode_paiement,
  p_reference        TEXT DEFAULT NULL,
  p_notes            TEXT DEFAULT NULL,
  p_idempotency_key  TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_commande         RECORD;
  v_total_paye       INTEGER := 0;
  v_reste            INTEGER := 0;
  v_ferme_commande   BOOLEAN := false;
  v_est_acompte      BOOLEAN := false;
  v_nouveau_statut   statut_paiement_commande;
  v_paiement_id      UUID;
  v_points_gagnes    INTEGER := 0;
  v_result           JSONB;
  v_existing         RECORD;
  v_statuts_terminaux TEXT[] := ARRAY['en_livraison', 'livre', 'retire', 'annule'];
  v_statuts_traites  TEXT[] := ARRAY['repasse', 'pret'];
BEGIN
  -- --------------------------------------------------------
  -- 0. Validation des entrées
  -- --------------------------------------------------------
  IF p_montant IS NULL OR p_montant <= 0 OR p_montant != floor(p_montant) THEN
    RETURN jsonb_build_object('success', false, 'code', 'MONTANT_INVALIDE',
      'error', 'Le montant doit être un entier positif (FCFA).');
  END IF;

  IF p_notes IS NOT NULL AND length(p_notes) > 2000 THEN
    RETURN jsonb_build_object('success', false, 'code', 'NOTES_TOO_LONG',
      'error', 'Les notes ne peuvent pas dépasser 2000 caractères.');
  END IF;

  -- --------------------------------------------------------
  -- 1. Verrouiller la commande (FOR UPDATE) + contrôle pressing_id
  -- --------------------------------------------------------
  SELECT id, pressing_id, client_id, montant_total, montant_paye,
         statut, statut_paiement
    INTO v_commande
    FROM public.commandes
   WHERE id = p_commande_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'COMMANDE_INTROUVABLE',
      'error', 'Commande introuvable.');
  END IF;

  -- Defense-in-depth : vérifier que la commande appartient bien au pressing
  -- passé en paramètre (l'API a déjà vérifié via RLS, mais on double-check).
  IF v_commande.pressing_id IS DISTINCT FROM p_pressing_id THEN
    RETURN jsonb_build_object('success', false, 'code', 'PRESSING_MISMATCH',
      'error', 'La commande n''appartient pas au pressing spécifié.');
  END IF;

  -- --------------------------------------------------------
  -- 2. Vérifier le statut de la commande
  -- --------------------------------------------------------
  IF v_commande.statut = 'annule' THEN
    RETURN jsonb_build_object('success', false, 'code', 'COMMANDE_ANNULEE',
      'error', 'Impossible d''encaisser un paiement sur une commande annulée.');
  END IF;

  IF v_commande.statut = ANY(v_statuts_terminaux) THEN
    RETURN jsonb_build_object('success', false, 'code', 'WORKFLOW_PAIEMENT_REFUSE',
      'error', 'Encaissement refusé : la commande est au statut terminal "' || v_commande.statut || '".',
      'details', jsonb_build_object('statut_commande', v_commande.statut));
  END IF;

  -- --------------------------------------------------------
  -- 3. Idempotency : si la clé existe déjà, retourner le paiement existant
  -- --------------------------------------------------------
  IF p_idempotency_key IS NOT NULL AND p_idempotency_key <> '' THEN
    SELECT id, montant, methode, date_paiement, reference, statut_row
      INTO v_existing
      FROM public.paiements
     WHERE commande_id = p_commande_id
       AND idempotency_key = p_idempotency_key
     LIMIT 1;

    IF FOUND THEN
      -- Si le paiement existant a été annulé, on refuse le replay
      -- (sinon on pourrait "réactiver" un paiement annulé par retry).
      IF v_existing.statut_row = 'annule' THEN
        RETURN jsonb_build_object('success', false, 'code', 'PAIEMENT_DEJAY_ANNULE',
          'error', 'Ce paiement a été annulé et ne peut pas être rejoué.');
      END IF;

      -- Re-fetch l'état courant de la commande pour le retour
      SELECT montant_paye, statut_paiement, montant_total
        INTO v_commande.montant_paye, v_commande.statut_paiement, v_commande.montant_total
        FROM public.commandes
       WHERE id = p_commande_id;

      RETURN jsonb_build_object(
        'success', true,
        'code', 'IDEMPOTENT_REPLAY',
        'data', jsonb_build_object(
          'paiement_id', v_existing.id,
          'commande_id', p_commande_id,
          'montant', v_existing.montant,
          'methode', v_existing.methode,
          'date_paiement', v_existing.date_paiement,
          'reference', v_existing.reference,
          'nouveau_montant_paye', v_commande.montant_paye,
          'nouveau_statut_paiement', v_commande.statut_paiement,
          'reste_a_payer', GREATEST(0, v_commande.montant_total - v_commande.montant_paye),
          'montant_total', v_commande.montant_total,
          'points_gagnes', 0,  -- déjà crédités au premier appel
          'replay', true
        )
      );
    END IF;
  END IF;

  -- --------------------------------------------------------
  -- 4. Calculer le reste réel (somme des paiements ACTIFS)
  -- --------------------------------------------------------
  -- ⚠️ On ne peut PAS faire confiance à commandes.montant_paye car il
  -- peut être stale (le trigger 005 le met à jour, mais en cas de
  -- concurrence ou de paiement annulé manuellement, on doit recalculer).
  SELECT COALESCE(SUM(montant), 0)
    INTO v_total_paye
    FROM public.paiements
   WHERE commande_id = p_commande_id
     AND statut_row = 'actif';

  v_reste := v_commande.montant_total - v_total_paye;

  IF v_reste <= 0 THEN
    RETURN jsonb_build_object('success', false, 'code', 'DEJA_PAYE',
      'error', 'Cette commande est déjà entièrement payée.',
      'details', jsonb_build_object(
        'montant_total', v_commande.montant_total,
        'montant_paye', v_total_paye,
        'reste', 0
      ));
  END IF;

  -- Tolérance de 1 FCFA (alignée sur CHECK commandes.montant_paye ≤ montant_total+1)
  IF p_montant > v_reste + 1 THEN
    RETURN jsonb_build_object('success', false, 'code', 'MONTANT_DEPASSE_SOLDE',
      'error', 'Le montant (' || p_montant || ' FCFA) dépasse le reste à payer (' || v_reste || ' FCFA).',
      'details', jsonb_build_object(
        'montant_demande', p_montant,
        'reste_a_payer', v_reste,
        'montant_total', v_commande.montant_total,
        'montant_paye', v_total_paye
      ));
  END IF;

  -- --------------------------------------------------------
  -- 5. Vérifier la règle acompte/solde (workflow)
  -- --------------------------------------------------------
  v_ferme_commande := (v_total_paye + p_montant >= v_commande.montant_total);
  v_est_acompte := NOT v_ferme_commande;

  IF v_ferme_commande THEN
    -- Paiement du solde final → commande doit être au moins "repasse"
    IF NOT (v_commande.statut = ANY(v_statuts_traites) OR v_commande.statut IN ('en_livraison', 'livre', 'retire')) THEN
      -- Exception : à la création (statut='recu'), un acompte total est autorisé.
      -- Mais cet endpoint (/api/personnel/caissier/encaisser) est pour les
      -- paiements ULTÉRIEURS, donc on applique le guard strict.
      -- L'acompte total à la création est géré par POST /api/admin/commandes.
      RETURN jsonb_build_object('success', false, 'code', 'WORKFLOW_PAIEMENT_REFUSE',
        'error', 'Encaissement du solde final refusé : la commande doit être au moins "Repassé".',
        'details', jsonb_build_object(
          'statut_commande', v_commande.statut,
          'statut_requis_minimum', 'repasse',
          'montant_paye_actuel', v_total_paye,
          'montant_total', v_commande.montant_total,
          'montant_paiement_propose', p_montant,
          'reste_a_payer', v_reste
        ));
    END IF;
  END IF;

  -- --------------------------------------------------------
  -- 6. INSERT le paiement (avec statut_row='actif')
  -- --------------------------------------------------------
  v_paiement_id := gen_random_uuid();

  INSERT INTO public.paiements (
    id, commande_id, montant, methode, reference,
    date_paiement, enregistre_par, notes,
    est_acompte, idempotency_key, statut_row
  ) VALUES (
    v_paiement_id, p_commande_id, p_montant, p_methode, p_reference,
    NOW(), p_personnel_id, p_notes,
    v_est_acompte, p_idempotency_key, 'actif'
  );

  -- --------------------------------------------------------
  -- 7. Recalculer montant_paye + statut_paiement MANUELLEMENT
  --    (le trigger 005 le ferait aussi, mais on le fait ici en
  --    avance pour retourner la valeur correcte sans re-fetch).
  -- --------------------------------------------------------
  v_total_paye := v_total_paye + p_montant;

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
   WHERE id = p_commande_id;

  -- --------------------------------------------------------
  -- 8. Incrément atomique des points fidélité
  -- --------------------------------------------------------
  -- points = points + floor(montant / 100)
  -- UPDATE atomique sans SELECT préalable (pas de race condition).
  IF v_commande.client_id IS NOT NULL THEN
    v_points_gagnes := floor(p_montant / 100);
    IF v_points_gagnes > 0 THEN
      UPDATE public.clients
         SET points_fidelite = points_fidelite + v_points_gagnes,
             updated_at = NOW()
       WHERE id = v_commande.client_id
         AND pressing_id = p_pressing_id;
    END IF;
  END IF;

  -- --------------------------------------------------------
  -- 9. Retourner le résultat
  -- --------------------------------------------------------
  v_result := jsonb_build_object(
    'success', true,
    'code', 'PAIEMENT_OK',
    'data', jsonb_build_object(
      'paiement_id', v_paiement_id,
      'commande_id', p_commande_id,
      'montant', p_montant,
      'methode', p_methode,
      'date_paiement', NOW(),
      'reference', p_reference,
      'est_acompte', v_est_acompte,
      'nouveau_montant_paye', v_total_paye,
      'nouveau_statut_paiement', v_nouveau_statut,
      'reste_a_payer', GREATEST(0, v_commande.montant_total - v_total_paye),
      'montant_total', v_commande.montant_total,
      'points_gagnes', v_points_gagnes,
      'replay', false
    )
  );

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.encaisser_paiement_atomic(UUID, UUID, UUID, UUID, INTEGER, methode_paiement, TEXT, TEXT, TEXT) IS
  'RPC atomique pour encaisser un paiement. Verrouille la commande FOR UPDATE, vérifie statut + règle acompte/solde, calcule le reste réel, refuse tout dépassement, insère le paiement, recalcule montant_paye + statut_paiement, incrémente atomiquement les points fidélité. Idempotente via idempotency_key (retourne le paiement existant si la clé existe). SECURITY INVOKER — appelée par service_role uniquement.';

-- ============================================================
-- SECTION 6 — RPC atomique : annuler_paiement (reversal)
-- ============================================================
-- Marque un paiement comme 'annule' (sans le supprimer) + crée une
-- écriture dans paiement_annulations + recalcule montant_paye.
-- Vérifie que l'utilisateur a les droits (p_role dans la whitelist).

CREATE OR REPLACE FUNCTION public.annuler_paiement(
  p_paiement_id      UUID,
  p_pressing_id      UUID,
  p_user_id          UUID,
  p_personnel_id     UUID,
  p_motif            TEXT,
  p_role             TEXT
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
  -- 0. Validation
  IF p_motif IS NULL OR length(trim(p_motif)) = 0 THEN
    RETURN jsonb_build_object('success', false, 'code', 'MOTIF_REQUIS',
      'error', 'Un motif d''annulation est obligatoire.');
  END IF;
  IF length(p_motif) > 1000 THEN
    RETURN jsonb_build_object('success', false, 'code', 'MOTIF_TOO_LONG',
      'error', 'Le motif ne peut pas dépasser 1000 caractères.');
  END IF;

  -- Restriction : seul le manager peut annuler un paiement
  -- (le caissier/réceptionniste peuvent encaisser mais pas annuler).
  -- L'API vérifie déjà le rôle, mais on double-check ici.
  IF p_role IS NULL OR p_role <> 'manager' THEN
    RETURN jsonb_build_object('success', false, 'code', 'ROLE_INSUFFISANT',
      'error', 'Seul le manager peut annuler un paiement.',
      'details', jsonb_build_object('role_recu', p_role, 'role_requis', 'manager'));
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

  -- 3. Marquer le paiement comme 'annule' (PAS de DELETE)
  UPDATE public.paiements
     SET statut_row = 'annule',
         updated_at = NOW()
   WHERE id = p_paiement_id;

  -- 4. Créer l'écriture de reversal
  INSERT INTO public.paiement_annulations (
    paiement_original_id, pressing_id, commande_id,
    montant, methode, motif, annule_par
  ) VALUES (
    p_paiement_id, p_pressing_id, v_paiement.commande_id,
    v_paiement.montant, v_paiement.methode, p_motif, p_personnel_id
  );

  -- 5. Recalculer montant_paye + statut_paiement (sans le paiement annulé)
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
      'reste_a_payer', GREATEST(0, v_commande.montant_total - v_total_paye)
    )
  );
END;
$$;

COMMENT ON FUNCTION public.annuler_paiement(UUID, UUID, UUID, UUID, TEXT, TEXT) IS
  'RPC atomique pour annuler un paiement (reversal). Marque le paiement comme statut_row=''annule'' SANS le supprimer, crée une écriture dans paiement_annulations, et recalcule montant_paye + statut_paiement. Seul le manager peut annuler (vérifié côté SQL).';

-- ============================================================
-- SECTION 7 — Grants
-- ============================================================
-- Les RPC sont SECURITY INVOKER — elles héritent des droits de l'appelant.
-- L'appelant (service_role via getSupabaseAdmin()) bypass RLS.
-- On révoque l'accès anon/authenticated pour empêcher un client d'appeler
-- directement la RPC via PostgREST (qui utiliserait le JWT utilisateur).

REVOKE EXECUTE ON FUNCTION public.encaisser_paiement_atomic(UUID, UUID, UUID, UUID, INTEGER, methode_paiement, TEXT, TEXT, TEXT) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.annuler_paiement(UUID, UUID, UUID, UUID, TEXT, TEXT) FROM anon, authenticated;
-- service_role a EXECUTE par défaut sur les fonctions publiques (GRANT USAGE ON SCHEMA public).

-- ============================================================
-- SECTION 8 — Trigger guard : empêcher INSERT direct de paiement
-- avec montant_paye > montant_total + 1 (double-check côté DB)
-- ============================================================
-- Le trigger 005 existant recalculait montant_paye après INSERT.
-- On garde ce trigger, mais on ajoute un guard AVANT INSERT pour
-- refuser tout paiement qui ferait dépasser le solde.
-- (L'API + la RPC vérifient déjà, mais defense-in-depth.)

CREATE OR REPLACE FUNCTION public.guard_paiement_pas_depassement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_montant_total INTEGER;
  v_total_paye    INTEGER;
BEGIN
  SELECT montant_total INTO v_montant_total
    FROM public.commandes
   WHERE id = NEW.commande_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Commande % introuvable', NEW.commande_id;
  END IF;

  -- Somme des paiements actifs (hors celui-ci en cours d'insert)
  SELECT COALESCE(SUM(montant), 0)
    INTO v_total_paye
    FROM public.paiements
   WHERE commande_id = NEW.commande_id
     AND statut_row = 'actif'
     AND id IS DISTINCT FROM NEW.id;

  IF v_total_paye + NEW.montant > v_montant_total + 1 THEN
    RAISE EXCEPTION 'PAIEMENT_DEPASSE_SOLDE: le paiement (%) ferait passer montant_paye à %, dépassant le montant_total (%) + tolérance 1',
      NEW.montant, v_total_paye + NEW.montant, v_montant_total
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_paiement_pas_depassement ON public.paiements;
CREATE TRIGGER trg_guard_paiement_pas_depassement
  BEFORE INSERT OR UPDATE OF montant, commande_id ON public.paiements
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_paiement_pas_depassement();

COMMENT ON FUNCTION public.guard_paiement_pas_depassement() IS
  'Trigger BEFORE INSERT/UPDATE sur paiements: refuse tout paiement qui ferait dépasser montant_total + tolérance 1 FCFA. Defense-in-depth (l''API et la RPC vérifient déjà).';

REVOKE EXECUTE ON FUNCTION public.guard_paiement_pas_depassement() FROM anon, authenticated;

-- ============================================================
-- SECTION 9 — Reload PostgREST schema cache
-- ============================================================
-- Pour que les nouvelles colonnes/fonctions soient visibles via l'API
-- Supabase immédiatement (sinon PostgREST garde le cache stale ~10min).
NOTIFY pgrst, 'reload schema';
