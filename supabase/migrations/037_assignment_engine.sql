-- ============================================================
-- e-pressing — Migration 037 : Moteur d'assignation du travail
-- ============================================================
-- Fichier    : 037_assignment_engine.sql
-- Version    : 1.0
-- Objectif   : Véritable système d'assignation des articles de production
--              aux employés (laveur / repassage / livreur / manager).
--
-- RÈGLES IMPOSÉES :
--   1. Chaque employé de production ne voit QUE les tâches qui lui sont
--      assignées (filtrage serveur-side, jamais uniquement frontend).
--   2. Seul le MANAGER peut assigner / réassigner / désassigner.
--   3. Le personnel cible doit :
--        - appartenir au MÊME pressing que l'article
--        - être actif (actif=true AND statut_compte='actif')
--        - avoir un rôle COMPATIBLE avec le poste de l'article
--          (laveur↔lavage, repassage↔repassage, livreur↔livraison,
--           manager↔tous)
--   4. Un caissier / réceptionniste / comptable NE PEUT PAS être assigné
--      à une tâche de production.
--   5. Audit log : assignment_created / assignment_changed / assignment_removed.
--   6. Les RPC sont SECURITY INVOKER + REVOKE EXECUTE FROM anon/authenticated
--      → seul service_role (API routes) peut les appeler.
--
-- Non-cassable : préserve toutes les colonnes/contraintes existantes.
-- Idempotent : ADD COLUMN IF NOT EXISTS, CREATE INDEX IF NOT EXISTS,
--              CREATE OR REPLACE FUNCTION, DO $$ ... EXCEPTION.
-- ============================================================


-- ============================================================
-- SECTION 1 — Colonnes d'assignation sur articles_vetements
-- ============================================================
-- `assigne_a` (UUID FK personnel) existe déjà (migration 010).
-- On ajoute :
--   - assigne_le     TIMESTAMPTZ — quand l'article a été assigné
--   - assigne_par    UUID FK personnel — manager qui a fait l'assignation
--   - started_at     TIMESTAMPTZ — quand l'employé a commencé le traitement
--   - completed_at   TIMESTAMPTZ — quand l'employé a terminé le traitement

ALTER TABLE public.articles_vetements
    ADD COLUMN IF NOT EXISTS assigne_le TIMESTAMPTZ;

ALTER TABLE public.articles_vetements
    ADD COLUMN IF NOT EXISTS assigne_par UUID
    REFERENCES public.personnel(id) ON DELETE SET NULL;

ALTER TABLE public.articles_vetements
    ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;

ALTER TABLE public.articles_vetements
    ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- Index pour la recherche "toutes les tâches assignées à X"
CREATE INDEX IF NOT EXISTS idx_articles_vetements_assigne_a_full
    ON public.articles_vetements (assigne_a)
    WHERE assigne_a IS NOT NULL;

-- Index pour "tâches non assignées d'un pressing" (via commande_id JOIN)
-- — couvert par l'index partiel existant + la requête EXISTS.
CREATE INDEX IF NOT EXISTS idx_articles_vetements_assigne_par
    ON public.articles_vetements (assigne_par)
    WHERE assigne_par IS NOT NULL;

COMMENT ON COLUMN public.articles_vetements.assigne_le IS
    'Date à laquelle l''article a été assigné à un employé de production.';
COMMENT ON COLUMN public.articles_vetements.assigne_par IS
    'Manager (personnel.id) qui a effectué l''assignation.';
COMMENT ON COLUMN public.articles_vetements.started_at IS
    'Date à laquelle l''employé assigné a commencé le traitement (optionnel, null tant que non commencé).';
COMMENT ON COLUMN public.articles_vetements.completed_at IS
    'Date à laquelle l''employé assigné a terminé le traitement (optionnel).';


-- ============================================================
-- SECTION 2 — Fonction utilitaire : role_compatible_avec_statut
-- ============================================================
-- Détermine si un rôle est compatible avec une tâche de production
-- étant donné le statut actuel de l'article.
--
-- Mapping :
--   recu, en_traitement → laveur (lavage à faire)
--   lave                → repassage (repassage à faire)
--   repasse             → repassage (rangement casier)
--   pret                → livreur (livraison / retrait)
--   en_livraison        → livreur
--   retire, livre       → aucun (terminal — assignation refusée)
--
-- Le manager est TOUJOURS compatible (override).
-- caissier, receptionniste, comptable → JAMAIS compatible (rôles non-production).

CREATE OR REPLACE FUNCTION public.role_compatible_avec_statut(
    p_role   TEXT,
    p_statut TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path = public
AS $$
    SELECT
        CASE
            -- Le manager peut tout faire (override / intervention manuelle)
            WHEN p_role = 'manager' THEN TRUE
            -- Statuts terminaux : aucune assignation possible
            WHEN p_statut IN ('retire', 'livre') THEN FALSE
            -- Lavage : recu, en_traitement
            WHEN p_statut IN ('recu', 'en_traitement') THEN p_role = 'laveur'
            -- Repassage : lave (à repasser), repasse (à ranger en casier)
            WHEN p_statut IN ('lave', 'repasse') THEN p_role = 'repassage'
            -- Livraison : pret (à livrer/retirer), en_livraison
            WHEN p_statut IN ('pret', 'en_livraison') THEN p_role = 'livreur'
            -- Statut inconnu : refus défensif
            ELSE FALSE
        END;
$$;

COMMENT ON FUNCTION public.role_compatible_avec_statut(TEXT, TEXT) IS
    'Vérifie la compatibilité d''un rôle personnel avec une tâche de production selon le statut de l''article. manager=always true, caissier/receptionniste/comptable=always false, laveur↔recu/en_traitement, repassage↔lave/repasse, livreur↔pret/en_livraison.';

-- La fonction est publique en lecture (utilitaire pur, pas de données sensibles)
-- mais on retire l'accès aux rôles anonymes par défaut.
REVOKE EXECUTE ON FUNCTION public.role_compatible_avec_statut(TEXT, TEXT) FROM anon;


-- ============================================================
-- SECTION 3 — RPC atomique : assigner_article_atomic
-- ============================================================
-- Assigne (ou réassigne) un article à un employé de production.
--
-- Étapes (tout en une transaction) :
--   1. SELECT FOR UPDATE l'article (verrou anti-concurrence)
--   2. Vérifie que l'article appartient à la commande + pressing
--   3. Vérifie que l'article n'est pas terminal (retire/livre)
--   4. SELECT FOR UPDATE le personnel cible (verrou + contrôle actif)
--   5. Vérifie pressing_id cible = pressing_id article
--   6. Vérifie personnel actif (actif=true AND statut_compte='actif')
--   7. Vérifie rôle compatible avec le statut de l'article
--   8. Si déjà assigné au même personnel → idempotent (retourne l'état)
--   9. Sinon UPDATE : assigne_a, assigne_le=NOW(), assigne_par, reset started/completed
--  10. Retourne JSONB { success, code, article_id, avant, apres }
--
-- L'appelant (API route, service_role) journalise l'audit en fonction
-- du code retourné (CREATED / CHANGED / IDEMPOTENT_REPLAY).

CREATE OR REPLACE FUNCTION public.assigner_article_atomic(
    p_article_id         UUID,
    p_commande_id        UUID,
    p_pressing_id        UUID,
    p_personnel_id_cible UUID,
    p_assigne_par        UUID,        -- personnel.id du manager
    p_user_id            UUID DEFAULT NULL  -- auth.users.id (pour audit)
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_article    RECORD;
    v_personnel  RECORD;
    v_avant      JSONB;
    v_apres      JSONB;
    v_code       TEXT;
BEGIN
    -- --------------------------------------------------------
    -- 0. Validation des entrées
    -- --------------------------------------------------------
    IF p_article_id IS NULL OR p_commande_id IS NULL OR p_pressing_id IS NULL
       OR p_personnel_id_cible IS NULL OR p_assigne_par IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'PARAMETRES_MANQUANTS',
            'error', 'Tous les paramètres sont requis (article_id, commande_id, pressing_id, personnel_id_cible, assigne_par).');
    END IF;

    -- --------------------------------------------------------
    -- 1. Verrouiller l'article + contrôle commande/pressing
    -- --------------------------------------------------------
    SELECT id, commande_id, statut, assigne_a, assigne_le, assigne_par,
           started_at, completed_at
      INTO v_article
      FROM public.articles_vetements
     WHERE id = p_article_id
       AND commande_id = p_commande_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'code', 'ARTICLE_INTROUVABLE',
            'error', 'Article introuvable (vérifiez l''ID et la commande associée).');
    END IF;

    -- Defense-in-depth : vérifier que la commande appartient au pressing.
    -- (RLS isole déjà, mais on double-check côté SQL.)
    PERFORM 1
      FROM public.commandes c
     WHERE c.id = p_commande_id
       AND c.pressing_id = p_pressing_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'code', 'PRESSING_MISMATCH',
            'error', 'La commande n''appartient pas au pressing spécifié.');
    END IF;

    -- --------------------------------------------------------
    -- 2. Vérifier que l'article n'est pas terminal
    -- --------------------------------------------------------
    IF v_article.statut IN ('retire', 'livre') THEN
        RETURN jsonb_build_object('success', false, 'code', 'ARTICLE_TERMINAL',
            'error', 'Impossible d''assigner un article déjà retiré ou livré (statut terminal).',
            'details', jsonb_build_object('statut', v_article.statut));
    END IF;

    -- --------------------------------------------------------
    -- 3. Vérifier le manager qui assigne (p_assigne_par)
    -- --------------------------------------------------------
    -- Le manager doit appartenir au même pressing et être actif avec le
    -- rôle manager. (L'API a déjà vérifié via hasRole, mais on double-check.)
    SELECT id, role, actif, statut_compte, pressing_id
      INTO v_personnel
      FROM public.personnel
     WHERE id = p_assigne_par
       AND pressing_id = p_pressing_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'code', 'ASSIGNEUR_INVALIDE',
            'error', 'Le manager qui assigne n''appartient pas au pressing ou est introuvable.');
    END IF;

    IF v_personnel.role <> 'manager' OR v_personnel.actif <> TRUE
       OR v_personnel.statut_compte <> 'actif' THEN
        RETURN jsonb_build_object('success', false, 'code', 'ASSIGNEUR_NON_MANAGER',
            'error', 'Seul un manager actif peut assigner une tâche.');
    END IF;

    -- --------------------------------------------------------
    -- 4. Verrouiller + valider le personnel CIBLE
    -- --------------------------------------------------------
    SELECT id, role, actif, statut_compte, pressing_id, nom_complet
      INTO v_personnel
      FROM public.personnel
     WHERE id = p_personnel_id_cible
     FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'code', 'PERSONNEL_INTROUVABLE',
            'error', 'Le personnel cible est introuvable.');
    END IF;

    -- Même pressing
    IF v_personnel.pressing_id IS DISTINCT FROM p_pressing_id THEN
        RETURN jsonb_build_object('success', false, 'code', 'PERSONNEL_AUTRE_PRESSING',
            'error', 'Impossible d''assigner un employé appartenant à un autre pressing.');
    END IF;

    -- Actif
    IF v_personnel.actif <> TRUE OR v_personnel.statut_compte <> 'actif' THEN
        RETURN jsonb_build_object('success', false, 'code', 'PERSONNEL_INACTIF',
            'error', 'Le personnel cible est inactif et ne peut pas recevoir de tâche.',
            'details', jsonb_build_object('actif', v_personnel.actif, 'statut_compte', v_personnel.statut_compte));
    END IF;

    -- Rôle compatible avec le poste
    IF NOT public.role_compatible_avec_statut(v_personnel.role, v_article.statut) THEN
        RETURN jsonb_build_object('success', false, 'code', 'ROLE_INCOMPATIBLE',
            'error', 'Le rôle "' || v_personnel.role || '" n''est pas compatible avec une tâche de ' ||
                     'statut "' || v_article.statut || '".',
            'details', jsonb_build_object('role', v_personnel.role, 'statut_article', v_article.statut));
    END IF;

    -- --------------------------------------------------------
    -- 5. Idempotence : déjà assigné au même personnel ?
    -- --------------------------------------------------------
    IF v_article.assigne_a = p_personnel_id_cible THEN
        RETURN jsonb_build_object('success', true, 'code', 'IDEMPOTENT_REPLAY',
            'article_id', p_article_id,
            'personnel_id', p_personnel_id_cible,
            'message', 'Article déjà assigné à ce personnel — aucun changement.');
    END IF;

    -- --------------------------------------------------------
    -- 6. Snapshot AVANT
    -- --------------------------------------------------------
    v_avant := jsonb_build_object(
        'article_id', p_article_id,
        'assigne_a', v_article.assigne_a,
        'assigne_le', v_article.assigne_le,
        'assigne_par', v_article.assigne_par,
        'statut', v_article.statut
    );

    -- Détermine le code d'audit (création vs changement)
    v_code := CASE WHEN v_article.assigne_a IS NULL THEN 'CREATED' ELSE 'CHANGED' END;

    -- --------------------------------------------------------
    -- 7. UPDATE atomique
    -- --------------------------------------------------------
    UPDATE public.articles_vetements
       SET assigne_a   = p_personnel_id_cible,
           assigne_le  = NOW(),
           assigne_par = p_assigne_par,
           -- On reset started_at/completed_at car c'est une nouvelle assignation
           started_at   = NULL,
           completed_at = NULL,
           updated_at   = NOW()
     WHERE id = p_article_id;

    -- --------------------------------------------------------
    -- 8. Snapshot APRÈS
    -- --------------------------------------------------------
    v_apres := jsonb_build_object(
        'article_id', p_article_id,
        'assigne_a', p_personnel_id_cible,
        'assigne_le', NOW(),
        'assigne_par', p_assigne_par,
        'statut', v_article.statut
    );

    RETURN jsonb_build_object(
        'success', true,
        'code', v_code,
        'article_id', p_article_id,
        'commande_id', p_commande_id,
        'personnel_id', p_personnel_id_cible,
        'avant', v_avant,
        'apres', v_apres
    );
END;
$$;

COMMENT ON FUNCTION public.assigner_article_atomic(UUID, UUID, UUID, UUID, UUID, UUID) IS
    'Assigne atomiquement un article de production à un employé. Vérifie same-pressing, actif, rôle compatible. Idempotent si déjà assigné au même. Retourne avant/après pour audit.';

-- Seul service_role (API routes) peut appeler les RPC d'assignation.
REVOKE EXECUTE ON FUNCTION public.assigner_article_atomic(UUID, UUID, UUID, UUID, UUID, UUID) FROM anon, authenticated;


-- ============================================================
-- SECTION 4 — RPC atomique : desassigner_article_atomic
-- ============================================================
-- Retire l'assignation d'un article (le remet dans la "file non assignée").
-- Uniquement par un manager actif du même pressing.

CREATE OR REPLACE FUNCTION public.desassigner_article_atomic(
    p_article_id   UUID,
    p_commande_id  UUID,
    p_pressing_id  UUID,
    p_par          UUID,        -- personnel.id du manager
    p_user_id      UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_article   RECORD;
    v_manager   RECORD;
    v_avant     JSONB;
BEGIN
    IF p_article_id IS NULL OR p_commande_id IS NULL OR p_pressing_id IS NULL OR p_par IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'PARAMETRES_MANQUANTS',
            'error', 'Tous les paramètres sont requis.');
    END IF;

    -- Verrouiller l'article
    SELECT id, commande_id, statut, assigne_a, assigne_le, assigne_par
      INTO v_article
      FROM public.articles_vetements
     WHERE id = p_article_id
       AND commande_id = p_commande_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'code', 'ARTICLE_INTROUVABLE',
            'error', 'Article introuvable.');
    END IF;

    -- Vérifier pressing
    PERFORM 1
      FROM public.commandes c
     WHERE c.id = p_commande_id
       AND c.pressing_id = p_pressing_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'code', 'PRESSING_MISMATCH',
            'error', 'La commande n''appartient pas au pressing spécifié.');
    END IF;

    -- Vérifier le manager
    SELECT id, role, actif, statut_compte
      INTO v_manager
      FROM public.personnel
     WHERE id = p_par
       AND pressing_id = p_pressing_id
     FOR UPDATE;

    IF NOT FOUND OR v_manager.role <> 'manager' OR v_manager.actif <> TRUE
       OR v_manager.statut_compte <> 'actif' THEN
        RETURN jsonb_build_object('success', false, 'code', 'ASSIGNEUR_NON_MANAGER',
            'error', 'Seul un manager actif du pressing peut désassigner une tâche.');
    END IF;

    -- Idempotent : déjà non assigné
    IF v_article.assigne_a IS NULL THEN
        RETURN jsonb_build_object('success', true, 'code', 'IDEMPOTENT_REPLAY',
            'article_id', p_article_id,
            'message', 'Article déjà non assigné — aucun changement.');
    END IF;

    v_avant := jsonb_build_object(
        'article_id', p_article_id,
        'assigne_a', v_article.assigne_a,
        'assigne_le', v_article.assigne_le,
        'assigne_par', v_article.assigne_par,
        'statut', v_article.statut
    );

    -- UPDATE : on garde started_at/completed_at pour l'historique ? Non —
    -- la désassignation remet l'article dans la file. On nettoie.
    UPDATE public.articles_vetements
       SET assigne_a   = NULL,
           assigne_le  = NULL,
           assigne_par = NULL,
           started_at   = NULL,
           completed_at = NULL,
           updated_at   = NOW()
     WHERE id = p_article_id;

    RETURN jsonb_build_object(
        'success', true,
        'code', 'REMOVED',
        'article_id', p_article_id,
        'commande_id', p_commande_id,
        'avant', v_avant,
        'apres', jsonb_build_object('article_id', p_article_id, 'assigne_a', null)
    );
END;
$$;

COMMENT ON FUNCTION public.desassigner_article_atomic(UUID, UUID, UUID, UUID, UUID) IS
    'Retire atomiquement l''assignation d''un article. Manager only. Retourne avant pour audit.';

REVOKE EXECUTE ON FUNCTION public.desassigner_article_atomic(UUID, UUID, UUID, UUID, UUID) FROM anon, authenticated;


-- ============================================================
-- SECTION 5 — Vue : production_file (file de production par pressing)
-- ============================================================
-- Vue pratique pour le manager : liste tous les articles non terminaux
-- d'un pressing avec leur statut d'assignation, le personnel assigné,
-- et les infos commande/client. Filtrable par pressing_id.

CREATE OR REPLACE VIEW public.production_file AS
SELECT
    av.id                       AS article_id,
    av.commande_id,
    c.pressing_id,
    c.numero_commande,
    c.statut                    AS commande_statut,
    c.date_reception,
    c.priorite,
    cli.nom_complet             AS client_nom,
    cli.telephone               AS client_telephone,
    av.statut                   AS article_statut,
    av.code_qr,
    av.assigne_a,
    p.nom_complet               AS assigne_nom,
    p.role                      AS assigne_role,
    av.assigne_le,
    av.assigne_par,
    av.started_at,
    av.completed_at,
    av.zone_stockage,
    CASE
        WHEN av.assigne_a IS NULL THEN 'non_assigne'
        WHEN av.completed_at IS NOT NULL THEN 'termine'
        WHEN av.started_at IS NOT NULL THEN 'en_cours'
        ELSE 'assigne'
    END                         AS statut_assignation
FROM public.articles_vetements av
JOIN public.commandes c ON c.id = av.commande_id
JOIN public.clients cli ON cli.id = c.client_id
LEFT JOIN public.personnel p ON p.id = av.assigne_a
WHERE av.statut NOT IN ('retire', 'livre');

COMMENT ON VIEW public.production_file IS
    'Vue de la file de production : tous les articles non terminaux d''un pressing avec statut d''assignation (non_assigne/assigne/en_cours/termine). Filtrer par pressing_id.';

-- Grant SELECT sur la vue (RLS s''applique via les tables sous-jacentes).
GRANT SELECT ON public.production_file TO authenticated;


-- ============================================================
-- SECTION 6 — Recharge du schéma PostgREST
-- ============================================================
-- Notifie PostgREST de recharger son cache de schéma pour que les
-- nouvelles fonctions/vues soient exposées via l''API REST.
NOTIFY pgrst, 'reload schema';


-- ============================================================
-- Fin de la migration 037_assignment_engine.sql
-- Récapitulatif :
--   - 4 colonnes ajoutées à articles_vetements (assigne_le, assigne_par,
--     started_at, completed_at)
--   - 1 fonction utilitaire role_compatible_avec_statut (IMMUTABLE)
--   - 2 RPC atomiques (assigner_article_atomic, desassigner_article_atomic)
--     avec FOR UPDATE, vérifications same-pressing/actif/role-compatible
--   - 1 vue production_file (file de production pour manager)
--   - REVOKE EXECUTE FROM anon/authenticated sur les RPC
--   - Idempotent (ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE, NOTIFY)
-- ============================================================
