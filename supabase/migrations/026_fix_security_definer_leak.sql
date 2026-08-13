-- ============================================================
-- e-pressing — Migration 026 : Hardening SECURITY DEFINER (Phase 4 #11)
-- ============================================================
-- Fichier    : 026_fix_security_definer_leak.sql
-- Version    : 1.0
-- Description : Complément défense-en-profondeur à la migration 018
--               (qui avait déjà recréé les 3 fonctions fuyardes en
--               SECURITY INVOKER).
--
-- Contexte sécurité (AUDIT_SECURITE.md §2.5) :
--   ---------------------------------------------------------------
--   3 fonctions SECURITY DEFINER fuyaient le statut cross-pressing :
--     1. public.deriver_statut_commande(UUID)        — migration 005
--     2. public.calculer_statut_commande(UUID)       — migration 010
--     3. public.calculer_statut_paiement_commande(UUID) — migration 010
--
--   La migration 018 les a recréées en SECURITY INVOKER (la RLS
--   fait alors le travail de filtrage par pressing_id). C'est la
--   correction primaire.
--
--   La présente migration 026 est un HARDENING COMPLÉMENTAIRE :
--     A) Re-déclare explicitement les 3 fonctions en SECURITY INVOKER
--        (idempotent — protège contre un éventuel rollback de 018).
--     B) Ajoute un CHECK de pressing_id au début des 2 fonctions
--        `calculer_*` (defense-in-depth : même si un futur dev
--        rebascule en SECURITY DEFINER, le check pressing_id
--        empêche la fuite cross-tenant).
--     C) REVOKE EXECUTE FROM anon sur les helpers SECURITY DEFINER
--        restants (is_super_admin, get_pressing_id_utilisateur,
--        current_pressing_id, is_pressing_manager) — bien que RLS
--        bloque déjà anon (pas de auth.uid()), la révocation
--        explicite supprime toute surface d'appel /rpc/.
--
-- Choix SECURITY INVOKER + check pressing_id (cf. 018 pour le
-- rationale complet) :
--   - SECURITY INVOKER → la RLS s'applique (filtrage natif).
--   - Check pressing_id explicite en début de fonction → si un
--     futur changement de SECURITY rebascule en DEFINER (par
--     mégarde), le check pressing_id empêche quand même la fuite.
--   - Le check utilise get_pressing_id_utilisateur() qui retourne
--     NULL pour service_role → on doit donc ACCEPTER le cas
--     "pressing_id_utilisateur IS NULL" (service_role légitime,
--     API routes Next.js) pour ne pas casser les appels serveur.
--     En cas d'appel par un user authentifié, le check est strict.
--
-- IDEMPOTENT : CREATE OR REPLACE FUNCTION (ré-exécutable) +
--   REVOKE/GRANT (ré-exécutables) + COMMENT ON FUNCTION (écrase).
--
-- Prérequis :
--   - Migrations 001 → 018 exécutées.
--   - RLS activée sur commandes, articles_vetements, paiements (006).
-- ============================================================


-- ============================================================
-- A) Re-déclaration SECURITY INVOKER des 3 fonctions (cf. 018)
-- ============================================================
-- On re-crée les 3 fonctions à l'identique de 018 (corps inchangé
-- pour deriver_statut_commande ; corps enrichi d'un check
-- pressing_id pour les 2 `calculer_*`). Toutes en SECURITY INVOKER.
-- ============================================================


-- A.1. deriver_statut_commande — SECURITY INVOKER (corps identique à 018)
CREATE OR REPLACE FUNCTION public.deriver_statut_commande(p_commande_id UUID)
RETURNS statut_commande
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    total_articles       INT;
    nb_recu              INT;
    nb_en_traitement     INT;
    nb_lave              INT;
    nb_repasse           INT;
    nb_pret              INT;
    nb_retire            INT;
    nb_livre             INT;
    statut_calcule       statut_commande;
BEGIN
    SELECT COUNT(*) INTO total_articles
      FROM public.articles_vetements
     WHERE commande_id = p_commande_id;

    IF total_articles = 0 THEN
        SELECT statut INTO statut_calcule
          FROM public.commandes WHERE id = p_commande_id;
        RETURN COALESCE(statut_calcule, 'recu'::statut_commande);
    END IF;

    SELECT
        COUNT(*) FILTER (WHERE statut = 'recu'),
        COUNT(*) FILTER (WHERE statut = 'en_traitement'),
        COUNT(*) FILTER (WHERE statut = 'lave'),
        COUNT(*) FILTER (WHERE statut = 'repasse'),
        COUNT(*) FILTER (WHERE statut = 'pret'),
        COUNT(*) FILTER (WHERE statut = 'retire'),
        COUNT(*) FILTER (WHERE statut = 'livre')
      INTO nb_recu, nb_en_traitement, nb_lave, nb_repasse, nb_pret, nb_retire, nb_livre
      FROM public.articles_vetements
     WHERE commande_id = p_commande_id;

    IF nb_livre = total_articles THEN
        statut_calcule := 'livre';
    ELSIF nb_retire = total_articles THEN
        statut_calcule := 'retire';
    ELSIF nb_pret + nb_retire + nb_livre = total_articles THEN
        statut_calcule := 'pret';
    ELSIF nb_repasse > 0 AND nb_en_traitement = 0 AND nb_lave = 0 AND nb_recu = 0 THEN
        statut_calcule := 'repasse';
    ELSIF nb_lave > 0 AND nb_en_traitement = 0 AND nb_recu = 0 THEN
        statut_calcule := 'lave';
    ELSIF nb_en_traitement > 0 THEN
        statut_calcule := 'en_traitement';
    ELSE
        statut_calcule := 'recu';
    END IF;

    RETURN statut_calcule;
END;
$$;

COMMENT ON FUNCTION public.deriver_statut_commande(UUID) IS
    'Calcule le statut_commande dérivé des statuts des articles (PRD §6.4). '
    'SECURITY INVOKER (AUDIT 2.5 — migrations 018 + 026) : RLS s''applique → '
    'un user ne voit QUE les commandes de son pressing. Le trigger appelant '
    '(trigger_recalculer_statut_commande, SECURITY DEFINER) exécute cette '
    'fonction en tant que propriétaire postgres qui bypass RLS.';


-- A.2. calculer_statut_commande — SECURITY INVOKER + check pressing_id
CREATE OR REPLACE FUNCTION public.calculer_statut_commande(
    commande_id UUID
)
RETURNS statut_commande
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_commande_pressing   UUID;
    v_user_pressing       UUID;
BEGIN
    -- Defense-in-depth (migration 026) :
    -- Récupère le pressing_id de la commande ciblée ET celui de l'utilisateur
    -- courant. Si l'utilisateur est un personnel (v_user_pressing IS NOT NULL),
    -- on vérifie que la commande appartient bien à SON pressing. Sinon on
    -- retourne NULL (pas de fuite cross-pressing).
    -- Si v_user_pressing IS NULL → c'est service_role (bypass RLS légitime,
    -- usage API routes Next.js) → on délègue à deriver_statut_commande.
    SELECT c.pressing_id INTO v_commande_pressing
      FROM public.commandes c
     WHERE c.id = commande_id;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    v_user_pressing := public.get_pressing_id_utilisateur();

    IF v_user_pressing IS NOT NULL
       AND v_user_pressing <> v_commande_pressing
       AND NOT public.is_super_admin() THEN
        -- L'utilisateur est authentifié comme personnel d'un pressing
        -- tiers → on refuse de retourner le statut (defense-in-depth,
        -- même si SECURITY INVOKER + RLS filtre déjà côté SELECT).
        RETURN NULL;
    END IF;

    RETURN public.deriver_statut_commande(commande_id);
END;
$$;

COMMENT ON FUNCTION public.calculer_statut_commande(UUID) IS
    'Alias spec-conforme (PROMPT 2.5 item 3) de deriver_statut_commande. '
    'Calcule le statut_commande dérivé des statuts des articles. Callable '
    'depuis le frontend. PostgREST: {"commande_id": "..."}. '
    'SECURITY INVOKER (AUDIT 2.5 — 018 + 026) + check pressing_id explicite '
    '(defense-in-depth) : un user ne peut calculer le statut QUE pour les '
    'commandes de son pressing. Renvoie NULL sinon.';


-- A.3. calculer_statut_paiement_commande — SECURITY INVOKER + check pressing_id
CREATE OR REPLACE FUNCTION public.calculer_statut_paiement_commande(
    commande_id UUID
)
RETURNS statut_paiement_commande
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_total_paye           INTEGER := 0;
    v_montant_total        INTEGER := 0;
    v_statut               statut_paiement_commande;
    v_commande_pressing    UUID;
    v_user_pressing        UUID;
BEGIN
    -- Defense-in-depth (migration 026) : même check pressing_id que
    -- calculer_statut_commande (cf. commentaire détaillé ci-dessus).
    SELECT c.pressing_id INTO v_commande_pressing
      FROM public.commandes c
     WHERE c.id = commande_id;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    v_user_pressing := public.get_pressing_id_utilisateur();

    IF v_user_pressing IS NOT NULL
       AND v_user_pressing <> v_commande_pressing
       AND NOT public.is_super_admin() THEN
        RETURN NULL;
    END IF;

    SELECT c.montant_total INTO v_montant_total
      FROM public.commandes c
     WHERE c.id = commande_id;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    SELECT COALESCE(SUM(p.montant), 0) INTO v_total_paye
      FROM public.paiements p
     WHERE p.commande_id = commande_id;

    IF v_total_paye = 0 THEN
        v_statut := 'non_paye';
    ELSIF v_total_paye < v_montant_total THEN
        v_statut := 'partiel';
    ELSE
        v_statut := 'paye';
    END IF;

    RETURN v_statut;
END;
$$;

COMMENT ON FUNCTION public.calculer_statut_paiement_commande(UUID) IS
    'Calcule le statut_paiement_commande (PRD §5.3). Callable depuis le frontend. '
    'PostgREST: {"commande_id": "..."}. '
    'SECURITY INVOKER (AUDIT 2.5 — 018 + 026) + check pressing_id explicite '
    '(defense-in-depth) : un user ne peut calculer le statut QUE pour les '
    'commandes de son pressing. Renvoie NULL sinon.';


-- ============================================================
-- B) REVOKE EXECUTE FROM anon sur les helpers SECURITY DEFINER
-- ============================================================
-- Par défaut PostgreSQL accorde EXECUTE sur toute fonction à PUBLIC.
-- Les helpers suivants sont SECURITY DEFINER (par design — cf. 006
-- et 020) car ils doivent accéder à super_admins / personnel sans
-- être bloqués par RLS. Ils retournent des valeurs scalaires
-- (UUID ou BOOLEAN) et ne fuient PAS de données métier, MAIS par
-- défense en profondeur on supprime leur appel depuis anon (les
-- anonymous n'ont pas de auth.uid() → les helpers renverraient
-- NULL/FALSE de toute façon, mais l'API /rpc/ ne doit même pas
-- exposer la signature).
--
-- authenticated et service_role conservent EXECUTE.
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.is_super_admin() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_pressing_id_utilisateur() FROM anon;
REVOKE EXECUTE ON FUNCTION public.current_pressing_id() FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_pressing_manager() FROM anon;

GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_pressing_id_utilisateur() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_pressing_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_pressing_manager() TO authenticated;

-- service_role conserve EXECUTE (hérité de PUBLIC par défaut, mais on
-- l'explicite pour documentation).
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_pressing_id_utilisateur() TO service_role;
GRANT EXECUTE ON FUNCTION public.current_pressing_id() TO service_role;
GRANT EXECUTE ON FUNCTION public.is_pressing_manager() TO service_role;

-- Re-confirmation des REVOKE/GRANT de 018 sur les 3 fonctions de calcul
-- (idempotent — protège contre un éventuel rollback).
REVOKE EXECUTE ON FUNCTION public.deriver_statut_commande(UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION public.calculer_statut_commande(UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION public.calculer_statut_paiement_commande(UUID) FROM anon;

GRANT EXECUTE ON FUNCTION public.deriver_statut_commande(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculer_statut_commande(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculer_statut_paiement_commande(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.deriver_statut_commande(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.calculer_statut_commande(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.calculer_statut_paiement_commande(UUID) TO service_role;


-- ============================================================
-- Fin de la migration 026_fix_security_definer_leak.sql
-- Récapitulatif :
--   - 3 fonctions recréées en SECURITY INVOKER (idempotent vs 018) :
--       * deriver_statut_commande(UUID)
--       * calculer_statut_commande(UUID)         → + check pressing_id
--       * calculer_statut_paiement_commande(UUID) → + check pressing_id
--   - 4 REVOKE EXECUTE FROM anon sur les helpers SECURITY DEFINER :
--       * is_super_admin()
--       * get_pressing_id_utilisateur()
--       * current_pressing_id()
--       * is_pressing_manager()
--   - 3 REVOKE EXECUTE FROM anon (re-confirmés) sur les fonctions de calcul
--   - GRANT EXECUTE TO authenticated / service_role (explicites)
--   - Idempotent (CREATE OR REPLACE, GRANT/REVOKE ré-exécutables)
-- ============================================================
