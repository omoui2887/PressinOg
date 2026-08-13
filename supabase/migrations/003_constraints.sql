-- ============================================================
-- e-pressing — Migration 003 : Contraintes métier (UNIQUE + CHECK)
-- ============================================================
-- Fichier    : 003_constraints.sql
-- Version    : 1.0
-- Date       : 24/07/2026
-- Description : Ajout des contraintes UNIQUE composites et CHECK
--               métier qui n'ont pas été déclarées inline dans
--               002_tables.sql.
--
-- Prérequis :
--   - Migration 001 (enums) ✅
--   - Migration 002 (17 tables) ✅
--
-- Convention : noms de contraintes préfixés par le nom de table
--   en snake_case, suffixés par le type (uniq / check).
-- ============================================================


-- ============================================================
-- 1. Contraintes UNIQUE composites (intégrité métier multi-tenant)
-- ============================================================
-- Un SaaS multi-tenant doit souvent garantir l'unicité d'une
-- valeur à l'intérieur d'un tenant (et non globalement).
-- Ex : un même pressing ne peut pas avoir 2 services nommés
--      "Lavage chemise", mais 2 pressings différents peuvent
--      chacun avoir leur "Lavage chemise".
-- ============================================================

-- 1.1. services : (pressing_id, nom) unique → pas de doublon de
--      service dans la grille tarifaire d'un même pressing.
ALTER TABLE public.services
    DROP CONSTRAINT IF EXISTS services_pressing_id_nom_uniq;
ALTER TABLE public.services
    ADD CONSTRAINT services_pressing_id_nom_uniq
    UNIQUE (pressing_id, nom);

-- 1.2. services : (pressing_id, type) unique → un seul service par type
--      (lavage, repassage, etc.) par pressing. Si le pressing veut
--      plusieurs formules de lavage, il faudra étendre l'enum — non
--      activé en V1.
ALTER TABLE public.services
    DROP CONSTRAINT IF EXISTS services_pressing_id_type_uniq;
ALTER TABLE public.services
    ADD CONSTRAINT services_pressing_id_type_uniq
    UNIQUE (pressing_id, type);

-- 1.3. clients : (pressing_id, telephone) unique → un client identifié
--      par son numéro de téléphone dans un pressing.
ALTER TABLE public.clients
    DROP CONSTRAINT IF EXISTS clients_pressing_id_telephone_uniq;
ALTER TABLE public.clients
    ADD CONSTRAINT clients_pressing_id_telephone_uniq
    UNIQUE (pressing_id, telephone);

-- 1.4. personnel : (pressing_id, user_id) unique → un compte Supabase Auth
--      ne peut être lié qu'à une seule ligne personnel par pressing.
--      (Un compte peut quand même appartenir à plusieurs pressings
--       distincts — cas rare mais autorisé pour un comptable externalisé.)
ALTER TABLE public.personnel
    DROP CONSTRAINT IF EXISTS personnel_pressing_id_user_id_uniq;
ALTER TABLE public.personnel
    ADD CONSTRAINT personnel_pressing_id_user_id_uniq
    UNIQUE (pressing_id, user_id);

-- 1.5. machines : (pressing_id, nom) unique → pas deux machines avec
--      le même nom dans un pressing.
ALTER TABLE public.machines
    DROP CONSTRAINT IF EXISTS machines_pressing_id_nom_uniq;
ALTER TABLE public.machines
    ADD CONSTRAINT machines_pressing_id_nom_uniq
    UNIQUE (pressing_id, nom);

-- 1.6. produits_stock : (pressing_id, nom) unique → pas de doublon
--      de produit dans le stock d'un pressing.
ALTER TABLE public.produits_stock
    DROP CONSTRAINT IF EXISTS produits_stock_pressing_id_nom_uniq;
ALTER TABLE public.produits_stock
    ADD CONSTRAINT produits_stock_pressing_id_nom_uniq
    UNIQUE (pressing_id, nom);


-- ============================================================
-- 2. Contraintes CHECK métier (règles de cohérence métier)
-- ============================================================
-- Ces CHECK garantissent que les données sont physiquement valides
-- au-delà des types. Ils complètent les CHECK inline déjà présents
-- dans 002 (machines.statut, anomalies.statut, mouvements_stock.type_mouvement).
-- ============================================================

-- 2.1. Montants en FCFA strictement positifs
--      Le FCFA n'a pas de centimes : on stocke en INTEGER.
--      Un montant de commande/ligne/paiement/abonnement/dépense
--      doit être > 0 (sinon c'est une incohérence métier).
--      Sauf : montant_total de commande peut être 0 (commande gratuite
--      type remise 100% / article_gratuit) → on impose >= 0.

-- 2.1.1. abonnements.montant_mensuel > 0
ALTER TABLE public.abonnements
    DROP CONSTRAINT IF EXISTS abonnements_montant_mensuel_check;
ALTER TABLE public.abonnements
    ADD CONSTRAINT abonnements_montant_mensuel_check
    CHECK (montant_mensuel > 0);

-- 2.1.2. services.prix >= 0 (un service peut être gratuit, rare mais possible)
ALTER TABLE public.services
    DROP CONSTRAINT IF EXISTS services_prix_check;
ALTER TABLE public.services
    ADD CONSTRAINT services_prix_check
    CHECK (prix >= 0);

-- 2.1.3. commandes.montant_total >= 0
ALTER TABLE public.commandes
    DROP CONSTRAINT IF EXISTS commandes_montant_total_check;
ALTER TABLE public.commandes
    ADD CONSTRAINT commandes_montant_total_check
    CHECK (montant_total >= 0);

-- 2.1.4. commandes.montant_paye >= 0
ALTER TABLE public.commandes
    DROP CONSTRAINT IF EXISTS commandes_montant_paye_check;
ALTER TABLE public.commandes
    ADD CONSTRAINT commandes_montant_paye_check
    CHECK (montant_paye >= 0);

-- 2.1.5. commandes.frais_livraison >= 0
ALTER TABLE public.commandes
    DROP CONSTRAINT IF EXISTS commandes_frais_livraison_check;
ALTER TABLE public.commandes
    ADD CONSTRAINT commandes_frais_livraison_check
    CHECK (frais_livraison >= 0);

-- 2.1.6. commandes.remise_valeur >= 0
ALTER TABLE public.commandes
    DROP CONSTRAINT IF EXISTS commandes_remise_valeur_check;
ALTER TABLE public.commandes
    ADD CONSTRAINT commandes_remise_valeur_check
    CHECK (remise_valeur >= 0);

-- 2.1.7. commande_lignes.prix_unitaire >= 0
ALTER TABLE public.commande_lignes
    DROP CONSTRAINT IF EXISTS commande_lignes_prix_unitaire_check;
ALTER TABLE public.commande_lignes
    ADD CONSTRAINT commande_lignes_prix_unitaire_check
    CHECK (prix_unitaire >= 0);

-- 2.1.8. commande_lignes.quantite > 0 (une ligne ne peut pas être vide)
ALTER TABLE public.commande_lignes
    DROP CONSTRAINT IF EXISTS commande_lignes_quantite_check;
ALTER TABLE public.commande_lignes
    ADD CONSTRAINT commande_lignes_quantite_check
    CHECK (quantite > 0);

-- 2.1.9. commande_lignes.montant_ligne = quantite * prix_unitaire
--        Cohérence financière ligne par ligne.
ALTER TABLE public.commande_lignes
    DROP CONSTRAINT IF EXISTS commande_lignes_montant_ligne_check;
ALTER TABLE public.commande_lignes
    ADD CONSTRAINT commande_lignes_montant_ligne_check
    CHECK (montant_ligne = quantite * prix_unitaire);

-- 2.1.10. paiements.montant > 0 (un paiement à 0 n'a pas de sens)
ALTER TABLE public.paiements
    DROP CONSTRAINT IF EXISTS paiements_montant_check;
ALTER TABLE public.paiements
    ADD CONSTRAINT paiements_montant_check
    CHECK (montant > 0);

-- 2.1.11. depenses.montant > 0
ALTER TABLE public.depenses
    DROP CONSTRAINT IF EXISTS depenses_montant_check;
ALTER TABLE public.depenses
    ADD CONSTRAINT depenses_montant_check
    CHECK (montant > 0);

-- 2.1.12. produits_stock.quantite_actuelle >= 0 (pas de stock négatif)
ALTER TABLE public.produits_stock
    DROP CONSTRAINT IF EXISTS produits_stock_quantite_actuelle_check;
ALTER TABLE public.produits_stock
    ADD CONSTRAINT produits_stock_quantite_actuelle_check
    CHECK (quantite_actuelle >= 0);

-- 2.1.13. produits_stock.seuil_alerte >= 0
ALTER TABLE public.produits_stock
    DROP CONSTRAINT IF EXISTS produits_stock_seuil_alerte_check;
ALTER TABLE public.produits_stock
    ADD CONSTRAINT produits_stock_seuil_alerte_check
    CHECK (seuil_alerte >= 0);

-- 2.1.14. clients.points_fidelite >= 0
ALTER TABLE public.clients
    DROP CONSTRAINT IF EXISTS clients_points_fidelite_check;
ALTER TABLE public.clients
    ADD CONSTRAINT clients_points_fidelite_check
    CHECK (points_fidelite >= 0);


-- ============================================================
-- 3. Contraintes CHECK temporelles (cohérence des dates)
-- ============================================================

-- 3.1. abonnements.date_fin > date_debut (si date_fin est renseignée)
ALTER TABLE public.abonnements
    DROP CONSTRAINT IF EXISTS abonnements_dates_check;
ALTER TABLE public.abonnements
    ADD CONSTRAINT abonnements_dates_check
    CHECK (date_fin IS NULL OR date_fin > date_debut);

-- 3.2. commandes : date_pret_reel >= date_reception (si renseignée)
ALTER TABLE public.commandes
    DROP CONSTRAINT IF EXISTS commandes_dates_pret_check;
ALTER TABLE public.commandes
    ADD CONSTRAINT commandes_dates_pret_check
    CHECK (date_pret_reel IS NULL OR date_pret_reel >= date_reception);

-- 3.3. commandes : date_livraison >= date_pret_reel (si les deux renseignées)
--      La livraison ne peut pas précéder la mise à disposition.
ALTER TABLE public.commandes
    DROP CONSTRAINT IF EXISTS commandes_dates_livraison_check;
ALTER TABLE public.commandes
    ADD CONSTRAINT commandes_dates_livraison_check
    CHECK (date_livraison IS NULL OR date_pret_reel IS NULL OR date_livraison >= date_pret_reel);

-- 3.4. commandes : date_retrait >= date_pret_reel (si les deux renseignées)
--      Le retrait client intervient après la mise à disposition.
ALTER TABLE public.commandes
    DROP CONSTRAINT IF EXISTS commandes_dates_retrait_check;
ALTER TABLE public.commandes
    ADD CONSTRAINT commandes_dates_retrait_check
    CHECK (date_retrait IS NULL OR date_pret_reel IS NULL OR date_retrait >= date_pret_reel);

-- 3.5. anomalies : date_resolution >= date_declaration (si résolue)
ALTER TABLE public.anomalies
    DROP CONSTRAINT IF EXISTS anomalies_dates_check;
ALTER TABLE public.anomalies
    ADD CONSTRAINT anomalies_dates_check
    CHECK (date_resolution IS NULL OR date_resolution >= date_declaration);


-- ============================================================
-- 4. Contraintes CHECK de cohérence métier avancées
-- ============================================================

-- 4.1. commandes : si livraison = TRUE, adresse_livraison doit être renseignée
--      (sinon le livreur ne sait pas où aller).
ALTER TABLE public.commandes
    DROP CONSTRAINT IF EXISTS commandes_livraison_adresse_check;
ALTER TABLE public.commandes
    ADD CONSTRAINT commandes_livraison_adresse_check
    CHECK (
        (livraison = FALSE) OR
        (adresse_livraison IS NOT NULL AND adresse_livraison <> '')
    );

-- 4.2. commandes : si remise_type = 'aucune', remise_valeur doit être 0
--      (pas de valeur parasite si pas de remise).
ALTER TABLE public.commandes
    DROP CONSTRAINT IF EXISTS commandes_remise_aucune_check;
ALTER TABLE public.commandes
    ADD CONSTRAINT commandes_remise_aucune_check
    CHECK (
        (remise_type <> 'aucune') OR
        (remise_valeur = 0)
    );

-- 4.3. commandes : si remise_type = 'pourcentage', remise_valeur ∈ [0, 100]
ALTER TABLE public.commandes
    DROP CONSTRAINT IF EXISTS commandes_remise_pourcentage_check;
ALTER TABLE public.commandes
    ADD CONSTRAINT commandes_remise_pourcentage_check
    CHECK (
        (remise_type <> 'pourcentage') OR
        (remise_valeur >= 0 AND remise_valeur <= 100)
    );

-- 4.4. commandes : montant_paye <= montant_total + tolérance de 1 FCFA
--      (tolérance pour arrondis éventuels — en pratique le calcul
--       est exact en INTEGER, mais on reste défensif).
--      Note : en cas de remise, montant_total est déjà net de remise.
ALTER TABLE public.commandes
    DROP CONSTRAINT IF EXISTS commandes_montant_paye_max_check;
ALTER TABLE public.commandes
    ADD CONSTRAINT commandes_montant_paye_max_check
    CHECK (montant_paye <= montant_total + 1);

-- 4.5. paiements : date_paiement ne peut pas être dans le futur (> 5 min)
--      Tolérance de 5 minutes pour les décalages d'horloge.
ALTER TABLE public.paiements
    DROP CONSTRAINT IF EXISTS paiements_date_paiement_past_check;
ALTER TABLE public.paiements
    ADD CONSTRAINT paiements_date_paiement_past_check
    CHECK (date_paiement <= NOW() + INTERVAL '5 minutes');

-- 4.6. mouvements_stock : si type_mouvement = 'entree', quantite doit être > 0
--      (une entrée négative n'a pas de sens, utiliser 'sortie').
ALTER TABLE public.mouvements_stock
    DROP CONSTRAINT IF EXISTS mouvements_stock_entree_positive_check;
ALTER TABLE public.mouvements_stock
    ADD CONSTRAINT mouvements_stock_entree_positive_check
    CHECK (type_mouvement <> 'entree' OR quantite > 0);

-- 4.7. mouvements_stock : si type_mouvement = 'sortie', quantite doit être > 0
--      (la valeur est stockée en positif, le sens indique sortie).
ALTER TABLE public.mouvements_stock
    DROP CONSTRAINT IF EXISTS mouvements_stock_sortie_positive_check;
ALTER TABLE public.mouvements_stock
    ADD CONSTRAINT mouvements_stock_sortie_positive_check
    CHECK (type_mouvement <> 'sortie' OR quantite > 0);

-- 4.8. codes_activation : si utilise = TRUE, date_utilisation doit être renseignée
--      (on ne peut pas marquer un code utilisé sans tracer quand).
ALTER TABLE public.codes_activation
    DROP CONSTRAINT IF EXISTS codes_activation_utilise_date_check;
ALTER TABLE public.codes_activation
    ADD CONSTRAINT codes_activation_utilise_date_check
    CHECK ((utilise = FALSE) OR (date_utilisation IS NOT NULL));

-- 4.9. codes_activation : si date_expiration est renseignée, date_expiration > date_generation
ALTER TABLE public.codes_activation
    DROP CONSTRAINT IF EXISTS codes_activation_expiration_check;
ALTER TABLE public.codes_activation
    ADD CONSTRAINT codes_activation_expiration_check
    CHECK (date_expiration IS NULL OR date_expiration > date_generation);


-- ============================================================
-- 5. Contraintes CHECK de référence
-- ============================================================

-- 5.1. personnel : si statut_compte = 'actif', user_id doit être renseigné
--      (un compte actif sans auth.users sous-jacent est incohérent).
ALTER TABLE public.personnel
    DROP CONSTRAINT IF EXISTS personnel_actif_user_id_check;
ALTER TABLE public.personnel
    ADD CONSTRAINT personnel_actif_user_id_check
    CHECK (statut_compte <> 'actif' OR user_id IS NOT NULL);

-- 5.2. personnel : si methode_creation = 'lien_invitation', token_invitation doit
--      être renseigné tant que statut_compte = 'invite_en_attente'.
ALTER TABLE public.personnel
    DROP CONSTRAINT IF EXISTS personnel_invitation_token_check;
ALTER TABLE public.personnel
    ADD CONSTRAINT personnel_invitation_token_check
    CHECK (
        (methode_creation <> 'lien_invitation') OR
        (statut_compte <> 'invite_en_attente') OR
        (token_invitation IS NOT NULL)
    );

-- 5.3. anomalies : si statut = 'resolue', date_resolution et resolu_par doivent être renseignés
ALTER TABLE public.anomalies
    DROP CONSTRAINT IF EXISTS anomalies_resolue_completude_check;
ALTER TABLE public.anomalies
    ADD CONSTRAINT anomalies_resolue_completude_check
    CHECK (
        (statut <> 'resolue') OR
        (date_resolution IS NOT NULL AND resolu_par IS NOT NULL)
    );


-- ============================================================
-- Fin de la migration 003_constraints.sql
-- Total : 6 contraintes UNIQUE + 28 contraintes CHECK = 34 contraintes
-- ============================================================
