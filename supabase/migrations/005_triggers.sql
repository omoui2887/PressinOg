-- ============================================================
-- e-pressing — Migration 005 : Triggers & Functions
-- ============================================================
-- Fichier    : 005_triggers.sql
-- Version    : 1.2
-- Date       : 24/07/2026
-- Fix v1.1   : DROP TRIGGER IF EXISTS avant chaque CREATE TRIGGER → idempotent.
-- Fix v1.2   : Correction de 2 bugs runtime bloquants :
--              (a) generer_numero_commande() : syntaxe invalide du calcul de
--                  clé advisory lock (CAST d'un row à 3 éléments vers BIGINT).
--                  Remplacé par pg_advisory_xact_lock(annee, hashtext(pressing_id)).
--              (b) trigger_appliquer_mouvement_stock() : sous-requête scalaire
--                  invalide `(col FROM tbl WHERE ...)` dans le RAISE EXCEPTION.
--                  Remplacé par `(SELECT col FROM tbl WHERE ...)`.
-- Description : Fonctions et triggers PostgreSQL pour automatiser :
--   1. Mise à jour automatique de updated_at sur toutes les tables
--   2. Génération automatique du numero_commande (CMD-YYYY-NNNNN)
--   3. Génération automatique du code_qr article (ART-XXXXXXXX)
--   4. Dérivation automatique de commandes.statut depuis les articles
--   5. Calcul automatique de commandes.statut_paiement + montant_paye
--      depuis la table paiements
--   6. Mise à jour de produits_stock.quantite_actuelle après un
--      mouvement de stock
--
-- Prérequis :
--   - Migrations 001 (enums), 002 (tables), 003 (constraints), 004 (indexes) ✅
--
-- Convention :
--   - Fonctions en LANGUAGE plpgsql, SECURITY DEFINER (bypass RLS pour
--     les calculs internes), VOLATILE par défaut (modifient des données)
--   - search_path = public pour empêcher les attaques par hijack de schéma
--   - Triggers nommés trg_<table>_<événement>
-- ============================================================


-- ============================================================
-- SECTION 1 : set_updated_at() — mise à jour automatique de updated_at
-- ============================================================
-- Une seule fonction générique réutilisée par toutes les tables via
-- des triggers BEFORE UPDATE. On évite 17 fonctions redondantes.
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.set_updated_at() IS
    'Met à jour NEW.updated_at = NOW() sur toute table ayant une colonne updated_at. À appeler via un trigger BEFORE UPDATE.';


-- ============================================================
-- SECTION 2 : Génération automatique du numero_commande
-- ============================================================
-- Format : CMD-AAAA-NNNNN
--   - AAAA : année de la réception
--   - NNNNN : compteur séquentiel sur 5 chiffres par pressing × année
--   → chaque pressing repart de 00001 chaque 1er janvier
--   → garantie d'unicité globale via la contrainte UNIQUE de 002
--
-- Le compteur est calculé en lisant le nombre de commandes déjà
-- présentes pour ce pressing cette année. Pour éviter les races
-- conditions, on utilise un advisory lock (pressing_id, year).
-- ============================================================

CREATE OR REPLACE FUNCTION public.generer_numero_commande()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    annee_courante    INT;
    compteur          INT;
    numero_genere     TEXT;
BEGIN
    -- Si l'app a déjà fourni un numero_commande, on le respecte.
    IF NEW.numero_commande IS NOT NULL AND NEW.numero_commande <> '' THEN
        RETURN NEW;
    END IF;

    annee_courante := EXTRACT(YEAR FROM COALESCE(NEW.date_reception, NOW()));

    -- Verrou advisory pour éviter 2 INSERT concurrents avec le même numéro.
    -- Forme à 2 entiers : (annee, hash du pressing_id) → un lock unique par
    -- couple (pressing, année). Les collisions de hashtext entre pressings
    -- différents sont rares et sans gravité (au pire, 2 pressings se sérialisent
    -- brièvement sur la même commande — l'unicité du numero est de toute façon
    -- garantie par la contrainte UNIQUE de 002).
    PERFORM pg_advisory_xact_lock(
        annee_courante,
        hashtext(CAST(NEW.pressing_id AS TEXT))
    );

    -- Compter les commandes existantes pour ce pressing cette année.
    SELECT COUNT(*) + 1
      INTO compteur
      FROM public.commandes
     WHERE pressing_id = NEW.pressing_id
       AND EXTRACT(YEAR FROM date_reception) = annee_courante;

    numero_genere := 'CMD-' || annee_courante || '-' || LPad(compteur::TEXT, 5, '0');
    NEW.numero_commande := numero_genere;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.generer_numero_commande() IS
    'Génère NEW.numero_commande au format CMD-AAAA-NNNNN (compteur annuel par pressing). Utilise pg_advisory_xact_lock(annee, hashtext(pressing_id)) pour éviter les doublons concurrents.';


-- ============================================================
-- SECTION 3 : Génération automatique du code_qr article
-- ============================================================
-- Format : ART-XXXXXXXX (8 caractères alphanumériques en majuscules)
-- Le code doit être unique globalement (contrainte UNIQUE de 002).
-- On génère aléatoirement et on retente en cas de collision (rare).
-- ============================================================

CREATE OR REPLACE FUNCTION public.generer_code_qr_article()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    tentative      TEXT;
    essais         INT := 0;
    caractères     TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    max_essais     INT := 10;
BEGIN
    -- Si l'app a déjà fourni un code_qr, on le respecte.
    IF NEW.code_qr IS NOT NULL AND NEW.code_qr <> '' THEN
        RETURN NEW;
    END IF;

    LOOP
        essais := essais + 1;
        IF essais > max_essais THEN
            RAISE EXCEPTION 'Impossible de générer un code_qr unique après % essais', max_essais;
        END IF;

        -- Génère 8 caractères aléatoires.
        SELECT string_agg(
                    substr(caractères, 1 + floor(random() * length(caractères))::INT, 1),
                    ''
                )
          INTO tentative
          FROM generate_series(1, 8);

        tentative := 'ART-' || tentative;

        -- Vérifie l'unicité.
        IF NOT EXISTS (SELECT 1 FROM public.articles_vetements WHERE code_qr = tentative) THEN
            NEW.code_qr := tentative;
            RETURN NEW;
        END IF;
    END LOOP;
END;
$$;

COMMENT ON FUNCTION public.generer_code_qr_article() IS
    'Génère NEW.code_qr au format ART-XXXXXXXX (8 aléatoires). Retente jusqu''à 10 fois en cas de collision.';


-- ============================================================
-- SECTION 4 : Dérivation de commandes.statut depuis les articles
-- ============================================================
-- Règle métier (PRD §6.4) : le statut d'une commande est dérivé
-- automatiquement des statuts de ses articles.
--
-- Matrice de dérivation (du moins avancé au plus avancé) :
--   - Si tous les articles sont 'recu'                    → recu
--   - Si au moins 1 article est 'en_traitement'           → en_traitement
--   - Si au moins 1 article est 'lave' (et aucun en_traitement) → lave
--   - Si au moins 1 article est 'repasse' (et aucun en_traitement/lave) → repasse
--   - Si tous les articles sont 'pret' ou au-delà          → pret
--   - Si tous les articles sont 'livre'                   → livre
--   - Si tous les articles sont 'retire'                  → retire
--   - 'en_livraison' : géré manuellement par le livreur (transition explicite)
--
-- Statut_article n'a PAS 'en_livraison' (contrairement à statut_commande).
-- La commande passe à 'en_livraison' puis 'livre' via actions métier
-- explicites (livreur), pas par dérivation automatique.
-- ============================================================

CREATE OR REPLACE FUNCTION public.deriver_statut_commande(p_commande_id UUID)
RETURNS statut_commande
LANGUAGE plpgsql
SECURITY DEFINER
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
    'Calcule le statut_commande dérivé des statuts des articles (PRD §6.4). Ignore la transition en_livraison (manuelle).';


-- Trigger wrapper : appelle deriver_statut_commande et met à jour la commande
CREATE OR REPLACE FUNCTION public.trigger_recalculer_statut_commande()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    cmd_id         UUID;
    ancien_statut  statut_commande;
    nouveau_statut statut_commande;
BEGIN
    -- Identifier la commande concernée (OLD ou NEW selon l'événement).
    cmd_id := COALESCE(NEW.commande_id, OLD.commande_id);
    IF cmd_id IS NULL THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    -- Récupérer le statut actuel de la commande.
    SELECT statut INTO ancien_statut
      FROM public.commandes WHERE id = cmd_id;

    -- Si la commande est en 'en_livraison', 'livre' ou 'retire', on ne
    -- recalule PAS : ces transitions sont manuelles (livreur).
    -- On recalcule uniquement pour les statuts atelier.
    IF ancien_statut IN ('en_livraison', 'livre', 'retire') THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    -- Calculer le nouveau statut.
    SELECT public.deriver_statut_commande(cmd_id) INTO nouveau_statut;

    -- Mettre à jour si différent (évite la récursivité infinie).
    IF nouveau_statut IS DISTINCT FROM ancien_statut THEN
        UPDATE public.commandes
           SET statut = nouveau_statut,
               updated_at = NOW()
         WHERE id = cmd_id;

        -- Mettre à jour date_pret_reel si la commande passe à 'pret'.
        IF nouveau_statut = 'pret' AND ancien_statut <> 'pret' THEN
            UPDATE public.commandes
               SET date_pret_reel = NOW()
             WHERE id = cmd_id AND date_pret_reel IS NULL;
        END IF;
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$;

COMMENT ON FUNCTION public.trigger_recalculer_statut_commande() IS
    'Trigger : recalcule commandes.statut après INSERT/UPDATE/DELETE sur articles_vetements. Ignore les statuts livreur (en_livraison/livre/retire).';


-- ============================================================
-- SECTION 5 : Calcul de commandes.statut_paiement + montant_paye
-- ============================================================
-- Règle métier (PRD §5.3) :
--   - montant_paye = SUM(paiements.montant) pour la commande
--   - statut_paiement :
--       * non_paye si montant_paye = 0
--       * partiel  si 0 < montant_paye < montant_total
--       * paye     si montant_paye >= montant_total
--
-- Ce recalcul se déclenche après chaque INSERT/UPDATE/DELETE sur
-- la table paiements.
-- ============================================================

CREATE OR REPLACE FUNCTION public.trigger_recalculer_paiement_commande()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

    -- Calculer le total payé.
    SELECT COALESCE(SUM(montant), 0)
      INTO total_paye
      FROM public.paiements
     WHERE commande_id = cmd_id;

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
    'Trigger : recalcule commandes.montant_paye + statut_paiement après INSERT/UPDATE/DELETE sur paiements.';


-- ============================================================
-- SECTION 6 : Mise à jour de produits_stock.quantite_actuelle
-- ============================================================
-- Règle métier (PRD §14) :
--   - type_mouvement = 'entree'     → quantite_actuelle += quantite
--   - type_mouvement = 'sortie'     → quantite_actuelle -= quantite
--   - type_mouvement = 'ajustement' → quantite_actuelle = quantite (valeur absolue)
--
-- Le trigger AFTER INSERT met à jour le stock du produit concerné.
-- Pas de trigger UPDATE/DELETE : un mouvement de stock est immuable
-- (historique). Pour corriger, on crée un mouvement d'ajustement.
-- ============================================================

CREATE OR REPLACE FUNCTION public.trigger_appliquer_mouvement_stock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    produit_id_local UUID;
    nouvelle_quantite NUMERIC(10,2);
BEGIN
    produit_id_local := NEW.produit_id;

    IF NEW.type_mouvement = 'entree' THEN
        UPDATE public.produits_stock
           SET quantite_actuelle = quantite_actuelle + NEW.quantite,
               updated_at = NOW()
         WHERE id = produit_id_local;

    ELSIF NEW.type_mouvement = 'sortie' THEN
        -- Le CHECK de 003 garantit que la quantite de sortie est > 0.
        -- Vérifier qu'on ne descend pas sous 0 (sinon RAISE EXCEPTION).
        SELECT quantite_actuelle - NEW.quantite INTO nouvelle_quantite
          FROM public.produits_stock WHERE id = produit_id_local;

        IF nouvelle_quantite < 0 THEN
            RAISE EXCEPTION
                'Stock insuffisant pour le produit % : tentative de sortir % alors que le stock est de %',
                produit_id_local, NEW.quantite,
                (SELECT quantite_actuelle FROM public.produits_stock WHERE id = produit_id_local);
        END IF;

        UPDATE public.produits_stock
           SET quantite_actuelle = quantite_actuelle - NEW.quantite,
               updated_at = NOW()
         WHERE id = produit_id_local;

    ELSIF NEW.type_mouvement = 'ajustement' THEN
        -- Ajustement : on définit la valeur absolue.
        UPDATE public.produits_stock
           SET quantite_actuelle = NEW.quantite,
               updated_at = NOW()
         WHERE id = produit_id_local;
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.trigger_appliquer_mouvement_stock() IS
    'Trigger AFTER INSERT : applique le mouvement à produits_stock.quantite_actuelle. entree +=, sortie -=, ajustement = valeur absolue. Lève une exception si stock négatif.';


-- ============================================================
-- SECTION 7 : Création des triggers
-- ============================================================

-- 7.1. Triggers BEFORE UPDATE (set_updated_at)
--     Une instruction par table (BEFORE UPDATE sur la colonne updated_at).
DROP TRIGGER IF EXISTS trg_set_updated_at_super_admins ON public.super_admins;
CREATE TRIGGER trg_set_updated_at_super_admins
    BEFORE UPDATE ON public.super_admins
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_set_updated_at_demandes_inscription ON public.demandes_inscription;
CREATE TRIGGER trg_set_updated_at_demandes_inscription
    BEFORE UPDATE ON public.demandes_inscription
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_set_updated_at_codes_activation ON public.codes_activation;
CREATE TRIGGER trg_set_updated_at_codes_activation
    BEFORE UPDATE ON public.codes_activation
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_set_updated_at_pressing ON public.pressing;
CREATE TRIGGER trg_set_updated_at_pressing
    BEFORE UPDATE ON public.pressing
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_set_updated_at_abonnements ON public.abonnements;
CREATE TRIGGER trg_set_updated_at_abonnements
    BEFORE UPDATE ON public.abonnements
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_set_updated_at_personnel ON public.personnel;
CREATE TRIGGER trg_set_updated_at_personnel
    BEFORE UPDATE ON public.personnel
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_set_updated_at_clients ON public.clients;
CREATE TRIGGER trg_set_updated_at_clients
    BEFORE UPDATE ON public.clients
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_set_updated_at_services ON public.services;
CREATE TRIGGER trg_set_updated_at_services
    BEFORE UPDATE ON public.services
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_set_updated_at_commandes ON public.commandes;
CREATE TRIGGER trg_set_updated_at_commandes
    BEFORE UPDATE ON public.commandes
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_set_updated_at_commande_lignes ON public.commande_lignes;
CREATE TRIGGER trg_set_updated_at_commande_lignes
    BEFORE UPDATE ON public.commande_lignes
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_set_updated_at_articles_vetements ON public.articles_vetements;
CREATE TRIGGER trg_set_updated_at_articles_vetements
    BEFORE UPDATE ON public.articles_vetements
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_set_updated_at_paiements ON public.paiements;
CREATE TRIGGER trg_set_updated_at_paiements
    BEFORE UPDATE ON public.paiements
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_set_updated_at_produits_stock ON public.produits_stock;
CREATE TRIGGER trg_set_updated_at_produits_stock
    BEFORE UPDATE ON public.produits_stock
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_set_updated_at_machines ON public.machines;
CREATE TRIGGER trg_set_updated_at_machines
    BEFORE UPDATE ON public.machines
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_set_updated_at_anomalies ON public.anomalies;
CREATE TRIGGER trg_set_updated_at_anomalies
    BEFORE UPDATE ON public.anomalies
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_set_updated_at_depenses ON public.depenses;
CREATE TRIGGER trg_set_updated_at_depenses
    BEFORE UPDATE ON public.depenses
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- (16 triggers — mouvements_stock n'a pas de updated_at, par design
--  un mouvement est immuable)


-- 7.2. Trigger BEFORE INSERT sur commandes (numéro auto)
DROP TRIGGER IF EXISTS trg_commandes_numero_auto ON public.commandes;
CREATE TRIGGER trg_commandes_numero_auto
    BEFORE INSERT ON public.commandes
    FOR EACH ROW EXECUTE FUNCTION public.generer_numero_commande();


-- 7.3. Trigger BEFORE INSERT sur articles_vetements (code_qr auto)
DROP TRIGGER IF EXISTS trg_articles_vetements_code_qr_auto ON public.articles_vetements;
CREATE TRIGGER trg_articles_vetements_code_qr_auto
    BEFORE INSERT ON public.articles_vetements
    FOR EACH ROW EXECUTE FUNCTION public.generer_code_qr_article();


-- 7.4. Triggers AFTER INSERT/UPDATE/DELETE sur articles_vetements
--      → recalcule commandes.statut
DROP TRIGGER IF EXISTS trg_commandes_statut_apres_article_insert ON public.articles_vetements;
CREATE TRIGGER trg_commandes_statut_apres_article_insert
    AFTER INSERT ON public.articles_vetements
    FOR EACH ROW EXECUTE FUNCTION public.trigger_recalculer_statut_commande();

DROP TRIGGER IF EXISTS trg_commandes_statut_apres_article_update ON public.articles_vetements;
CREATE TRIGGER trg_commandes_statut_apres_article_update
    AFTER UPDATE OF statut, commande_id ON public.articles_vetements
    FOR EACH ROW
    WHEN (OLD.statut IS DISTINCT FROM NEW.statut
          OR OLD.commande_id IS DISTINCT FROM NEW.commande_id)
    EXECUTE FUNCTION public.trigger_recalculer_statut_commande();

DROP TRIGGER IF EXISTS trg_commandes_statut_apres_article_delete ON public.articles_vetements;
CREATE TRIGGER trg_commandes_statut_apres_article_delete
    AFTER DELETE ON public.articles_vetements
    FOR EACH ROW EXECUTE FUNCTION public.trigger_recalculer_statut_commande();


-- 7.5. Triggers AFTER INSERT/UPDATE/DELETE sur paiements
--      → recalcule commandes.statut_paiement + montant_paye
DROP TRIGGER IF EXISTS trg_commandes_paiement_apres_paiement_insert ON public.paiements;
CREATE TRIGGER trg_commandes_paiement_apres_paiement_insert
    AFTER INSERT ON public.paiements
    FOR EACH ROW EXECUTE FUNCTION public.trigger_recalculer_paiement_commande();

DROP TRIGGER IF EXISTS trg_commandes_paiement_apres_paiement_update ON public.paiements;
CREATE TRIGGER trg_commandes_paiement_apres_paiement_update
    AFTER UPDATE OF montant, commande_id ON public.paiements
    FOR EACH ROW
    WHEN (OLD.montant IS DISTINCT FROM NEW.montant
          OR OLD.commande_id IS DISTINCT FROM NEW.commande_id)
    EXECUTE FUNCTION public.trigger_recalculer_paiement_commande();

DROP TRIGGER IF EXISTS trg_commandes_paiement_apres_paiement_delete ON public.paiements;
CREATE TRIGGER trg_commandes_paiement_apres_paiement_delete
    AFTER DELETE ON public.paiements
    FOR EACH ROW EXECUTE FUNCTION public.trigger_recalculer_paiement_commande();


-- 7.6. Trigger AFTER INSERT sur mouvements_stock → met à jour le stock
DROP TRIGGER IF EXISTS trg_mouvements_stock_appliquer ON public.mouvements_stock;
CREATE TRIGGER trg_mouvements_stock_appliquer
    AFTER INSERT ON public.mouvements_stock
    FOR EACH ROW EXECUTE FUNCTION public.trigger_appliquer_mouvement_stock();


-- ============================================================
-- Fin de la migration 005_triggers.sql
-- Total :
--   - 7 fonctions plpgsql (SECURITY DEFINER) :
--       * set_updated_at, generer_numero_commande, generer_code_qr_article,
--         deriver_statut_commande, trigger_recalculer_statut_commande,
--         trigger_recalculer_paiement_commande, trigger_appliquer_mouvement_stock
--   - 25 triggers (tous idempotents via DROP TRIGGER IF EXISTS) :
--       * 16 × set_updated_at (BEFORE UPDATE)
--       * 1  × numero_commande auto (BEFORE INSERT commandes)
--       * 1  × code_qr auto (BEFORE INSERT articles_vetements)
--       * 3  × recalcul statut commande (AFTER article INSERT/UPDATE/DELETE)
--       * 3  × recalcul statut paiement (AFTER paiement INSERT/UPDATE/DELETE)
--       * 1  × application mouvement stock (AFTER INSERT mouvements_stock)
-- ============================================================
