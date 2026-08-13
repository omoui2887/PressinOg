-- ============================================================
-- e-pressing — Migration 018 : Fix fuites SECURITY DEFINER
-- ============================================================
-- Fichier    : 018_fix_security_definer_leak.sql
-- Version    : 1.0
-- Date       : 01/08/2026
-- Description : Recrée 3 fonctions SECURITY DEFINER en SECURITY INVOKER
--               pour empêcher la fuite du statut d'une commande
--               appartenant à un pressing tiers via /rpc/.
--
-- Contexte sécurité (AUDIT e-pressing — item 2.5) :
--   ---------------------------------------------------------------
--   3 fonctions étaient SECURITY DEFINER (et donc bypassaient RLS) :
--     1. public.deriver_statut_commande(p_commande_id UUID)
--        - Migration 005_triggers.sql (lignes ~195-254)
--        - Callable via /rpc/deriver_statut_commande
--        - Fait SELECT sur commandes + articles_vetements
--     2. public.calculer_statut_commande(commande_id UUID)
--        - Migration 010_lot2_gap_fill.sql (lignes ~485-499)
--        - Callable via /rpc/calculer_statut_commande (alias spec)
--        - Wrapper qui délègue à deriver_statut_commande
--     3. public.calculer_statut_paiement_commande(commande_id UUID)
--        - Migration 010_lot2_gap_fill.sql (lignes ~520-564)
--        - Callable via /rpc/calculer_statut_paiement_commande
--        - Fait SELECT sur commandes + paiements
--
--   Problème :
--     Un utilisateur authentifié (appartenant au pressing A) pouvait
--     appeler :
--       POST /rest/v1/rpc/calculer_statut_commande
--       Body: {"commande_id": "<uuid d'une commande du pressing B>"}
--     et obtenir le statut de la commande du pressing B, contournant
--     complètement l'isolation multi-tenant. Idem pour le statut
--     de paiement.
--
--     deriver_statut_commande était également callable directement
--     via /rpc/deriver_statut_commande (bien que ce soit un helper
--     interne utilisé par trigger_recalculer_statut_commande).
--
--   Cause racine :
--     SECURITY DEFINER → la fonction s'exécute en tant que propriétaire
--     (postgres) → bypass RLS → aucun filtrage par pressing_id.
--
--   Correctif :
--     Recréer les 3 fonctions en SECURITY INVOKER. Dès lors, RLS
--     s'applique sur les SELECT internes (commandes, articles_vetements,
--     paiements) → un user ne voit QUE les lignes de son pressing.
--
-- Choix SECURITY INVOKER vs SECURITY DEFINER + check pressing_id :
--   ---------------------------------------------------------------
--   Pour les 3 fonctions, on a choisi SECURITY INVOKER (option A)
--   plutôt que SECURITY DEFINER + WHERE pressing_id = get_pressing_id_utilisateur()
--   (option B) pour les raisons suivantes :
--
--   - Option A s'appuie sur RLS, qui a été audité comme solide
--     (AUDIT §2.1 à 2.4 : RLS activé sur 18/18 tables, WITH CHECK
--      systématique, auth.uid() partout, aucune fuite cross-pressing
--      sur les policies). Confier la sécurité à RLS est cohérent
--      avec l'architecture.
--
--   - Option B aurait cassé l'appel via service_role (server-side,
--     utilisé par les API routes Next.js via getSupabaseAdmin()) :
--       * service_role n'a pas de auth.uid() (pas de JWT user)
--       * get_pressing_id_utilisateur() retourne NULL
--       * is_super_admin() retourne FALSE
--       * → le check `pressing_id = NULL OR FALSE` = FALSE → fonction
--         renvoie NULL pour TOUTES les commandes → les API routes
--         qui utilisent service_role + appellent ces fonctions
--         cassent.
--
--   - Option B aurait aussi nécessité de répliquer la logique RLS
--     dans le code applicatif SQL, ce qui est anti-pattern (DRY).
--
--   Compatibilité avec le trigger (005_triggers.sql) :
--     deriver_statut_commande est appelée par trigger_recalculer_statut_commande
--     (qui reste SECURITY DEFINER, comme toute fonction trigger).
--     Quand un trigger SECURITY DEFINER appelle une fonction
--     SECURITY INVOKER, l'appelant est le propriétaire du trigger
--     (postgres, superuser) → RLS est bypassé (les superusers
--     bypassent RLS par défaut) → le SELECT sur commandes fonctionne
--     correctement dans le contexte du trigger.
--     ✓ Le trigger continue à marcher.
--     ✓ L'appel direct via /rpc/ par un user authentifié est filtré
--       par RLS → seul le pressing de l'user est visible.
--
--   Note : trigger_recalculer_statut_commande lui-même reste
--   SECURITY DEFINER. C'est NORMAL : c'est une fonction TRIGGER
--   (RETURNS TRIGGER) qui n'est PAS appelable via /rpc/ (PostgREST
--   n'expose que les fonctions scalaires/table). De plus, elle
--   récupère commande_id depuis NEW.commande_id / OLD.commande_id
--   (pas depuis un paramètre arbitraire) → pas de surface d'attaque.
--
-- Idempotence :
--   - CREATE OR REPLACE FUNCTION → ré-exécutable sans erreur.
--   - Les COMMENT ON FUNCTION sont également idempotents.
--   - Pas de DROP TABLE / DROP COLUMN.
--
-- Prérequis :
--   - Migrations 001 à 010 exécutées.
--   - RLS activée sur commandes, articles_vetements, paiements (006).
-- ============================================================


-- ============================================================
-- 1. public.deriver_statut_commande — SECURITY INVOKER
-- ============================================================
-- Recrée à l'identique (corps de la fonction inchangé) mais avec
-- SECURITY INVOKER au lieu de SECURITY DEFINER.
-- Signature et comportement identiques pour ne pas casser les
-- appelants (trigger_recalculer_statut_commande, calculer_statut_commande).
-- ============================================================
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

    -- Si la commande n'a pas encore d'articles, on garde le statut actuel.
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

    -- Matrice de dérivation (par ordre de priorité croissante)
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
    'Ignore la transition en_livraison (manuelle). '
    'SECURITY INVOKER (AUDIT 2.5) : RLS s''applique → un user ne voit QUE les '
    'commandes de son pressing. Le trigger appelant (trigger_recalculer_statut_commande, '
    'SECURITY DEFINER) exécute cette fonction en tant que propriétaire postgres qui bypass RLS.';


-- ============================================================
-- 2. public.calculer_statut_commande — SECURITY INVOKER
-- ============================================================
-- Recrée à l'identique (corps inchangé) mais avec SECURITY INVOKER.
-- C'est un wrapper qui délègue à deriver_statut_commande (devenue
-- SECURITY INVOKER ci-dessus). Les deux changements sont cohérents.
-- ============================================================
CREATE OR REPLACE FUNCTION public.calculer_statut_commande(
    commande_id UUID
)
RETURNS statut_commande
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
    -- Délègue à la fonction existante (implémentation officielle 005).
    -- Le nom du paramètre respecte le spec PROMPT 2.5 (callable via
    -- PostgREST avec {"commande_id": "..."}).
    RETURN public.deriver_statut_commande(commande_id);
END;
$$;

COMMENT ON FUNCTION public.calculer_statut_commande(UUID) IS
    'Alias spec-conforme (PROMPT 2.5 item 3) de deriver_statut_commande. '
    'Calcule le statut_commande dérivé des statuts des articles. '
    'Callable depuis le frontend pour prédire le statut sans modifier la DB. '
    'PostgREST: {"commande_id": "..."}. '
    'SECURITY INVOKER (AUDIT 2.5) : RLS s''applique → un user ne peut calculer '
    'le statut QUE pour les commandes de son pressing. Renvoie NULL si la '
    'commande n''existe pas ou appartient à un autre pressing.';


-- ============================================================
-- 3. public.calculer_statut_paiement_commande — SECURITY INVOKER
-- ============================================================
-- Recrée à l'identique (corps inchangé) mais avec SECURITY INVOKER.
-- Le SELECT sur commandes est filtré par RLS (policy de la table
-- commandes) → un user ne peut interroger QUE les commandes de son
-- pressing. Si la commande n'existe pas ou est cross-pressing, le
-- SELECT retourne NULL → IF NOT FOUND → RETURN NULL (comportement
-- déjà prévu par la fonction originale).
-- ============================================================
CREATE OR REPLACE FUNCTION public.calculer_statut_paiement_commande(
    commande_id UUID
)
RETURNS statut_paiement_commande
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_total_paye     INTEGER := 0;
    v_montant_total  INTEGER := 0;
    v_statut         statut_paiement_commande;
BEGIN
    -- Récupérer le montant total de la commande.
    -- On préfixe par c. (alias) pour lever l'ambiguïté entre
    -- le paramètre `commande_id` et la colonne paiements.commande_id.
    -- RLS (policy commandes) filtre : si la commande appartient à un
    -- autre pressing, le SELECT renvoie 0 ligne → NOT FOUND → RETURN NULL.
    SELECT c.montant_total INTO v_montant_total
      FROM public.commandes c
     WHERE c.id = commande_id;

    -- Si la commande n'existe pas (ou est filtrée par RLS car cross-pressing),
    -- retourner NULL (pas d'erreur).
    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    -- Sommer les paiements liés à cette commande.
    -- Même préfixage p. pour lever l'ambiguïté (sinon PL/pgSQL
    -- résoudrait `commande_id = commande_id` en `param = param` = TRUE
    -- → renverrait TOUS les paiements, pas seulement ceux de la commande).
    -- RLS sur paiements filtre aussi (mais la FK commande_id garantit
    -- déjà qu'on ne somme QUE les paiements d'une commande visible).
    SELECT COALESCE(SUM(p.montant), 0) INTO v_total_paye
      FROM public.paiements p
     WHERE p.commande_id = commande_id;

    -- Déterminer le statut.
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
    'Calcule le statut_paiement_commande (PRD §5.3). Callable depuis le frontend '
    'pour prédire le statut sans modifier la DB. Le trigger trigger_recalculer_paiement_commande '
    'fait la même chose en arrière-plan après chaque INSERT/UPDATE/DELETE sur paiements. '
    'PostgREST: {"commande_id": "..."}. '
    'SECURITY INVOKER (AUDIT 2.5) : RLS s''applique → un user ne peut calculer '
    'le statut QUE pour les commandes de son pressing. Renvoie NULL si la '
    'commande n''existe pas ou appartient à un autre pressing.';


-- ============================================================
-- 4. Vérification : revoke EXECUTE de anon sur les 3 fonctions
-- ============================================================
-- Par défaut PostgreSQL accorde EXECUTE sur une nouvelle fonction
-- à PUBLIC (tous les rôles). Comme SECURITY INVOKER + RLS filtre
-- déjà les anonymous (qui n'ont pas de auth.uid() → toutes les
-- policies retourneraient FALSE), l'appel par anon serait de toute
-- façon inefficace. Mais par défense en profondeur, on REVOKE
-- explicitement EXECUTE pour anon :
REVOKE EXECUTE ON FUNCTION public.deriver_statut_commande(UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION public.calculer_statut_commande(UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION public.calculer_statut_paiement_commande(UUID) FROM anon;

-- authenticated et service_role conservent EXECUTE ( hérité de PUBLIC
-- ou explicite). RLS fera le travail de filtrage :
--   - authenticated : ne voit QUE les commandes de son pressing.
--   - service_role  : bypass RLS (par config Supabase) → peut tout lire
--                     (usage légitime côté API routes Next.js).
GRANT EXECUTE ON FUNCTION public.deriver_statut_commande(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculer_statut_commande(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculer_statut_paiement_commande(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.deriver_statut_commande(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.calculer_statut_commande(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.calculer_statut_paiement_commande(UUID) TO service_role;


-- ============================================================
-- Fin de la migration 018_fix_security_definer_leak.sql
-- Récapitulatif :
--   - 3 fonctions recréées en SECURITY INVOKER (au lieu de DEFINER) :
--       * deriver_statut_commande(UUID)
--       * calculer_statut_commande(UUID)
--       * calculer_statut_paiement_commande(UUID)
--   - 3 REVOKE EXECUTE FROM anon (défense en profondeur)
--   - 6 GRANT EXECUTE TO authenticated / service_role (explicite)
--   - Aucun DROP TABLE / DROP COLUMN
--   - Idempotent (CREATE OR REPLACE, GRANT/REVOKE ré-exécutables)
--
-- Limitations résiduelles :
--   - Les triggers trigger_recalculer_statut_commande et
--     trigger_recalculer_paiement_commande restent SECURITY DEFINER
--     (comportement normal pour un trigger PostgreSQL). Ils ne sont
--     pas exposés via /rpc/ (PostgREST n'expose pas les fonctions
--     RETURNS TRIGGER). Pas de fuite.
--   - La fonction is_super_admin() et get_pressing_id_utilisateur()
--     restent SECURITY DEFINER (006_rls_policies.sql) — c'est voulu
--     car elles doivent accéder à super_admins/personnel sans être
--     bloquées par RLS (sinon boucle). Auditées comme sûres.
-- ============================================================
