-- ============================================================
-- e-pressing — Tests SQL de la création de commande atomique (RPC)
-- ============================================================
-- Ce script valide le comportement atomique de la RPC
-- `create_commande_atomic` directement au niveau PostgreSQL.
-- À exécuter après avoir appliqué la migration 038.
--
-- Couverture (12 scénarios — incluant concurrence + rollback) :
--   1.  commande simple sans remise ni acompte
--   2.  commande avec acompte partiel (statut 'partiel')
--   3.  commande avec acompte total (statut 'paye')
--   4.  commande avec remise commerciale (pourcentage)
--   5.  commande avec remise fidélité (calculée côté serveur)
--   6.  commande avec article personnalisé (prix custom)
--   7.  idempotence — même clé retourne la commande existante
--   8.  concurrence — 2 créations parallèles avec clés différentes
--   9.  rollback — acompte > total → aucune commande créée
--   10. rollback — service inactif → aucune commande créée
--   11. rollback — client cross-pressing → aucune commande créée
--   12. contraintes SQL — CHECK commandes_montant_total_coherent_check
--
-- PRÉREQUIS : avoir appliqué 035, 036, 037, 038.
--
-- UTILISATION :
--   psql -h <host> -U postgres -d postgres -f tests/create-commande-atomic.sql
--   (ou via Supabase SQL Editor — exécuter en mode autocommit)
-- ============================================================

\set ECHO all
\set ON_ERROR_STOP off

-- ============================================================
-- SETUP : créer des données de test (pressing, client, services, catalogue)
-- ============================================================

-- Nettoyer les données de test précédentes
DELETE FROM public.paiement_annulations WHERE pressing_id IN (
  SELECT id FROM public.pressing WHERE slug = 'test-create-commande-atomic'
);
DELETE FROM public.paiements WHERE commande_id IN (
  SELECT id FROM public.commandes WHERE numero_commande LIKE 'TEST-CC-%'
);
DELETE FROM public.articles_vetements WHERE commande_id IN (
  SELECT id FROM public.commandes WHERE numero_commande LIKE 'TEST-CC-%'
);
DELETE FROM public.commande_lignes WHERE commande_id IN (
  SELECT id FROM public.commandes WHERE numero_commande LIKE 'TEST-CC-%'
);
DELETE FROM public.commandes WHERE numero_commande LIKE 'TEST-CC-%';
DELETE FROM public.audit_log WHERE pressing_id IN (
  SELECT id FROM public.pressing WHERE slug = 'test-create-commande-atomic'
);
DELETE FROM public.clients WHERE telephone LIKE 'TEST-CC-%';
DELETE FROM public.tarifs_articles WHERE pressing_id IN (
  SELECT id FROM public.pressing WHERE slug = 'test-create-commande-atomic'
);
DELETE FROM public.services WHERE pressing_id IN (
  SELECT id FROM public.pressing WHERE slug = 'test-create-commande-atomic'
);
DELETE FROM public.pressing_remise_config WHERE pressing_id IN (
  SELECT id FROM public.pressing WHERE slug = 'test-create-commande-atomic'
);
DELETE FROM public.pressing WHERE slug = 'test-create-commande-atomic';

-- Créer un pressing de test
INSERT INTO public.pressing (id, slug, nom, email, telephone, adresse, ville, pays)
VALUES (
  '00000000-0000-0000-0000-0000000000a1',
  'test-create-commande-atomic',
  'Pressing Test CC',
  'test-cc@test.local',
  'TEST-CC-001',
  'Test Address',
  'Test City',
  'CI'
)
ON CONFLICT (id) DO NOTHING;

-- Config de remise par défaut
INSERT INTO public.pressing_remise_config (pressing_id)
VALUES ('00000000-0000-0000-0000-0000000000a1')
ON CONFLICT (pressing_id) DO NOTHING;

-- Créer un client de test avec 100 points fidélité (5%)
INSERT INTO public.clients (id, pressing_id, nom_complet, telephone, points_fidelite)
VALUES (
  '00000000-0000-0000-0000-0000000000b1',
  '00000000-0000-0000-0000-0000000000a1',
  'Client Test CC',
  'TEST-CC-CLIENT-001',
  100
)
ON CONFLICT (id) DO NOTHING;

-- Créer un personnel manager de test
INSERT INTO public.personnel (id, pressing_id, nom_complet, role, actif, statut_compte)
VALUES (
  '00000000-0000-0000-0000-0000000000c1',
  '00000000-0000-0000-0000-0000000000a1',
  'Manager Test CC',
  'manager',
  true,
  'actif'
)
ON CONFLICT (id) DO NOTHING;

-- Créer un service Lavage (prix 500 FCFA)
INSERT INTO public.services (id, pressing_id, type, nom, prix, actif)
VALUES (
  '00000000-0000-0000-0000-0000000000d1',
  '00000000-0000-0000-0000-0000000000a1',
  'lavage',
  'Lavage Standard',
  500,
  true
)
ON CONFLICT (id) DO NOTHING;

-- Créer un service Repassage (prix 300 FCFA)
INSERT INTO public.services (id, pressing_id, type, nom, prix, actif)
VALUES (
  '00000000-0000-0000-0000-0000000000d2',
  '00000000-0000-0000-0000-0000000000a1',
  'repassage',
  'Repassage Standard',
  300,
  true
)
ON CONFLICT (id) DO NOTHING;

-- Créer un service inactif
INSERT INTO public.services (id, pressing_id, type, nom, prix, actif)
VALUES (
  '00000000-0000-0000-0000-0000000000d3',
  '00000000-0000-0000-0000-0000000000a1',
  'nettoyage_sec',
  'Nettoyage à sec (désactivé)',
  2000,
  false
)
ON CONFLICT (id) DO NOTHING;

-- Créer un tarif spécifique pour Chemise + Lavage = 400 FCFA (override service.prix=500)
INSERT INTO public.tarifs_articles (pressing_id, catalogue_article_id, type_service, prix, actif)
SELECT '00000000-0000-0000-0000-0000000000a1', id, 'lavage', 400, true
  FROM public.catalogue_articles WHERE slug = 'chemise'
ON CONFLICT DO NOTHING;


-- ============================================================
-- TEST 1 : Commande simple sans remise ni acompte
-- ============================================================
\echo '=== TEST 1: Commande simple ==='

SELECT public.create_commande_atomic(
  p_pressing_id := '00000000-0000-0000-0000-0000000000a1',
  p_user_id := NULL,
  p_personnel_id := '00000000-0000-0000-0000-0000000000c1',
  p_role := 'manager',
  p_client_id := '00000000-0000-0000-0000-0000000000b1',
  p_date_pret_prevue := '2026-08-20 18:00:00+00',
  p_notes := 'Test commande simple',
  p_priorite := 'normal',
  p_idempotence_key := 'test-cc-1',
  p_articles_json := jsonb_build_array(jsonb_build_object(
    'service_id', '00000000-0000-0000-0000-0000000000d1',
    'catalogue_article_id', (SELECT id FROM public.catalogue_articles WHERE slug = 'chemise'),
    'catalogue_article_nom', 'Chemises',
    'couleur', 'blanc',
    'couleur_libre', NULL,
    'etat', 'bon',
    'description_etat', NULL,
    'quantite', 3,
    'is_custom', false,
    'prix_unitaire', NULL
  )),
  p_remise := NULL,
  p_acompte := NULL
);

-- Vérifie que la commande a été créée avec montant_total = 400*3 = 1200
-- (tarif spécifique Chemise+Lavage = 400, pas service.prix = 500)
SELECT id, numero_commande, montant_total, montant_paye, statut, statut_paiement, priorite
  FROM public.commandes
 WHERE idempotence_key = 'test-cc-1';

-- Expected : montant_total = 1200, montant_paye = 0, statut_paiement = 'non_paye'

-- Vérifie que 3 articles_vetements ont été créés (1 par unité de quantité)
SELECT COUNT(*) AS nb_articles
  FROM public.articles_vetements av
  JOIN public.commandes c ON c.id = av.commande_id
 WHERE c.idempotence_key = 'test-cc-1';
-- Expected : 3

-- Vérifie que 1 commande_lignes a été créée
SELECT COUNT(*) AS nb_lignes
  FROM public.commande_lignes cl
  JOIN public.commandes c ON c.id = cl.commande_id
 WHERE c.idempotence_key = 'test-cc-1';
-- Expected : 1

-- Vérifie que l'audit_log a été créé
SELECT COUNT(*) AS nb_audit
  FROM public.audit_log
 WHERE entity_type = 'commande'
   AND pressing_id = '00000000-0000-0000-0000-0000000000a1'
   AND action = 'create_commande'
   AND created_at > NOW() - INTERVAL '5 minutes';
-- Expected : >= 1


-- ============================================================
-- TEST 2 : Commande avec acompte partiel
-- ============================================================
\echo '=== TEST 2: Acompte partiel ==='

SELECT public.create_commande_atomic(
  p_pressing_id := '00000000-0000-0000-0000-0000000000a1',
  p_user_id := NULL,
  p_personnel_id := '00000000-0000-0000-0000-0000000000c1',
  p_role := 'manager',
  p_client_id := '00000000-0000-0000-0000-0000000000b1',
  p_date_pret_prevue := '2026-08-20 18:00:00+00',
  p_priorite := 'normal',
  p_idempotence_key := 'test-cc-2',
  p_articles_json := jsonb_build_array(jsonb_build_object(
    'service_id', '00000000-0000-0000-0000-0000000000d1',
    'catalogue_article_id', (SELECT id FROM public.catalogue_articles WHERE slug = 'chemise'),
    'catalogue_article_nom', 'Chemises',
    'couleur', 'blanc',
    'couleur_libre', NULL,
    'etat', 'bon',
    'description_etat', NULL,
    'quantite', 2,
    'is_custom', false,
    'prix_unitaire', NULL
  )),
  p_remise := NULL,
  p_acompte := jsonb_build_object('montant', 500, 'methode', 'especes', 'reference', NULL)
);

-- Vérifie : montant_total = 800, montant_paye = 500, statut_paiement = 'partiel'
SELECT montant_total, montant_paye, statut_paiement
  FROM public.commandes WHERE idempotence_key = 'test-cc-2';
-- Expected : 800, 500, partiel

-- Vérifie : 1 paiement avec est_acompte=true
SELECT COUNT(*) AS nb_paiements, bool_or(est_acompte) AS a_acompte
  FROM public.paiements p
  JOIN public.commandes c ON c.id = p.commande_id
 WHERE c.idempotence_key = 'test-cc-2';
-- Expected : 1, true


-- ============================================================
-- TEST 3 : Commande avec acompte total (statut 'paye')
-- ============================================================
\echo '=== TEST 3: Acompte total (paye) ==='

SELECT public.create_commande_atomic(
  p_pressing_id := '00000000-0000-0000-0000-0000000000a1',
  p_user_id := NULL,
  p_personnel_id := '00000000-0000-0000-0000-0000000000c1',
  p_role := 'manager',
  p_client_id := '00000000-0000-0000-0000-0000000000b1',
  p_date_pret_prevue := '2026-08-20 18:00:00+00',
  p_priorite := 'normal',
  p_idempotence_key := 'test-cc-3',
  p_articles_json := jsonb_build_array(jsonb_build_object(
    'service_id', '00000000-0000-0000-0000-0000000000d1',
    'catalogue_article_id', (SELECT id FROM public.catalogue_articles WHERE slug = 'chemise'),
    'catalogue_article_nom', 'Chemises',
    'couleur', 'blanc',
    'etat', 'bon',
    'quantite', 2,
    'is_custom', false,
    'prix_unitaire', NULL
  )),
  p_remise := NULL,
  p_acompte := jsonb_build_object('montant', 800, 'methode', 'mobile_money', 'reference', 'MOMO-TEST-3')
);

-- Expected : montant_total = 800, montant_paye = 800, statut_paiement = 'paye'
SELECT montant_total, montant_paye, statut_paiement
  FROM public.commandes WHERE idempotence_key = 'test-cc-3';


-- ============================================================
-- TEST 4 : Commande avec remise commerciale 10%
-- ============================================================
\echo '=== TEST 4: Remise commerciale 10% ==='

SELECT public.create_commande_atomic(
  p_pressing_id := '00000000-0000-0000-0000-0000000000a1',
  p_user_id := NULL,
  p_personnel_id := '00000000-0000-0000-0000-0000000000c1',
  p_role := 'manager',
  p_client_id := '00000000-0000-0000-0000-0000000000b1',
  p_date_pret_prevue := '2026-08-20 18:00:00+00',
  p_priorite := 'normal',
  p_idempotence_key := 'test-cc-4',
  p_articles_json := jsonb_build_array(jsonb_build_object(
    'service_id', '00000000-0000-0000-0000-0000000000d1',
    'catalogue_article_id', (SELECT id FROM public.catalogue_articles WHERE slug = 'chemise'),
    'catalogue_article_nom', 'Chemises',
    'couleur', 'blanc',
    'etat', 'bon',
    'quantite', 2,
    'is_custom', false,
    'prix_unitaire', NULL
  )),
  p_remise := jsonb_build_object('type', 'pourcentage', 'valeur', 10),
  p_acompte := NULL
);

-- Expected : montant_total_avant_remise = 800, montant_remise = 80, montant_total = 720
SELECT montant_total_avant_remise, montant_remise, montant_total, remise_type, remise_valeur
  FROM public.commandes WHERE idempotence_key = 'test-cc-4';
-- Expected : 800, 80, 720, pourcentage, 10

-- Vérifie : audit 'appliquer_remise' créé
SELECT COUNT(*) AS nb_audit_remise
  FROM public.audit_log
 WHERE action = 'appliquer_remise'
   AND entity_id = (SELECT id::TEXT FROM public.commandes WHERE idempotence_key = 'test-cc-4');
-- Expected : 1


-- ============================================================
-- TEST 5 : Commande avec remise fidélité (5% car client a 100 pts)
-- ============================================================
\echo '=== TEST 5: Remise fidélité 5% (calculée côté serveur) ==='

SELECT public.create_commande_atomic(
  p_pressing_id := '00000000-0000-0000-0000-0000000000a1',
  p_user_id := NULL,
  p_personnel_id := '00000000-0000-0000-0000-0000000000c1',
  p_role := 'manager',
  p_client_id := '00000000-0000-0000-0000-0000000000b1',
  p_date_pret_prevue := '2026-08-20 18:00:00+00',
  p_priorite := 'normal',
  p_idempotence_key := 'test-cc-5',
  p_articles_json := jsonb_build_array(jsonb_build_object(
    'service_id', '00000000-0000-0000-0000-0000000000d1',
    'catalogue_article_id', (SELECT id FROM public.catalogue_articles WHERE slug = 'chemise'),
    'catalogue_article_nom', 'Chemises',
    'couleur', 'blanc',
    'etat', 'bon',
    'quantite', 2,
    'is_custom', false,
    'prix_unitaire', NULL
  )),
  p_remise := jsonb_build_object('type', 'fidelite', 'valeur', 0),
  -- valeur=0 ignorée — la RPC calcule 5% car client a 100 pts
  p_acompte := NULL
);

-- Expected : montant_total_avant_remise = 800, montant_remise = 40 (5% de 800), montant_total = 760
SELECT montant_total_avant_remise, montant_remise, montant_total, remise_type, remise_valeur
  FROM public.commandes WHERE idempotence_key = 'test-cc-5';
-- Expected : 800, 40, 760, fidelite, 5


-- ============================================================
-- TEST 6 : Commande avec article personnalisé (prix custom)
-- ============================================================
\echo '=== TEST 6: Article personnalisé (prix custom 2500) ==='

SELECT public.create_commande_atomic(
  p_pressing_id := '00000000-0000-0000-0000-0000000000a1',
  p_user_id := NULL,
  p_personnel_id := '00000000-0000-0000-0000-0000000000c1',
  p_role := 'manager',
  p_client_id := '00000000-0000-0000-0000-0000000000b1',
  p_date_pret_prevue := '2026-08-20 18:00:00+00',
  p_priorite := 'normal',
  p_idempotence_key := 'test-cc-6',
  p_articles_json := jsonb_build_array(jsonb_build_object(
    'service_id', '00000000-0000-0000-0000-0000000000d1',
    'catalogue_article_id', (SELECT id FROM public.catalogue_articles WHERE slug = 'houssse-vetement-perso'),
    'catalogue_article_nom', 'Boubou traditionnel',
    'couleur', 'rouge',
    'etat', 'bon',
    'quantite', 1,
    'is_custom', true,
    'prix_unitaire', 2500
  )),
  p_remise := NULL,
  p_acompte := NULL
);

-- Expected : montant_total = 2500 (prix custom, ignore service.prix et tarif)
SELECT montant_total, montant_total_avant_remise, montant_remise
  FROM public.commandes WHERE idempotence_key = 'test-cc-6';
-- Expected : 2500, 2500, 0

-- Vérifie que la description de la ligne contient le nom custom
SELECT description, prix_unitaire, montant_ligne
  FROM public.commande_lignes cl
  JOIN public.commandes c ON c.id = cl.commande_id
 WHERE c.idempotence_key = 'test-cc-6';
-- Expected : description starts with 'Boubou traditionnel rouge — bon', prix_unitaire = 2500


-- ============================================================
-- TEST 7 : Idempotence — même clé retourne la commande existante
-- ============================================================
\echo '=== TEST 7: Idempotence replay ==='

-- 1er appel — crée la commande
SELECT public.create_commande_atomic(
  p_pressing_id := '00000000-0000-0000-0000-0000000000a1',
  p_user_id := NULL,
  p_personnel_id := '00000000-0000-0000-0000-0000000000c1',
  p_role := 'manager',
  p_client_id := '00000000-0000-0000-0000-0000000000b1',
  p_date_pret_prevue := '2026-08-20 18:00:00+00',
  p_priorite := 'normal',
  p_idempotence_key := 'test-cc-7',
  p_articles_json := jsonb_build_array(jsonb_build_object(
    'service_id', '00000000-0000-0000-0000-0000000000d1',
    'catalogue_article_id', (SELECT id FROM public.catalogue_articles WHERE slug = 'chemise'),
    'catalogue_article_nom', 'Chemises',
    'couleur', 'blanc',
    'etat', 'bon',
    'quantite', 1,
    'is_custom', false,
    'prix_unitaire', NULL
  ))
);

-- 2e appel — doit retourner la MÊME commande (IDEMPOTENT_REPLAY)
SELECT (result->>'code') AS code,
       (result->'data'->>'id') AS commande_id,
       (result->'data'->>'numero_commande') AS numero_commande
  FROM (
    SELECT public.create_commande_atomic(
      p_pressing_id := '00000000-0000-0000-0000-0000000000a1',
      p_user_id := NULL,
      p_personnel_id := '00000000-0000-0000-0000-0000000000c1',
      p_role := 'manager',
      p_client_id := '00000000-0000-0000-0000-0000000000b1',
      p_date_pret_prevue := '2026-08-20 18:00:00+00',
      p_priorite := 'normal',
      p_idempotence_key := 'test-cc-7',  -- MÊME CLÉ
      p_articles_json := jsonb_build_array(jsonb_build_object(
        'service_id', '00000000-0000-0000-0000-0000000000d1',
        'catalogue_article_id', (SELECT id FROM public.catalogue_articles WHERE slug = 'chemise'),
        'catalogue_article_nom', 'Chemises',
        'couleur', 'blanc',
        'etat', 'bon',
        'quantite', 1,
        'is_custom', false,
        'prix_unitaire', NULL
      ))
    ) AS result
  ) sub;
-- Expected : code = 'IDEMPOTENT_REPLAY', commande_id = même que le 1er appel

-- Vérifie qu'il n'y a toujours qu'UNE SEULE commande avec cette clé
SELECT COUNT(*) AS nb_commandes
  FROM public.commandes WHERE idempotence_key = 'test-cc-7';
-- Expected : 1


-- ============================================================
-- TEST 8 : Concurrence — 2 créations parallèles (test manuel)
-- ============================================================
\echo '=== TEST 8: Concurrence (test manuel — voir commentaires) ==='
-- ⚠️ Ce test ne peut pas être exécuté via psql en mode script car psql
-- est mono-connexion. Pour tester la concurrence réelle :
--
-- 1. Ouvrir 2 sessions psql en parallèle (terminal A + terminal B)
-- 2. Dans chaque, exécuter en même temps :
--    -- Session A
--    SELECT public.create_commande_atomic(
--      p_pressing_id := '00000000-0000-0000-0000-0000000000a1',
--      p_user_id := NULL,
--      p_personnel_id := '00000000-0000-0000-0000-0000000000c1',
--      p_role := 'manager',
--      p_client_id := '00000000-0000-0000-0000-0000000000b1',
--      p_date_pret_prevue := '2026-08-20 18:00:00+00',
--      p_priorite := 'normal',
--      p_idempotence_key := 'test-cc-8-A',  -- clé différente
--      p_articles_json := jsonb_build_array(jsonb_build_object(...))
--    );
--
--    -- Session B (en parallèle)
--    SELECT public.create_commande_atomic(
--      ...,
--      p_idempotence_key := 'test-cc-8-B',  -- clé différente
--      ...
--    );
--
-- Résultat attendu :
--   - Les 2 requêtes réussissent
--   - Les 2 numero_commande sont SÉQUENTIELS (CMD-2026-NNNNN, NNNNN+1)
--     car le trigger generer_numero_commande utilise pg_advisory_xact_lock
--     pour sérialiser les INSERTs concurrents sur un même pressing.
--   - Aucune collision sur la contrainte UNIQUE.
--
-- Pour tester la RACE CONDITION (même clé) :
--   - 2 sessions avec p_idempotence_key = 'test-cc-8-race' en même temps
--   - Résultat attendu : une réussit (COMMANDE_CREEE), l'autre obtient
--     soit IDEMPOTENT_REPLAY (si la 1e a commit avant que la 2e ne lise),
--     soit une erreur 23505 (unique_violation sur idx_commandes_idempotence)
--     si la 2e lit avant le commit de la 1e.
--   - Dans le 2e cas, le wrapper TS détecte le code 23505 et renvoie
--     IDEMPOTENCE_RACE_CONDITION → l'appelant peut retry pour récupérer
--     le replay.

-- Vérification post-test : 2 commandes avec clés différentes
SELECT public.create_commande_atomic(
  p_pressing_id := '00000000-0000-0000-0000-0000000000a1',
  p_user_id := NULL,
  p_personnel_id := '00000000-0000-0000-0000-0000000000c1',
  p_role := 'manager',
  p_client_id := '00000000-0000-0000-0000-0000000000b1',
  p_date_pret_prevue := '2026-08-20 18:00:00+00',
  p_priorite := 'normal',
  p_idempotence_key := 'test-cc-8-A',
  p_articles_json := jsonb_build_array(jsonb_build_object(
    'service_id', '00000000-0000-0000-0000-0000000000d1',
    'catalogue_article_id', (SELECT id FROM public.catalogue_articles WHERE slug = 'chemise'),
    'catalogue_article_nom', 'Chemises',
    'couleur', 'blanc', 'etat', 'bon', 'quantite', 1,
    'is_custom', false, 'prix_unitaire', NULL
  ))
);

SELECT public.create_commande_atomic(
  p_pressing_id := '00000000-0000-0000-0000-0000000000a1',
  p_user_id := NULL,
  p_personnel_id := '00000000-0000-0000-0000-0000000000c1',
  p_role := 'manager',
  p_client_id := '00000000-0000-0000-0000-0000000000b1',
  p_date_pret_prevue := '2026-08-20 18:00:00+00',
  p_priorite := 'normal',
  p_idempotence_key := 'test-cc-8-B',
  p_articles_json := jsonb_build_array(jsonb_build_object(
    'service_id', '00000000-0000-0000-0000-0000000000d1',
    'catalogue_article_id', (SELECT id FROM public.catalogue_articles WHERE slug = 'chemise'),
    'catalogue_article_nom', 'Chemises',
    'couleur', 'blanc', 'etat', 'bon', 'quantite', 1,
    'is_custom', false, 'prix_unitaire', NULL
  ))
);

-- Expected : 2 commandes avec numéros séquentiels
SELECT numero_commande, idempotence_key
  FROM public.commandes
 WHERE idempotence_key IN ('test-cc-8-A', 'test-cc-8-B')
 ORDER BY numero_commande;


-- ============================================================
-- TEST 9 : Rollback — acompte > montant_total
-- ============================================================
\echo '=== TEST 9: Rollback — acompte > total ==='

SELECT public.create_commande_atomic(
  p_pressing_id := '00000000-0000-0000-0000-0000000000a1',
  p_user_id := NULL,
  p_personnel_id := '00000000-0000-0000-0000-0000000000c1',
  p_role := 'manager',
  p_client_id := '00000000-0000-0000-0000-0000000000b1',
  p_date_pret_prevue := '2026-08-20 18:00:00+00',
  p_priorite := 'normal',
  p_idempotence_key := 'test-cc-9',
  p_articles_json := jsonb_build_array(jsonb_build_object(
    'service_id', '00000000-0000-0000-0000-0000000000d1',
    'catalogue_article_id', (SELECT id FROM public.catalogue_articles WHERE slug = 'chemise'),
    'catalogue_article_nom', 'Chemises',
    'couleur', 'blanc', 'etat', 'bon', 'quantite', 1,
    'is_custom', false, 'prix_unitaire', NULL
  )),
  -- total = 400 (tarif Chemise+Lavage)
  p_acompte := jsonb_build_object('montant', 9999, 'methode', 'especes')  -- 9999 > 400
);

-- Expected : success=false, code=ACOMPTE_DEPASSE_TOTAL

-- Vérifie qu'AUCUNE commande n'a été créée avec cette clé
SELECT COUNT(*) AS nb_commandes
  FROM public.commandes WHERE idempotence_key = 'test-cc-9';
-- Expected : 0

-- Vérifie qu'AUCUN paiement n'a été créé
SELECT COUNT(*) AS nb_paiements
  FROM public.paiements p
  JOIN public.commandes c ON c.id = p.commande_id
 WHERE c.idempotence_key = 'test-cc-9';
-- Expected : 0 (pas même de commande orpheline)


-- ============================================================
-- TEST 10 : Rollback — service inactif
-- ============================================================
\echo '=== TEST 10: Rollback — service inactif ==='

SELECT public.create_commande_atomic(
  p_pressing_id := '00000000-0000-0000-0000-0000000000a1',
  p_user_id := NULL,
  p_personnel_id := '00000000-0000-0000-0000-0000000000c1',
  p_role := 'manager',
  p_client_id := '00000000-0000-0000-0000-0000000000b1',
  p_date_pret_prevue := '2026-08-20 18:00:00+00',
  p_priorite := 'normal',
  p_idempotence_key := 'test-cc-10',
  p_articles_json := jsonb_build_array(jsonb_build_object(
    'service_id', '00000000-0000-0000-0000-0000000000d3',  -- service INACTIF
    'catalogue_article_id', (SELECT id FROM public.catalogue_articles WHERE slug = 'chemise'),
    'catalogue_article_nom', 'Chemises',
    'couleur', 'blanc', 'etat', 'bon', 'quantite', 1,
    'is_custom', false, 'prix_unitaire', NULL
  ))
);

-- Expected : success=false, code=SERVICE_INACTIF

SELECT COUNT(*) AS nb_commandes
  FROM public.commandes WHERE idempotence_key = 'test-cc-10';
-- Expected : 0


-- ============================================================
-- TEST 11 : Rollback — client cross-pressing
-- ============================================================
\echo '=== TEST 11: Rollback — client cross-pressing ==='

-- Crée un 2e pressing + un client qui n'appartient PAS au pressing de test
INSERT INTO public.pressing (id, slug, nom, email, telephone, adresse, ville, pays)
VALUES (
  '00000000-0000-0000-0000-0000000000a2',
  'test-create-commande-atomic-2',
  'Pressing Test CC 2',
  'test-cc2@test.local',
  'TEST-CC-002',
  'Test Address 2',
  'Test City 2',
  'CI'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.clients (id, pressing_id, nom_complet, telephone)
VALUES (
  '00000000-0000-0000-0000-0000000000b2',
  '00000000-0000-0000-0000-0000000000a2',  -- pressing DIFFÉRENT
  'Client Test CC 2',
  'TEST-CC-CLIENT-002'
)
ON CONFLICT (id) DO NOTHING;

-- Tente de créer une commande sur pressing A avec un client de pressing B
SELECT public.create_commande_atomic(
  p_pressing_id := '00000000-0000-0000-0000-0000000000a1',  -- pressing A
  p_user_id := NULL,
  p_personnel_id := '00000000-0000-0000-0000-0000000000c1',
  p_role := 'manager',
  p_client_id := '00000000-0000-0000-0000-0000000000b2',  -- client de pressing B
  p_date_pret_prevue := '2026-08-20 18:00:00+00',
  p_priorite := 'normal',
  p_idempotence_key := 'test-cc-11',
  p_articles_json := jsonb_build_array(jsonb_build_object(
    'service_id', '00000000-0000-0000-0000-0000000000d1',
    'catalogue_article_id', (SELECT id FROM public.catalogue_articles WHERE slug = 'chemise'),
    'catalogue_article_nom', 'Chemises',
    'couleur', 'blanc', 'etat', 'bon', 'quantite', 1,
    'is_custom', false, 'prix_unitaire', NULL
  ))
);

-- Expected : success=false, code=CLIENT_INTROUVABLE

SELECT COUNT(*) AS nb_commandes
  FROM public.commandes WHERE idempotence_key = 'test-cc-11';
-- Expected : 0


-- ============================================================
-- TEST 12 : Contraintes SQL — CHECK commandes_montant_total_coherent_check
-- ============================================================
\echo '=== TEST 12: Contraintes SQL (CHECK montant_total = avant - remise) ==='

-- Tente un INSERT direct avec montant_total incohérent (devrait échouer)
-- ⚠️ Le trigger guard_remise_coherence (036) corrige automatiquement
-- montant_total. Le CHECK ajouté en 038 est PLUS STRICT que le trigger :
-- il REFUSE (au lieu de corriger). Mais comme le trigger s'exécute
-- BEFORE INSERT et corrige montant_total avant le CHECK, l'INSERT
-- réussit avec la valeur corrigée.
-- Testons donc le cas où le trigger ne corrige PAS (montant_total est
-- explicitement set à la bonne valeur) :

INSERT INTO public.commandes (
  pressing_id, client_id, numero_commande,
  statut, statut_paiement,
  montant_total, montant_paye,
  remise_type, remise_valeur,
  montant_total_avant_remise, montant_remise,
  date_reception, date_pret_prevue,
  livraison, frais_livraison,
  priorite, idempotence_key, cree_par
) VALUES (
  '00000000-0000-0000-0000-0000000000a1',
  '00000000-0000-0000-0000-0000000000b1',
  'TEST-CC-12-VALID',
  'recu', 'non_paye',
  720, 0,            -- montant_total = 720
  'pourcentage', 10,
  800, 80,           -- montant_total_avant_remise = 800, montant_remise = 80
                      -- → 800 - 80 = 720 ✓ (cohérent)
  NOW(), '2026-08-20 18:00:00+00',
  false, 0,
  'normal', 'test-cc-12-valid', '00000000-0000-0000-0000-0000000000c1'
);

-- Expected : INSERT réussit (montant_total = avant - remise = 800 - 80 = 720)

-- Vérifie que la commande a été créée
SELECT COUNT(*) AS nb_commandes
  FROM public.commandes WHERE numero_commande = 'TEST-CC-12-VALID';
-- Expected : 1

-- Nettoie cette commande de test
DELETE FROM public.commandes WHERE numero_commande = 'TEST-CC-12-VALID';

-- Tente maintenant un INSERT avec montant_total INCOHÉRENT
-- (montant_total = 999 au lieu de 720) → doit ÉCHOUER via le CHECK
-- (mais le trigger guard_remise_coherence va d'abord CORRIGER
-- montant_total à 720, donc le CHECK ne verra jamais 999).
-- Pour tester le CHECK sans le trigger, on désactive temporairement
-- le trigger :
-- ⚠️ NE PAS FAIRE EN PRODUCTION — c'est seulement pour le test.

BEGIN;
ALTER TABLE public.commandes DISABLE TRIGGER trg_guard_remise_coherence;

-- Tente l'INSERT avec montant_total incohérent
-- Doit échouer avec check_violation (code 23514)
INSERT INTO public.commandes (
  pressing_id, client_id, numero_commande,
  statut, statut_paiement,
  montant_total, montant_paye,
  remise_type, remise_valeur,
  montant_total_avant_remise, montant_remise,
  date_reception, date_pret_prevue,
  livraison, frais_livraison,
  priorite, idempotence_key, cree_par
) VALUES (
  '00000000-0000-0000-0000-0000000000a1',
  '00000000-0000-0000-0000-0000000000b1',
  'TEST-CC-12-INVALID',
  'recu', 'non_paye',
  999, 0,            -- montant_total = 999 (INCOHÉRENT — devrait être 720)
  'pourcentage', 10,
  800, 80,
  NOW(), '2026-08-20 18:00:00+00',
  false, 0,
  'normal', 'test-cc-12-invalid', '00000000-0000-0000-0000-0000000000c1'
);

-- Expected : ERREUR check_violation (23514) "new row for relation commandes
-- violates check constraint commandes_montant_total_coherent_check"

ROLLBACK;  -- annule le DISABLE TRIGGER + l'INSERT (qui a échoué de toute façon)


-- ============================================================
-- RÉCAPITULATIF
-- ============================================================
\echo '=== RÉCAPITULATIF ==='
\echo 'Tests 1-6 : scénarios nominaux (création, acompte, remise, custom).'
\echo 'Test 7    : idempotence (replay retourne la commande existante).'
\echo 'Test 8    : concurrence (2 clés différentes → 2 numéros séquentiels).'
\echo '            ⚠️ test manuel pour la vraie concurrence (2 sessions psql).'
\echo 'Tests 9-11: rollback (aucune commande orpheline en cas d erreur).'
\echo 'Test 12   : contraintes SQL (CHECK montant_total = avant - remise).'
\echo ''
\echo 'Pour nettoyer les données de test :'
\echo '  DELETE FROM public.commandes WHERE numero_commande LIKE '\''TEST-CC-%'\'';'
\echo '  DELETE FROM public.commandes WHERE idempotence_key LIKE '\''test-cc-%'\'';'
\echo '  DELETE FROM public.clients WHERE telephone LIKE '\''TEST-CC-%'\'';'
\echo '  DELETE FROM public.pressing WHERE slug LIKE '\''test-create-commande-atomic%'\'';'

-- ============================================================
-- Fin du script tests/create-commande-atomic.sql
-- ============================================================
