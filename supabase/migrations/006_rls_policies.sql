-- ============================================================
-- OgPressing — Migration 006 : Row Level Security (RLS)
-- ============================================================
-- Fichier    : 006_rls_policies.sql
-- Version    : 1.1
-- Date       : 24/07/2026
-- Fix v1.1   : Vérification croisée des colonnes référencées vs 002_tables.sql
--              v1.2 — TOUTES les colonnes utilisées dans les policies existent
--              (super_admins.user_id, personnel.user_id/pressing_id,
--              commandes.pressing_id, *_commande_id, *_produit_id,
--              codes_activation.code/utilise). Aucune correction nécessaire,
--              la v1.0 était déjà alignée.
-- Description : Activation de RLS + policies d'isolation multi-tenant
--               sur les 17 tables du schéma OgPressing (PRD §18.4).
--
-- Principes de sécurité :
--   1. Isolation stricte par pressing_id (multi-tenant SaaS)
--      → un employé ne voit QUE les données de son pressing.
--   2. Super Admin = accès total sur toutes les tables (bypass isolation).
--   3. demandes_inscription / codes_activation = exceptions publiques
--      contrôlées pour la landing page et l'activation de compte.
--   4. super_admins = réservé au Super Admin uniquement.
--
-- Prérequis :
--   - Migration 001 (enums) exécutée ✅
--   - Migrations 002 → 005 (tables + contraintes + index) exécutées
--   - Les 17 tables ci-dessous doivent exister dans le schéma public
--
-- Helpers utilisés (définis en Section 0) :
--   - public.is_super_admin()              → BOOLEAN
--   - public.get_pressing_id_utilisateur() → UUID
--
-- ⚠️  À exécuter APRÈS la création des tables.
--     Idempotent : DROP POLICY IF EXISTS + CREATE OR REPLACE FUNCTION.
-- ============================================================


-- ============================================================
-- SECTION 0 : Fonctions utilitaires de sécurité (SECURITY DEFINER)
-- ============================================================
-- Ces deux fonctions sont SECURITY DEFINER et appartiennent au
-- rôle propriétaire (postgres) → elles BYPASS le RLS.
-- Sans cela, on aurait une boucle infinie : is_super_admin() lirait
-- super_admins qui est protégé par is_super_admin()...
--
-- Si ces fonctions ont déjà été créées dans une migration antérieure
-- (par exemple 002 ou 003), CREATE OR REPLACE les met à jour
-- sans erreur (idempotent).
--
-- Convention colonnes supposées (à vérifier vs 002_tables.sql) :
--   - super_admins.user_id   UUID REFERENCES auth.users(id)
--   - personnel.user_id      UUID REFERENCES auth.users(id)
--   - personnel.pressing_id  UUID REFERENCES pressing(id)
-- ============================================================

-- 0.1. is_super_admin()
--      Retourne TRUE si l'utilisateur authentifié courant (auth.uid())
--      possède une ligne dans public.super_admins.
--      Utilisée pour donner l'accès total au Super Admin sur toutes
--      les tables métier.
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.super_admins sa
        WHERE sa.user_id = auth.uid()
    );
$$;

-- 0.2. get_pressing_id_utilisateur()
--      Retourne l'UUID du pressing auquel appartient l'utilisateur
--      authentifié courant (via la table personnel).
--      Retourne NULL si l'utilisateur n'est pas lié à un pressing
--      (ex : Super Admin, ou compte non encore activé).
--      Utilisée pour l'isolation multi-tenant : chaque employé ne
--      voit QUE les données de son pressing.
CREATE OR REPLACE FUNCTION public.get_pressing_id_utilisateur()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT p.pressing_id
    FROM public.personnel p
    WHERE p.user_id = auth.uid()
    LIMIT 1;
$$;

-- Documentation des fonctions
COMMENT ON FUNCTION public.is_super_admin() IS
    'Retourne TRUE si auth.uid() est un Super Admin OgPressing. SECURITY DEFINER (bypass RLS interne).';
COMMENT ON FUNCTION public.get_pressing_id_utilisateur() IS
    'Retourne le pressing_id de l''utilisateur courant (via personnel). NULL si non lié. SECURITY DEFINER (bypass RLS interne).';


-- ============================================================
-- SECTION 1 : Activation de RLS sur les 17 tables
-- ============================================================
-- ALTER TABLE ... ENABLE ROW LEVEL SECURITY active le filtrage RLS.
-- Sans policy associée, RLS bloque TOUT (deny by default) sauf pour
-- les rôles BYPASSRLS (service_role, postgres superuser).
--
-- Les 17 tables :
--   1.  super_admins          (réservée Super Admin)
--   2.  demandes_inscription  (insert publique + Super Admin)
--   3.  codes_activation      (lecture publique limitée + Super Admin)
--   4.  pressing              (isolation par id, pas de pressing_id)
--   5.  abonnements           (pressing_id direct)
--   6.  personnel             (pressing_id direct)
--   7.  clients               (pressing_id direct)
--   8.  services              (pressing_id direct)
--   9.  commandes             (pressing_id direct)
--   10. commande_lignes       (join commandes)
--   11. articles_vetements    (join commandes)
--   12. paiements             (join commandes)
--   13. produits_stock        (pressing_id direct)
--   14. mouvements_stock      (join produits_stock)
--   15. machines              (pressing_id direct)
--   16. anomalies             (pressing_id direct)
--   17. depenses              (pressing_id direct)
-- ============================================================

ALTER TABLE public.super_admins          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.demandes_inscription  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.codes_activation      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pressing              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.abonnements           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personnel             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commandes             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commande_lignes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.articles_vetements    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paiements             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produits_stock        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mouvements_stock      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.machines              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anomalies             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.depenses              ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- SECTION 2 : Table super_admins
-- ============================================================
-- Accès réservé EXCLUSIVEMENT au Super Admin.
-- Le tout 1er Super Admin est inséré via service_role (bypass RLS)
-- lors de l'initialisation de la plateforme (script bootstrap).
-- Aucun accès public, aucun accès pressing.
-- ============================================================

-- Policy : super_admin_full_access
-- Le Super Admin peut tout faire (SELECT, INSERT, UPDATE, DELETE).
DROP POLICY IF EXISTS "super_admin_full_access" ON public.super_admins;
CREATE POLICY "super_admin_full_access" ON public.super_admins
    FOR ALL
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());


-- ============================================================
-- SECTION 3 : Tables demandes_inscription & codes_activation
-- ============================================================
-- Ces tables servent au funnel d'acquisition SaaS :
--   - Landing page (publique) → INSERT dans demandes_inscription
--   - Page d'activation (publique) → SELECT limité dans codes_activation
--   - Dashboard Super Admin → gestion complète
--
-- Exceptions publiques contrôlées :
--   - demandes_inscription : INSERT public (anon) pour le formulaire
--     de la landing page (le prospect n'est pas authentifié).
--   - codes_activation : SELECT public (anon) limité aux colonnes
--     "code" et "utilise" (restriction column-level via GRANT) pour
--     permettre la vérification d'un code d'activation sans exposer
--     les colonnes sensibles (pressing_id_cible, date_expiration, etc.).
-- ============================================================

-- 3.1. demandes_inscription
-- -----

-- Policy : super_admin_full_access
-- Le Super Admin gère toutes les demandes (lecture, changement de
-- statut : en_attente → contactee → validee/refusee, suppression).
DROP POLICY IF EXISTS "super_admin_full_access" ON public.demandes_inscription;
CREATE POLICY "super_admin_full_access" ON public.demandes_inscription
    FOR ALL
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

-- Policy : demande_insert_public
-- Exception publique : le formulaire de la landing page (rôle anon,
-- non authentifié) peut INSERER une nouvelle demande d'inscription.
-- Aucune lecture / modification / suppression publique : un anon ne
-- peut donc pas lister les demandes des autres prospects.
DROP POLICY IF EXISTS "demande_insert_public" ON public.demandes_inscription;
CREATE POLICY "demande_insert_public" ON public.demandes_inscription
    FOR INSERT
    TO anon
    WITH CHECK (true);


-- 3.2. codes_activation
-- -----

-- Policy : super_admin_full_access
-- Le Super Admin génère, lit, marque comme utilisé, supprime les codes.
DROP POLICY IF EXISTS "super_admin_full_access" ON public.codes_activation;
CREATE POLICY "super_admin_full_access" ON public.codes_activation
    FOR ALL
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

-- Policy : code_read_public
-- Exception publique : la page d'activation (rôle anon) peut LIRE
-- les codes pour vérifier la validité d'un code saisi.
-- ⚠️  La restriction aux colonnes "code" et "utilise" se fait par
--     GRANT column-level (ci-dessous), PAS par RLS (RLS filtre des
--     lignes, pas des colonnes). RLS autorise toutes les lignes ;
--     le GRANT limite les colonnes visibles par anon.
DROP POLICY IF EXISTS "code_read_public" ON public.codes_activation;
CREATE POLICY "code_read_public" ON public.codes_activation
    FOR SELECT
    TO anon
    USING (true);

-- Restriction column-level : on retire d'abord l'éventuel SELECT
-- large accordé à anon par défaut (Supabase accorde souvent SELECT
-- à anon/authenticated sur les nouvelles tables), puis on n'accorde
-- QUE les colonnes "code" et "utilise".
-- → anon peut faire : SELECT code, utilise FROM codes_activation WHERE code = $1
-- → anon NE peut PAS faire : SELECT pressing_id_cible FROM codes_activation
--    (erreur : permission denied for column pressing_id_cible)
REVOKE SELECT ON public.codes_activation FROM anon;
GRANT SELECT (code, utilise) ON public.codes_activation TO anon;


-- ============================================================
-- SECTION 4 : Table pressing (isolation par id)
-- ============================================================
-- La table pressing N'A PAS de colonne pressing_id : elle EST le
-- pressing. L'isolation se fait donc sur la colonne primaire "id".
-- Un employé ne voit QUE la ligne de son propre pressing.
--
-- Subtilité INSERT : la policy isolation_pressing impose
--   WITH CHECK (id = get_pressing_id_utilisateur()).
-- Or un utilisateur non encore lié à un pressing renvoie NULL →
-- la condition est toujours false → l'INSERT par un non-Super-Admin
-- est bloqué. C'est le comportement attendu : la création d'un
-- pressing se fait via service_role dans le flow d'activation
-- (code_activation → création pressing + compte admin).
-- ============================================================

-- Policy : super_admin_full_access
DROP POLICY IF EXISTS "super_admin_full_access" ON public.pressing;
CREATE POLICY "super_admin_full_access" ON public.pressing
    FOR ALL
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

-- Policy : isolation_pressing (id = pressing_id de l'utilisateur)
DROP POLICY IF EXISTS "isolation_pressing" ON public.pressing;
CREATE POLICY "isolation_pressing" ON public.pressing
    FOR ALL
    USING (id = public.get_pressing_id_utilisateur())
    WITH CHECK (id = public.get_pressing_id_utilisateur());


-- ============================================================
-- SECTION 5 : Tables avec pressing_id DIRECT — partie 1
--              abonnements, personnel, clients, services
-- ============================================================
-- Pattern identique pour chaque table :
--   - super_admin_full_access : tout si is_super_admin()
--   - isolation_pressing      : tout si pressing_id de la ligne
--                               = get_pressing_id_utilisateur()
--
-- FOR ALL couvre SELECT / INSERT / UPDATE / DELETE :
--   - USING(...)  filtre SELECT, UPDATE (old row), DELETE
--   - WITH CHECK(...) valide INSERT et UPDATE (new row)
-- ============================================================

-- 5.1. abonnements (un pressing → plusieurs échéances d'abonnement)
DROP POLICY IF EXISTS "super_admin_full_access" ON public.abonnements;
CREATE POLICY "super_admin_full_access" ON public.abonnements
    FOR ALL
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "isolation_pressing" ON public.abonnements;
CREATE POLICY "isolation_pressing" ON public.abonnements
    FOR ALL
    USING (pressing_id = public.get_pressing_id_utilisateur())
    WITH CHECK (pressing_id = public.get_pressing_id_utilisateur());


-- 5.2. personnel (les employés du pressing — dont l'utilisateur courant)
-- ⚠️  Un employé peut voir la liste de ses collègues (même pressing),
--     mais ne peut pas créer/modifier un compte collègue sans être
--     manager/admin. Le filtrage fin par rôle se fera côté application
--     (l'API vérifie le rôle avant d'écrire). RLS garantit juste
--     l'isolation par pressing.
DROP POLICY IF EXISTS "super_admin_full_access" ON public.personnel;
CREATE POLICY "super_admin_full_access" ON public.personnel
    FOR ALL
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "isolation_pressing" ON public.personnel;
CREATE POLICY "isolation_pressing" ON public.personnel
    FOR ALL
    USING (pressing_id = public.get_pressing_id_utilisateur())
    WITH CHECK (pressing_id = public.get_pressing_id_utilisateur());


-- 5.3. clients (le fichier clients du pressing)
DROP POLICY IF EXISTS "super_admin_full_access" ON public.clients;
CREATE POLICY "super_admin_full_access" ON public.clients
    FOR ALL
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "isolation_pressing" ON public.clients;
CREATE POLICY "isolation_pressing" ON public.clients
    FOR ALL
    USING (pressing_id = public.get_pressing_id_utilisateur())
    WITH CHECK (pressing_id = public.get_pressing_id_utilisateur());


-- 5.4. services (la grille tarifaire des services du pressing)
DROP POLICY IF EXISTS "super_admin_full_access" ON public.services;
CREATE POLICY "super_admin_full_access" ON public.services
    FOR ALL
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "isolation_pressing" ON public.services;
CREATE POLICY "isolation_pressing" ON public.services
    FOR ALL
    USING (pressing_id = public.get_pressing_id_utilisateur())
    WITH CHECK (pressing_id = public.get_pressing_id_utilisateur());


-- ============================================================
-- SECTION 6 : Table commandes (pressing_id direct)
-- ============================================================
-- Cœur du métier : une commande appartient à un pressing et à un client.
-- L'isolation par pressing_id garantit qu'un employé ne voit que les
-- commandes de son pressing.
-- ============================================================

DROP POLICY IF EXISTS "super_admin_full_access" ON public.commandes;
CREATE POLICY "super_admin_full_access" ON public.commandes
    FOR ALL
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "isolation_pressing" ON public.commandes;
CREATE POLICY "isolation_pressing" ON public.commandes
    FOR ALL
    USING (pressing_id = public.get_pressing_id_utilisateur())
    WITH CHECK (pressing_id = public.get_pressing_id_utilisateur());


-- ============================================================
-- SECTION 7 : Table produits_stock (pressing_id direct)
-- ============================================================
-- Le catalogue des biodétergents suivis en stock par le pressing.
-- Les mouvements_stock (Section 10) y font référence.
-- ============================================================

DROP POLICY IF EXISTS "super_admin_full_access" ON public.produits_stock;
CREATE POLICY "super_admin_full_access" ON public.produits_stock
    FOR ALL
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "isolation_pressing" ON public.produits_stock;
CREATE POLICY "isolation_pressing" ON public.produits_stock
    FOR ALL
    USING (pressing_id = public.get_pressing_id_utilisateur())
    WITH CHECK (pressing_id = public.get_pressing_id_utilisateur());


-- ============================================================
-- SECTION 8 : Tables machines, anomalies, depenses (pressing_id direct)
-- ============================================================

-- 8.1. machines (laveuses, calandres, etc. du pressing)
DROP POLICY IF EXISTS "super_admin_full_access" ON public.machines;
CREATE POLICY "super_admin_full_access" ON public.machines
    FOR ALL
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "isolation_pressing" ON public.machines;
CREATE POLICY "isolation_pressing" ON public.machines
    FOR ALL
    USING (pressing_id = public.get_pressing_id_utilisateur())
    WITH CHECK (pressing_id = public.get_pressing_id_utilisateur());


-- 8.2. anomalies (incidents déclarés par le personnel sur les commandes)
DROP POLICY IF EXISTS "super_admin_full_access" ON public.anomalies;
CREATE POLICY "super_admin_full_access" ON public.anomalies
    FOR ALL
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "isolation_pressing" ON public.anomalies;
CREATE POLICY "isolation_pressing" ON public.anomalies
    FOR ALL
    USING (pressing_id = public.get_pressing_id_utilisateur())
    WITH CHECK (pressing_id = public.get_pressing_id_utilisateur());


-- 8.3. depenses (dépenses du pressing — activé en Phase 2 post-MVP)
DROP POLICY IF EXISTS "super_admin_full_access" ON public.depenses;
CREATE POLICY "super_admin_full_access" ON public.depenses
    FOR ALL
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "isolation_pressing" ON public.depenses;
CREATE POLICY "isolation_pressing" ON public.depenses
    FOR ALL
    USING (pressing_id = public.get_pressing_id_utilisateur())
    WITH CHECK (pressing_id = public.get_pressing_id_utilisateur());


-- ============================================================
-- SECTION 9 : Tables sans pressing_id direct (JOIN via commandes)
--              commande_lignes, articles_vetements, paiements
-- ============================================================
-- Ces tables référencent une commande (commande_id) mais n'ont pas
-- de colonne pressing_id directe. L'isolation vérifie donc que la
-- commande parente appartient au pressing de l'utilisateur via un
-- sous-requête EXISTS.
--
-- Colonnes FK supposées (à vérifier/adapter vs 002_tables.sql) :
--   - commande_lignes.commande_id    → commandes.id
--   - articles_vetements.commande_id → commandes.id
--   - paiements.commande_id          → commandes.id
--
-- ⚠️  Le sous-requête EXISTS délègue à la policy RLS de commandes :
--     comme commandes a sa propre policy isolation_pressing, un
--     employé ne pourra jamais joindre une ligne à une commande
--     d'un autre pressing (double sécurité).
-- ============================================================

-- 9.1. commande_lignes (lignes détaillées d'une commande : service + qté + prix)
DROP POLICY IF EXISTS "super_admin_full_access" ON public.commande_lignes;
CREATE POLICY "super_admin_full_access" ON public.commande_lignes
    FOR ALL
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "isolation_pressing" ON public.commande_lignes;
CREATE POLICY "isolation_pressing" ON public.commande_lignes
    FOR ALL
    USING (
        EXISTS (
            SELECT 1
            FROM public.commandes c
            WHERE c.id = commande_lignes.commande_id
              AND c.pressing_id = public.get_pressing_id_utilisateur()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.commandes c
            WHERE c.id = commande_lignes.commande_id
              AND c.pressing_id = public.get_pressing_id_utilisateur()
        )
    );


-- 9.2. articles_vetements (chaque vêtement individuel d'une commande)
DROP POLICY IF EXISTS "super_admin_full_access" ON public.articles_vetements;
CREATE POLICY "super_admin_full_access" ON public.articles_vetements
    FOR ALL
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "isolation_pressing" ON public.articles_vetements;
CREATE POLICY "isolation_pressing" ON public.articles_vetements
    FOR ALL
    USING (
        EXISTS (
            SELECT 1
            FROM public.commandes c
            WHERE c.id = articles_vetements.commande_id
              AND c.pressing_id = public.get_pressing_id_utilisateur()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.commandes c
            WHERE c.id = articles_vetements.commande_id
              AND c.pressing_id = public.get_pressing_id_utilisateur()
        )
    );


-- 9.3. paiements (règlements enregistrés sur une commande)
-- ⚠️  PRINCIPE FONDAMENTAL : AUCUNE intégration de paiement.
--     Les paiements sont purement déclaratifs (le caissier enregistre
--     un règlement reçu hors application). RLS garantit juste qu'un
--     pressing ne voit pas les paiements d'un autre pressing.
DROP POLICY IF EXISTS "super_admin_full_access" ON public.paiements;
CREATE POLICY "super_admin_full_access" ON public.paiements
    FOR ALL
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "isolation_pressing" ON public.paiements;
CREATE POLICY "isolation_pressing" ON public.paiements
    FOR ALL
    USING (
        EXISTS (
            SELECT 1
            FROM public.commandes c
            WHERE c.id = paiements.commande_id
              AND c.pressing_id = public.get_pressing_id_utilisateur()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.commandes c
            WHERE c.id = paiements.commande_id
              AND c.pressing_id = public.get_pressing_id_utilisateur()
        )
    );


-- ============================================================
-- SECTION 10 : Table mouvements_stock (JOIN via produits_stock)
-- ============================================================
-- mouvements_stock référence un produit (produit_id) mais n'a pas
-- de pressing_id direct. L'isolation vérifie que le produit parent
-- appartient au pressing de l'utilisateur.
--
-- Colonne FK supposée (à vérifier/adapter vs 002_tables.sql) :
--   - mouvements_stock.produit_id → produits_stock.id
-- ============================================================

DROP POLICY IF EXISTS "super_admin_full_access" ON public.mouvements_stock;
CREATE POLICY "super_admin_full_access" ON public.mouvements_stock
    FOR ALL
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "isolation_pressing" ON public.mouvements_stock;
CREATE POLICY "isolation_pressing" ON public.mouvements_stock
    FOR ALL
    USING (
        EXISTS (
            SELECT 1
            FROM public.produits_stock p
            WHERE p.id = mouvements_stock.produit_id
              AND p.pressing_id = public.get_pressing_id_utilisateur()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.produits_stock p
            WHERE p.id = mouvements_stock.produit_id
              AND p.pressing_id = public.get_pressing_id_utilisateur()
        )
    );


-- ============================================================
-- Fin de la migration 006_rls_policies.sql
-- ============================================================
-- Récapitulatif :
--   - 2 fonctions SECURITY DEFINER (is_super_admin, get_pressing_id_utilisateur)
--   - 17 tables avec RLS activé (ENABLE ROW LEVEL SECURITY)
--   - 33 policies au total :
--       * super_admins           : 1 policy  (super_admin_full_access)
--       * demandes_inscription   : 2 policies (super_admin_full_access + demande_insert_public)
--       * codes_activation       : 2 policies (super_admin_full_access + code_read_public)
--                                            + GRANT column-level (code, utilise) pour anon
--       * pressing               : 2 policies (super_admin_full_access + isolation_pressing sur id)
--       * 13 tables restantes    : 2 policies chacune
--                                  (super_admin_full_access + isolation_pressing)
--                                  → abonnements, personnel, clients, services, commandes,
--                                    commande_lignes, articles_vetements, paiements,
--                                    produits_stock, mouvements_stock, machines,
--                                    anomalies, depenses
--
-- Total : 1 + 2 + 2 + 2 + (13 × 2) = 33 policies
--
-- Vérification post-déploiement (à exécuter dans le SQL Editor Supabase) :
--   SELECT tablename, rowsecurity
--   FROM pg_tables
--   WHERE schemaname = 'public'
--   ORDER BY tablename;
--   → rowsecurity = true pour les 17 tables.
--
--   SELECT tablename, policyname, cmd, roles
--   FROM pg_policies
--   WHERE schemaname = 'public'
--   ORDER BY tablename, policyname;
--   → 33 lignes attendues.
-- ============================================================
