-- ============================================================
-- Migration 044 : Fix trigger guard_paiement_pas_depassement
-- ------------------------------------------------------------
-- BUG : Le trigger guard_paiement_pas_depassement (migration 035)
-- s'exécute BEFORE INSERT sur paiements et lève l'exception
-- 'Commande <NULL> introuvable' quand commande_id est NULL.
--
-- Or, les paiements d'ABONNEMENT (renouvellement) ont commande_id=NULL
-- (contrainte CHECK XOR : exactement un de commande_id/abonnement_id).
-- Le trigger bloquait donc TOUS les renouvellements d'abonnement.
--
-- FIX : Skip la vérification de dépassement quand commande_id IS NULL
-- (cas d'un paiement d'abonnement — pas de montant_total de commande
-- à vérifier).
-- ============================================================

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
  -- Si commande_id est NULL, c'est un paiement d'abonnement (pas de
  -- commande associée). La contrainte CHECK XOR garantit qu'abonnement_id
  -- est renseigné. Il n'y a pas de montant_total de commande à vérifier,
  -- on skippe la garde. (Le montant de l'abonnement est validé côté API.)
  IF NEW.commande_id IS NULL THEN
    RETURN NEW;
  END IF;

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

COMMENT ON FUNCTION public.guard_paiement_pas_depassement() IS
  'Trigger BEFORE INSERT/UPDATE sur paiements: refuse tout paiement qui ferait dépasser montant_total + tolérance 1 FCFA. Skip la vérification quand commande_id IS NULL (paiement d''abonnement). Defense-in-depth (l''API et la RPC vérifient déjà).';

-- Le trigger existant (trg_guard_paiement_pas_depassement) reste attaché,
-- il appelle simplement la fonction mise à jour. Pas besoin de DROP/CREATE
-- le trigger lui-même.

NOTIFY pgrst, 'reload schema';
