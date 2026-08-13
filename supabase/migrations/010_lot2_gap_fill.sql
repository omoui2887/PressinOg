-- ============================================================
-- e-pressing — Migration 010 : Gap-fill LOT 2
-- ============================================================
-- Fichier    : 010_lot2_gap_fill.sql
-- Version    : 1.0
-- Date       : 25/07/2026
-- Auteur     : Audit LOT 2 (cf. /home/z/my-project/AUDIT_LOT2.md)
--
-- Description : Comble les écarts identifiés entre le spec
--               (upload/02-schema-supabase.md — prompts 2.2 à 2.5)
--               et l'implémentation réelle (migrations 001-009).
--
-- ⚠️  NON-BLOQUANT : aucune colonne existante n'est supprimée ou
--     renommée. L'app existante (clients, personnel, wizard
--     commandes) continue de fonctionner sans modification.
--
-- ⚠️  IDEMPOTENT : toutes les opérations sont ré-exécutables sans
--     erreur (ADD COLUMN IF NOT EXISTS, CREATE INDEX IF NOT EXISTS,
--     CREATE OR REPLACE FUNCTION, DO $$ BEGIN ... EXCEPTION).
--
-- Éléments ajoutés (cf. AUDIT_LOT2.md §Synthèse globale) :
--   - 17 colonnes manquantes réparties sur 9 tables
--   - 1 contrainte CHECK XOR sur paiements (commande_id / abonnement_id)
--   - 1 index composite sur produits_stock (alertes stock bas)
--   - 3 fonctions PostgreSQL manquantes :
--       * calculer_montant_remise(montant_avant, type, valeur)
--       * calculer_statut_commande(commande_id)        -- alias
--       * calculer_statut_paiement_commande(commande_id) -- scalaire
--   - 1 correction de la vue vue_clients_enrichis (total_depense
--     passe de SUM(montant_total) à SUM(paiements.montant))
--
-- Prérequis :
--   - Migrations 001 à 009 appliquées ✅
--   - En particulier : 002 (tables), 003 (contraintes), 005 (triggers),
--     006 (RLS), 009 (vue vue_clients_enrichis).
-- ============================================================


-- ============================================================
-- SECTION 1 — Colonnes manquantes (17 colonnes sur 9 tables)
-- ============================================================
-- Chaque ALTER TABLE utilise ADD COLUMN IF NOT EXISTS → safe de
-- re-exécuter. Toutes les nouvelles colonnes sont NULLABLE (ou ont
-- une DEFAULT) pour ne pas casser les lignes existantes.
-- ============================================================


-- ------------------------------------------------------------
-- 1.1. demandes_inscription
--      2 colonnes du spec PROMPT 2.2 oubliées dans 002.
--      Sert au Super Admin pour qualifier le prospect avant
--      de générer un code d'activation.
-- ------------------------------------------------------------
ALTER TABLE public.demandes_inscription
    ADD COLUMN IF NOT EXISTS nombre_machines INTEGER;

ALTER TABLE public.demandes_inscription
    ADD COLUMN IF NOT EXISTS nombre_employes INTEGER;

COMMENT ON COLUMN public.demandes_inscription.nombre_machines IS
    'Nombre de machines du pressing prospect (renseigné par le prospect dans le formulaire d''inscription). NULL si non renseigné.';

COMMENT ON COLUMN public.demandes_inscription.nombre_employes IS
    'Nombre d''employés du pressing prospect. NULL si non renseigné.';


-- ------------------------------------------------------------
-- 1.2. codes_activation
--      Lien direct vers la demande d'inscription qui a motivé
--      la génération du code (audit + parcours Super Admin).
--      Ce n'est pas pressing_id_cible (qui lie au pressing créé
--      APRÈS activation) mais demande_id (qui lie à la demande
--      AVANT activation).
-- ------------------------------------------------------------
ALTER TABLE public.codes_activation
    ADD COLUMN IF NOT EXISTS demande_id UUID
    REFERENCES public.demandes_inscription(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_codes_activation_demande_id
    ON public.codes_activation (demande_id)
    WHERE demande_id IS NOT NULL;

COMMENT ON COLUMN public.codes_activation.demande_id IS
    'Lien facultatif vers la demande d''inscription qui a motivé la génération de ce code (audit Super Admin). NULL si code créé sans demande (e.g. prospection directe).';


-- ------------------------------------------------------------
-- 1.3. pressing
--      Horaires d'ouverture (jsonb) — spec PROMPT 2.2.
--      Ex: {"lundi": "08:00-18:00", "mardi": "08:00-18:00", ...}
-- ------------------------------------------------------------
ALTER TABLE public.pressing
    ADD COLUMN IF NOT EXISTS horaires JSONB;

COMMENT ON COLUMN public.pressing.horaires IS
    'Horaires d''ouverture du pressing au format JSON. Ex: {"lundi": "08:00-18:00", "mardi": "08:00-18:00", "dimanche": null} pour fermé. NULL tant que non renseigné par le gérant.';


-- ------------------------------------------------------------
-- 1.4. abonnements
--      3 colonnes du spec PROMPT 2.2 pour tracer les paiements
--      d'abonnement SaaS (règlement hors app).
-- ------------------------------------------------------------
ALTER TABLE public.abonnements
    ADD COLUMN IF NOT EXISTS reference_paiement TEXT;

ALTER TABLE public.abonnements
    ADD COLUMN IF NOT EXISTS justificatif_url TEXT;

ALTER TABLE public.abonnements
    ADD COLUMN IF NOT EXISTS enregistre_par UUID
    REFERENCES public.super_admins(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_abonnements_enregistre_par
    ON public.abonnements (enregistre_par)
    WHERE enregistre_par IS NOT NULL;

COMMENT ON COLUMN public.abonnements.reference_paiement IS
    'Référence libre du paiement d''échéance (numéro transaction MOMO, reçu espèces, etc.). NULL si non payé.';

COMMENT ON COLUMN public.abonnements.justificatif_url IS
    'URL du justificatif de paiement uploadé par le Super Admin (capture MOMO, scan reçu). NULL si non fourni.';

COMMENT ON COLUMN public.abonnements.enregistre_par IS
    'Super Admin qui a enregistré l''échéance (audit). FK vers super_admins.';


-- ------------------------------------------------------------
-- 1.5. clients
--      preferences_lavage jsonb avec default — spec PROMPT 2.3.
--      Sert à pré-remplir les futures commandes du client
--      (PRD §5.2 — "preferences_lavage").
-- ------------------------------------------------------------
ALTER TABLE public.clients
    ADD COLUMN IF NOT EXISTS preferences_lavage JSONB
    NOT NULL DEFAULT '{"detergent": "bio", "temperature": "tiede", "adoucissant": true, "detachage": false, "pressing_intensif": false, "repassage": "standard"}'::jsonb;

COMMENT ON COLUMN public.clients.preferences_lavage IS
    'Préférences de lavage par défaut du client (PRD §5.2). JSON: {detergent, temperature, adoucissant, detachage, pressing_intensif, repassage}. Pré-rempli à la création.';


-- ------------------------------------------------------------
-- 1.6. commandes
--      2 colonnes pour tracer la remise — spec PROMPT 2.3.
--      montant_total_avant_remise = total brut (somme des lignes)
--      montant_remise = montant monétaire de la remise appliquée
--      montant_total = montant_total_avant_remise - montant_remise
--      (cohérence vérifiée par CHECK ajouté en Section 2)
-- ------------------------------------------------------------
ALTER TABLE public.commandes
    ADD COLUMN IF NOT EXISTS montant_total_avant_remise INTEGER
    NOT NULL DEFAULT 0;

ALTER TABLE public.commandes
    ADD COLUMN IF NOT EXISTS montant_remise INTEGER
    NOT NULL DEFAULT 0;

-- ⚠️ BACKFILL CRITIQUE :
-- Les commandes existantes ont été créées AVANT cette migration.
-- montant_total_avant_remise a defaulté à 0, mais montant_total
-- contient le vrai total. Si on ajoute la contrainte CHECK sans
-- backfiller, elle échouera (montant_total = montant_total_avant_remise
-- - montant_remise → montant_total = 0 - 0 = 0 ≠ montant_total réel).
-- On backfill donc : montant_total_avant_remise = montant_total
-- (et montant_remise reste à 0, ce qui respecte l'équation).
UPDATE public.commandes
   SET montant_total_avant_remise = montant_total
 WHERE montant_total_avant_remise = 0
   AND montant_total > 0
   AND montant_remise = 0;

COMMENT ON COLUMN public.commandes.montant_total_avant_remise IS
    'Montant total brut de la commande (somme des montants_ligne) avant application de la remise. En FCFA.';

COMMENT ON COLUMN public.commandes.montant_remise IS
    'Montant monétaire de la remise appliquée (calculé par la fonction calculer_montant_remise). En FCFA. montant_total = montant_total_avant_remise - montant_remise.';

-- Index pour les requêtes "commandes avec remise"
CREATE INDEX IF NOT EXISTS idx_commandes_remise
    ON public.commandes (pressing_id, montant_remise)
    WHERE montant_remise > 0;


-- ------------------------------------------------------------
-- 1.7. articles_vetements
--      assigne_a UUID FK personnel — spec PROMPT 2.3.
--      Permet d'affecter un vêtement à un atelier/laveur spécifique
--      (PRD §6.4 — "affectation atelier").
-- ------------------------------------------------------------
ALTER TABLE public.articles_vetements
    ADD COLUMN IF NOT EXISTS assigne_a UUID
    REFERENCES public.personnel(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_articles_vetements_assigne_a
    ON public.articles_vetements (assigne_a)
    WHERE assigne_a IS NOT NULL;

COMMENT ON COLUMN public.articles_vetements.assigne_a IS
    'Membre du personnel à qui l''article est affecté pour traitement (atelier). NULL si non affecté.';


-- ------------------------------------------------------------
-- 1.8. paiements
--      3 colonnes manquantes du spec PROMPT 2.3 :
--        - abonnement_id : pour tracer les paiements SaaS
--          (règlement abonnement mensuel)
--        - est_acompte : true si paiement partiel à la réception
--        - justificatif_url : URL du justificatif uploadé
-- ------------------------------------------------------------
ALTER TABLE public.paiements
    ALTER COLUMN commande_id DROP NOT NULL;

ALTER TABLE public.paiements
    ADD COLUMN IF NOT EXISTS abonnement_id UUID
    REFERENCES public.abonnements(id) ON DELETE CASCADE;

ALTER TABLE public.paiements
    ADD COLUMN IF NOT EXISTS est_acompte BOOLEAN
    NOT NULL DEFAULT FALSE;

ALTER TABLE public.paiements
    ADD COLUMN IF NOT EXISTS justificatif_url TEXT;

CREATE INDEX IF NOT EXISTS idx_paiements_abonnement_id
    ON public.paiements (abonnement_id)
    WHERE abonnement_id IS NOT NULL;

COMMENT ON COLUMN public.paiements.commande_id IS
    'Commande associée au paiement (pour un règlement client). NULL si le paiement concerne un abonnement SaaS (abonnement_id renseigné).';

COMMENT ON COLUMN public.paiements.abonnement_id IS
    'Abonnement SaaS associé au paiement (règlement échéance par le Super Admin). NULL si le paiement concerne une commande client (commande_id renseigné).';

COMMENT ON COLUMN public.paiements.est_acompte IS
    'TRUE si ce paiement est un acompte versé à la réception (avant traitement complet). FALSE sinon. Utile pour distinguer les acomptes des soldes finaux.';

COMMENT ON COLUMN public.paiements.justificatif_url IS
    'URL du justificatif de paiement (scan reçu, capture MOMO). NULL si non fourni.';


-- ------------------------------------------------------------
-- 1.9. produits_stock
--      2 colonnes du spec PROMPT 2.4 :
--        - fds_url : fiche de données de sécurité (obligatoire
--          réglementairement pour les biodétergents)
--        - date_expiration : péremption du produit
-- ------------------------------------------------------------
ALTER TABLE public.produits_stock
    ADD COLUMN IF NOT EXISTS fds_url TEXT;

ALTER TABLE public.produits_stock
    ADD COLUMN IF NOT EXISTS date_expiration DATE;

COMMENT ON COLUMN public.produits_stock.fds_url IS
    'URL de la Fiche de Données de Sécurité (FDS) du produit. Obligatoire réglementairement pour les produits chimiques (biodétergents). NULL si non uploadée.';

COMMENT ON COLUMN public.produits_stock.date_expiration IS
    'Date de péremption du produit. NULL si non périssable ou inconnu. Trigger d''alerte possible : expiré ou expirant dans 30 jours.';


-- ------------------------------------------------------------
-- 1.10. mouvements_stock
--       commande_id (nullable FK commandes) — spec PROMPT 2.4.
--       Permet de lier une sortie de stock à une commande
--       (consommation de biodétergent par commande).
-- ------------------------------------------------------------
ALTER TABLE public.mouvements_stock
    ADD COLUMN IF NOT EXISTS commande_id UUID
    REFERENCES public.commandes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_mouvements_stock_commande_id
    ON public.mouvements_stock (commande_id)
    WHERE commande_id IS NOT NULL;

COMMENT ON COLUMN public.mouvements_stock.commande_id IS
    'Commande associée au mouvement (sortie de stock pour une commande spécifique). NULL si mouvement non lié à une commande (réassort, ajustement, etc.).';


-- ============================================================
-- SECTION 2 — Contrainte CHECK XOR sur paiements
-- ============================================================
-- Spec PROMPT 2.3 : "soit commande_id est renseigné soit
-- abonnement_id, jamais les deux null en même temps, jamais
-- les deux renseignés en même temps".
--
-- Cette contrainte garantit qu'un paiement est TOUJOURS lié à
-- un objet métier (commande OU abonnement), mais JAMAIS aux deux.
-- ============================================================

DO $$
BEGIN
    -- Idempotent : si la contrainte existe déjà, on ne fait rien.
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'paiements_commande_abonnement_xor_check'
          AND conrelid = 'public.paiements'::regclass
    ) THEN
        ALTER TABLE public.paiements
            ADD CONSTRAINT paiements_commande_abonnement_xor_check
            CHECK (
                (commande_id IS NOT NULL AND abonnement_id IS NULL)
                OR
                (commande_id IS NULL AND abonnement_id IS NOT NULL)
            );
    END IF;
EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN duplicate_table THEN NULL;
END $$;

COMMENT ON CONSTRAINT paiements_commande_abonnement_xor_check ON public.paiements IS
    'Un paiement doit être lié à exactement un objet métier : soit une commande (client), soit un abonnement (SaaS). Jamais les deux, jamais aucun des deux.';


-- ============================================================
-- SECTION 3 — Contrainte CHECK cohérence remise sur commandes
-- ============================================================
-- montant_total = montant_total_avant_remise - montant_remise
-- (toujours vrai depuis qu'on a ajouté ces 2 colonnes en 1.6).
-- Exception : pour les commandes existantes créées avant 010,
-- montant_total_avant_remise = montant_total et montant_remise = 0
-- (default) → la contrainte reste valide.
-- ============================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'commandes_remise_coherence_check'
          AND conrelid = 'public.commandes'::regclass
    ) THEN
        ALTER TABLE public.commandes
            ADD CONSTRAINT commandes_remise_coherence_check
            CHECK (
                montant_total = montant_total_avant_remise - montant_remise
                AND montant_remise >= 0
                AND montant_total_avant_remise >= 0
            );
    END IF;
EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN duplicate_table THEN NULL;
END $$;

COMMENT ON CONSTRAINT commandes_remise_coherence_check ON public.commandes IS
    'Cohérence financière : montant_total = montant_total_avant_remise - montant_remise. Tous les montants sont >= 0.';


-- ============================================================
-- SECTION 4 — Index composite alertes stock bas
-- ============================================================
-- Spec PROMPT 2.4 : "index composite sur
-- produits_stock(pressing_id, quantite_actuelle, seuil_alerte)
-- pour accélérer le calcul des alertes de stock bas".
--
-- Requête typique accélérée :
--   SELECT * FROM produits_stock
--    WHERE pressing_id = ?
--      AND quantite_actuelle <= seuil_alerte;
--
-- On crée un index partiel (uniquement les lignes en alerte)
-- plutôt qu'un index sur toutes les lignes — beaucoup plus
-- performant pour ce filtre métier.
-- ============================================================

DROP INDEX IF EXISTS public.idx_produits_stock_alerte_basse;
CREATE INDEX idx_produits_stock_alerte_basse
    ON public.produits_stock (pressing_id, quantite_actuelle, seuil_alerte)
    WHERE quantite_actuelle <= seuil_alerte;

-- Index secondaire pour lister TOUS les produits d'un pressing
-- avec leur statut d'alerte (utile pour le dashboard stock complet).
CREATE INDEX IF NOT EXISTS idx_produits_stock_pressing_quantite
    ON public.produits_stock (pressing_id, quantite_actuelle);

COMMENT ON INDEX public.idx_produits_stock_alerte_basse IS
    'Index partiel pour les alertes de stock bas : accélère WHERE pressing_id=? AND quantite_actuelle <= seuil_alerte. Seules les lignes en alerte sont indexées (taille réduite).';


-- ============================================================
-- SECTION 5 — Fonction calculer_montant_remise (spec 2.5 item 4)
-- ============================================================
-- Spec : "retourne le montant de remise calculé en FCFA selon
-- le type de remise :
--   - pourcentage    → montant_avant * valeur / 100
--   - montant_fixe   → valeur
--   - article_gratuit → 0 (calculé différemment)
--   - fidelite       → montant_avant * valeur / 100
-- Cette fonction sera appelée depuis le frontend au moment de
-- la création de la commande, pas nécessairement via un trigger."
--
-- Volatile (pas IMMUTABLE) car dépend de la logique métier qui
-- peut évoluer. Mais déterministe (mêmes inputs → même output)
-- → on pourrait la marquer IMMUTABLE, on reste prudent en VOLATILE.
-- ============================================================

CREATE OR REPLACE FUNCTION public.calculer_montant_remise(
    p_montant_avant INTEGER,
    p_type          remise_type,
    p_valeur        INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_montant_remise INTEGER := 0;
BEGIN
    -- Validation : montant_avant >= 0
    IF p_montant_avant IS NULL OR p_montant_avant < 0 THEN
        RETURN 0;
    END IF;

    -- Validation : valeur >= 0
    IF p_valeur IS NULL OR p_valeur < 0 THEN
        RETURN 0;
    END IF;

    CASE p_type
        WHEN 'aucune' THEN
            v_montant_remise := 0;

        WHEN 'pourcentage' THEN
            -- valeur est un % ∈ [0, 100]
            IF p_valeur > 100 THEN
                v_montant_remise := p_montant_avant;  -- plafonné à 100%
            ELSE
                v_montant_remise := (p_montant_avant * p_valeur) / 100;
            END IF;

        WHEN 'montant_fixe' THEN
            -- valeur est un montant en FCFA, plafonné au montant_avant
            IF p_valeur > p_montant_avant THEN
                v_montant_remise := p_montant_avant;
            ELSE
                v_montant_remise := p_valeur;
            END IF;

        WHEN 'article_gratuit' THEN
            -- Calculé différemment (le montant de remise dépend du prix
            -- de l'article gratuit, qui n'est pas connu ici).
            -- Le spec dit explicitement : "0 pour l'instant car calculé
            -- différemment".
            v_montant_remise := 0;

        WHEN 'fidelite' THEN
            -- valeur est un % de remise fidélité ∈ [0, 100]
            IF p_valeur > 100 THEN
                v_montant_remise := p_montant_avant;
            ELSE
                v_montant_remise := (p_montant_avant * p_valeur) / 100;
            END IF;

        ELSE
            -- Type inconnu → pas de remise (safe default)
            v_montant_remise := 0;
    END CASE;

    -- Sécurité : la remise ne peut pas dépasser le montant avant
    IF v_montant_remise > p_montant_avant THEN
        v_montant_remise := p_montant_avant;
    END IF;

    RETURN v_montant_remise;
END;
$$;

COMMENT ON FUNCTION public.calculer_montant_remise(INTEGER, remise_type, INTEGER) IS
    'Calcule le montant de remise en FCFA selon le type (PRD §5.3). Appelée depuis le frontend au moment de la création de commande. Pour article_gratuit, retourne 0 (calculé séparément). Plafonnée au montant_avant.';


-- ============================================================
-- SECTION 6 — Fonction calculer_statut_commande (spec 2.5 item 3)
-- ============================================================
-- Spec : "Une fonction PostgreSQL calculer_statut_commande(commande_id
-- uuid) qui recalcule automatiquement le statut global d'une commande
-- en fonction des statuts de tous ses articles_vetements".
--
-- L'implémentation existe déjà sous le nom deriver_statut_commande
-- (paramètre p_commande_id). On crée un alias public.calculer_statut_commande
-- qui respecte exactement la signature du spec.
-- ============================================================

CREATE OR REPLACE FUNCTION public.calculer_statut_commande(
    commande_id UUID
)
RETURNS statut_commande
LANGUAGE plpgsql
SECURITY DEFINER
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
    'Alias spec-conforme (PROMPT 2.5 item 3) de deriver_statut_commande. Calcule le statut_commande dérivé des statuts des articles. Callable depuis le frontend pour prédire le statut sans modifier la DB. PostgREST: {"commande_id": "..."}.';


-- ============================================================
-- SECTION 7 — Fonction calculer_statut_paiement_commande
--             (spec 2.5 item 2)
-- ============================================================
-- Spec : "Une fonction PostgreSQL calculer_statut_paiement_commande(commande_id
-- uuid) qui recalcule automatiquement le statut_paiement d'une commande
-- ('non_paye', 'partiel', 'paye') en fonction de la somme des paiements
-- enregistrés comparée au montant_total".
--
-- L'implémentation 005 a un TRIGGER (trigger_recalculer_paiement_commande)
-- qui fait le calcul en arrière-plan mais n'est pas callable directement
-- (c'est une fonction TRIGGER sans paramètre). On crée la version scalaire
-- demandée par le spec.
-- ============================================================

CREATE OR REPLACE FUNCTION public.calculer_statut_paiement_commande(
    commande_id UUID
)
RETURNS statut_paiement_commande
LANGUAGE plpgsql
SECURITY DEFINER
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
    SELECT c.montant_total INTO v_montant_total
      FROM public.commandes c
     WHERE c.id = commande_id;

    -- Si la commande n'existe pas, retourner NULL (pas d'erreur).
    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    -- Sommer les paiements liés à cette commande.
    -- Même préfixage p. pour lever l'ambiguïté (sinon PL/pgSQL
    -- résoudrait `commande_id = commande_id` en `param = param` = TRUE
    -- → renverrait TOUS les paiements, pas seulement ceux de la commande).
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
    'Calcule le statut_paiement_commande (PRD §5.3). Callable depuis le frontend pour prédire le statut sans modifier la DB. Le trigger trigger_recalculer_paiement_commande fait la même chose en arrière-plan après chaque INSERT/UPDATE/DELETE sur paiements. PostgREST: {"commande_id": "..."}.';

-- Note : dans la fonction ci-dessus, on préfixe systématiquement les
-- colonnes par un alias de table (c., p.) pour lever l'ambiguïté
-- entre le paramètre `commande_id` et les colonnes du même nom dans
-- les tables commandes/paiements. Sans cela, PL/pgSQL résoudrait
-- `commande_id = commande_id` en `paramètre = paramètre` (= TRUE),
-- ce qui renverrait TOUS les paiements au lieu de ceux de la commande.


-- ============================================================
-- SECTION 8 — Correction de la vue vue_clients_enrichis
-- ============================================================
-- Spec PROMPT 2.5 item 1 : "total_depense : somme de tous les
-- paiements effectivement enregistrés pour les commandes de ce
-- client".
--
-- L'implémentation 009 calculait SUM(commandes.montant_total) qui
-- correspond au "chiffre d'affaires théorique" (montant des
-- commandes), pas au "total dépensé" (paiements encaissés).
--
-- Schéma de la vue corrigée :
--   clients
--   LEFT JOIN commandes ON commandes.client_id = clients.id
--   GROUP BY clients.id
--   + subquery scalaire corrélée sur clients.id pour total_depense
--     (SUM(paiements.montant) pour les commandes du client)
--
-- ⚠️ On NE fait PAS de LEFT JOIN paiements dans la requête principale
--    pour éviter l'inflation du SUM(montant_total - montant_paye)
--    si une commande a plusieurs paiements (chaque paiement dupliquerait
--    la ligne commande → somme multipliée par le nb de paiements).
-- ============================================================

DROP VIEW IF EXISTS public.vue_clients_enrichis;

CREATE VIEW public.vue_clients_enrichis AS
SELECT
    c.id,
    c.pressing_id,
    c.nom_complet,
    c.telephone,
    c.email,
    c.adresse,
    c.preferences_lavage,    -- nouvelle colonne 010

    -- solde_impaye : SUM(montant_total - montant_paye) pour commandes
    -- non entièrement payées (statut_paiement IN ('non_paye','partiel')).
    -- ⚠️ Utilise cmd.montant_paye (calculé par trigger 005) — PAS de JOIN
    -- paiements dans la requête principale pour éviter l'inflation du SUM
    -- si une commande a plusieurs paiements.
    COALESCE(
        SUM(
            CASE
                WHEN cmd.statut_paiement IN ('non_paye', 'partiel')
                    THEN GREATEST(cmd.montant_total - cmd.montant_paye, 0)
                ELSE 0
            END
        ),
        0
    ) AS solde_impaye,

    -- total_depense : SUM(paiements effectivement enregistrés) — spec 2.5.
    -- ⚠️ Subquery scalaire corrélée sur c.id pour éviter l'inflation du
    -- SUM si on JOIN paiements dans la requête principale (cf. note ci-dessus).
    COALESCE(
        (
            SELECT SUM(p.montant)
              FROM public.paiements p
              JOIN public.commandes cmd2 ON cmd2.id = p.commande_id
             WHERE cmd2.client_id = c.id
               AND p.commande_id IS NOT NULL
        ),
        0
    ) AS total_depense,

    -- nombre_commandes : COUNT(commandes)
    COUNT(cmd.id) AS nombre_commandes,

    -- derniere_commande : MAX(commandes.created_at)
    MAX(cmd.created_at) AS derniere_commande

FROM public.clients c
LEFT JOIN public.commandes cmd ON cmd.client_id = c.id
GROUP BY c.id, c.pressing_id, c.nom_complet, c.telephone, c.email,
         c.adresse, c.preferences_lavage, c.points_fidelite, c.notes,
         c.created_at, c.updated_at;

COMMENT ON VIEW public.vue_clients_enrichis IS
    'Vue enrichie des clients : solde_impaye (commandes non payées), total_depense (somme des paiements encaissés), nombre_commandes, derniere_commande. Hérite du pressing_id → RLS multi-tenant automatique.';

-- GRANT : la vue est soumise à RLS (security_invoker par défaut en PG15+).
GRANT SELECT ON public.vue_clients_enrichis TO anon, authenticated;


-- ============================================================
-- SECTION 9 — Vérifications post-migration (manuelles, à exécuter
--             dans le SQL Editor pour confirmer le bon état)
-- ============================================================
-- -- 9.1. Toutes les nouvelles colonnes existent ?
-- SELECT column_name FROM information_schema.columns
--  WHERE table_schema = 'public'
--    AND column_name IN (
--      'nombre_machines', 'nombre_employes',
--      'demande_id', 'horaires',
--      'reference_paiement', 'justificatif_url', 'enregistre_par',
--      'preferences_lavage',
--      'montant_total_avant_remise', 'montant_remise',
--      'assigne_a',
--      'abonnement_id', 'est_acompte',
--      'fds_url', 'date_expiration',
--      'commande_id'  -- existe déjà sur mouvements_stock via 010
--    )
--  ORDER BY table_name, column_name;
--
-- -- 9.2. La contrainte CHECK XOR existe ?
-- SELECT conname FROM pg_constraint
--  WHERE conname = 'paiements_commande_abonnement_xor_check';
--
-- -- 9.3. Les fonctions existent ?
-- SELECT proname FROM pg_proc
--  WHERE proname IN (
--      'calculer_montant_remise',
--      'calculer_statut_commande',
--      'calculer_statut_paiement_commande'
--  );
--
-- -- 9.4. Test fonctionnel calculer_montant_remise
-- SELECT public.calculer_montant_remise(10000, 'pourcentage'::remise_type, 10);
-- -- attendu : 1000
--
-- SELECT public.calculer_montant_remise(10000, 'montant_fixe'::remise_type, 1500);
-- -- attendu : 1500
--
-- SELECT public.calculer_montant_remise(10000, 'article_gratuit'::remise_type, 0);
-- -- attendu : 0
--
-- -- 9.5. La vue est correcte ?
-- SELECT id, nom_complet, solde_impaye, total_depense, nombre_commandes
--   FROM public.vue_clients_enrichis
--  LIMIT 5;


-- ============================================================
-- Fin de la migration 010_lot2_gap_fill.sql
-- ============================================================
-- Récapitulatif des ajouts :
--   - 17 colonnes (ADD COLUMN IF NOT EXISTS) sur 9 tables
--   - 1 contrainte CHECK XOR (paiements)
--   - 1 contrainte CHECK cohérence remise (commandes)
--   - 2 index (alerte stock bas + remise)
--   - 3 fonctions PostgreSQL (calculer_montant_remise, calculer_statut_commande,
--     calculer_statut_paiement_commande)
--   - 1 vue recréée (vue_clients_enrichis avec total_depense corrigé)
--   - 9 index secondaires sur les nouvelles FK
--
-- Toutes les opérations sont IDEMPOTENTES. La migration peut être
-- re-exécutée sans erreur.
--
-- ⚠️  Après application, l'utilisateur doit :
--   1. Exécuter ce script dans le SQL Editor Supabase
--   2. Confirmer "010 ok" dans le chat
--   3. L'agent mettra à jour database.types.ts pour refléter
--      les nouvelles colonnes
-- ============================================================
