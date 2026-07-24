-- ============================================================
-- OgPressing — Migration 001 : Types ENUM PostgreSQL
-- ============================================================
-- Fichier    : 001_enums.sql
-- Version    : 1.0
-- Date       : 24/07/2026
-- Description : Création de tous les types ENUM personnalisés
--               utilisés dans le schéma de données OgPressing
--               (PRD V1.2 §18.5 + extensions additionnelles).
--
-- Convention :
--   - Noms d'enum en minuscules avec underscores (snake_case)
--   - Valeurs d'enum en minuscules avec underscores
--   - Accents supprimés pour compatibilité SQL
--     (ex : "élévée" → "elevee", "désactivé" → "desactive")
--
-- ⚠️  À exécuter une seule fois sur une base vierge.
--     Les migrations suivantes (002_tables.sql, 003_rls.sql, ...)
--     dépendent de ces types.
--
-- Total : 21 types ENUM
-- ============================================================


-- ============================================================
-- 1. role_personnel
--    Rôles des employés d'un pressing (PRD §3.3).
--    7 rôles avec permissions différenciées (matrice §3.4).
--    Utilisé par : personnel.role
-- ============================================================
CREATE TYPE role_personnel AS ENUM (
    'manager',
    'receptionniste',
    'caissier',
    'laveur',
    'repassage',
    'livreur',
    'comptable'
);


-- ============================================================
-- 2. methode_creation_personnel
--    Méthode de création d'un compte employé par l'Admin (PRD §3.5).
--    - creation_directe : l'Admin saisit un mot de passe temporaire
--      (employés peu à l'aise avec le numérique, sans email)
--    - lien_invitation  : l'employé reçoit un lien par SMS/email et
--      définit lui-même son mot de passe
--    Utilisé par : personnel.methode_creation
-- ============================================================
CREATE TYPE methode_creation_personnel AS ENUM (
    'creation_directe',
    'lien_invitation'
);


-- ============================================================
-- 3. statut_compte_personnel
--    Cycle de vie d'un compte employé (PRD §3.5).
--    - invite_en_attente : lien d'invitation envoyé, compte non activé
--    - actif             : compte utilisable, connexion autorisée
--    - desactive         : compte suspendu par l'Admin (fin de contrat)
--                          → historique conservé pour traçabilité
--    Utilisé par : personnel.statut_compte
-- ============================================================
CREATE TYPE statut_compte_personnel AS ENUM (
    'invite_en_attente',
    'actif',
    'desactive'
);


-- ============================================================
-- 4. statut_pressing
--    Statut commercial d'un pressing client.
--    - actif     : abonnement en cours, accès complet
--    - suspendu  : non-paiement confirmé → accès bloqué
--    - essai     : période d'essai 7 jours (auto-créée à l'activation)
--    Utilisé par : pressing.statut
-- ============================================================
CREATE TYPE statut_pressing AS ENUM (
    'actif',
    'suspendu',
    'essai'
);


-- ============================================================
-- 5. plan_abonnement
--    Les 3 plans tarifaires SaaS (PRD §16).
--    - starter  : 9 900 FCFA/mois, 3 utilisateurs max, export .xlsx ❌
--    - pro      : 24 900 FCFA/mois, 8 utilisateurs max, export .xlsx ✅ (⭐ recommandé)
--    - business : 49 900 FCFA/mois, utilisateurs illimités, exports + alertes
--    Utilisé par : abonnements.plan
-- ============================================================
CREATE TYPE plan_abonnement AS ENUM (
    'starter',
    'pro',
    'business'
);


-- ============================================================
-- 6. statut_abonnement
--    Cycle de vie d'un abonnement SaaS.
--    - essai    : période d'essai 7 jours (auto-créé à l'activation)
--    - actif    : abonnement payé et en cours
--    - suspendu : non-paiement confirmé par le Super Admin
--    - expire   : date de fin dépassée sans renouvellement
--    Utilisé par : abonnements.statut
-- ============================================================
CREATE TYPE statut_abonnement AS ENUM (
    'essai',
    'actif',
    'suspendu',
    'expire'
);


-- ============================================================
-- 7. statut_demande
--    Statut des demandes d'inscription (landing page → Super Admin).
--    - en_attente : demande reçue via le formulaire intégré
--    - contactee  : Super Admin a contacté le prospect (WhatsApp/appel)
--    - validee    : prospect a payé hors SaaS → code activation généré
--    - refusee    : prospect refusé ou demande abandonnée
--    Utilisé par : demandes_inscription.statut
-- ============================================================
CREATE TYPE statut_demande AS ENUM (
    'en_attente',
    'contactee',
    'validee',
    'refusee'
);


-- ============================================================
-- 8. type_vetement
--    Types de vêtements pris en charge au pressing (PRD §5.1).
--    Utilisé par : articles_vetements.type_vetement
-- ============================================================
CREATE TYPE type_vetement AS ENUM (
    'chemise',
    'pantalon',
    'robe',
    'costume',
    'drap',
    'couverture',
    'autre'
);


-- ============================================================
-- 9. couleur_vetement
--    Couleurs possibles d'un vêtement (PRD §5.1).
--    La valeur 'autre' permet la saisie d'une couleur libre.
--    Utilisé par : articles_vetements.couleur
-- ============================================================
CREATE TYPE couleur_vetement AS ENUM (
    'blanc',
    'noir',
    'bleu',
    'rouge',
    'vert',
    'jaune',
    'gris',
    'marron',
    'autre'
);


-- ============================================================
-- 10. etat_vetement
--     État du vêtement à la réception (PRD §5.1).
--     Permet de déclarer les défauts existants avant traitement →
--     protège le pressing contre les réclamations abusives.
--     Utilisé par : articles_vetements.etat
-- ============================================================
CREATE TYPE etat_vetement AS ENUM (
    'bon',
    'acceptable',
    'use',
    'dechire',
    'tache'
);


-- ============================================================
-- 11. statut_article
--     Cycle de vie d'un article individuel (PRD §6.1).
--     7 statuts indépendants de la commande globale.
--     Le statut commande est dérivé automatiquement de celui des articles.
--     Utilisé par : articles_vetements.statut
-- ============================================================
CREATE TYPE statut_article AS ENUM (
    'recu',
    'en_traitement',
    'lave',
    'repasse',
    'pret',
    'retire',
    'livre'
);


-- ============================================================
-- 12. statut_commande
--     Cycle de vie d'une commande globale (PRD §6.4).
--     8 statuts dérivés automatiquement du statut des articles.
--     - en_livraison : transition spécifique au service de livraison
--     Utilisé par : commandes.statut
-- ============================================================
CREATE TYPE statut_commande AS ENUM (
    'recu',
    'en_traitement',
    'lave',
    'repasse',
    'pret',
    'en_livraison',
    'livre',
    'retire'
);


-- ============================================================
-- 13. methode_paiement
--     3 modes de règlement enregistrés manuellement (PRD §5.2).
--     ⚠️  PRINCIPE FONDAMENTAL — AUCUNE intégration de paiement.
--         Le caissier sélectionne le mode APRÈS avoir reçu le
--         règlement physiquement en dehors de l'application.
--     Utilisé par :
--       - paiements.methode
--       - abonnements.mode_paiement_derniere_echeance
-- ============================================================
CREATE TYPE methode_paiement AS ENUM (
    'especes',
    'mobile_money',
    'carte_bancaire'
);


-- ============================================================
-- 14. remise_type
--     Types de remises applicables à une commande (PRD §7.6).
--     - aucune          : pas de remise
--     - pourcentage     : -X% sur le total (ex : -10%)
--     - montant_fixe    : -X FCFA sur le total (ex : -500 FCFA)
--     - article_gratuit : Xème article offert (ex : 4e lavage gratuit)
--     - fidelite        : remise auto via points de fidélité
--     Utilisé par : commandes.remise_type
-- ============================================================
CREATE TYPE remise_type AS ENUM (
    'aucune',
    'pourcentage',
    'montant_fixe',
    'article_gratuit',
    'fidelite'
);


-- ============================================================
-- 15. statut_paiement_commande
--     Statut de paiement d'une commande (PRD §5.3).
--     Calculé automatiquement depuis la table paiements :
--     - non_paye : aucun paiement enregistré
--     - partiel  : somme des paiements < montant_total
--     - paye     : somme des paiements >= montant_total
--     Utilisé par : commandes.statut_paiement
-- ============================================================
CREATE TYPE statut_paiement_commande AS ENUM (
    'non_paye',
    'partiel',
    'paye'
);


-- ============================================================
-- 16. categorie_produit_stock
--     Catégories de biodétergents suivis en stock (PRD §14).
--     Utilisé par : produits_stock.categorie
-- ============================================================
CREATE TYPE categorie_produit_stock AS ENUM (
    'detergent',
    'adoucissant',
    'detacheur',
    'desinfectant',
    'javel',
    'savon'
);


-- ============================================================
-- 17. unite_stock
--     Unités de mesure pour les biodétergents (PRD §14).
--     - litre : pour les produits liquides (detergent, adoucissant, etc.)
--     - kg    : pour les produits solides (savon en poudre, etc.)
--     Utilisé par : produits_stock.unite
-- ============================================================
CREATE TYPE unite_stock AS ENUM (
    'litre',
    'kg'
);


-- ============================================================
-- 18. categorie_depense
--     Catégories de dépenses d'un pressing (PRD §18.3).
--     ⚠️  Table `depenses` activée en Phase 2 (post-MVP).
--     Utilisé par : depenses.categorie
-- ============================================================
CREATE TYPE categorie_depense AS ENUM (
    'loyer',
    'eau',
    'electricite',
    'salaires',
    'maintenance',
    'fournitures',
    'autre'
);


-- ============================================================
-- 19. type_service
--     Types de services de pressing proposés (PRD §5.1).
--     Le prix unitaire d'un article est calculé selon le service.
--     Utilisé par : services.type
-- ============================================================
CREATE TYPE type_service AS ENUM (
    'lavage',
    'repassage',
    'nettoyage_sec',
    'detachage',
    'blanchisserie'
);


-- ============================================================
-- 20. type_anomalie
--     Types d'anomalies déclarables (PRD §12.3 — Repassage / Laveur).
--     Déclarée par le personnel lors du traitement d'une commande.
--     Utilisé par : anomalies.type
-- ============================================================
CREATE TYPE type_anomalie AS ENUM (
    'vetement_endommage',
    'vetement_perdu',
    'erreur_facturation',
    'retard',
    'autre'
);


-- ============================================================
-- 21. severite_anomalie
--     Niveau de gravité d'une anomalie.
--     Sert à prioriser le traitement par l'Admin / Manager.
--     Utilisé par : anomalies.severite
-- ============================================================
CREATE TYPE severite_anomalie AS ENUM (
    'faible',
    'moyenne',
    'elevee'
);


-- ============================================================
-- Fin de la migration 001_enums.sql
-- Total : 21 types ENUM créés
-- ============================================================
