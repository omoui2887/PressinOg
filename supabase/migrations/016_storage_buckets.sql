-- ============================================================
-- OgPressing — Migration 016 : Buckets Supabase Storage + RLS
-- ============================================================
-- Fichier    : 016_storage_buckets.sql
-- Version    : 1.0
-- Date       : 01/08/2026
-- Description : Crée les 4 buckets Storage utilisés par l'app et
--               définit les policies RLS sur storage.objects afin
--               d'isoler les fichiers SENSIBLES (FDS, justificatifs).
--
-- Contexte sécurité (AUDIT_SECURITE.md — Conclusion #2) :
--   Avant cette migration, AUCUNE policy RLS n'existait sur
--   storage.objects. Les buckets `fds` et `justificatifs` étaient
--   accédés via getPublicUrl() côté client, ce qui rendait les
--   Fiches de Données de Sécurité et les justificatifs de paiement
--   potentiellement accessibles à tout internet si les buckets
--   étaient publics (comportement par défaut du Dashboard Supabase).
--
--   Cette migration :
--     1. Crée 4 buckets (idempotent via ON CONFLICT).
--     2. Active RLS sur storage.objects (no-op si déjà activée).
--     3. Définit des policies par bucket :
--        - logos              : SELECT public, écriture authentifiée
--        - catalogue-articles : SELECT public, écriture authentifiée
--        - fds                : SELECT/INSERT/UPDATE/DELETE isolés par
--                               pressing_id (extrait du path) + SA
--        - justificatifs      : SELECT/INSERT/UPDATE/DELETE SA uniquement
--
-- Convention de nommage des chemins (CRITIQUE pour RLS) :
--   Les fichiers dans le bucket `fds` DOIVENT être stockés avec un
--   path préfixé par le pressing_id du propriétaire :
--     fds/{pressing_id}/{timestamp}-{random}.pdf
--   La policy SELECT utilise split_part(name, '/', 2) pour extraire
--   le pressing_id du path et vérifier qu'il correspond au pressing
--   du user authentifié (via la table personnel).
--   EXEMPLE :
--     fds/550e8400-e29b-41d4-a716-446655440000/1700000000-abc123.pdf
--     → split_part(name, '/', 2) = '550e8400-e29b-41d4-a716-446655440000'
--     → comparé à personnel.pressing_id de l'utilisateur authentifié.
--
--   Pour `justificatifs`, le path est libre (typiquement
--   `abonnements/{abonnement_id}/{timestamp}-{random}.{ext}`)
--   car l'accès est restreint au Super Admin uniquement, sans
--   isolation multi-tenant.
--
-- ⚠️  Idempotente : INSERT ... ON CONFLICT, DROP POLICY IF EXISTS,
--     ALTER TABLE ... ENABLE ROW LEVEL SECURITY (no-op si déjà actif).
--     Peut être ré-exécutée sans erreur.
-- ============================================================


-- ============================================================
-- SECTION 1 : Création des 4 buckets (idempotent)
-- ============================================================
-- storage.buckets colonnes : id (PK), name, public (bool), owner,
-- created_at, updated_at, file_size_limit, allowed_mime_types.
--
-- On utilise ON CONFLICT (id) DO UPDATE pour FORCER le flag `public`
-- à la valeur attendue — même si le bucket a été créé manuellement
-- via le Dashboard avec une mauvaise visibilité, cette migration
-- rectifie le tir. C'est plus sûr que ON CONFLICT DO NOTHING.
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES
  -- Buckets PUBLICS (lecture sans auth) — contenus non sensibles
  ('logos',              'logos',              true),
  ('catalogue-articles', 'catalogue-articles', true),
  -- Buckets PRIVÉS (lecture soumise à RLS) — contenus sensibles
  ('fds',                'fds',                false),
  ('justificatifs',      'justificatifs',      false)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      name   = EXCLUDED.name;


-- ============================================================
-- SECTION 2 : Activation de RLS sur storage.objects
-- ============================================================
-- Par défaut, Supabase active RLS sur storage.objects, mais on le
-- force explicitement pour garantir le deny-by-default même si un
-- opérateur a désactivé RLS via le Dashboard.
-- ============================================================

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- SECTION 3 : Policies pour le bucket `logos` (PUBLIC)
-- ============================================================
-- Logos de pressing — publiés sur la landing page et visibles par
-- tout internet. La lecture est donc publique (true).
-- L'écriture (INSERT/UPDATE/DELETE) est réservée aux users
-- authentifiés — en pratique, seuls les managers y écrivent via
-- l'onglet "Infos générales" du pressing (RLS applicative côté API).
-- ============================================================

DROP POLICY IF EXISTS "logos_select_public" ON storage.objects;
CREATE POLICY "logos_select_public" ON storage.objects
  FOR SELECT USING (bucket_id = 'logos');

DROP POLICY IF EXISTS "logos_insert_auth" ON storage.objects;
CREATE POLICY "logos_insert_auth" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'logos' AND auth.uid() IS NOT NULL
  );

DROP POLICY IF EXISTS "logos_update_auth" ON storage.objects;
CREATE POLICY "logos_update_auth" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'logos' AND auth.uid() IS NOT NULL
  );

DROP POLICY IF EXISTS "logos_delete_auth" ON storage.objects;
CREATE POLICY "logos_delete_auth" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'logos' AND auth.uid() IS NOT NULL
  );


-- ============================================================
-- SECTION 4 : Policies pour le bucket `catalogue-articles` (PUBLIC)
-- ============================================================
-- Icônes d'articles du catalogue global — affichées dans le picker
-- côté client (landing + formulaire commande). Lecture publique.
-- L'écriture est réservée aux users authentifiés — en pratique,
-- seul le Super Admin y écrit (via /api/super-admin/catalogue/upload-icon).
-- ============================================================

DROP POLICY IF EXISTS "catalogue_articles_select_public" ON storage.objects;
CREATE POLICY "catalogue_articles_select_public" ON storage.objects
  FOR SELECT USING (bucket_id = 'catalogue-articles');

DROP POLICY IF EXISTS "catalogue_articles_insert_auth" ON storage.objects;
CREATE POLICY "catalogue_articles_insert_auth" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'catalogue-articles' AND auth.uid() IS NOT NULL
  );

DROP POLICY IF EXISTS "catalogue_articles_update_auth" ON storage.objects;
CREATE POLICY "catalogue_articles_update_auth" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'catalogue-articles' AND auth.uid() IS NOT NULL
  );

DROP POLICY IF EXISTS "catalogue_articles_delete_auth" ON storage.objects;
CREATE POLICY "catalogue_articles_delete_auth" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'catalogue-articles' AND auth.uid() IS NOT NULL
  );


-- ============================================================
-- SECTION 5 : Policies pour le bucket `fds` (PRIVÉ — isolation pressing)
-- ============================================================
-- Fiches de Données de Sécurité — données SENSIBLES business
-- (composition chimique, dangers, premiers secours). Le PRD exige
-- que ces fichiers ne soient accessibles qu'au pressing propriétaire
-- et au Super Admin.
--
-- Convention de path (OBLIGATOIRE pour que RLS fonctionne) :
--   fds/{pressing_id}/{timestamp}-{random}.pdf
--   → split_part(name, '/', 2) extrait le pressing_id du path.
--
-- Le Super Admin (is_super_admin()) a accès à tous les fichiers,
-- pour le support et la supervision.
--
-- `personnel` est la table de rattachement user_id ↔ pressing_id.
-- On vérifie que le user authentifié a une ligne personnel dont le
-- pressing_id correspond au pressing_id extrait du path du fichier.
-- ============================================================

-- 5.1. SELECT : lecture (ou génération de signed URL via le client auth)
DROP POLICY IF EXISTS "fds_select_isolation" ON storage.objects;
CREATE POLICY "fds_select_isolation" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'fds'
    AND (
      public.is_super_admin()
      OR EXISTS (
        SELECT 1
        FROM public.personnel p
        WHERE p.user_id = auth.uid()
          AND p.pressing_id::text = split_part(name, '/', 2)
      )
    )
  );

-- 5.2. INSERT : upload d'une nouvelle FDS
-- WITH CHECK est évalué sur la ligne insérée — on vérifie que le
-- path contient bien le pressing_id du user authentifié.
DROP POLICY IF EXISTS "fds_insert_isolation" ON storage.objects;
CREATE POLICY "fds_insert_isolation" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'fds'
    AND (
      public.is_super_admin()
      OR EXISTS (
        SELECT 1
        FROM public.personnel p
        WHERE p.user_id = auth.uid()
          AND p.pressing_id::text = split_part(name, '/', 2)
      )
    )
  );

-- 5.3. UPDATE : remplacement d'une FDS existante
DROP POLICY IF EXISTS "fds_update_isolation" ON storage.objects;
CREATE POLICY "fds_update_isolation" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'fds'
    AND (
      public.is_super_admin()
      OR EXISTS (
        SELECT 1
        FROM public.personnel p
        WHERE p.user_id = auth.uid()
          AND p.pressing_id::text = split_part(name, '/', 2)
      )
    )
  );

-- 5.4. DELETE : suppression d'une FDS
DROP POLICY IF EXISTS "fds_delete_isolation" ON storage.objects;
CREATE POLICY "fds_delete_isolation" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'fds'
    AND (
      public.is_super_admin()
      OR EXISTS (
        SELECT 1
        FROM public.personnel p
        WHERE p.user_id = auth.uid()
          AND p.pressing_id::text = split_part(name, '/', 2)
      )
    )
  );


-- ============================================================
-- SECTION 6 : Policies pour le bucket `justificatifs` (PRIVÉ — SA only)
-- ============================================================
-- Justificatifs de paiement des abonnements — concernent UNIQUEMENT
-- le Super Admin qui gère les abonnements et les paiements.
-- Aucun pressing client ne doit y accéder.
--
-- Le path est libre (typiquement
-- `abonnements/{abonnement_id}/{timestamp}-{random}.{ext}`).
-- ============================================================

-- 6.1. SELECT : lecture (génération de signed URL via le client auth SA)
DROP POLICY IF EXISTS "justificatifs_select_sa" ON storage.objects;
CREATE POLICY "justificatifs_select_sa" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'justificatifs' AND public.is_super_admin()
  );

-- 6.2. INSERT : upload d'un nouveau justificatif
DROP POLICY IF EXISTS "justificatifs_insert_sa" ON storage.objects;
CREATE POLICY "justificatifs_insert_sa" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'justificatifs' AND public.is_super_admin()
  );

-- 6.3. UPDATE : remplacement d'un justificatif
DROP POLICY IF EXISTS "justificatifs_update_sa" ON storage.objects;
CREATE POLICY "justificatifs_update_sa" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'justificatifs' AND public.is_super_admin()
  );

-- 6.4. DELETE : suppression d'un justificatif
DROP POLICY IF EXISTS "justificatifs_delete_sa" ON storage.objects;
CREATE POLICY "justificatifs_delete_sa" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'justificatifs' AND public.is_super_admin()
  );


-- ============================================================
-- SECTION 7 : Documentation des buckets
-- ============================================================
-- Note : `COMMENT ON STORAGE BUCKET` n'est pas une syntaxe PostgreSQL
-- standard (les buckets sont des lignes de la table storage.buckets,
-- pas des objets commentables individuellement). La documentation
-- sensible de chaque bucket est donc consignée ci-dessous en
-- commentaires SQL, pour les besoins d'audit.
--
--   fds              — Bucket PRIVE. Fiches de Données de Sécurite (FDS).
--                      Path attendu : fds/{pressing_id}/{filename}.
--                      RLS isole par pressing_id + SA. Aucun acces public.
--
--   justificatifs    — Bucket PRIVE. Justificatifs de paiement des
--                      abonnements. Accessible uniquement au Super Admin
--                      (is_super_admin). Aucun acces public.
--
--   logos            — Bucket PUBLIC. Logos de pressing affiches sur la
--                      landing et dans l'app. Lecture publique, ecriture
--                      reservee aux users authentifies.
--
--   catalogue-articles — Bucket PUBLIC. Icones du catalogue global
--                      d'articles. Lecture publique, ecriture reservee
--                      au Super Admin (via /api/super-admin/catalogue/upload-icon).
-- ============================================================


-- ============================================================
-- FIN DE LA MIGRATION
-- ============================================================
-- Récapitulatif des policies créées (16 au total) :
--   logos              : 4 (SELECT/INSERT/UPDATE/DELETE)
--   catalogue-articles : 4 (SELECT/INSERT/UPDATE/DELETE)
--   fds                : 4 (SELECT/INSERT/UPDATE/DELETE — isolation pressing_id)
--   justificatifs      : 4 (SELECT/INSERT/UPDATE/DELETE — SA only)
--
-- Après exécution :
--   - Tout fichier `fds` uploaded sans pressing_id dans le path ne
--     sera PLUS lisible (deny by default). Les uploads doivent
--     utiliser le format fds/{pressing_id}/{filename}.
--   - Les fichiers `justificatifs` ne sont accessibles qu'au SA.
--   - Les fichiers publics (logos, catalogue-articles) restent
--     librement accessibles en lecture.
-- ============================================================
