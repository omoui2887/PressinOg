-- ============================================================
-- e-pressing — Tests SQL du système de casiers uniques (migration 039)
-- ============================================================
-- Ce script valide le comportement atomique des RPCs
-- `assigner_casier_atomic` et `liberer_casier_atomic` directement
-- au niveau PostgreSQL.
-- À exécuter après avoir appliqué la migration 039.
--
-- Couverture (10 scénarios — incluant concurrence + rollback) :
--   1.  assignation simple — casier libre → CASIER_ASSIGNE
--   2.  libération simple — casier occupé → CASIER_LIBERE
--   3.  libération idempotente — déjà libre → CASIER_DEJA_LIBRE
--   4.  casier introuvable → CASIER_INTROUVABLE
--   5.  article statut invalide → ARTICLE_STATUT_INVALIDE
--   6.  casier déjà occupé → CASIER_OCCUPE
--   7.  CONCURRENCE — 2 requêtes simultanées sur A1 → UNE réussit
--   8.  réaffectation — article déjà dans A1 assigné à B1 → auto-libère A1
--   9.  auto-libération sur statut terminal (trigger)
--   10. contrainte UNIQUE — INSERT direct violé → 23505
--
-- PRÉREQUIS : avoir appliqué toutes les migrations jusqu'à 039.
--
-- UTILISATION :
--   psql -h <host> -U postgres -d postgres -f tests/casiers-engine.sql
--   (ou via Supabase SQL Editor — exécuter en mode autocommit)
-- ============================================================

\set ECHO all
\set ON_ERROR_STOP off

-- ============================================================
-- SETUP : créer des données de test
-- ============================================================

-- Nettoyer les données de test précédentes
DELETE FROM public.casier_affectations WHERE pressing_id = '00000000-0000-0000-0000-0000000009a1';
DELETE FROM public.casiers WHERE pressing_id = '00000000-0000-0000-0000-0000000009a1';
DELETE FROM public.articles_vetements WHERE commande_id IN (
  SELECT id FROM public.commandes WHERE numero_commande LIKE 'TEST-CASIER-%'
);
DELETE FROM public.commande_lignes WHERE commande_id IN (
  SELECT id FROM public.commandes WHERE numero_commande LIKE 'TEST-CASIER-%'
);
DELETE FROM public.commandes WHERE numero_commande LIKE 'TEST-CASIER-%';
DELETE FROM public.audit_log WHERE pressing_id = '00000000-0000-0000-0000-0000000009a1';
DELETE FROM public.clients WHERE telephone LIKE 'TEST-CASIER-%';
DELETE FROM public.services WHERE pressing_id = '00000000-0000-0000-0000-0000000009a1';
DELETE FROM public.pressing WHERE id = '00000000-0000-0000-0000-0000000009a1';

-- Créer un pressing de test
INSERT INTO public.pressing (id, slug, nom, email, telephone, adresse, ville, pays)
VALUES (
  '00000000-0000-0000-0000-0000000009a1',
  'test-casiers-atomic',
  'Pressing Test Casiers',
  'test-casiers@test.local',
  'TEST-CASIER-001',
  'Test Address',
  'Test City',
  'CI'
)
ON CONFLICT (id) DO NOTHING;

-- Créer un service
INSERT INTO public.services (id, pressing_id, nom, prix)
VALUES (
  '00000000-0000-0000-0000-0000000009b1',
  '00000000-0000-0000-0000-0000000009a1',
  'Lavage Test',
  1000
)
ON CONFLICT (id) DO NOTHING;

-- Créer un client
INSERT INTO public.clients (id, pressing_id, nom_complet, telephone)
VALUES (
  '00000000-0000-0000-0000-0000000009c1',
  '00000000-0000-0000-0000-0000000009a1',
  'Client Test Casiers',
  'TEST-CASIER-CLIENT'
)
ON CONFLICT (id) DO NOTHING;

-- Créer une commande + ligne + 2 articles
INSERT INTO public.commandes (id, pressing_id, client_id, numero_commande, statut, montant_total, date_pret_prevue)
VALUES (
  '00000000-0000-0000-0000-0000000009d1',
  '00000000-0000-0000-0000-0000000009a1',
  '00000000-0000-0000-0000-0000000009c1',
  'TEST-CASIER-001',
  'pret',
  2000,
  NOW() + INTERVAL '2 days'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.commande_lignes (id, commande_id, service_id, description, prix_unitaire, quantite, montant_ligne)
VALUES (
  '00000000-0000-0000-0000-0000000009e1',
  '00000000-0000-0000-0000-0000000009d1',
  '00000000-0000-0000-0000-0000000009b1',
  'Chemises',
  1000,
  2,
  2000
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.articles_vetements (id, commande_id, ligne_id, code_qr, type_vetement, statut)
VALUES
  ('00000000-0000-0000-0000-0000000009f1', '00000000-0000-0000-0000-0000000009d1', '00000000-0000-0000-0000-0000000009e1', 'QR-TEST-CASIER-1', 'chemise', 'pret'),
  ('00000000-0000-0000-0000-0000000009f2', '00000000-0000-0000-0000-0000000009d1', '00000000-0000-0000-0000-0000000009e1', 'QR-TEST-CASIER-2', 'chemise', 'pret')
ON CONFLICT (id) DO NOTHING;

-- Créer 2 casiers de test (A1 et B1)
INSERT INTO public.casiers (id, pressing_id, code, zone, actif)
VALUES
  ('00000000-0000-0000-0000-0000000009g1', '00000000-0000-0000-0000-0000000009a1', 'A1', 'A', true),
  ('00000000-0000-0000-0000-0000000009g2', '00000000-0000-0000-0000-0000000009a1', 'B1', 'B', true)
ON CONFLICT DO NOTHING;


-- ============================================================
-- TEST 1 : Assignation simple — casier libre → CASIER_ASSIGNE
-- ============================================================
\echo '--- TEST 1: Assignation simple ---'
SELECT public.assigner_casier_atomic(
  '00000000-0000-0000-0000-0000000009a1'::uuid,
  'A1',
  '00000000-0000-0000-0000-0000000009f1'::uuid,
  NULL,
  NULL,
  NULL,
  NULL
) AS result;

-- Vérifie que l'affectation a été créée
SELECT count(*) AS nb_affectations_actives_a1
FROM public.casier_affectations
WHERE casier_id = '00000000-0000-0000-0000-0000000009g1'
  AND statut = 'actif';

-- Vérifie que zone_stockage a été mis à jour sur l'article
SELECT zone_stockage, date_rangeement IS NOT NULL AS has_date
FROM public.articles_vetements
WHERE id = '00000000-0000-0000-0000-0000000009f1';


-- ============================================================
-- TEST 2 : Libération simple — casier occupé → CASIER_LIBERE
-- ============================================================
\echo '--- TEST 2: Libération simple ---'
SELECT public.liberer_casier_atomic(
  '00000000-0000-0000-0000-0000000009a1'::uuid,
  'A1',
  NULL,
  'Test libération',
  NULL,
  NULL
) AS result;

-- Vérifie que l'affectation est libérée
SELECT statut, libere_le IS NOT NULL AS has_libere_le
FROM public.casier_affectations
WHERE casier_id = '00000000-0000-0000-0000-0000000009g1';

-- Vérifie que zone_stockage est NULL
SELECT zone_stockage IS NULL AS casier_libere
FROM public.articles_vetements
WHERE id = '00000000-0000-0000-0000-0000000009f1';


-- ============================================================
-- TEST 3 : Libération idempotente — déjà libre → CASIER_DEJA_LIBRE
-- ============================================================
\echo '--- TEST 3: Libération idempotente ---'
SELECT public.liberer_casier_atomic(
  '00000000-0000-0000-0000-0000000009a1'::uuid,
  'A1',
  NULL,
  'Test libération 2',
  NULL,
  NULL
) AS result;


-- ============================================================
-- TEST 4 : Casier introuvable → CASIER_INTROUVABLE
-- ============================================================
\echo '--- TEST 4: Casier introuvable ---'
SELECT public.assigner_casier_atomic(
  '00000000-0000-0000-0000-0000000009a1'::uuid,
  'Z99',
  '00000000-0000-0000-0000-0000000009f1'::uuid,
  NULL,
  NULL,
  NULL,
  NULL
) AS result;


-- ============================================================
-- TEST 5 : Article statut invalide → ARTICLE_STATUT_INVALIDE
-- ============================================================
\echo '--- TEST 5: Article statut invalide ---'
-- Met l'article à 'recu' (non valide pour rangement)
UPDATE public.articles_vetements SET statut = 'recu' WHERE id = '00000000-0000-0000-0000-0000000009f2';

SELECT public.assigner_casier_atomic(
  '00000000-0000-0000-0000-0000000009a1'::uuid,
  'A1',
  '00000000-0000-0000-0000-0000000009f2'::uuid,
  NULL,
  NULL,
  NULL,
  NULL
) AS result;

-- Restore le statut
UPDATE public.articles_vetements SET statut = 'pret' WHERE id = '00000000-0000-0000-0000-0000000009f2';


-- ============================================================
-- TEST 6 : Casier déjà occupé → CASIER_OCCUPE
-- ============================================================
\echo '--- TEST 6: Casier déjà occupé ---'
-- Assigne A1 à l'article 1
SELECT public.assigner_casier_atomic(
  '00000000-0000-0000-0000-0000000009a1'::uuid,
  'A1',
  '00000000-0000-0000-0000-0000000009f1'::uuid,
  NULL,
  NULL,
  NULL,
  NULL
) AS result;

-- Tente d'assigner A1 à l'article 2 → doit échouer (CASIER_OCCUPE)
SELECT public.assigner_casier_atomic(
  '00000000-0000-0000-0000-0000000009a1'::uuid,
  'A1',
  '00000000-0000-0000-0000-0000000009f2'::uuid,
  NULL,
  NULL,
  NULL,
  NULL
) AS result;


-- ============================================================
-- TEST 7 : CONCURRENCE — 2 requêtes simultanées sur A1
-- ============================================================
-- Ce test utilise 2 transactions parallèles via dblink pour simuler
-- 2 requêtes HTTP concurrentes. Une seule doit réussir.
-- ============================================================
\echo '--- TEST 7: Concurrence — 2 requêtes simultanées sur A1 ---'

-- Libère A1 d'abord
SELECT public.liberer_casier_atomic(
  '00000000-0000-0000-0000-0000000009a1'::uuid,
  'A1',
  NULL,
  'Reset pour test concurrence',
  NULL,
  NULL
);

-- Lance 2 assignations en parallèle via dblink
-- (requiert l'extension dblink)
CREATE EXTENSION IF NOT EXISTS dblink;

DO $$
DECLARE
  v_result1 JSONB;
  v_result2 JSONB;
BEGIN
  -- Lance 2 transactions concurrentes
  SELECT * INTO v_result1 FROM dblink_connect('conn1', 'dbname=' || current_database());
  SELECT * INTO v_result2 FROM dblink_connect('conn2', 'dbname=' || current_database());

  -- Les deux assignations en parallèle
  PERFORM dblink_send_query('conn1',
    'SELECT public.assigner_casier_atomic(' ||
    '''00000000-0000-0000-0000-0000000009a1''::uuid, ' ||
    '''A1'', ' ||
    '''00000000-0000-0000-0000-0000000009f1''::uuid, NULL, NULL, NULL, NULL)'
  );

  PERFORM dblink_send_query('conn2',
    'SELECT public.assigner_casier_atomic(' ||
    '''00000000-0000-0000-0000-0000000009a1''::uuid, ' ||
    '''A1'', ' ||
    '''00000000-0000-0000-0000-0000000009f2''::uuid, NULL, NULL, NULL, NULL)'
  );

  -- Récupère les résultats
  SELECT * INTO v_result1 FROM dblink_get_result('conn1') AS t(r JSONB);
  SELECT * INTO v_result2 FROM dblink_get_result('conn2') AS t(r JSONB);

  PERFORM dblink_disconnect('conn1');
  PERFORM dblink_disconnect('conn2');

  RAISE NOTICE 'Résultat 1: %', v_result1;
  RAISE NOTICE 'Résultat 2: %', v_result2;

  -- Vérifie qu'une seule a réussi
  IF (v_result1->>'success') = 'true' AND (v_result2->>'success') = 'true' THEN
    RAISE EXCEPTION 'ECHEC: Les deux assignations ont réussi (unicité violée !)';
  ELSIF (v_result1->>'success') = 'false' AND (v_result2->>'success') = 'false' THEN
    RAISE EXCEPTION 'ECHEC: Les deux assignations ont échoué';
  ELSE
    RAISE NOTICE 'SUCCES: Une seule assignation a réussi (unicité garantie)';
  END IF;
END $$;


-- ============================================================
-- TEST 8 : Réaffectation — article déjà dans A1 assigné à B1
-- ============================================================
\echo '--- TEST 8: Réaffectation ---'
-- L'article 1 est dans A1 (test 7). Assigne-le à B1.
SELECT public.assigner_casier_atomic(
  '00000000-0000-0000-0000-0000000009a1'::uuid,
  'B1',
  '00000000-0000-0000-0000-0000000009f1'::uuid,
  NULL,
  NULL,
  NULL,
  NULL
) AS result;

-- Vérifie que A1 est libéré et B1 est occupé
SELECT 'A1' AS casier, statut FROM public.casier_affectations WHERE casier_id = '00000000-0000-0000-0000-0000000009g1';
SELECT 'B1' AS casier, statut FROM public.casier_affectations WHERE casier_id = '00000000-0000-0000-0000-0000000009g2' AND statut = 'actif';

-- Vérifie que zone_stockage = B1 sur l'article
SELECT zone_stockage FROM public.articles_vetements WHERE id = '00000000-0000-0000-0000-0000000009f1';


-- ============================================================
-- TEST 9 : Auto-libération sur statut terminal (trigger)
-- ============================================================
\echo '--- TEST 9: Auto-libération sur statut terminal ---'
-- L'article 1 est dans B1. Marque-le comme 'retire'.
UPDATE public.articles_vetements
SET statut = 'retire'
WHERE id = '00000000-0000-0000-0000-0000000009f1';

-- Vérifie que le trigger a libéré le casier B1
SELECT statut, libere_le IS NOT NULL AS auto_libere
FROM public.casier_affectations
WHERE casier_id = '00000000-0000-0000-0000-0000000009g2';

-- Vérifie que zone_stockage est NULL
SELECT zone_stockage IS NULL AS casier_libere_auto
FROM public.articles_vetements
WHERE id = '00000000-0000-0000-0000-0000000009f1';


-- ============================================================
-- TEST 10 : Contrainte UNIQUE — INSERT direct violé → 23505
-- ============================================================
\echo '--- TEST 10: Contrainte UNIQUE (INSERT direct) ---'
-- Tente un INSERT direct d'une 2e affectation active sur A1
-- (devrait échouer avec 23505)
DO $$
BEGIN
  -- Remet l'article 2 à 'pret' et assigne-le à A1 via la RPC
  UPDATE public.articles_vetements SET statut = 'pret' WHERE id = '00000000-0000-0000-0000-0000000009f2';

  PERFORM public.assigner_casier_atomic(
    '00000000-0000-0000-0000-0000000009a1'::uuid,
    'A1',
    '00000000-0000-0000-0000-0000000009f2'::uuid,
    NULL, NULL, NULL, NULL
  );

  -- Tente un INSERT direct (contourne la RPC) — doit échouer
  BEGIN
    INSERT INTO public.casier_affectations (casier_id, article_id, pressing_id, statut)
    VALUES (
      '00000000-0000-0000-0000-0000000009g1',
      '00000000-0000-0000-0000-0000000009f1',
      '00000000-0000-0000-0000-0000000009a1',
      'actif'
    );
    RAISE EXCEPTION 'ECHEC: L''INSERT direct aurait dû échouer (unicité violée)';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'SUCCES: INSERT direct rejeté par la contrainte UNIQUE (23505)';
  END;
END $$;


\echo '--- Tous les tests SQL sont terminés ---'
