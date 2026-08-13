-- ============================================================
-- e-pressing — Migration 033 : Remove dead payment modes
-- ============================================================
-- Fichier    : 033_remove_dead_payment_modes.sql
-- Version    : 1.1
-- Description : Nettoie les valeurs mortes 'carte', 'cheque', 'virement'
--               du champ `personnel.modes_paiement_autorises` (migration 019).
--
-- Contexte (FIX-WAVE1-A #8 — PRD §5.2 + §18.5) :
--   La migration 019 a ajouté `modes_paiement_autorises` avec un sur-ensemble
--   de 5 valeurs : ['especes','mobile_money','carte','cheque','virement'].
--   L'objectif était de prévoir une extension future de l'enum `methode_paiement`.
--   Mais l'enum `methode_paiement` (migration 001) reste à 3 valeurs
--   (especes, mobile_money, carte_bancaire) — PRD §18.5. Les 3 valeurs
--   supplémentaires ('carte', 'cheque', 'virement') ne peuvent JAMAIS passer
--   la validation `METHODES_VALID` côté /api/personnel/caissier/encaisser
--   (qui valide contre l'enum MethodePaiement). Ce sont donc des dead values
--   qui créent de la confusion : le manager peut les proposer dans l'UI,
--   mais le caissier ne peut jamais encaisser.
--
--   Cette migration :
--     1. Backfill : filtre les arrays existants pour ne garder que les
--        3 valeurs PRD. Si l'array résultant est vide, on y met le default
--        PRD. NULL reste NULL (la colonne est nullable).
--     2. Met à jour le DEFAULT de la colonne à ['especes','mobile_money',
--        'carte_bancaire'] (3 valeurs PRD).
--     3. Remplace la CHECK constraint par une qui n'autorise QUE les
--        3 valeurs PRD (au lieu des 5 précédentes), via l'opérateur `<@`
--        (contained in) — même approche que la contrainte existante.
--     4. Met à jour le COMMENT ON COLUMN pour refléter le nouvel ensemble.
--
-- ⚠️ Sécurité :
--   - BACKFILL FIRST : on retire les dead values AVANT de poser la CHECK
--     constraint stricte, sinon les lignes existantes violeraient la
--     contrainte et l'ALTER TABLE échouerait.
--   - Si une ligne caissier avait ['carte'] uniquement (cas extrême), on
--     remplace par les 3 valeurs PRD pour ne pas bloquer le caissier.
--   - Idempotent : DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT.
--
-- Référence : FIX-WAVE1-A issue #8 + PRD §5.2 + §18.5.
-- ============================================================


-- ============================================================
-- SECTION 1 : Backfill — retirer les valeurs mortes des arrays existants
-- ============================================================
-- Pour chaque ligne de `personnel` (tout rôle, par sécurité — même si
-- seul le rôle 'caissier' utilise réellement le champ) :
--   - On filtre l'array pour ne garder que les 3 valeurs PRD.
--   - Si l'array résultant est vide, on met le default PRD (3 valeurs).
--   - NULL reste NULL.
--
-- On utilise `jsonb_path_query_array` (Postgres 12+) qui prend un jsonb
-- et un path et renvoie tous les éléments matchant le path. Plus simple
-- que jsonb_agg + jsonb_array_elements_text.
-- ============================================================

UPDATE public.personnel
SET modes_paiement_autorises = COALESCE(
    NULLIF(
        (
            -- Filtre l'array pour ne garder que les 3 valeurs PRD.
            -- Si l'array d'origine ne contient aucune des 3 valeurs PRD,
            -- le résultat sera '[]' (array vide), et on retombe sur le
            -- COALESCE extérieur qui met le default PRD.
            SELECT jsonb_path_query_array(
                modes_paiement_autorises,
                '$ ? (@ == "especes" || @ == "mobile_money" || @ == "carte_bancaire")'
            )
        ),
        '[]'::jsonb
    ),
    '["especes","mobile_money","carte_bancaire"]'::jsonb
)
WHERE modes_paiement_autorises IS NOT NULL
  AND modes_paiement_autorises ?| ARRAY['carte', 'cheque', 'virement'];


-- ============================================================
-- SECTION 2 : Mettre à jour le DEFAULT de la colonne
-- ============================================================
-- ALTER COLUMN ... SET DEFAULT est idempotent : la valeur est remplacée
-- à chaque exécution. On passe de 5 valeurs à 3.
-- ============================================================

ALTER TABLE public.personnel
    ALTER COLUMN modes_paiement_autorises
    SET DEFAULT '["especes","mobile_money","carte_bancaire"]'::jsonb;


-- ============================================================
-- SECTION 3 : Remplacer la CHECK constraint
-- ============================================================
-- On supprime l'ancienne (5 valeurs) et on pose la nouvelle (3 valeurs)
-- strictement alignée sur l'enum `methode_paiement`. On utilise
-- l'opérateur `<@` (jsonb contained in) — même approche que la contrainte
-- existante (PostgreSQL ne permet pas les sous-requêtes dans une CHECK
-- constraint, mais `<@` sur un jsonb literal fonctionne).
--
-- La colonne étant nullable, on garde `IS NULL OR (...)` pour autoriser
-- les valeurs NULL (par sécurité, bien que toutes les lignes caissier
-- devraient avoir un array non-NULL).
-- ============================================================

ALTER TABLE public.personnel
    DROP CONSTRAINT IF EXISTS personnel_modes_paiement_autorises_check;

ALTER TABLE public.personnel
    ADD CONSTRAINT personnel_modes_paiement_autorises_check
    CHECK (
        modes_paiement_autorises IS NULL
        OR (
            jsonb_typeof(modes_paiement_autorises) = 'array'
            AND jsonb_array_length(modes_paiement_autorises) > 0
            AND modes_paiement_autorises <@ '["especes", "mobile_money", "carte_bancaire"]'::jsonb
        )
    );


-- ============================================================
-- SECTION 4 : Mettre à jour le COMMENT ON COLUMN
-- ============================================================

COMMENT ON COLUMN public.personnel.modes_paiement_autorises IS
    'Liste JSONB des modes de paiement autorisés pour ce caissier (subset de ["especes","mobile_money","carte_bancaire"] — PRD §5.2 + §18.5). Default = les 3 valeurs. Contrainte CHECK : array non-vide + chaque élément dans l''enum valide. Référence : AUDIT_SECURITE.md 9.7 + 9.11, FIX-WAVE1-A #8.';


-- ============================================================
-- Fin de la migration 033_remove_dead_payment_modes.sql
-- Récapitulatif :
--   - Backfill : arrays existants filtrés aux 3 valeurs PRD.
--   - DEFAULT mis à jour (3 valeurs).
--   - CHECK constraint mise à jour (3 valeurs strictes, via <@).
--   - COMMENT ON COLUMN mis à jour.
--   - Aucun DROP TABLE / DROP COLUMN.
--   - Idempotent (DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT).
-- ============================================================
