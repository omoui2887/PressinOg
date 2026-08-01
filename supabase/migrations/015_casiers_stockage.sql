-- ============================================================
-- OgPressing — Migration 015 : Casiers de stockage pour linges propres
-- ============================================================
-- Fichier    : 015_casiers_stockage.sql
-- Version    : 1.0
-- Date       : 31/07/2026
-- Description : Ajoute le suivi des casiers de stockage (zone_stockage)
--               pour les articles propres prêts à être retirés/livrés.
--
-- Rationale :
--   Lorsqu'un article est propre (statut "pret"), il doit être rangé
--   dans un casier physique identifié (ex: A1, B2, C3) pour que le
--   client ou le livreur puisse le retrouver facilement. Cette
--   migration ajoute 3 colonnes à `articles_vetements` :
--     - zone_stockage   TEXT         (code du casier, ex: "A1")
--     - date_rangeement TIMESTAMPTZ  (quand l'article a été rangé)
--     - rangee_par      UUID         (personnel qui a rangé l'article)
--
-- Workflow :
--   1. Repasseur termine le repassage → article.statut = "repasse"
--   2. Repasseur (ou réceptionniste) range l'article dans un casier
--      → article.statut = "pret" + zone_stockage = "A1"
--   3. Client vient retirer (ou livreur livre)
--      → article.statut = "retire" (ou "livre") + zone_stockage = NULL
--      (le casier est libéré automatiquement)
--
-- ⚠️  Idempotente : utilise ADD COLUMN IF NOT EXISTS + CREATE INDEX
--     IF NOT EXISTS. Peut être ré-exécutée sans erreur.
-- ============================================================


-- ============================================================
-- 1. Ajout des colonnes à articles_vetements
-- ============================================================

-- Code du casier (ex: "A1", "B2", "C3"). Nullable : renseigné quand
-- l'article est rangé (statut "pret"), mis à NULL quand l'article est
-- retiré ou livré (libération du casier).
ALTER TABLE public.articles_vetements
    ADD COLUMN IF NOT EXISTS zone_stockage TEXT;

-- Date à laquelle l'article a été rangé dans le casier.
ALTER TABLE public.articles_vetements
    ADD COLUMN IF NOT EXISTS date_rangeement TIMESTAMPTZ;

-- Personnel qui a rangé l'article dans le casier.
ALTER TABLE public.articles_vetements
    ADD COLUMN IF NOT EXISTS rangee_par UUID REFERENCES public.personnel(id) ON DELETE SET NULL;


-- ============================================================
-- 2. Index pour la recherche rapide par casier
-- ============================================================
-- Utilisé par le tableau "Casiers" (filtrage par zone_stockage) et
-- par la vérification d'unicité (un casier ne devrait contenir qu'un
-- article à la fois — contrainte applicative, pas DB, car on veut
-- pouvoir gérer le cas exceptionnel de plusieurs articles dans un
-- grand casier).
CREATE INDEX IF NOT EXISTS idx_articles_vetements_zone_stockage
    ON public.articles_vetements (zone_stockage)
    WHERE zone_stockage IS NOT NULL;


-- ============================================================
-- 3. Contrainte CHECK : zone_stockage doit être non-vide si renseigné
-- ============================================================
-- On interdit les chaînes vides ou composées uniquement d'espaces.
-- Le format attendu est court (1-10 caractères alphanumériques).
ALTER TABLE public.articles_vetements
    DROP CONSTRAINT IF EXISTS chk_zone_stockage_format;
ALTER TABLE public.articles_vetements
    ADD CONSTRAINT chk_zone_stockage_format
    CHECK (
        zone_stockage IS NULL
        OR (length(btrim(zone_stockage)) BETWEEN 1 AND 10
            AND zone_stockage ~ '^[A-Za-z0-9]+$')
    );


-- ============================================================
-- 4. Commentaires sur les colonnes (documentation intégrée DB)
-- ============================================================
COMMENT ON COLUMN public.articles_vetements.zone_stockage IS
    'Code du casier physique où l''article propre est rangé (ex: A1, B2). Renseigné quand statut=pret, mis à NULL quand retire/livre.';
COMMENT ON COLUMN public.articles_vetements.date_rangeement IS
    'Date à laquelle l''article a été rangé dans le casier.';
COMMENT ON COLUMN public.articles_vetements.rangee_par IS
    'Personnel (FK personnel.id) qui a rangé l''article dans le casier.';


-- ============================================================
-- 5. Mise à jour du trigger deriver_statut_commande (optionnel)
-- ============================================================
-- Le trigger existant (migration 005) recalcule commandes.statut à
-- partir des statuts des articles. Les nouvelles colonnes
-- zone_stockage / date_rangeement / rangee_par ne modifient PAS le
-- statut de la commande — elles sont purement informatives. Aucune
-- modification du trigger n'est nécessaire.


-- ============================================================
-- 6. RLS — pas de nouvelles policies nécessaires
-- ============================================================
-- La table articles_vetements est déjà protégée par RLS via la
-- commande parent (migration 006). Les nouvelles colonnes héritent
-- automatiquement de la même isolation par pressing_id. Aucune
-- policy supplémentaire à créer.


-- ============================================================
-- 7. Grant — pas de modification nécessaire
-- ============================================================
-- Les grants existants (migration 007) s'appliquent à toute la table
-- articles_vetements, y compris les nouvelles colonnes.


-- ============================================================
-- Fin de la migration 015_casiers_stockage.sql
-- ============================================================
