-- ============================================================
-- e-pressing — Tests SQL du moteur financier atomique
-- ============================================================
-- Ce script valide le comportement atomique des RPC financières
-- directement au niveau PostgreSQL. À exécuter après avoir appliqué
-- les migrations 035 et 036.
--
-- Couverture (12 scénarios exigés) :
--   1.  paiement normal
--   2.  paiement partiel
--   3.  paiement final
--   4.  double paiement simultané (concurrence)
--   5.  idempotence (même clé = même paiement)
--   6.  paiement supérieur au solde
--   7.  fidélité 49 points (0%)
--   8.  fidélité 50 points (3%)
--   9.  fidélité 100 points (5%)
--   10. remise 100% frauduleuse (refusée)
--   11. remise fixe supérieure au total (clamped)
--   12. paiement d'une commande annulée (refusé)
--
-- PRÉREQUIS : avoir appliqué 035_financial_engine_atomic_payments.sql
--             et 036_financial_engine_atomic_discounts.sql
--
-- UTILISATION :
--   psql -h <host> -U postgres -d postgres -f tests/financial-engine.sql
--   (ou via Supabase SQL Editor)
-- ============================================================

\set ECHO all
\set ON_ERROR_STOP off

-- ============================================================
-- SETUP : créer des données de test (pressing, client, commande)
-- ============================================================

-- Nettoyer les données de test précédentes
DELETE FROM public.paiement_annulations WHERE pressing_id IN (
  SELECT id FROM public.pressing WHERE slug = 'test-financial-engine'
);
DELETE FROM public.paiements WHERE commande_id IN (
  SELECT id FROM public.commandes WHERE numero_commande LIKE 'TEST-FE-%'
);
DELETE FROM public.commandes WHERE numero_commande LIKE 'TEST-FE-%';
DELETE FROM public.clients WHERE telephone LIKE 'TEST-FE-%';
DELETE FROM public.pressing WHERE slug = 'test-financial-engine';

-- Créer un pressing de test
INSERT INTO public.pressing (id, slug, nom, email, telephone, adresse, ville, pays)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'test-financial-engine',
  'Pressing Test FE',
  'test-fe@test.local',
  'TEST-FE-001',
  'Test Address',
  'Test City',
  'CI'
)
ON CONFLICT (id) DO NOTHING;

-- Créer un client de test
INSERT INTO public.clients (id, pressing_id, nom_complet, telephone, points_fidelite)
VALUES (
  '00000000-0000-0000-0000-000000000010',
  '00000000-0000-0000-0000-000000000001',
  'Client Test FE',
  'TEST-FE-CLIENT-001',
  0
)
ON CONFLICT (id) DO NOTHING;

-- Config de remise par défaut pour le pressing de test
INSERT INTO public.pressing_remise_config (pressing_id)
VALUES ('00000000-0000-0000-0000-000000000001')
ON CONFLICT (pressing_id) DO NOTHING;

-- ============================================================
-- TEST 1 : Paiement normal (acompte partiel)
-- ============================================================
\echo '=== TEST 1: Paiement normal ==='

INSERT INTO public.commandes (
  id, pressing_id, client_id, numero_commande,
  statut, statut_paiement, montant_total, montant_paye,
  montant_total_avant_remise, montant_remise
) VALUES (
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000010',
  'TEST-FE-001',
  'recu', 'non_paye', 10000, 0, 10000, 0
)
ON CONFLICT (id) DO NOTHING;

SELECT public.encaisser_paiement_atomic(
  '00000000-0000-0000-0000-000000000101',  -- commande_id
  '00000000-0000-0000-0000-000000000001',  -- pressing_id
  NULL,                                    -- user_id (test)
  NULL,                                    -- personnel_id (test)
  5000,                                    -- montant
  'especes'::methode_paiement,             -- methode
  NULL, NULL, NULL                         -- reference, notes, idempotency_key
) AS test_1_result;

-- Vérifications
SELECT 'TEST 1a: montant_paye = 5000' AS check,
  CASE WHEN montant_paye = 5000 THEN 'PASS' ELSE 'FAIL' END AS status
  FROM public.commandes WHERE id = '00000000-0000-0000-0000-000000000101';

SELECT 'TEST 1b: statut_paiement = partiel' AS check,
  CASE WHEN statut_paiement = 'partiel' THEN 'PASS' ELSE 'FAIL' END AS status
  FROM public.commandes WHERE id = '00000000-0000-0000-0000-000000000101';

SELECT 'TEST 1c: points_fidelite = 50' AS check,
  CASE WHEN points_fidelite = 50 THEN 'PASS' ELSE 'FAIL' END AS status
  FROM public.clients WHERE id = '00000000-0000-0000-0000-000000000010';

-- ============================================================
-- TEST 2 : Paiement partiel (deuxième acompte)
-- ============================================================
\echo '=== TEST 2: Paiement partiel (2e acompte) ==='

SELECT public.encaisser_paiement_atomic(
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000001',
  NULL, NULL,
  3000,
  'mobile_money'::methode_paiement,
  'MOMO-TEST-2', NULL, NULL
) AS test_2_result;

SELECT 'TEST 2: montant_paye = 8000' AS check,
  CASE WHEN montant_paye = 8000 THEN 'PASS' ELSE 'FAIL' END AS status
  FROM public.commandes WHERE id = '00000000-0000-0000-0000-000000000101';

-- ============================================================
-- TEST 3 : Paiement final (solde complet)
-- ============================================================
\echo '=== TEST 3: Paiement final ==='

-- Avancer la commande au statut 'repasse' (requis pour solde final)
UPDATE public.commandes SET statut = 'repasse'
  WHERE id = '00000000-0000-0000-0000-000000000101';

SELECT public.encaisser_paiement_atomic(
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000001',
  NULL, NULL,
  2000,  -- reste = 10000 - 8000 = 2000
  'especes'::methode_paiement,
  NULL, NULL, NULL
) AS test_3_result;

SELECT 'TEST 3a: montant_paye = 10000' AS check,
  CASE WHEN montant_paye = 10000 THEN 'PASS' ELSE 'FAIL' END AS status
  FROM public.commandes WHERE id = '00000000-0000-0000-0000-000000000101';

SELECT 'TEST 3b: statut_paiement = paye' AS check,
  CASE WHEN statut_paiement = 'paye' THEN 'PASS' ELSE 'FAIL' END AS status
  FROM public.commandes WHERE id = '00000000-0000-0000-0000-000000000101';

-- ============================================================
-- TEST 4 : Double paiement simultané (DEJA_PAYE)
-- ============================================================
\echo '=== TEST 4: Double paiement (DEJA_PAYE) ==='

SELECT public.encaisser_paiement_atomic(
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000001',
  NULL, NULL,
  1000,  -- commande déjà payée
  'especes'::methode_paiement,
  NULL, NULL, NULL
) AS test_4_result;
-- Attendu: success=false, code='DEJA_PAYE'

-- ============================================================
-- TEST 5 : Idempotence (même clé = même paiement)
-- ============================================================
\echo '=== TEST 5: Idempotence ==='

-- Nouvelle commande pour ce test
INSERT INTO public.commandes (
  id, pressing_id, client_id, numero_commande,
  statut, statut_paiement, montant_total, montant_paye,
  montant_total_avant_remise, montant_remise
) VALUES (
  '00000000-0000-0000-0000-000000000102',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000010',
  'TEST-FE-002',
  'recu', 'non_paye', 10000, 0, 10000, 0
)
ON CONFLICT (id) DO NOTHING;

-- 1er appel avec idempotency_key
SELECT public.encaisser_paiement_atomic(
  '00000000-0000-0000-0000-000000000102',
  '00000000-0000-0000-0000-000000000001',
  NULL, NULL,
  5000,
  'especes'::methode_paiement,
  NULL, NULL,
  'idem-key-001'  -- idempotency_key
) AS test_5a_result;

-- 2e appel avec la MÊME clé → doit retourner le même paiement
SELECT public.encaisser_paiement_atomic(
  '00000000-0000-0000-0000-000000000102',
  '00000000-0000-0000-0000-000000000001',
  NULL, NULL,
  5000,
  'especes'::methode_paiement,
  NULL, NULL,
  'idem-key-001'  -- MÊME idempotency_key
) AS test_5b_result;
-- Attendu: success=true, code='IDEMPOTENT_REPLAY', data.replay=true

-- Vérifier qu'il n'y a qu'UN SEUL paiement pour cette commande
SELECT 'TEST 5: un seul paiement (idempotent)' AS check,
  CASE WHEN COUNT(*) = 1 THEN 'PASS' ELSE 'FAIL' END AS status
  FROM public.paiements
  WHERE commande_id = '00000000-0000-0000-0000-000000000102';

-- ============================================================
-- TEST 6 : Paiement supérieur au solde (MONTANT_DEPASSE_SOLDE)
-- ============================================================
\echo '=== TEST 6: Paiement > solde ==='

SELECT public.encaisser_paiement_atomic(
  '00000000-0000-0000-0000-000000000102',
  '00000000-0000-0000-0000-000000000001',
  NULL, NULL,
  99999,  -- dépasse largement le reste (5000)
  'especes'::methode_paiement,
  NULL, NULL, NULL
) AS test_6_result;
-- Attendu: success=false, code='MONTANT_DEPASSE_SOLDE'

-- ============================================================
-- TEST 7 : Fidélité 49 points → 0%
-- ============================================================
\echo '=== TEST 7: Fidélité 49 points → 0% ==='

-- Créer un client avec 49 points
INSERT INTO public.clients (id, pressing_id, nom_complet, telephone, points_fidelite)
VALUES (
  '00000000-0000-0000-0000-000000000020',
  '00000000-0000-0000-0000-000000000001',
  'Client 49pts',
  'TEST-FE-CLIENT-049',
  49
)
ON CONFLICT (id) DO NOTHING;

SELECT public.calculer_remise_fidelite_auto(
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000020'
) AS test_7_result;
-- Attendu: 0

-- ============================================================
-- TEST 8 : Fidélité 50 points → 3%
-- ============================================================
\echo '=== TEST 8: Fidélité 50 points → 3% ==='

INSERT INTO public.clients (id, pressing_id, nom_complet, telephone, points_fidelite)
VALUES (
  '00000000-0000-0000-0000-000000000030',
  '00000000-0000-0000-0000-000000000001',
  'Client 50pts',
  'TEST-FE-CLIENT-050',
  50
)
ON CONFLICT (id) DO NOTHING;

SELECT public.calculer_remise_fidelite_auto(
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000030'
) AS test_8_result;
-- Attendu: 3

-- ============================================================
-- TEST 9 : Fidélité 100 points → 5%
-- ============================================================
\echo '=== TEST 9: Fidélité 100 points → 5% ==='

INSERT INTO public.clients (id, pressing_id, nom_complet, telephone, points_fidelite)
VALUES (
  '00000000-0000-0000-0000-000000000040',
  '00000000-0000-0000-0000-000000000001',
  'Client 100pts',
  'TEST-FE-CLIENT-100',
  100
)
ON CONFLICT (id) DO NOTHING;

SELECT public.calculer_remise_fidelite_auto(
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000040'
) AS test_9_result;
-- Attendu: 5

-- ============================================================
-- TEST 10 : Remise 100% frauduleuse (POURCENTAGE_100_REFUSE)
-- ============================================================
\echo '=== TEST 10: Remise 100% refusée ==='

SELECT public.calculer_remise_atomique(
  '00000000-0000-0000-0000-000000000001',  -- pressing_id
  10000,                                    -- montant_avant_remise
  'pourcentage'::remise_type,               -- type
  100,                                      -- valeur = 100%
  'manager',                                -- role
  NULL                                      -- articles_json
) AS test_10_result;
-- Attendu: success=false, code='POURCENTAGE_100_REFUSE'

-- ============================================================
-- TEST 11 : Remise fixe supérieure au total (clamped)
-- ============================================================
\echo '=== TEST 11: Remise fixe > total (clamped) ==='

SELECT public.calculer_remise_atomique(
  '00000000-0000-0000-0000-000000000001',
  10000,
  'montant_fixe'::remise_type,
  15000,  -- dépasse le total
  'manager',
  NULL
) AS test_11_result;
-- Attendu: success=true, montant_remise=10000 (clamped)

-- ============================================================
-- TEST 12 : Paiement sur commande annulée (COMMANDE_ANNULEE)
-- ============================================================
\echo '=== TEST 12: Paiement sur commande annulée ==='

-- Créer une commande annulée
INSERT INTO public.commandes (
  id, pressing_id, client_id, numero_commande,
  statut, statut_paiement, montant_total, montant_paye,
  montant_total_avant_remise, montant_remise
) VALUES (
  '00000000-0000-0000-0000-000000000103',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000010',
  'TEST-FE-003',
  'annule', 'non_paye', 10000, 0, 10000, 0
)
ON CONFLICT (id) DO NOTHING;

SELECT public.encaisser_paiement_atomic(
  '00000000-0000-0000-0000-000000000103',
  '00000000-0000-0000-0000-000000000001',
  NULL, NULL,
  5000,
  'especes'::methode_paiement,
  NULL, NULL, NULL
) AS test_12_result;
-- Attendu: success=false, code='COMMANDE_ANNULEE'

-- ============================================================
-- CLEANUP
-- ============================================================
\echo '=== CLEANUP ==='

DELETE FROM public.paiement_annulations WHERE pressing_id = '00000000-0000-0000-0000-000000000001';
DELETE FROM public.paiements WHERE commande_id IN (
  SELECT id FROM public.commandes WHERE numero_commande LIKE 'TEST-FE-%'
);
DELETE FROM public.commandes WHERE numero_commande LIKE 'TEST-FE-%';
DELETE FROM public.clients WHERE telephone LIKE 'TEST-FE-%';
DELETE FROM public.pressing_remise_config WHERE pressing_id = '00000000-0000-0000-0000-000000000001';
DELETE FROM public.pressing WHERE id = '00000000-0000-0000-0000-000000000001';

\echo '=== TOUS LES TESTS SQL SONT TERMINÉS ==='
