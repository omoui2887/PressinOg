-- ============================================================
-- OgPressing — Migration 004 : Index de performance
-- ============================================================
-- Fichier    : 004_indexes.sql
-- Version    : 1.0
-- Date       : 24/07/2026
-- Description : Création des index B-tree secondaires pour optimiser
--               les requêtes les plus fréquentes de l'application.
--
-- Stratégie :
--   1. Index sur pressing_id pour TOUTES les tables multi-tenant
--      → le filtre "WHERE pressing_id = ?" est exécuté à chaque
--        requête métier (RLS le génère automatiquement). Sans index,
--        PostgreSQL ferait un Seq Scan sur toute la table.
--   2. Index sur les colonnes de statut (filtres dashboards/listes).
--   3. Index sur les dates (tri chronologique, filtres période).
--   4. Index composites pressing_id + statut/date (jointures RLS+filtre).
--
-- Prérequis :
--   - Migration 001 (enums) ✅
--   - Migration 002 (17 tables) ✅
--   - Migration 003 (contraintes UNIQUE composites) ✅
--      → les 6 UNIQUE composites créés en 003 génèrent déjà 6 index
--        (PostgreSQL en crée un automatiquement par UNIQUE).
--        On NE les recrée pas ici.
--
-- Convention : noms d'index préfixés `idx_<table>_<colonnes>`.
-- Tous les index sont NON unique (sauf si explicitement nécessaire).
-- ============================================================


-- ============================================================
-- SECTION 1 : Index pressing_id (filtre multi-tenant RLS)
-- ============================================================
-- Chaque policy isolation_pressing génère WHERE pressing_id = ?
-- → un index sur pressing_id change un Seq Scan O(n) en Index Scan O(log n).
-- Sur 100k commandes, on passe de ~50ms à ~1ms.
--
-- Note : les 6 UNIQUE composites de 003 incluent déjà pressing_id
-- en première colonne pour : services, clients, personnel, machines,
-- produits_stock. PostgreSQL peut les utiliser pour le filtre
-- pressing_id seul (prefix matching) → on NE crée PAS d'index
-- pressing_id supplémentaire pour ces 5 tables.
-- ============================================================

-- 1.1. abonnements.pressing_id (pas d'UNIQUE composite en 003)
CREATE INDEX IF NOT EXISTS idx_abonnements_pressing_id
    ON public.abonnements (pressing_id);

-- 1.2. commandes.pressing_id (table la plus sollicitée de l'app)
CREATE INDEX IF NOT EXISTS idx_commandes_pressing_id
    ON public.commandes (pressing_id);

-- 1.3. machines.pressing_id (UNIQUE composite en 003 → non recréé)
-- 1.4. anomalies.pressing_id
CREATE INDEX IF NOT EXISTS idx_anomalies_pressing_id
    ON public.anomalies (pressing_id);

-- 1.5. depenses.pressing_id
CREATE INDEX IF NOT EXISTS idx_depenses_pressing_id
    ON public.depenses (pressing_id);


-- ============================================================
-- SECTION 2 : Index sur FK (jointures fréquentes)
-- ============================================================
-- PostgreSQL NE crée PAS d'index automatique sur les FK
-- (contrairement aux PK et UNIQUE). Or les jointures sur FK sont
-- très fréquentes → on indexe explicitement chaque FK.
-- ============================================================

-- 2.1. abonnements.pressing_id est déjà indexé en Section 1.

-- 2.2. personnel.pressing_id (UNIQUE composite personnel_pressing_id_user_id
--      en 003 sert aussi pour pressing_id seul — non recréé).
-- 2.3. personnel.user_id (recherche par compte auth — login, /me)
CREATE INDEX IF NOT EXISTS idx_personnel_user_id
    ON public.personnel (user_id)
    WHERE user_id IS NOT NULL;  -- partial index : on n'indexe que les actifs

-- 2.4. personnel.cree_par (audit)
CREATE INDEX IF NOT EXISTS idx_personnel_cree_par
    ON public.personnel (cree_par)
    WHERE cree_par IS NOT NULL;

-- 2.5. commandes.client_id (liste des commandes d'un client)
CREATE INDEX IF NOT EXISTS idx_commandes_client_id
    ON public.commandes (client_id);

-- 2.6. commandes.cree_par (audit / filtre "mes commandes")
CREATE INDEX IF NOT EXISTS idx_commandes_cree_par
    ON public.commandes (cree_par)
    WHERE cree_par IS NOT NULL;

-- 2.7. commande_lignes.commande_id (détail d'une commande)
CREATE INDEX IF NOT EXISTS idx_commande_lignes_commande_id
    ON public.commande_lignes (commande_id);

-- 2.8. commande_lignes.service_id (vente par service)
CREATE INDEX IF NOT EXISTS idx_commande_lignes_service_id
    ON public.commande_lignes (service_id)
    WHERE service_id IS NOT NULL;

-- 2.9. articles_vetements.commande_id (liste des articles d'une commande)
CREATE INDEX IF NOT EXISTS idx_articles_vetements_commande_id
    ON public.articles_vetements (commande_id);

-- 2.10. articles_vetements.ligne_id (regroupement par ligne)
CREATE INDEX IF NOT EXISTS idx_articles_vetements_ligne_id
    ON public.articles_vetements (ligne_id)
    WHERE ligne_id IS NOT NULL;

-- 2.11. articles_vetements.code_qr (déjà UNIQUE → auto-indexé, non recréé)

-- 2.12. paiements.commande_id (liste des paiements d'une commande)
CREATE INDEX IF NOT EXISTS idx_paiements_commande_id
    ON public.paiements (commande_id);

-- 2.13. paiements.enregistre_par (audit caissier)
CREATE INDEX IF NOT EXISTS idx_paiements_enregistre_par
    ON public.paiements (enregistre_par)
    WHERE enregistre_par IS NOT NULL;

-- 2.14. mouvements_stock.produit_id (historique d'un produit)
CREATE INDEX IF NOT EXISTS idx_mouvements_stock_produit_id
    ON public.mouvements_stock (produit_id);

-- 2.15. mouvements_stock.enregistre_par (audit)
CREATE INDEX IF NOT EXISTS idx_mouvements_stock_enregistre_par
    ON public.mouvements_stock (enregistre_par)
    WHERE enregistre_par IS NOT NULL;

-- 2.16. anomalies.commande_id (anomalies d'une commande)
CREATE INDEX IF NOT EXISTS idx_anomalies_commande_id
    ON public.anomalies (commande_id)
    WHERE commande_id IS NOT NULL;

-- 2.17. anomalies.article_id (anomalies d'un article)
CREATE INDEX IF NOT EXISTS idx_anomalies_article_id
    ON public.anomalies (article_id)
    WHERE article_id IS NOT NULL;

-- 2.18. anomalies.declare_par (audit)
CREATE INDEX IF NOT EXISTS idx_anomalies_declare_par
    ON public.anomalies (declare_par)
    WHERE declare_par IS NOT NULL;

-- 2.19. anomalies.resolu_par (audit)
CREATE INDEX IF NOT EXISTS idx_anomalies_resolu_par
    ON public.anomalies (resolu_par)
    WHERE resolu_par IS NOT NULL;

-- 2.20. depenses.enregistre_par (audit)
CREATE INDEX IF NOT EXISTS idx_depenses_enregistre_par
    ON public.depenses (enregistre_par)
    WHERE enregistre_par IS NOT NULL;

-- 2.21. demandes_inscription.traite_par (audit Super Admin)
CREATE INDEX IF NOT EXISTS idx_demandes_inscription_traite_par
    ON public.demandes_inscription (traite_par)
    WHERE traite_par IS NOT NULL;

-- 2.22. codes_activation.pressing_id_cible (recherche code → pressing)
CREATE INDEX IF NOT EXISTS idx_codes_activation_pressing_id_cible
    ON public.codes_activation (pressing_id_cible)
    WHERE pressing_id_cible IS NOT NULL;

-- 2.23. codes_activation.cree_par (audit Super Admin)
CREATE INDEX IF NOT EXISTS idx_codes_activation_cree_par
    ON public.codes_activation (cree_par);


-- ============================================================
-- SECTION 3 : Index sur statuts (filtres dashboards/listes)
-- ============================================================
-- Les listes filtrées par statut sont omniprésentes :
--   - "commandes prêtes à livrer"
--   - "anomalies ouvertes"
--   - "machines en panne"
--   - "demandes en attente"
-- → un index sur la colonne statut accélère ces filtres.
-- ============================================================

-- 3.1. commandes.statut (filtre le plus utilisé de l'app)
CREATE INDEX IF NOT EXISTS idx_commandes_statut
    ON public.commandes (statut);

-- 3.2. commandes.statut_paiement (caisse : "impayés")
CREATE INDEX IF NOT EXISTS idx_commandes_statut_paiement
    ON public.commandes (statut_paiement);

-- 3.3. articles_vetements.statut (suivi atelier : "à laver", "à repasser")
CREATE INDEX IF NOT EXISTS idx_articles_vetements_statut
    ON public.articles_vetements (statut);

-- 3.4. abonnements.statut (Super Admin : "abonnements suspendus")
CREATE INDEX IF NOT EXISTS idx_abonnements_statut
    ON public.abonnements (statut);

-- 3.5. pressing.statut (Super Admin : "pressings suspendus")
CREATE INDEX IF NOT EXISTS idx_pressing_statut
    ON public.pressing (statut);

-- 3.6. demandes_inscription.statut (Super Admin : "demandes en attente")
CREATE INDEX IF NOT EXISTS idx_demandes_inscription_statut
    ON public.demandes_inscription (statut);

-- 3.7. anomalies.statut (Manager : "anomalies ouvertes")
CREATE INDEX IF NOT EXISTS idx_anomalies_statut
    ON public.anomalies (statut);

-- 3.8. personnel.statut_compte (Admin : "comptes en attente d'activation")
CREATE INDEX IF NOT EXISTS idx_personnel_statut_compte
    ON public.personnel (statut_compte);

-- 3.9. personnel.actif (Admin : liste des employés actifs)
CREATE INDEX IF NOT EXISTS idx_personnel_actif
    ON public.personnel (actif)
    WHERE actif = TRUE;  -- partial index : 90% des requêtes filtrent actif=TRUE

-- 3.10. services.actif (Admin : grille tarifaire active)
CREATE INDEX IF NOT EXISTS idx_services_actif
    ON public.services (actif)
    WHERE actif = TRUE;


-- ============================================================
-- SECTION 4 : Index sur dates (tri chronologique, filtres période)
-- ============================================================
-- Les tableaux de bord trient par date desc, et les filtres période
-- (aujourd'hui, cette semaine, ce mois) sont très fréquents.
-- ============================================================

-- 4.1. commandes.date_reception (liste chronologique principale)
CREATE INDEX IF NOT EXISTS idx_commandes_date_reception
    ON public.commandes (date_reception DESC);

-- 4.2. commandes.date_pret_prevue (suivi des retards)
CREATE INDEX IF NOT EXISTS idx_commandes_date_pret_prevue
    ON public.commandes (date_pret_prevue)
    WHERE date_pret_prevue IS NOT NULL;

-- 4.3. commandes.date_pret_reel (KPI délai de traitement)
CREATE INDEX IF NOT EXISTS idx_commandes_date_pret_reel
    ON public.commandes (date_pret_reel)
    WHERE date_pret_reel IS NOT NULL;

-- 4.4. paiements.date_paiement (rapport caisse journalier)
CREATE INDEX IF NOT EXISTS idx_paiements_date_paiement
    ON public.paiements (date_paiement DESC);

-- 4.5. mouvements_stock.date_mouvement (historique chronologique)
CREATE INDEX IF NOT EXISTS idx_mouvements_stock_date_mouvement
    ON public.mouvements_stock (date_mouvement DESC);

-- 4.6. anomalies.date_declaration (liste chronologique des incidents)
CREATE INDEX IF NOT EXISTS idx_anomalies_date_declaration
    ON public.anomalies (date_declaration DESC);

-- 4.7. depenses.date_depense (rapport dépenses mensuel)
CREATE INDEX IF NOT EXISTS idx_depenses_date_depense
    ON public.depenses (date_depense DESC);

-- 4.8. demandes_inscription.created_at (file chronologique Super Admin)
CREATE INDEX IF NOT EXISTS idx_demandes_inscription_created_at
    ON public.demandes_inscription (created_at DESC);

-- 4.9. codes_activation.date_generation (gestion des codes par le Super Admin)
CREATE INDEX IF NOT EXISTS idx_codes_activation_date_generation
    ON public.codes_activation (date_generation DESC);


-- ============================================================
-- SECTION 5 : Index composites (filtres combinés fréquents)
-- ============================================================
-- Les index composites accélèrent les requêtes qui filtrent sur
-- plusieurs colonnes simultanément. L'ordre des colonnes compte :
--   - colonne la plus sélective / filtre RLS en premier (pressing_id)
--   - puis colonne de tri/filtre
-- PostgreSQL peut utiliser un index composite pour le prefix :
--   (pressing_id, statut) sert aussi pour WHERE pressing_id = ?.
-- ============================================================

-- 5.1. commandes (pressing_id, statut) — le filtre combo #1 :
--      "toutes les commandes prêtes de mon pressing"
CREATE INDEX IF NOT EXISTS idx_commandes_pressing_id_statut
    ON public.commandes (pressing_id, statut);

-- 5.2. commandes (pressing_id, statut_paiement) — caisse :
--      "toutes les commandes impayées de mon pressing"
CREATE INDEX IF NOT EXISTS idx_commandes_pressing_id_statut_paiement
    ON public.commandes (pressing_id, statut_paiement);

-- 5.3. commandes (pressing_id, date_reception) — KPI :
--      "commandes reçues aujourd'hui / cette semaine"
CREATE INDEX IF NOT EXISTS idx_commandes_pressing_id_date_reception
    ON public.commandes (pressing_id, date_reception DESC);

-- 5.4. articles_vetements (commande_id, statut) — atelier :
--      "articles en cours de traitement d'une commande"
CREATE INDEX IF NOT EXISTS idx_articles_vetements_commande_id_statut
    ON public.articles_vetements (commande_id, statut);

-- 5.5. paiements (commande_id, date_paiement) — caisse :
--      "paiements d'une commande triés par date"
CREATE INDEX IF NOT EXISTS idx_paiements_commande_id_date_paiement
    ON public.paiements (commande_id, date_paiement DESC);

-- 5.6. anomalies (pressing_id, statut, severite) — Manager :
--      "anomalies ouvertes critiques de mon pressing"
CREATE INDEX IF NOT EXISTS idx_anomalies_pressing_id_statut_severite
    ON public.anomalies (pressing_id, statut, severite);

-- 5.7. abonnements (pressing_id, statut) — Super Admin :
--      "abonnements actifs d'un pressing"
CREATE INDEX IF NOT EXISTS idx_abonnements_pressing_id_statut
    ON public.abonnements (pressing_id, statut);

-- 5.8. depenses (pressing_id, date_depense) — rapport comptable :
--      "dépenses d'un pressing sur une période"
CREATE INDEX IF NOT EXISTS idx_depenses_pressing_id_date_depense
    ON public.depenses (pressing_id, date_depense DESC);

-- 5.9. mouvements_stock (produit_id, date_mouvement) — historique :
--      "mouvements d'un produit triés par date"
CREATE INDEX IF NOT EXISTS idx_mouvements_stock_produit_id_date_mouvement
    ON public.mouvements_stock (produit_id, date_mouvement DESC);


-- ============================================================
-- SECTION 6 : Index sur created_at (tri chronologique global)
-- ============================================================
-- Plusieurs listes utilisent ORDER BY created_at DESC comme tri
-- par défaut (historique). On ajoute un index quand ce n'est pas
-- déjà couvert par un index de Section 4 ou 5.
-- ============================================================

-- 6.1. super_admins.created_at (rare mais pour cohérence)
--      → table petite, pas d'index supplémentaire.

-- 6.2. personnel.created_at (Admin : liste des employés par date)
CREATE INDEX IF NOT EXISTS idx_personnel_created_at
    ON public.personnel (created_at DESC);

-- 6.3. clients.created_at (Admin : nouveaux clients du mois)
CREATE INDEX IF NOT EXISTS idx_clients_created_at
    ON public.clients (created_at DESC);

-- 6.4. services.created_at
--      → table petite, pas d'index supplémentaire.

-- 6.5. produits_stock.created_at (rare mais pour cohérence)
--      → table petite, pas d'index supplémentaire.

-- 6.6. machines.created_at
--      → table petite, pas d'index supplémentaire.


-- ============================================================
-- SECTION 7 : Index sur numero_commande (recherche par numéro)
-- ============================================================
-- numero_commande est déjà UNIQUE (auto-indexé en 002).
-- On ajoute un index sur (pressing_id, numero_commande) pour la
-- recherche "trouver la commande CMD-2026-00001 de MON pressing"
-- sans révéler l'existence de commandes d'autres pressings.
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_commandes_pressing_id_numero
    ON public.commandes (pressing_id, numero_commande);


-- ============================================================
-- Fin de la migration 004_indexes.sql
-- Total : ~45 index créés (5 pressing_id + 23 FK + 10 statut + 9 date
--         + 9 composites + 1 numero) — certains partials (WHERE NOT NULL).
-- ============================================================
