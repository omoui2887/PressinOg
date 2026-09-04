-- ============================================================
-- Migration 047 : Fix trigger_recalculer_paiement_commande
-- ------------------------------------------------------------
-- BUG : Le trigger trigger_recalculer_paiement_commande (après
-- INSERT/UPDATE/DELETE sur paiements) sommait TOUS les paiements
-- d'une commande sans filtrer sur statut_row = 'actif'. Les
-- paiements annulés (statut_row = 'annule') étaient inclus dans
-- le total, ce qui donnait un montant_paye incorrect et pouvait
-- violer la contrainte commandes_montant_paye_coherent_check
-- (montant_paye <= montant_total + 1), bloquant la création de
-- commande avec l'erreur "Erreur interne du serveur".
--
-- FIX : Ajout du filtre `AND statut_row = 'actif'` dans le SELECT
-- SUM(montant) pour ne compter que les paiements actifs.
-- ============================================================

CREATE OR REPLACE FUNCTION public.trigger_recalculer_paiement_commande()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
    cmd_id            UUID;
    total_paye        INTEGER;
    total_commande    INTEGER;
    nouveau_statut    statut_paiement_commande;
BEGIN
    -- Identifier la commande concernée.
    cmd_id := COALESCE(NEW.commande_id, OLD.commande_id);
    IF cmd_id IS NULL THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    -- Calculer le total payé en ne comptant QUE les paiements actifs
    -- (statut_row = 'actif'). Les paiements annulés (reversal) sont
    -- exclus du calcul. Sans ce filtre, un paiement annulé restait
    -- compté dans montant_paye, faussant le statut de paiement et
    -- pouvant violer la contrainte montant_paye <= montant_total + 1.
    SELECT COALESCE(SUM(montant), 0)
      INTO total_paye
      FROM public.paiements
     WHERE commande_id = cmd_id
       AND statut_row = 'actif';

    -- Récupérer le montant total de la commande.
    SELECT montant_total
      INTO total_commande
      FROM public.commandes
     WHERE id = cmd_id;

    IF NOT FOUND THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    -- Déterminer le statut de paiement.
    IF total_paye = 0 THEN
        nouveau_statut := 'non_paye';
    ELSIF total_paye < total_commande THEN
        nouveau_statut := 'partiel';
    ELSE
        nouveau_statut := 'paye';
    END IF;

    -- Mettre à jour la commande (single UPDATE pour éviter la récursivité).
    UPDATE public.commandes
       SET montant_paye = total_paye,
           statut_paiement = nouveau_statut,
           updated_at = NOW()
     WHERE id = cmd_id;

    RETURN COALESCE(NEW, OLD);
END;
$$;

COMMENT ON FUNCTION public.trigger_recalculer_paiement_commande() IS
  'Trigger AFTER INSERT/UPDATE/DELETE sur paiements : recalcule montant_paye et statut_paiement de la commande en ne sommant QUE les paiements actifs (statut_row = ''actif'').';

NOTIFY pgrst, 'reload schema';
