-- ============================================================
-- OgPressing — Migration 017 : Robustesse des codes d'activation
-- ============================================================
-- Fichier    : 017_robustesse_codes_activation.sql
-- Version    : 1.0
-- Date       : 01/08/2026
-- Description : Crée la fonction SQL atomique `activer_code(p_code)`
--               qui effectue en UNE SEULE TRANSACTION :
--                 1. Le SELECT du code + verrou de ligne (FOR UPDATE)
--                 2. La vérification de l'usage unique (utilise = false)
--                 3. La vérification de l'expiration à 7 jours
--                    (date_expiration IS NULL OR date_expiration >= NOW())
--                 4. L'UPDATE atomique (utilise = true, date_utilisation)
--                 5. Le retour des métadonnées (pressing_id_cible, demande_id)
--                    nécessaires à l'API route /api/public/activation pour
--                    continuer la création du pressing.
--
-- Contexte sécurité (AUDIT OgPressing — item 9.10) :
--   ---------------------------------------------------------------
--   AVANT cette migration, la vérification du code d'activation
--   reposait entièrement sur la logique applicative de l'API route
--   /api/public/activation/route.ts (étapes 1 et 6) :
--     - étape 1 : SELECT pour vérifier `utilise = false` + date_expiration
--     - étape 6 : UPDATE pour marquer `utilise = true` + date_utilisation
--
--   Problèmes :
--     a) TOCTOU (Time-Of-Check-Time-Of-Use) : entre l'étape 1 (SELECT)
--        et l'étape 6 (UPDATE), deux requêtes concurrentes peuvent
--        toutes les deux passer le check `utilise = false` puis
--        toutes les deux updatater → création de 2 pressings pour 1 code.
--     b) Contournement : si la logique API est bypassée (bug, future
--        refactor qui oublie un check, appel direct à Supabase),
--        plus rien ne garantit l'usage unique et l'expiration.
--     c) Pas de garde-fou SQL : la DB fait confiance à l'API sans
--        vérifier elle-même les invariants métier.
--
--   Cette migration corrige (a), (b) et (c) en imposant que
--   l'activation passe par `public.activer_code(p_code)` qui est
--   atomique et verrouillée (FOR UPDATE + double-check).
--
-- Contraintes existantes conservées (003_constraints.sql) :
--   - codes_activation_utilise_date_check :
--       CHECK ((utilise = FALSE) OR (date_utilisation IS NOT NULL))
--     → satisfaite car on set date_utilisation = NOW() avec utilise = TRUE.
--   - codes_activation_expiration_check :
--       CHECK (date_expiration IS NULL OR date_expiration > date_generation)
--     → satisfaite car on n'insère pas de date_expiration ici
--       (elle est positionnée à la génération du code par le Super Admin).
--   - codes_activation.code UNIQUE : garantie par la table (002_tables.sql).
--
-- Comment l'utiliser côté API (remplacer la logique manuelle) :
--   ---------------------------------------------------------------
--   Dans /api/public/activation/route.ts, REMPLACER l'étape 1 (SELECT
--   de vérification) ET l'étape 6 (UPDATE de marquage) par UN SEUL
--   appel RPC :
--
--     const { data, error } = await supabase
--       .rpc('activer_code', { p_code: code });
--
--     if (error) {
--       -- error.message contient 'Code invalide ou inconnu',
--       -- 'Code déjà utilisé' ou 'Code expiré'
--       return NextResponse.json({ success: false, error: error.message },
--                                { status: 400 });
--     }
--     -- data = [{ pressing_id_cible: <uuid ou null>, demande_id: <uuid ou null> }]
--     const { pressing_id_cible, demande_id } = data[0];
--     -- pressing_id_cible est typiquement NULL à ce stade (pas encore de
--     -- pressing créé). L'API crée ensuite le pressing puis fait un UPDATE
--     -- complémentaire pour setter pressing_id_cible + linking demande_id.
--
--   L'appel RPC DOIT se faire AVANT la création du pressing (étapes 2-5)
--   car il verrouille le code (FOR UPDATE) tant que la transaction
--   n'est pas commitée. Si l'API échoue ensuite (création pressing,
--   personnel, abonnement), le code reste marqué `utilise = true` :
--   c'est voulé (le prospect doit demander un nouveau code au Super
--   Admin, évite tout retry automatique frauduleux).
--
--   ⚠️ ALTERNATIVE : si l'on souhaite un rollback du `utilise = true`
--   en cas d'échec des étapes suivantes, l'API doit explicitement
--   remettre `utilise = false, date_utilisation = NULL` dans son bloc
--   catch. À évaluer selon le produit (sécurité vs UX).
--
-- Choix SECURITY INVOKER (pas DEFINER) :
--   ---------------------------------------------------------------
--   SECURITY INVOKER → la fonction s'exécute avec les droits de
--   l'appelant. RLS s'applique sur `codes_activation`.
--   Or la policy RLS `code_read_public` (006_rls_policies.sql §3.2)
--   ne donne à `anon` que SELECT (code, utilise). Anon ne peut PAS
--   faire UPDATE. → L'appel RPC par anon ÉCHOUE.
--
--   C'est voulu : on ne veut PAS qu'un visiteur anon puisse appeler
--   `/rpc/activer_code`. Cet appel doit transiter par l'API route
--   Next.js qui utilise le client `service_role` (bypass RLS) ou
--   un client authentifié Super Admin.
--
--   Si on avait mis SECURITY DEFINER, la fonction s'exécuterait en
--   tant que propriétaire (postgres) et bypasserait RLS, permettant
--   à anon d'appeler directement /rpc/activer_code et de "brûler"
--   un code sans créer le pressing associé. À ÉVITER.
--
-- Idempotence :
--   - CREATE OR REPLACE FUNCTION → ré-exécutable sans erreur.
--   - Pas de DROP TABLE / DROP COLUMN.
--
-- Prérequis :
--   - Migrations 001 à 010 exécutées (codes_activation + demande_id).
--   - RLS activée sur codes_activation (006).
-- ============================================================


-- ============================================================
-- 1. Fonction atomique activer_code(p_code TEXT)
-- ============================================================
CREATE OR REPLACE FUNCTION public.activer_code(p_code TEXT)
RETURNS TABLE(
    pressing_id_cible UUID,
    demande_id        UUID
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_code        RECORD;
    v_updated_id  UUID;
BEGIN
    -- -------------------------------------------------------
    -- 1. SELECT + verrou exclusif (FOR UPDATE)
    --    On locke la ligne pendant toute la transaction pour
    --    empêcher une 2e transaction concurrente de la lire
    --    avant qu'on ait fait l'UPDATE. Si 2 requêtes arrivent
    --    simultanément, la 2e attend que la 1e commit/rollback.
    --    On ne filtre PAS `utilise = false` ici pour pouvoir
    --    distinguer "code inconnu" (NOT FOUND) de "code déjà
    --    utilisé" (utilise = true) dans le message d'erreur.
    -- -------------------------------------------------------
    SELECT
        c.id,
        c.pressing_id_cible,
        c.demande_id,
        c.date_expiration,
        c.utilise
    INTO v_code
    FROM public.codes_activation AS c
    WHERE c.code = p_code
    FOR UPDATE;

    -- -------------------------------------------------------
    -- 2. Code introuvable
    -- -------------------------------------------------------
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Code d''activation invalide ou inconnu.'
            USING HINT = 'Vérifiez la saisie du code (format PRS-XXXX-XXXX).';
    END IF;

    -- -------------------------------------------------------
    -- 3. Vérification usage unique
    --    Si utilise = true, le code a déjà été consommé par une
    --    transaction précédente (commit). On refuse.
    -- -------------------------------------------------------
    IF v_code.utilise THEN
        RAISE EXCEPTION 'Ce code d''activation a déjà été utilisé. Chaque code est à usage unique.'
            USING HINT = 'Contactez le Super Admin OgPressing pour obtenir un nouveau code.';
    END IF;

    -- -------------------------------------------------------
    -- 4. Vérification expiration (durée de validité 7 jours)
    --    date_expiration peut être NULL (auquel cas pas d'expiration)
    --    sinon on vérifie date_expiration >= NOW().
    -- -------------------------------------------------------
    IF v_code.date_expiration IS NOT NULL
       AND v_code.date_expiration < NOW() THEN
        RAISE EXCEPTION 'Ce code d''activation a expiré. Les codes sont valables 7 jours.'
            USING HINT = 'Contactez le Super Admin OgPressing pour obtenir un nouveau code.';
    END IF;

    -- -------------------------------------------------------
    -- 5. UPDATE atomique avec double-check (défense en profondeur)
    --    Le FOR UPDATE ci-dessus protège déjà contre la concurrence
    --    entre transactions, mais on ajoute `AND utilise = false`
    --    dans le WHERE de l'UPDATE par sécurité. Si l'UPDATE
    --    n'affecte aucune ligne (RETURNING vide), c'est qu'une
    --    transaction concurrente a marqué le code entre-temps.
    -- -------------------------------------------------------
    UPDATE public.codes_activation
       SET utilise          = TRUE,
           date_utilisation = NOW(),
           updated_at       = NOW()
     WHERE id      = v_code.id
       AND utilise = FALSE
    RETURNING id INTO v_updated_id;

    IF v_updated_id IS NULL THEN
        -- Cas théorique (FOR UPDATE devrait empêcher cela) :
        -- une transaction concurrente a fait l'UPDATE entre le SELECT
        -- et l'UPDATE. On rollback et on laisse l'appelant réessayer.
        RAISE EXCEPTION 'Code déjà utilisé par une transaction concurrente.'
            USING HINT = 'Veuillez réessayer ; si l''erreur persiste, contactez OgPressing.';
    END IF;

    -- -------------------------------------------------------
    -- 6. Retourne les métadonnées utiles à l'API
    --    - pressing_id_cible : typiquement NULL à ce stade
    --      (le pressing n'est pas encore créé). L'API le settera
    --      après création du pressing via un UPDATE complémentaire.
    --    - demande_id       : lien vers la demande d'inscription
    --      (si le code a été généré depuis une demande), pour
    --      audit et parcours Super Admin.
    -- -------------------------------------------------------
    RETURN QUERY
        SELECT v_code.pressing_id_cible, v_code.demande_id;
END;
$$;


-- ------------------------------------------------------------
-- Documentation de la fonction (visible via \df+ dans psql
-- ou via pg_proc.comment dans PostgREST).
-- ------------------------------------------------------------
COMMENT ON FUNCTION public.activer_code(TEXT) IS
    'Activation atomique d''un code d''activation (AUDIT OgPressing 9.10). '
    'Vérifie en une seule transaction : (1) existence du code, (2) usage unique (utilise = false), '
    '(3) non-expiration (date_expiration >= NOW()). '
    'Locke la ligne (FOR UPDATE) puis UPDATE atomique avec double-check (WHERE utilise = false). '
    'Retourne (pressing_id_cible, demande_id) pour que l''API route continue la création du pressing. '
    'SECURITY INVOKER : RLS s''applique, seuls service_role / Super Admin peuvent invoquer.';


-- ============================================================
-- 2. Grant EXECUTE à service_role (et non à anon/authenticated)
-- ============================================================
-- Par défaut, EXECUTE sur une nouvelle fonction est accordé à PUBLIC
-- (tous les rôles). Comme SECURITY INVOKER + RLS `code_read_public`
-- (qui ne donne à anon QUE SELECT sur (code, utilise)), anon ne peut
-- de toute façon pas faire l'UPDATE interne. Mais par défense en
-- profondeur, on restreint explicitement EXECUTE :
--   - service_role : bypass RLS → peut tout faire (usage API route)
--   - authenticated : peut invoquer (RLS filtrera selon la policy
--     `super_admin_full_access` → seul le Super Admin passera)
--   - anon : REVOKE (ne peut pas invoquer directement depuis /rpc/)
GRANT EXECUTE ON FUNCTION public.activer_code(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.activer_code(TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.activer_code(TEXT) FROM anon;


-- ============================================================
-- Fin de la migration 017_robustesse_codes_activation.sql
-- Récapitulatif :
--   - 1 fonction SQL atomique créée : public.activer_code(TEXT)
--   - 2 grants / 1 revoke ajustés pour la surface d'attaque /rpc/
--   - Aucun DROP TABLE / DROP COLUMN
--   - Idempotent (CREATE OR REPLACE, GRANT/REVOKE ré-exécutables)
-- ============================================================
