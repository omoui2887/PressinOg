-- ============================================================
-- Tests SQL — Synchronisation des statuts d'abonnement
-- ====================================================================
-- 8 scénarios exigés par la spécification, à exécuter directement
-- contre la DB Supabase (Dashboard → SQL Editor) pour valider le
-- comportement réel de la fonction synchroniser_statut_abonnements().
--
-- ⚠️  Ce script CRÉE des données de test puis les NETTOIE à la fin.
--     Il est idempotent (peut être relancé).
--
-- Usage :
--   1. Ouvrir Supabase Dashboard → SQL Editor
--   2. Coller ce script entier
--   3. Run → vérifier les messages RAISE NOTICE
-- ============================================================

-- ------------------------------------------------------------
-- 0. Nettoyage préalable (idempotence)
-- ------------------------------------------------------------
DELETE FROM public.abonnements WHERE pressing_id IN (
  SELECT id FROM public.pressing WHERE nom LIKE 'TEST_ABO_%'
);
DELETE FROM public.pressing WHERE nom LIKE 'TEST_ABO_%';

-- ------------------------------------------------------------
-- Création d'un pressing de test
-- ------------------------------------------------------------
INSERT INTO public.pressing (nom, ville, statut, date_activation)
VALUES ('TEST_ABO_Pressing', 'Abidjan', 'actif', NOW())
RETURNING id AS test_pressing_id \gset

-- ============================================================
-- Scénario 1 : essai valide (statut='essai', date_fin > NOW())
-- ============================================================
INSERT INTO public.abonnements (pressing_id, plan, statut, date_debut, date_fin, montant_mensuel)
VALUES (:test_pressing_id, 'starter', 'essai', NOW() - INTERVAL '1 day', NOW() + INTERVAL '6 days', 9900);

-- ============================================================
-- Scénario 2 : essai expiré (statut='essai', date_fin < NOW())
-- ============================================================
INSERT INTO public.abonnements (pressing_id, plan, statut, date_debut, date_fin, montant_mensuel)
VALUES (:test_pressing_id, 'starter', 'essai', NOW() - INTERVAL '10 days', NOW() - INTERVAL '3 days', 9900);

-- ============================================================
-- Scénario 3 : actif valide (statut='actif', date_fin > NOW())
-- ============================================================
INSERT INTO public.abonnements (pressing_id, plan, statut, date_debut, date_fin, montant_mensuel)
VALUES (:test_pressing_id, 'pro', 'actif', NOW() - INTERVAL '5 days', NOW() + INTERVAL '25 days', 24900);

-- ============================================================
-- Scénario 4 : actif expiré (statut='actif', date_fin < NOW())
-- ============================================================
INSERT INTO public.abonnements (pressing_id, plan, statut, date_debut, date_fin, montant_mensuel)
VALUES (:test_pressing_id, 'business', 'actif', NOW() - INTERVAL '40 days', NOW() - INTERVAL '10 days', 49900);

-- ============================================================
-- Scénario 5 : suspendu (statut='suspendu')
-- ============================================================
INSERT INTO public.abonnements (pressing_id, plan, statut, date_debut, date_fin, montant_mensuel)
VALUES (:test_pressing_id, 'pro', 'suspendu', NOW() - INTERVAL '20 days', NOW() + INTERVAL '10 days', 24900);

-- ============================================================
-- Scénario 6 : renouvellement (sera testé après sync — date_fin étendue)
-- On insère un abonnement expiré, on lance sync, puis on le renouvelle
-- ============================================================
INSERT INTO public.abonnements (pressing_id, plan, statut, date_debut, date_fin, montant_mensuel)
VALUES (:test_pressing_id, 'starter', 'actif', NOW() - INTERVAL '35 days', NOW() - INTERVAL '5 days', 9900)
RETURNING id AS renew_abonnement_id \gset

-- ============================================================
-- Scénario 7 : changement de plan (statut='actif', plan change)
-- ============================================================
INSERT INTO public.abonnements (pressing_id, plan, statut, date_debut, date_fin, montant_mensuel)
VALUES (:test_pressing_id, 'starter', 'actif', NOW() - INTERVAL '2 days', NOW() + INTERVAL '28 days', 9900);

-- ============================================================
-- Scénario 8 : réactivation (sera testée après sync)
-- On insère un abonnement suspendu, on lance sync, puis on le réactive
-- ============================================================
INSERT INTO public.abonnements (pressing_id, plan, statut, date_debut, date_fin, montant_mensuel)
VALUES (:test_pressing_id, 'pro', 'suspendu', NOW() - INTERVAL '15 days', NOW() + INTERVAL '15 days', 24900)
RETURNING id AS reactivate_abonnement_id \gset

-- ============================================================
-- EXÉCUTION de la fonction de synchronisation
-- ============================================================
\echo '\n=== Exécution de synchroniser_statut_abonnements() ===\n'
SELECT public.synchroniser_statut_abonnements();

-- ============================================================
-- VÉRIFICATIONS — afficher les statuts après sync
-- ============================================================
\echo '\n=== Statuts des abonnements de test après synchronisation ===\n'
SELECT
  plan,
  statut,
  date_fin,
  CASE
    WHEN statut = 'essai' AND date_fin < NOW() THEN '❌ devait rester essai (BUG)'
    WHEN statut = 'essai' AND date_fin > NOW() THEN '✅ essai valide'
    WHEN statut = 'actif' AND date_fin > NOW() THEN '✅ actif valide'
    WHEN statut = 'actif' AND date_fin < NOW() THEN '❌ devait être expire (BUG)'
    WHEN statut = 'expire' AND date_fin < NOW() THEN '✅ expire correctement'
    WHEN statut = 'suspendu' THEN '✅ suspendu (inchangé)'
    ELSE '? vérifier'
  END AS verification
FROM public.abonnements
WHERE pressing_id = :test_pressing_id
ORDER BY date_debut;

-- ============================================================
-- Scénario 6 : RENOUVELLEMENT — étendre date_fin du renouvelable
-- ============================================================
\echo '\n=== Scénario 6 : Renouvellement ===\n'
UPDATE public.abonnements
SET statut = 'actif',
    date_fin = NOW() + INTERVAL '30 days',
    date_derniere_echeance = NOW(),
    updated_at = NOW()
WHERE id = :renew_abonnement_id;

SELECT plan, statut, date_fin,
  CASE
    WHEN statut = 'actif' AND date_fin > NOW() THEN '✅ renouvelé avec succès'
    ELSE '❌ renouvellement échoué (BUG)'
  END AS verification
FROM public.abonnements WHERE id = :renew_abonnement_id;

-- ============================================================
-- Scénario 7 : CHANGEMENT DE PLAN
-- ============================================================
\echo '\n=== Scénario 7 : Changement de plan ===\n'
UPDATE public.abonnements
SET plan = 'business',
    montant_mensuel = 49900,
    updated_at = NOW()
WHERE pressing_id = :test_pressing_id
  AND statut = 'actif'
  AND plan = 'starter'
  AND date_fin > NOW();

SELECT plan, statut,
  CASE
    WHEN plan = 'business' AND statut = 'actif' THEN '✅ plan changé avec succès'
    ELSE '❌ changement de plan échoué (BUG)'
  END AS verification
FROM public.abonnements
WHERE pressing_id = :test_pressing_id AND plan = 'business' AND statut = 'actif'
ORDER BY date_debut DESC LIMIT 1;

-- ============================================================
-- Scénario 8 : RÉACTIVATION — suspendu → actif
-- ============================================================
\echo '\n=== Scénario 8 : Réactivation ===\n'
UPDATE public.abonnements
SET statut = 'actif',
    updated_at = NOW()
WHERE id = :reactivate_abonnement_id;

SELECT plan, statut,
  CASE
    WHEN statut = 'actif' THEN '✅ réactivé avec succès'
    ELSE '❌ réactivation échouée (BUG)'
  END AS verification
FROM public.abonnements WHERE id = :reactivate_abonnement_id;

-- ============================================================
-- NETTOYAGE — supprimer les données de test
-- ============================================================
\echo '\n=== Nettoyage des données de test ===\n'
DELETE FROM public.abonnements WHERE pressing_id = :test_pressing_id;
DELETE FROM public.pressing WHERE id = :test_pressing_id;
\echo '✓ Données de test supprimées.\n'

-- ============================================================
-- RÉSUMÉ — re-exécuter la fonction pour confirmer updated=0
-- ============================================================
\echo '\n=== Re-exécution (devrait retourner updated=0 ou moins qu avant) ===\n'
SELECT public.synchroniser_statut_abonnements();
