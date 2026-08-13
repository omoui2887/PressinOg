-- ============================================================
-- e-pressing — Migration 019 : Champs dédiés aux caissiers
-- ============================================================
-- Fichier    : 019_champs_caissier.sql
-- Version    : 1.0
-- Date       : 01/08/2026
-- Description : Ajoute à la table `personnel` trois colonnes spécifiques
--               aux caissiers afin de corriger deux vulnérabilités
--               MOYENNES identifiées dans AUDIT_SECURITE.md :
--
--                 9.7  — Champs caissier non implémentés
--                        (modes_paiement_autorises, nom_affiche_recu,
--                         seuil_alerte_impaye)
--                 9.11 — Restriction des modes de paiement non appliquée
--                        côté serveur (la route /api/personnel/caissier/
--                        encaisser utilisait un METHODES_VALID statique
--                        global au lieu de lire les modes autorisés du
--                        caissier).
--
-- Colonnes ajoutées :
--   1. modes_paiement_autorises  JSONB
--      - Liste des modes de paiement que le caissier est autorisé à
--        encaisser (subset de ['especes','mobile_money','carte',
--        'cheque','virement']).
--      - Default : tous les modes autorisés (pour ne pas casser les
--        caissiers existants qui avaient auparavant tous les droits).
--      - CHECK : doit être un array JSON non-vide, et chaque élément
--        doit être dans l'ensemble des modes valides.
--
--   2. nom_affiche_recu  TEXT
--      - Nom du caissier tel qu'il doit apparaître sur les reçus
--        imprimés (ex : "Awa K." plutôt que "Awa Koné").
--      - Nullable : si NULL, l'application utilisera `nom_complet`.
--
--   3. seuil_alerte_impaye  INTEGER
--      - Montant (en FCFA) en-dessous duquel un solde impayé est
--        considéré comme acceptable (tolérance arrondi, micro-solde).
--      - Default : 5000 FCFA.
--      - CHECK : entier >= 0 et <= 1 000 000.
--
-- ⚠️  Idempotente : ADD COLUMN IF NOT EXISTS, DROP CONSTRAINT IF EXISTS
--     avant recréation, UPDATE ... WHERE ... IS NULL, COMMENT ON
--     ré-écrit systématiquement. Peut être ré-exécutée sans erreur.
--
-- ⚠️  NOTE SUR L'ENUM : les modes valides pour `modes_paiement_autorises`
--     sont ['especes','mobile_money','carte','cheque','virement'].
--     L'enum `methode_paiement` existant (migration 001) ne contient que
--     3 valeurs ('especes','mobile_money','carte_bancaire'). Ce CHECK est
--     volontairement plus large que l'enum pour permettre une extension
--     future (ajout de 'carte','cheque','virement' à l'enum sans casser
--     la colonne modes_paiement_autorises). La route
--     /api/personnel/caissier/encaisser conserve une double validation :
--     format (methode dans l'enum) + autorisation (methode dans le
--     sous-ensemble du caissier).
-- ============================================================


-- ============================================================
-- SECTION 1 : Ajout des 3 colonnes à `personnel`
-- ============================================================
-- ADD COLUMN IF NOT EXISTS garantit l'idempotence : la migration peut
-- être rejouée sans erreur si les colonnes existent déjà.
-- ============================================================

ALTER TABLE public.personnel
    ADD COLUMN IF NOT EXISTS modes_paiement_autorises JSONB
        NOT NULL
        DEFAULT '["especes","mobile_money","carte","cheque","virement"]'::jsonb;

ALTER TABLE public.personnel
    ADD COLUMN IF NOT EXISTS nom_affiche_recu TEXT;

ALTER TABLE public.personnel
    ADD COLUMN IF NOT EXISTS seuil_alerte_impaye INTEGER
        NOT NULL
        DEFAULT 5000;


-- ============================================================
-- SECTION 2 : CHECK constraint sur modes_paiement_autorises
-- ============================================================
-- Le champ doit être un array JSON non-vide, et chaque élément doit
-- appartenir à l'ensemble des modes valides.
--
-- On utilise jsonb_typeof() pour vérifier que c'est bien un array,
-- puis jsonb_array_length() > 0 pour s'assurer qu'il n'est pas vide.
--
-- Pour valider chaque élément : on utilise jsonb_array_elements_text()
-- qui expand l'array en lignes, puis on vérifie que toutes les lignes
-- sont dans l'ensemble autorisé avec un NOT EXISTS (... NOT IN ...).
-- ============================================================

-- Nettoyage préalable (idempotence)
ALTER TABLE public.personnel
    DROP CONSTRAINT IF EXISTS personnel_modes_paiement_autorises_check;

ALTER TABLE public.personnel
    ADD CONSTRAINT personnel_modes_paiement_autorises_check
    CHECK (
        jsonb_typeof(modes_paiement_autorises) = 'array'
        AND jsonb_array_length(modes_paiement_autorises) > 0
        AND NOT EXISTS (
            SELECT 1
            FROM jsonb_array_elements_text(modes_paiement_autorises) AS elem
            WHERE elem NOT IN (
                'especes',
                'mobile_money',
                'carte',
                'cheque',
                'virement'
            )
        )
    );


-- ============================================================
-- SECTION 3 : CHECK constraint sur seuil_alerte_impaye
-- ============================================================
-- Le seuil doit être un entier positif raisonnable (entre 0 et
-- 1 000 000 FCFA). 0 = aucune tolérance, 1 000 000 = tolérance
-- maximale absurde (garde-fou anti-saisie aberrante).
-- ============================================================

ALTER TABLE public.personnel
    DROP CONSTRAINT IF EXISTS personnel_seuil_alerte_impaye_check;

ALTER TABLE public.personnel
    ADD CONSTRAINT personnel_seuil_alerte_impaye_check
    CHECK (seuil_alerte_impaye >= 0 AND seuil_alerte_impaye <= 1000000);


-- ============================================================
-- SECTION 4 : Backfill des caissiers existants
-- ============================================================
-- Les nouveaux caissiers créés après cette migration hériteront du
-- DEFAULT JSONB (tous modes autorisés). Mais les caissiers existants
-- dont la ligne a été créée AVANT l'ajout de la colonne peuvent avoir
-- une valeur NULL si la colonne avait été ajoutée sans DEFAULT.
-- Comme on utilise ADD COLUMN ... NOT NULL DEFAULT ..., PostgreSQL
-- remplit automatiquement les lignes existantes avec la valeur par
-- défaut, mais on exécute tout de même l'UPDATE par sécurité (cas où
-- une colonne aurait été ajoutée manuellement avant cette migration
-- sans DEFAULT).
-- ============================================================

UPDATE public.personnel
SET modes_paiement_autorises = '["especes","mobile_money","carte","cheque","virement"]'::jsonb,
    seuil_alerte_impaye = COALESCE(seuil_alerte_impaye, 5000)
WHERE role = 'caissier'
  AND (modes_paiement_autorises IS NULL OR seuil_alerte_impaye IS NULL);


-- ============================================================
-- SECTION 5 : Commentaires SQL sur les colonnes
-- ============================================================
-- Les COMMENT ON COLUMN sont idempotents : ils écrasent le commentaire
-- précédent s'il existe. Ils sont visibles dans psql (\d+ personnel)
-- et dans l'onglet "Table" du Dashboard Supabase.
-- ============================================================

COMMENT ON COLUMN public.personnel.modes_paiement_autorises IS
    'Liste JSONB des modes de paiement autorisés pour ce caissier (subset de ["especes","mobile_money","carte","cheque","virement"]). Default = tous les modes. Contrainte CHECK : array non-vide + chaque élément dans l''enum valide. Référence : AUDIT_SECURITE.md 9.7 + 9.11.';

COMMENT ON COLUMN public.personnel.nom_affiche_recu IS
    'Nom du caissier tel qu''il doit apparaître sur les reçus imprimés (ex : "Awa K."). Si NULL, l''application utilise nom_complet. Référence : AUDIT_SECURITE.md 9.7.';

COMMENT ON COLUMN public.personnel.seuil_alerte_impaye IS
    'Seuil (FCFA) en-dessous duquel un solde impayé est considéré comme acceptable (tolérance arrondi / micro-solde). Default 5000. CHECK : entier entre 0 et 1 000 000. Référence : AUDIT_SECURITE.md 9.7.';


-- ============================================================
-- SECTION 6 : Index partiel pour accélérer les requêtes caissier
-- ============================================================
-- Index partiel sur (pressing_id) filtré aux caissiers actifs : permet
-- à l'admin de lister rapidement les caissiers d'un pressing (page
-- Personnel) sans scanner tous les employés.
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_personnel_caissiers_par_pressing
    ON public.personnel (pressing_id)
    WHERE role = 'caissier' AND actif = true;


-- ============================================================
-- Fin de la migration 019_champs_caissier.sql
-- ============================================================
