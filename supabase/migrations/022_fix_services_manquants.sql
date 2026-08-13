-- ============================================================
-- e-pressing — Migration 022 : Fix services manquants par pressing
-- ============================================================
-- Fichier    : 022_fix_services_manquants.sql
-- Version    : 1.0
-- Description : Pour chaque pressing existant, garantit la présence
--               des 5 services standards (lavage, repassage,
--               nettoyage_sec, detachage, blanchisserie) dans la
--               table `public.services`.
--
-- Contexte :
--   Cette migration était mentionnée dans le résumé de session
--   précédent (post-Phase 3) mais n'avait jamais été créée. Sans
--   elle, certains pressings peuvent ne pas avoir de ligne dans
--   `services` pour un type donné → la page "Tarifs par article"
--   et la création de commande (qui propose un SELECT sur les
--   services actifs) ne proposent pas le service manquant.
--
--   La migration 021_add_laver_repasser_enum.sql a ajouté la valeur
--   'laver_repasser' à l'enum type_service. Cette 6e valeur n'est
--   PAS créée automatiquement ici : elle est créée à la demande par
--   le manager via la page "Tarifs par article" (table
--   `tarifs_articles`, migration 020). Ici on ne backfill QUE les
--   5 services "génériques" du PRD §5.1.
--
-- Schéma réel (002_tables.sql §8) :
--   CREATE TABLE public.services (
--       id              UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
--       pressing_id     UUID           NOT NULL REFERENCES public.pressing(id) ON DELETE CASCADE,
--       type            type_service   NOT NULL,   -- ⚠️ colonne = `type` (pas `type_service`)
--       nom             TEXT           NOT NULL,   -- ⚠️ NOT NULL → doit être fourni
--       prix            INTEGER        NOT NULL,   -- FCFA
--       duree_estimee   INTERVAL,                   -- ⚠️ INTERVAL (pas INTEGER)
--       actif           BOOLEAN        NOT NULL DEFAULT TRUE,
--       created_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
--       updated_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW()
--   );
--
-- ⚠️  Cast ::text sur les comparaisons d'enum :
--     La comparaison `s.type = t` où `t` est un TEXT déclenche
--     l'erreur PostgreSQL 22P02 "invalid input syntax for type enum"
--     si le runtime ne peut pas inférer le type enum depuis une
--     requête paramétrée. On utilise donc `s.type::text = t` qui
--     force la comparaison en TEXT des deux côtés (sûr car les
--     valeurs enum sont des identifiants ASCII simples).
--
-- IDEMPOTENT : DO $$ ... END $$ + INSERT ... WHERE NOT EXISTS.
--   Peut être ré-exécutée sans erreur ni doublon.
--
-- Prérequis :
--   - Migrations 001 (enums) + 002 (tables) exécutées ✅
--   - Migration 021 (laver_repasser) exécutée ✅ (valeur ajoutée à l'enum)
-- ============================================================


-- ============================================================
-- Backfill des 5 services standards pour chaque pressing
-- ============================================================
-- Itère sur tous les pressings, et pour chacun, insère les 5
-- services standards s'ils n'existent pas déjà.
--
-- Valeurs par défaut :
--   - prix          : 1000 FCFA (à ajuster par le manager ensuite)
--   - duree_estimee : '24 hours'::interval (délai standard)
--   - actif         : TRUE
--   - nom           : libellé humain lisible ("Lavage", "Repassage", etc.)
-- ============================================================

DO $$
DECLARE
    p RECORD;
    t TEXT;
    types TEXT[]     := ARRAY['lavage', 'repassage', 'nettoyage_sec', 'detachage', 'blanchisserie'];
    noms TEXT[]      := ARRAY['Lavage', 'Repassage', 'Nettoyage à sec', 'Détachage', 'Blanchisserie'];
    idx INT;
    nom_service TEXT;
BEGIN
    FOR p IN SELECT id FROM public.pressing LOOP
        idx := 1;
        FOREACH t IN ARRAY types LOOP
            nom_service := noms[idx];

            INSERT INTO public.services (pressing_id, type, nom, prix, duree_estimee, actif)
            SELECT p.id, t::text::type_service, nom_service, 1000, '24 hours'::interval, TRUE
            WHERE NOT EXISTS (
                SELECT 1
                FROM public.services s
                WHERE s.pressing_id = p.id
                  AND s.type::text = t
            );

            idx := idx + 1;
        END LOOP;
    END LOOP;
END $$;


-- ============================================================
-- Commentaire de migration
-- ============================================================
COMMENT ON TABLE public.services IS
    'Grille tarifaire des services proposés par un pressing. PRD §5.1 : 5 types standards (lavage, repassage, nettoyage_sec, detachage, blanchisserie) + laver_repasser (migration 021). Migration 022 garantit la présence des 5 services standards pour chaque pressing.';


-- ============================================================
-- Fin de la migration 022_fix_services_manquants.sql
-- Récapitulatif :
--   - 1 DO $$ block itérant sur tous les pressings
--   - Pour chaque pressing × chaque type (5 types) :
--     INSERT ... WHERE NOT EXISTS (idempotent)
--   - Aucun DROP, aucun UPDATE destructif
--   - Cast ::text sur les comparaisons d'enum (évite 22P02)
-- ============================================================
