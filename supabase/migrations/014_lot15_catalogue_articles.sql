-- ============================================================
-- e-pressing — Migration 014 : Catalogue d'articles illustré (LOT 15.1)
-- ============================================================
-- Fichier    : 014_lot15_catalogue_articles.sql
-- Version    : 1.0
-- Date       : 24/07/2026
-- Description : Crée la table `catalogue_articles` (catalogue global
--               partagé de 33 articles/accessoires de pressing avec
--               illustrations), modifie `articles_vetements` pour
--               remplacer l'ENUM figé `type_vetement` (7 valeurs) par
--               une FK `catalogue_article_id` vers le nouveau catalogue,
--               et active la RLS appropriée.
--
-- ⚠️  PRINCIPES :
--   - Le catalogue est GLOBAL (commun à tous les pressings, non lié à
--     un pressing_id). Aucune isolation multi-tenant sur cette table.
--   - Lecture (SELECT) ouverte à tout utilisateur authentifié.
--   - Écriture (INSERT/UPDATE/DELETE) réservée au Super Admin
--     (is_super_admin() = true). Les pressings clients ne peuvent pas
--     modifier le catalogue global.
--   - L'ancienne colonne `type_vetement` est conservée (renommée
--     `type_vetement_legacy`) pour ne pas perdre les données
--     historiques, mais le nouveau code utilise `catalogue_article_id`.
--
-- IDEMPOTENT : CREATE TABLE IF NOT EXISTS + ON CONFLICT DO NOTHING +
--   ADD COLUMN IF NOT EXISTS + CREATE POLICY IF NOT EXISTS.
--   La migration peut être rejouée sans erreur.
-- ============================================================


-- ============================================================
-- 1. CRÉATION DE LA TABLE catalogue_articles
-- ============================================================
-- Catalogue global d'articles/accessoires traités par un pressing
-- professionnel. 33 entrées initiales couvrant 9 catégories.
--
-- `slug`  : identifiant technique stable (ex: 'costume-ceremonie'),
--           utilisé pour construire `icone_url` = '/images/articles/{slug}.png'.
-- `nom`   : libellé affiché (ex: 'Costumes & Vêtements de Cérémonie').
-- `categorie` : texte libre (9 catégories initiales, évolutives via
--               la page d'administration Super Admin).
-- `actif` : une fois désactivé, l'article n'apparaît plus dans le
--           sélecteur ArticleCatalogPicker utilisé par les pressings,
--           mais reste visible côté Super Admin pour réactivation.
-- `ordre_affichage` : tri au sein d'une catégorie (ASC).
-- ============================================================
CREATE TABLE IF NOT EXISTS public.catalogue_articles (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    slug            TEXT        NOT NULL UNIQUE,
    nom             TEXT        NOT NULL,
    categorie       TEXT        NOT NULL,
    icone_url       TEXT        NOT NULL,
    actif           BOOLEAN     NOT NULL DEFAULT TRUE,
    ordre_affichage INTEGER     NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index sur `actif` + `categorie` pour filtrer rapidement les articles
-- actifs groupés par catégorie côté picker.
CREATE INDEX IF NOT EXISTS idx_catalogue_articles_actif_categorie
    ON public.catalogue_articles (actif, categorie, ordre_affichage);


-- ============================================================
-- 2. INSERT DES 33 ARTICLES DU CATALOGUE INITIAL
-- ============================================================
-- Ordre_affichage suit l'ordre du spec LOT 15.1, groupé par catégorie.
-- icone_url suit la convention '/images/articles/{slug}.png'. Les
-- fichiers PNG correspondants seront déposés dans /public/images/articles/
-- au fur et à mesure. En attendant, le composant ArticleCatalogPicker
-- affiche une icône lucide "Shirt" générique en repli (onError <img>).
-- ============================================================

INSERT INTO public.catalogue_articles (slug, nom, categorie, icone_url, ordre_affichage) VALUES
  -- Vêtements traités (5)
  ('costume-ceremonie', 'Costumes & Vêtements de Cérémonie', 'Vêtements traités', '/images/articles/costume-ceremonie.png', 101),
  ('chemise', 'Chemises', 'Vêtements traités', '/images/articles/chemise.png', 102),
  ('robe-textile-delicat', 'Robes & Textiles Délicats', 'Vêtements traités', '/images/articles/robe-textile-delicat.png', 103),
  ('pull-maille', 'Pulls & Maille', 'Vêtements traités', '/images/articles/pull-maille.png', 104),
  ('manteau-doudoune', 'Manteaux & Doudounes', 'Vêtements traités', '/images/articles/manteau-doudoune.png', 105),
  -- Linge de maison (4)
  ('rideau-voilage', 'Rideaux & Voilages', 'Linge de maison', '/images/articles/rideau-voilage.png', 201),
  ('nappe-chemin-table', 'Nappes & Chemins de Table', 'Linge de maison', '/images/articles/nappe-chemin-table.png', 202),
  ('parure-lit', 'Parures de Lit', 'Linge de maison', '/images/articles/parure-lit.png', 203),
  ('serviette-peignoir', 'Serviettes & Peignoirs', 'Linge de maison', '/images/articles/serviette-peignoir.png', 204),
  -- Cuir et fourrure (3)
  ('blouson-cuir', 'Blouson en Cuir', 'Cuir et fourrure', '/images/articles/blouson-cuir.png', 301),
  ('manteau-fourrure', 'Manteau de Fourrure', 'Cuir et fourrure', '/images/articles/manteau-fourrure.png', 302),
  ('bottes-accessoires-cuir', 'Bottes & Accessoires Cuir', 'Cuir et fourrure', '/images/articles/bottes-accessoires-cuir.png', 303),
  -- Travail et uniformes (3)
  ('costume-medical', 'Costume Médical', 'Travail et uniformes', '/images/articles/costume-medical.png', 401),
  ('uniforme-hotellerie', 'Uniforme d''Hôtellerie', 'Travail et uniformes', '/images/articles/uniforme-hotellerie.png', 402),
  ('bleu-travail-securite', 'Bleu de Travail / Vêtement de Sécurité', 'Travail et uniformes', '/images/articles/bleu-travail-securite.png', 403),
  -- Textiles spéciaux (3)
  ('costume-danse-sport', 'Costume de Danse/Sport', 'Textiles spéciaux', '/images/articles/costume-danse-sport.png', 501),
  ('sacs-bagages', 'Sacs & Bagages', 'Textiles spéciaux', '/images/articles/sacs-bagages.png', 502),
  ('jouet-peluche', 'Jouets en Peluche', 'Textiles spéciaux', '/images/articles/jouet-peluche.png', 503),
  -- Accessoires de mode (4)
  ('cravate-foulard', 'Cravates & Foulards', 'Accessoires de mode', '/images/articles/cravate-foulard.png', 601),
  ('ceinture-tissu', 'Ceintures en Tissu', 'Accessoires de mode', '/images/articles/ceinture-tissu.png', 602),
  ('gants-cuir', 'Gants en Cuir', 'Accessoires de mode', '/images/articles/gants-cuir.png', 603),
  ('chapeau-casquette', 'Chapeaux & Casquettes', 'Accessoires de mode', '/images/articles/chapeau-casquette.png', 604),
  -- Petits textiles & linge de table (3)
  ('mouchoir-tissu', 'Mouchoirs en Tissu', 'Petits textiles & linge de table', '/images/articles/mouchoir-tissu.png', 701),
  ('set-de-table', 'Sets de Table', 'Petits textiles & linge de table', '/images/articles/set-de-table.png', 702),
  ('serviette-table', 'Serviettes de Table Individuelles', 'Petits textiles & linge de table', '/images/articles/serviette-table.png', 703),
  -- Maison et décoration (4)
  ('houssse-coussin', 'Housses de Coussin', 'Maison et décoration', '/images/articles/housse-coussin.png', 801),
  ('chemin-de-table-deco', 'Chemins de Table', 'Maison et décoration', '/images/articles/chemin-de-table-deco.png', 802),
  ('tapis-bain', 'Tapis de Bain', 'Maison et décoration', '/images/articles/tapis-bain.png', 803),
  ('decoration-murale-tissu', 'Décorations Murales en Tissu', 'Maison et décoration', '/images/articles/decoration-murale-tissu.png', 804),
  -- Articles spéciaux (4)
  ('sac-main-tissu', 'Sacs à Main en Tissu', 'Articles spéciaux', '/images/articles/sac-main-tissu.png', 901),
  ('chaussettes-luxe', 'Chaussettes de Luxe', 'Articles spéciaux', '/images/articles/chaussettes-luxe.png', 902),
  ('accessoire-animaux', 'Accessoires pour Animaux', 'Articles spéciaux', '/images/articles/accessoire-animaux.png', 903),
  ('houssse-vetement-perso', 'Housses de Vêtement Personnalisées', 'Articles spéciaux', '/images/articles/housse-vetement-perso.png', 904)
ON CONFLICT (slug) DO NOTHING;

-- ℹ️ Note orthographe : le spec original utilise "houssse" pour les slugs
-- `houssse-coussin` et `houssse-vetement-perso`. Nous conservons l'ortho-
-- graphe exacte du spec pour rester aligné avec les autres livrables.


-- ============================================================
-- 3. MIGRATION DE LA TABLE articles_vetements
-- ============================================================
-- 3.1 Renomme `type_vetement` (ENUM NOT NULL) en `type_vetement_legacy`
--     et drop NOT NULL : les nouveaux INSERTs ne rempliront plus cette
--     colonne (qui n'a plus de sens avec le nouveau catalogue de 33
--     articles — l'ENUM figé à 7 valeurs ne permettait pas de couvrir
--     la diversité réelle).
-- 3.2 Ajoute `catalogue_article_id UUID` (nullable dans un 1er temps
--     pour permettre le backfill).
-- 3.3 Backfill : mappe les anciennes valeurs `type_vetement_legacy`
--     vers les slugs du nouveau catalogue :
--       chemise     → chemise
--       pantalon    → chemise (fallback — pas d'équivalent direct)
--       robe        → robe-textile-delicat
--       costume     → costume-ceremonie
--       drap        → parure-lit
--       couverture  → parure-lit (fallback)
--       autre       → chemise (fallback — à corriger manuellement si
--                     besoin, mais NOT NULL requiert une valeur)
-- 3.4 SET NOT NULL + ajout contrainte FK.
-- ============================================================

-- 3.1 — Renommage + drop NOT NULL (idempotent via DO block)
DO $$
BEGIN
  -- Renomme type_vetement → type_vetement_legacy si pas déjà fait.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'articles_vetements'
      AND column_name = 'type_vetement'
  ) THEN
    ALTER TABLE public.articles_vetements RENAME COLUMN type_vetement TO type_vetement_legacy;
  END IF;

  -- Drop NOT NULL sur type_vetement_legacy (les nouveaux INSERTs ne le
  -- rempliront plus). Idempotent.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'articles_vetements'
      AND column_name = 'type_vetement_legacy'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.articles_vetements ALTER COLUMN type_vetement_legacy DROP NOT NULL;
  END IF;
END $$;

-- 3.2 — Ajout de la colonne catalogue_article_id (idempotent)
ALTER TABLE public.articles_vetements
  ADD COLUMN IF NOT EXISTS catalogue_article_id UUID;

-- 3.3 — Backfill : mappe type_vetement_legacy → catalogue_article_id
-- On ne touche que les lignes où catalogue_article_id IS NULL.
UPDATE public.articles_vetements av
SET catalogue_article_id = sub.ca_id
FROM (
  SELECT av2.id AS av_id, ca.id AS ca_id
  FROM public.articles_vetements av2
  LEFT JOIN public.catalogue_articles ca ON ca.slug = CASE av2.type_vetement_legacy
    WHEN 'chemise'     THEN 'chemise'
    WHEN 'pantalon'    THEN 'chemise'
    WHEN 'robe'        THEN 'robe-textile-delicat'
    WHEN 'costume'     THEN 'costume-ceremonie'
    WHEN 'drap'        THEN 'parure-lit'
    WHEN 'couverture'  THEN 'parure-lit'
    WHEN 'autre'       THEN 'chemise'
    ELSE 'chemise'
  END
  WHERE av2.catalogue_article_id IS NULL
) sub
WHERE av.id = sub.av_id
  AND sub.ca_id IS NOT NULL;

-- 3.4 — SET NOT NULL + FK
-- ⚠️ Si certaines lignes n'ont pas pu être backfillées ( catalogue_article_id
-- encore NULL, par ex. en cas de problème avec le CASE), on les force au
-- slug 'chemise' (fallback ultime) avant SET NOT NULL.
UPDATE public.articles_vetements av
SET catalogue_article_id = (
  SELECT id FROM public.catalogue_articles ca WHERE ca.slug = 'chemise' LIMIT 1
)
WHERE av.catalogue_article_id IS NULL;

ALTER TABLE public.articles_vetements
  ALTER COLUMN catalogue_article_id SET NOT NULL;

-- FK vers catalogue_articles(id). RESTRICT : on ne peut pas supprimer un
-- article du catalogue s'il est déjà référencé par une commande existante.
-- Le Super Admin devra d'abord désactiver l'article (actif=false) plutôt
-- que le supprimer.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_articles_vetements_catalogue_article'
      AND conrelid = 'public.articles_vetements'::regclass
  ) THEN
    ALTER TABLE public.articles_vetements
      ADD CONSTRAINT fk_articles_vetements_catalogue_article
      FOREIGN KEY (catalogue_article_id)
      REFERENCES public.catalogue_articles(id)
      ON DELETE RESTRICT;
  END IF;
END $$;

-- Index sur catalogue_article_id pour accélérer les JOINs inverses
-- (ex: "combien de commandes utilisent cet article du catalogue ?")
CREATE INDEX IF NOT EXISTS idx_articles_vetements_catalogue_article_id
    ON public.articles_vetements (catalogue_article_id);


-- ============================================================
-- 4. MIGRATION DE LA TABLE commande_lignes (cohérence)
-- ============================================================
-- La table commande_lignes possède aussi une colonne `type_vetement`
-- (nullable). On la renomme en `type_vetement_legacy` pour cohérence
-- avec articles_vetements. On NE LUI AJOUTE PAS `catalogue_article_id`
-- car une ligne peut théoriquement agréger plusieurs articles de
-- catalogue différents (bien qu'en pratique via le wizard, 1 ligne =
-- 1 catalogue_article_id ; mais le schéma reste permissif).
-- Le nouveau code dérive l'info catalogue via JOIN articles_vetements
-- → catalogue_articles quand nécessaire.
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'commande_lignes'
      AND column_name = 'type_vetement'
  ) THEN
    ALTER TABLE public.commande_lignes RENAME COLUMN type_vetement TO type_vetement_legacy;
  END IF;
END $$;


-- ============================================================
-- 5. RLS SUR catalogue_articles
-- ============================================================
-- RLS activée. Le catalogue est GLOBAL (pas de pressing_id) :
--   - SELECT : tout utilisateur authentifié (lecture seule)
--   - INSERT / UPDATE / DELETE : réservés au Super Admin
--     (is_super_admin() = true)
--
-- Les pressings clients peuvent LIRE le catalogue (pour le picker du
-- wizard de commande) mais ne peuvent pas le modifier.
--
-- Note : `anon` n'a PAS accès au catalogue (pas de SELECT policy pour
-- anon). Le catalogue n'est utile qu'aux utilisateurs connectés.
-- ============================================================
ALTER TABLE public.catalogue_articles ENABLE ROW LEVEL SECURITY;

-- Policy SELECT : tout utilisateur authentifié peut lire.
DROP POLICY IF EXISTS catalogue_articles_select_authenticated ON public.catalogue_articles;
CREATE POLICY catalogue_articles_select_authenticated
  ON public.catalogue_articles
  FOR SELECT
  TO authenticated
  USING (true);

-- Policy WRITE : seul le Super Admin peut écrire (INSERT/UPDATE/DELETE).
-- Une seule policy FOR ALL couvre les 3 opérations.
DROP POLICY IF EXISTS catalogue_articles_write_super_admin ON public.catalogue_articles;
CREATE POLICY catalogue_articles_write_super_admin
  ON public.catalogue_articles
  FOR ALL
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());


-- ============================================================
-- 6. GRANTS
-- ============================================================
-- authenticated : SELECT sur catalogue_articles (lecture du picker).
-- Les writes passent par le service_role (API Super Admin) qui bypass RLS.
-- ============================================================
-- Note : pas de GRANT sur une SEQUENCE car la table utilise gen_random_uuid()
-- (UUID PK) et non SERIAL (pas de sequence associée).
GRANT SELECT ON public.catalogue_articles TO authenticated;


-- ============================================================
-- 7. TRIGGER updated_at automatique
-- ============================================================
-- Réutilise le trigger générique `set_updated_at()` défini dans la
-- migration 005 (PRD §18.6) pour mettre à jour `updated_at` à chaque
-- UPDATE sur catalogue_articles.
-- ============================================================
DROP TRIGGER IF EXISTS trg_catalogue_articles_set_updated_at ON public.catalogue_articles;

CREATE TRIGGER trg_catalogue_articles_set_updated_at
  BEFORE UPDATE ON public.catalogue_articles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();


-- ============================================================
-- Fin de la migration 014_lot15_catalogue_articles.sql
--
-- Vérification post-migration (à exécuter manuellement pour contrôle) :
--
--   SELECT slug, nom, categorie, icone_url, ordre_affichage, actif
--   FROM catalogue_articles
--   ORDER BY categorie, ordre_affichage;
--
--   SELECT COUNT(*) FROM articles_vetements
--   WHERE catalogue_article_id IS NULL;  -- doit renvoyer 0
--
--   SELECT COUNT(*) FROM articles_vetements
--   WHERE type_vetement_legacy IS NOT NULL;  -- ancienne donnée conservée
-- ============================================================
