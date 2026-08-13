-- ============================================================
-- e-pressing — Migration 002 : Création des 17 tables
-- ============================================================
-- Fichier    : 002_tables.sql
-- Version    : 1.2
-- Date       : 24/07/2026
-- Fix v1.1   : Réordonnancement pressing (§3) AVANT codes_activation (§4)
--              pour résoudre l'erreur 42P01 "relation public.pressing
--              does not exist" causée par une forward reference FK.
-- Fix v1.2   : CREATE TABLE IF NOT EXISTS partout → migration idempotente.
--              Permet de re-exécuter 002 sans erreur si des tables ont été
--              créées partiellement lors d'une exécution précédente qui a
--              échoué (cas SQL Editor Supabase en mode autocommit).
-- Description : Création des 17 tables du schéma e-pressing
--               (PRD V1.2 §18.3).
--
-- Convention :
--   - Noms de tables en minuscules avec underscores (snake_case)
--   - Clés primaires : id UUID DEFAULT gen_random_uuid()
--   - Horodatage : created_at / updated_at TIMESTAMPTZ DEFAULT NOW()
--   - Montants en FCFA stockés en INTEGER (le FCFA n'a pas de centimes)
--   - Références à auth.users(id) pour les comptes Supabase Auth
--
-- Prérequis :
--   - Migration 001 (21 enums) exécutée ✅
--   - Extension pgcrypto active (gen_random_uuid) — défaut Supabase
--
-- Ordre de création : parents avant enfants (FK inline).
--   1. super_admins          (aucune FK métier)
--   2. demandes_inscription  → super_admins
--   3. pressing              (aucune FK métier)
--   4. codes_activation      → pressing, super_admins
--   5. abonnements           → pressing
--   6. personnel             → pressing, auth.users
--   7. clients               → pressing
--   8. services              → pressing
--   9. commandes             → pressing, clients
--  10. commande_lignes       → commandes, services
--  11. articles_vetements    → commandes, commande_lignes
--  12. paiements             → commandes
--  13. produits_stock        → pressing
--  14. mouvements_stock      → produits_stock
--  15. machines              → pressing
--  16. anomalies             → pressing, commandes, articles_vetements
--  17. depenses              → pressing
--
-- ⚠️  FIX v1.1 (24/07/2026) : pressing est créée AVANT codes_activation
--      car codes_activation.pressing_id_cible référence pressing(id).
--      PostgreSQL n'autorise pas les forward references dans les FK
--      au moment du CREATE TABLE → ERREUR 42P01 si l'ordre est inversé.
--
-- ⚠️  À exécuter APRÈS 001_enums.sql et AVANT 003/004/005/006.
-- ============================================================


-- ============================================================
-- 1. super_admins
--    Comptes Super Admin e-pressing (gestion SaaS multi-tenant).
--    Liés 1-1 à auth.users (Supabase Auth). RLS réservée au Super Admin.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.super_admins (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID        NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    nom_complet     TEXT        NOT NULL,
    email           TEXT        NOT NULL UNIQUE,
    telephone       TEXT,
    actif           BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================
-- 2. demandes_inscription
--    Prospects qui remplissent le formulaire de la landing page.
--    Le Super Admin les contacte hors SaaS (WhatsApp/appel) puis
--    génère un code_activation si le prospect a payé hors application.
--    ⚠️  INSERT publique (anon) via RLS — aucune auth requise.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.demandes_inscription (
    id                  UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
    nom_gerant          TEXT             NOT NULL,
    nom_pressing        TEXT             NOT NULL,
    telephone           TEXT             NOT NULL,
    email               TEXT,
    ville               TEXT,
    commune             TEXT,
    message             TEXT,
    statut              statut_demande   NOT NULL DEFAULT 'en_attente',
    traite_par          UUID             REFERENCES public.super_admins(id) ON DELETE SET NULL,
    date_traitement     TIMESTAMPTZ,
    notes_traitement    TEXT,
    created_at          TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);


-- ============================================================
-- 3. pressing
--    Un pressing = un tenant. Pas de colonne pressing_id : c'est le
--    pressing qui EST référencé par les autres tables. L'isolation RLS
--    se fait donc sur id = get_pressing_id_utilisateur().
--    Statut : essai (7 jours) → actif → suspendu (non-paiement).
--
--    ⚠️  DOIT être créée AVANT codes_activation (qui la référence
--        via pressing_id_cible) — fix v1.1.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.pressing (
    id                  UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
    nom                 TEXT             NOT NULL,
    slug                TEXT             UNIQUE,
    telephone           TEXT,
    email               TEXT,
    adresse             TEXT,
    ville               TEXT,
    commune             TEXT,
    logo_url            TEXT,
    statut              statut_pressing  NOT NULL DEFAULT 'essai',
    date_activation     TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
    date_suspension     TIMESTAMPTZ,
    motif_suspension    TEXT,
    created_at          TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);


-- ============================================================
-- 4. codes_activation
--    Codes à usage unique générés par le Super Admin après qu'un
--    prospect a payé hors SaaS. Permettent l'activation du compte
--    pressing (création pressing + 1er compte admin).
--    ⚠️  Lecture publique LIMITÉE aux colonnes code + utilise (RLS + GRANT).
-- ============================================================
CREATE TABLE IF NOT EXISTS public.codes_activation (
    id                  UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
    code                TEXT             NOT NULL UNIQUE,
    pressing_id_cible   UUID             REFERENCES public.pressing(id) ON DELETE SET NULL,
    utilise             BOOLEAN          NOT NULL DEFAULT FALSE,
    date_generation     TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
    date_expiration     TIMESTAMPTZ,
    date_utilisation    TIMESTAMPTZ,
    cree_par            UUID             NOT NULL REFERENCES public.super_admins(id) ON DELETE RESTRICT,
    plan_initial        plan_abonnement  NOT NULL DEFAULT 'starter',
    created_at          TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);


-- ============================================================
-- 5. abonnements
--    Échéances d'abonnement SaaS d'un pressing. Une ligne par période
--    (mensuelle). Le Super Admin génère une nouvelle échéance après
--    règlement hors SaaS. ⚠️ Aucune intégration de paiement.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.abonnements (
    id                              UUID                 PRIMARY KEY DEFAULT gen_random_uuid(),
    pressing_id                     UUID                 NOT NULL REFERENCES public.pressing(id) ON DELETE CASCADE,
    plan                            plan_abonnement      NOT NULL DEFAULT 'starter',
    statut                          statut_abonnement    NOT NULL DEFAULT 'essai',
    date_debut                      TIMESTAMPTZ          NOT NULL,
    date_fin                        TIMESTAMPTZ,
    montant_mensuel                 INTEGER              NOT NULL,  -- FCFA, aucun centime
    mode_paiement_derniere_echeance methode_paiement,
    date_derniere_echeance          TIMESTAMPTZ,
    created_at                      TIMESTAMPTZ          NOT NULL DEFAULT NOW(),
    updated_at                      TIMESTAMPTZ          NOT NULL DEFAULT NOW()
);


-- ============================================================
-- 6. personnel
--    Employés d'un pressing. Liés 1-1 à auth.users (sauf si création
--    directe sans email — auquel cas user_id peut être NULL jusqu'à
--    activation). 7 rôles (PRD §3.3) avec permissions différenciées.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.personnel (
    id                       UUID                        PRIMARY KEY DEFAULT gen_random_uuid(),
    pressing_id              UUID                        NOT NULL REFERENCES public.pressing(id) ON DELETE CASCADE,
    user_id                  UUID                        REFERENCES auth.users(id) ON DELETE SET NULL,
    nom_complet              TEXT                        NOT NULL,
    email                    TEXT,
    telephone                TEXT,
    role                     role_personnel              NOT NULL,
    methode_creation         methode_creation_personnel  NOT NULL DEFAULT 'creation_directe',
    statut_compte            statut_compte_personnel     NOT NULL DEFAULT 'invite_en_attente',
    mot_de_passe_temporaire_hash TEXT,  -- pour création_directe (BCRYPT)
    token_invitation         TEXT                        UNIQUE,
    date_invitation          TIMESTAMPTZ,
    date_activation          TIMESTAMPTZ,
    date_desactivation       TIMESTAMPTZ,
    actif                    BOOLEAN                     NOT NULL DEFAULT TRUE,
    cree_par                 UUID                        REFERENCES public.personnel(id) ON DELETE SET NULL,
    created_at               TIMESTAMPTZ                 NOT NULL DEFAULT NOW(),
    updated_at               TIMESTAMPTZ                 NOT NULL DEFAULT NOW()
);


-- ============================================================
-- 7. clients
--    Fichier clients d'un pressing. Identifiés par téléphone (unique
--    par pressing). Points de fidélité optionnels.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.clients (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    pressing_id     UUID         NOT NULL REFERENCES public.pressing(id) ON DELETE CASCADE,
    nom_complet     TEXT         NOT NULL,
    telephone       TEXT         NOT NULL,
    email           TEXT,
    adresse         TEXT,
    points_fidelite INTEGER      NOT NULL DEFAULT 0,
    notes           TEXT,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);


-- ============================================================
-- 8. services
--    Grille tarifaire des services proposés par un pressing.
--    5 types (PRD §5.1) : lavage, repassage, nettoyage_sec, detachage, blanchisserie.
--    Prix en FCFA par article.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.services (
    id              UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
    pressing_id     UUID           NOT NULL REFERENCES public.pressing(id) ON DELETE CASCADE,
    type            type_service   NOT NULL,
    nom             TEXT           NOT NULL,
    prix            INTEGER        NOT NULL,  -- FCFA
    duree_estimee   INTERVAL,
    actif           BOOLEAN        NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);


-- ============================================================
-- 9. commandes
--    Cœur métier : une commande = un client + des lignes + des articles.
--    Statut dérivé automatiquement des statuts des articles (trigger 005).
--    Statut_paiement dérivé des paiements enregistrés (trigger 005).
--    Montants en FCFA (INTEGER).
-- ============================================================
CREATE TABLE IF NOT EXISTS public.commandes (
    id                  UUID                     PRIMARY KEY DEFAULT gen_random_uuid(),
    pressing_id         UUID                     NOT NULL REFERENCES public.pressing(id) ON DELETE CASCADE,
    client_id           UUID                     NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
    numero_commande     TEXT                     NOT NULL UNIQUE,  -- ex: CMD-2026-00001
    statut              statut_commande          NOT NULL DEFAULT 'recu',
    statut_paiement     statut_paiement_commande NOT NULL DEFAULT 'non_paye',
    montant_total       INTEGER                  NOT NULL DEFAULT 0,  -- FCFA
    montant_paye        INTEGER                  NOT NULL DEFAULT 0,  -- FCFA, calculé depuis paiements
    remise_type         remise_type              NOT NULL DEFAULT 'aucune',
    remise_valeur       INTEGER                  NOT NULL DEFAULT 0,
    date_reception      TIMESTAMPTZ              NOT NULL DEFAULT NOW(),
    date_pret_prevue    TIMESTAMPTZ,
    date_pret_reel      TIMESTAMPTZ,
    date_livraison      TIMESTAMPTZ,
    date_retrait        TIMESTAMPTZ,
    livraison           BOOLEAN                  NOT NULL DEFAULT FALSE,
    adresse_livraison   TEXT,
    frais_livraison     INTEGER                  NOT NULL DEFAULT 0,  -- FCFA
    notes               TEXT,
    cree_par            UUID                     REFERENCES public.personnel(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ              NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ              NOT NULL DEFAULT NOW()
);


-- ============================================================
-- 10. commande_lignes
--     Lignes détaillées d'une commande : un service × une quantité × prix.
--     Ex: "Lavage chemise × 3 × 500 FCFA = 1500 FCFA".
--     Pas de pressing_id direct → isolation via JOIN commandes (RLS 006).
-- ============================================================
CREATE TABLE IF NOT EXISTS public.commande_lignes (
    id              UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
    commande_id     UUID           NOT NULL REFERENCES public.commandes(id) ON DELETE CASCADE,
    service_id      UUID           REFERENCES public.services(id) ON DELETE SET NULL,
    type_vetement   type_vetement,
    description     TEXT,
    quantite        INTEGER        NOT NULL DEFAULT 1,
    prix_unitaire   INTEGER        NOT NULL,  -- FCFA
    montant_ligne   INTEGER        NOT NULL,  -- FCFA, = quantite * prix_unitaire
    created_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);


-- ============================================================
-- 11. articles_vetements
--     Chaque vêtement individuel d'une commande, identifié par un QR code unique.
--     Le statut de l'article évolue indépendamment (recu → ... → retire/livre).
--     Le statut de la commande globale est dérivé de celui des articles (trigger 005).
-- ============================================================
CREATE TABLE IF NOT EXISTS public.articles_vetements (
    id                  UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
    commande_id         UUID             NOT NULL REFERENCES public.commandes(id) ON DELETE CASCADE,
    ligne_id            UUID             REFERENCES public.commande_lignes(id) ON DELETE SET NULL,
    code_qr             TEXT             NOT NULL UNIQUE,
    type_vetement       type_vetement    NOT NULL,
    couleur             couleur_vetement NOT NULL DEFAULT 'autre',
    couleur_libre       TEXT,  -- renseigné si couleur = 'autre'
    etat                etat_vetement    NOT NULL DEFAULT 'bon',
    description_etat    TEXT,  -- détails des défauts observés à la réception
    statut              statut_article   NOT NULL DEFAULT 'recu',
    photo_url           TEXT,
    created_at          TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);


-- ============================================================
-- 12. paiements
--     ⚠️  PRINCIPE FONDAMENTAL — AUCUNE intégration de paiement.
--     Règlements purement déclaratifs : le caissier enregistre un paiement
--     reçu HORS application (espèces, mobile money, carte) en indiquant
--     le mode, le montant et une référence libre.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.paiements (
    id              UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
    commande_id     UUID             NOT NULL REFERENCES public.commandes(id) ON DELETE CASCADE,
    montant         INTEGER          NOT NULL,  -- FCFA
    methode         methode_paiement NOT NULL,
    reference       TEXT,  -- numéro de transaction MOMO, reçu espèces, etc.
    date_paiement   TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
    enregistre_par  UUID             REFERENCES public.personnel(id) ON DELETE SET NULL,
    notes           TEXT,
    created_at      TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);


-- ============================================================
-- 13. produits_stock
--     Catalogue des biodétergents suivis en stock par un pressing.
--     Quantité actuelle + seuil d'alerte. Unité : litre ou kg.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.produits_stock (
    id                      UUID                       PRIMARY KEY DEFAULT gen_random_uuid(),
    pressing_id             UUID                       NOT NULL REFERENCES public.pressing(id) ON DELETE CASCADE,
    nom                     TEXT                       NOT NULL,
    categorie               categorie_produit_stock    NOT NULL,
    unite                   unite_stock                NOT NULL,
    quantite_actuelle       NUMERIC(10,2)              NOT NULL DEFAULT 0,
    seuil_alerte            NUMERIC(10,2)              NOT NULL DEFAULT 0,
    prix_achat_unitaire     INTEGER,  -- FCFA (peut être NULL si inconnu)
    fournisseur             TEXT,
    created_at              TIMESTAMPTZ                NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ                NOT NULL DEFAULT NOW()
);


-- ============================================================
-- 14. mouvements_stock
--     Historique des entrées/sorties/ajustements de stock.
--     Pas de pressing_id direct → isolation via JOIN produits_stock (RLS 006).
--     Trigger 005 met à jour produits_stock.quantite_actuelle.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.mouvements_stock (
    id                  UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
    produit_id          UUID           NOT NULL REFERENCES public.produits_stock(id) ON DELETE CASCADE,
    type_mouvement      TEXT           NOT NULL CHECK (type_mouvement IN ('entree','sortie','ajustement')),
    quantite            NUMERIC(10,2)  NOT NULL,  -- positif = entrée, négatif = sortie
    motif               TEXT,
    date_mouvement      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    enregistre_par      UUID           REFERENCES public.personnel(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);


-- ============================================================
-- 15. machines
--     Laveuses, calandres, etc. du pressing. Suivi du statut
--     (operationnelle / en panne / maintenance).
-- ============================================================
CREATE TABLE IF NOT EXISTS public.machines (
    id                          UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
    pressing_id                 UUID           NOT NULL REFERENCES public.pressing(id) ON DELETE CASCADE,
    nom                         TEXT           NOT NULL,
    type                        TEXT,  -- 'laveuse', 'calandre', 'seche_linge', etc.
    capacite                    NUMERIC(10,2),
    unite                       unite_stock,
    date_achat                  DATE,
    statut                      TEXT           NOT NULL DEFAULT 'operationnelle'
                                  CHECK (statut IN ('operationnelle','en_panne','maintenance')),
    date_derniere_maintenance   DATE,
    notes                       TEXT,
    created_at                  TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);


-- ============================================================
-- 16. anomalies
--     Incidents déclarés par le personnel sur une commande ou un article
--     (vêtement endommagé, perdu, erreur de facturation, retard...).
--     5 types × 3 sévérités (PRD §12.3).
-- ============================================================
CREATE TABLE IF NOT EXISTS public.anomalies (
    id                  UUID               PRIMARY KEY DEFAULT gen_random_uuid(),
    pressing_id         UUID               NOT NULL REFERENCES public.pressing(id) ON DELETE CASCADE,
    commande_id         UUID               REFERENCES public.commandes(id) ON DELETE SET NULL,
    article_id          UUID               REFERENCES public.articles_vetements(id) ON DELETE SET NULL,
    type                type_anomalie      NOT NULL,
    severite            severite_anomalie  NOT NULL DEFAULT 'moyenne',
    description         TEXT               NOT NULL,
    statut              TEXT               NOT NULL DEFAULT 'ouverte'
                          CHECK (statut IN ('ouverte','en_cours','resolue')),
    declare_par         UUID               REFERENCES public.personnel(id) ON DELETE SET NULL,
    date_declaration    TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
    date_resolution     TIMESTAMPTZ,
    resolu_par          UUID               REFERENCES public.personnel(id) ON DELETE SET NULL,
    solution            TEXT,
    created_at          TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ        NOT NULL DEFAULT NOW()
);


-- ============================================================
-- 17. depenses
--     ⚠️  Table activée en Phase 2 (post-MVP, PRD §18.3).
--     Dépenses d'exploitation d'un pressing : loyer, eau, électricité,
--     salaires, maintenance, fournitures, autre.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.depenses (
    id              UUID                 PRIMARY KEY DEFAULT gen_random_uuid(),
    pressing_id     UUID                 NOT NULL REFERENCES public.pressing(id) ON DELETE CASCADE,
    montant         INTEGER              NOT NULL,  -- FCFA
    categorie       categorie_depense    NOT NULL,
    description     TEXT,
    date_depense    DATE                 NOT NULL DEFAULT CURRENT_DATE,
    enregistre_par  UUID                 REFERENCES public.personnel(id) ON DELETE SET NULL,
    methode_paiement methode_paiement,
    reference       TEXT,
    created_at      TIMESTAMPTZ          NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ          NOT NULL DEFAULT NOW()
);


-- ============================================================
-- Fin de la migration 002_tables.sql
-- Total : 17 tables créées
-- ============================================================
