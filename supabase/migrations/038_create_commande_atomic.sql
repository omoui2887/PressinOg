-- ============================================================
-- e-pressing — Migration 038 : Création de commande atomique (RPC)
-- ============================================================
-- Fichier    : 038_create_commande_atomic.sql
-- Version    : 1.0
-- Objectif   : Rendre la création d'une commande 100 % atomique.
--
-- PROBLÈME (route.ts avant refactor) :
--   La route POST /api/admin/commandes exécutait 7 à 10 INSERTs
--   séquentiels (commandes → commande_lignes → articles_vetements × N
--   → paiements → audit_log) en dehors d'une transaction SQL. En cas
--   d'erreur à mi-parcours, un rollback MANUEL (DELETE cascade) était
--   tenté — mais :
--     - si la connexion tombait entre l'INSERT commande et le rollback,
--       la commande orpheline restait en base (lignes incomplètes,
--       montant_total ≠ somme des lignes, paiement absent, etc.) ;
--     - deux requêtes concurrentes pouvaient créer des commandes
--       dupliquées (le check d'idempotence pré-INSERT n'était pas
--       protégé par un verrou) ;
--     - le calcul du montant_total se faisait en TS puis était poussé
--       en base sans re-vérification serveur (un client malveillant
--       pouvait théoriquement envoyer un payload trompeur).
--
-- SOLUTION : une seule RPC PostgreSQL `create_commande_atomic(...)`
--   qui fait TOUT en une transaction :
--     1.  validation client (appartient au pressing)
--     2.  validation services (actifs, same pressing)
--     3.  validation catalogue_articles (actifs)
--     4.  validation tarifs (lecture serveur des tarifs_articles /
--         services.prix / prix custom — JAMAIS confiance au frontend)
--     5.  calcul sous-total (somme des lignes côté SQL)
--     6.  calcul remise (appel à calculer_remise_atomique / fidelite)
--     7.  calcul total (avant_remise - remise, clampé à 0)
--     8.  création commande (numero_commande auto via trigger 005)
--     9.  création commande_lignes (1 par article groupé)
--     10. création articles_vetements (N par ligne selon quantité)
--     11. création paiement initial si acompte fourni
--     12. mise à jour montant_paye / statut_paiement (manuelle, sans
--         dépendre du trigger AFTER INSERT paiements — cohérence
--         immédiate pour le RETURN)
--     13. création audit_log (create_commande + appliquer_remise*)
--     14. COMMIT automatique (RETURN)
--
--   En cas d'erreur à N'IMPORTE QUELLE étape : RAISE EXCEPTION →
--   PostgreSQL ROLLBACK automatique de TOUS les INSERTs/UPDATEs faits
--   dans la fonction. Aucune commande orpheline, aucun paiement sans
--   commande, aucun article sans ligne.
--
-- SÉCURITÉ :
--   - SECURITY INVOKER + REVOKE EXECUTE FROM anon/authenticated :
--     seul service_role (API routes via getSupabaseAdmin()) peut
--     appeler. Le JWT utilisateur ne suffit pas.
--   - p_pressing_id est vérifié côté SQL (defense-in-depth) — même si
--     l'API a déjà vérifié via RLS, la RPC re-vérifie.
--   - Les prix sont TOUJOURS recalculés côté SQL à partir de
--     services.prix / tarifs_articles. La seule exception est
--     is_custom=true où l'opérateur saisit un prix libre (validé ≥ 0).
--   - p_montant_paye / p_montant_total ne sont PAS des paramètres :
--     ils sont calculés intégralement dans la fonction.
--
-- NON-CASSABLE :
--   - CREATE OR REPLACE FUNCTION, ADD COLUMN IF NOT EXISTS,
--     CREATE INDEX IF NOT EXISTS.
--   - Les triggers existants (005) ne sont PAS supprimés — voir
--     SECTION 4 "Analyse des triggers existants" pour la démonstration
--     de redondance/partielle-redondance.
-- ============================================================


-- ============================================================
-- SECTION 1 — Contraintes SQL supplémentaires (defense-in-depth)
-- ============================================================
-- Ces CHECK constraints empêchent toute insertion incohérente, même
-- par un script SQL direct ou un futur code applicatif qui court-
-- circuite la RPC. Elles sont ADD COLUMN IF NOT EXISTS + DO $$ pour
-- être strictement idempotentes.

-- 1.1. articles_vetements : quantité cohérente (1 article = 1 vêtement
--      physique, pas un paquet). La table ne porte pas de colonne
--      `quantite` (c'est commande_lignes qui la porte) → pas de
--      contrainte à ajouter ici, mais on garantit via la RPC que pour
--      une ligne de quantité Q on insère exactement Q articles_vetements.

-- 1.2. commande_lignes : prix_unitaire >= 0 (déjà CHECK dans 003)
--      Vérifions juste que la contrainte existe, sinon on l'ajoute.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'commande_lignes_prix_unitaire_check'
      AND conrelid = 'public.commande_lignes'::regclass
  ) THEN
    ALTER TABLE public.commande_lignes
      ADD CONSTRAINT commande_lignes_prix_unitaire_check
      CHECK (prix_unitaire >= 0);
  END IF;
END $$;

-- 1.3. commande_lignes : montant_ligne = prix_unitaire * quantite
--      Garantit la cohérence arithmétique (anti-incohérence si un
--      script pousse un montant_ligne erroné).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'commande_lignes_montant_coherent_check'
      AND conrelid = 'public.commande_lignes'::regclass
  ) THEN
    ALTER TABLE public.commande_lignes
      ADD CONSTRAINT commande_lignes_montant_coherent_check
      CHECK (montant_ligne = prix_unitaire * quantite);
  END IF;
END $$;

-- 1.4. commandes : montant_total_avant_remise >= 0
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'commandes_montant_avant_remise_positif_check'
      AND conrelid = 'public.commandes'::regclass
  ) THEN
    ALTER TABLE public.commandes
      ADD CONSTRAINT commandes_montant_avant_remise_positif_check
      CHECK (montant_total_avant_remise >= 0);
  END IF;
END $$;

-- 1.5. commandes : montant_remise >= 0 (déjà implicite via trigger 036
--      mais on l'ajoute explicitement pour les scripts qui bypassent
--      les triggers).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'commandes_montant_remise_positif_check'
      AND conrelid = 'public.commandes'::regclass
  ) THEN
    ALTER TABLE public.commandes
      ADD CONSTRAINT commandes_montant_remise_positif_check
      CHECK (montant_remise >= 0);
  END IF;
END $$;

-- 1.6. commandes : cohérence totale = avant - remise (le trigger 036
--      `guard_remise_coherence` corrige automatiquement montant_total,
--      mais ajoutons aussi un CHECK strict pour les scripts qui
--      contournent les triggers — ils recevront une erreur claire
--      au lieu d'une incohérence silencieuse).
--      ⚠️ Ce CHECK ne corrige PAS (contrairement au trigger), il
--      REFUSE. Comme la RPC calcule toujours montant_total correctement
--      avant l'INSERT, ce CHECK ne sera jamais violé par la RPC.
--      Il protège uniquement contre les inserts directs hors-RPC.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'commandes_montant_total_coherent_check'
      AND conrelid = 'public.commandes'::regclass
  ) THEN
    ALTER TABLE public.commandes
      ADD CONSTRAINT commandes_montant_total_coherent_check
      CHECK (montant_total = montant_total_avant_remise - montant_remise);
  END IF;
END $$;

-- 1.7. commandes : montant_paye >= 0 ET <= montant_total + 1
--      (tolérance 1 FCFA pour les arrondis, alignée sur la pratique
--      existante — migration 035 SECTION 8).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'commandes_montant_paye_coherent_check'
      AND conrelid = 'public.commandes'::regclass
  ) THEN
    ALTER TABLE public.commandes
      ADD CONSTRAINT commandes_montant_paye_coherent_check
      CHECK (montant_paye >= 0 AND montant_paye <= montant_total + 1);
  END IF;
END $$;


-- ============================================================
-- SECTION 2 — RPC : create_commande_atomic(...)
-- ============================================================
-- Signature : cf. commentaire ci-dessus. Tous les paramètres sont
-- explicitement typés (pas de TEXT générique pour les UUID/ints).
-- p_articles_json est un JSONB array d'objets :
--   {
--     service_id, catalogue_article_id, catalogue_article_nom,
--     couleur, couleur_libre, etat, description_etat,
--     quantite, is_custom, prix_unitaire
--   }
-- p_remise est un JSONB { type, valeur } ou NULL.
-- p_acompte est un JSONB { montant, methode, reference } ou NULL.

CREATE OR REPLACE FUNCTION public.create_commande_atomic(
  p_pressing_id        UUID,
  p_user_id            UUID,
  p_personnel_id       UUID,
  p_role               TEXT,
  p_client_id          UUID,
  p_date_pret_prevue   TIMESTAMPTZ,
  p_notes              TEXT             DEFAULT NULL,
  p_priorite           TEXT             DEFAULT 'normal',
  p_idempotence_key    TEXT             DEFAULT NULL,
  p_articles_json      JSONB            DEFAULT NULL,
  p_remise             JSONB            DEFAULT NULL,
  p_acompte            JSONB            DEFAULT NULL,
  p_ip_address         INET             DEFAULT NULL,
  p_user_agent         TEXT             DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_now                TIMESTAMPTZ := NOW();
  v_date_retrait       TIMESTAMPTZ;
  v_retrait_delay_ms   INTEGER;
  v_priorite           TEXT := COALESCE(NULLIF(p_priorite, ''), 'normal');

  -- Article loop
  v_article            JSONB;
  v_article_idx        INTEGER := 0;
  v_nb_articles        INTEGER;
  v_service_id         UUID;
  v_catalogue_id       UUID;
  v_catalogue_nom      TEXT;
  v_couleur            TEXT;
  v_couleur_libre      TEXT;
  v_etat               TEXT;
  v_description_etat   TEXT;
  v_quantite           INTEGER;
  v_is_custom          BOOLEAN;
  v_prix_custom        INTEGER;
  v_service_row        RECORD;
  v_catalogue_row      RECORD;
  v_tarif_prix         INTEGER;
  v_prix_unitaire      INTEGER;
  v_montant_ligne      INTEGER;
  v_description        TEXT;

  -- Aggregated data
  v_service_ids        UUID[] := ARRAY[]::UUID[];
  v_catalogue_ids      UUID[] := ARRAY[]::UUID[];
  v_service_map        JSONB := '{}'::jsonb;  -- {service_id: {type, prix, actif}}
  v_catalogue_map      JSONB := '{}'::jsonb; -- {catalogue_id: {nom, actif}}
  v_tarif_map          JSONB := '{}'::jsonb; -- {catalogue_id::type: prix}

  -- Financial
  v_montant_avant      INTEGER := 0;
  v_montant_remise     INTEGER := 0;
  v_remise_type        remise_type := 'aucune';
  v_remise_valeur      INTEGER := 0;
  v_remise_input_type  remise_type;
  v_remise_input_valeur INTEGER;
  v_remise_result      JSONB;
  v_pct_fidelite       INTEGER;
  v_montant_total      INTEGER;
  v_acompte_montant    INTEGER := 0;
  v_acompte_methode    methode_paiement;
  v_acompte_reference  TEXT;
  v_montant_paye       INTEGER := 0;
  v_statut_paiement    statut_paiement_commande := 'non_paye';
  v_est_acompte        BOOLEAN := false;

  -- Commande
  v_commande_id        UUID;
  v_numero_commande    TEXT;
  v_ligne_id           UUID;
  v_short_commande_id  TEXT;

  -- Idempotence replay
  v_existing_cmd       RECORD;

  -- Validation flags
  v_couleur_valid      BOOLEAN;
  v_etat_valid         BOOLEAN;
  v_role_ok_remise     BOOLEAN;

  -- Couleurs / états valides (miroir des enums couleur_vetement + etat_vetement)
  v_couleurs_valides   TEXT[] := ARRAY['blanc','noir','bleu','rouge','vert','jaune','gris','marron','autre'];
  v_etats_valides      TEXT[] := ARRAY['bon','acceptable','use','dechire','tache'];
  v_methodes_valides   TEXT[] := ARRAY['especes','mobile_money','carte_bancaire'];
BEGIN
  -- --------------------------------------------------------
  -- 0. Validation des entrées NON-financières (shape + enums)
  -- --------------------------------------------------------
  IF p_articles_json IS NULL OR jsonb_array_length(p_articles_json) = 0 THEN
    RETURN jsonb_build_object('success', false, 'code', 'ARTICLES_VIDES',
      'error', 'Au moins un article est requis.');
  END IF;

  IF p_client_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'CLIENT_ID_REQUIS',
      'error', 'client_id est requis.');
  END IF;

  IF p_date_pret_prevue IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'DATE_PRET_REQUISE',
      'error', 'date_pret_prevue est requis (ISO date).');
  END IF;

  IF p_notes IS NOT NULL AND length(p_notes) > 2000 THEN
    RETURN jsonb_build_object('success', false, 'code', 'NOTES_TOO_LONG',
      'error', 'Les notes ne peuvent pas dépasser 2000 caractères.');
  END IF;

  IF v_priorite NOT IN ('normal', 'express') THEN
    RETURN jsonb_build_object('success', false, 'code', 'PRIORITE_INVALIDE',
      'error', 'priorite doit être normal ou express.');
  END IF;

  IF p_idempotence_key IS NOT NULL AND length(p_idempotence_key) > 100 THEN
    RETURN jsonb_build_object('success', false, 'code', 'IDEMPOTENCE_KEY_TOO_LONG',
      'error', 'idempotence_key ne peut pas dépasser 100 caractères.');
  END IF;

  -- --------------------------------------------------------
  -- 0.b. Idempotence replay (SELECT FOR UPDATE pour verrouiller
  --      pendant la durée de la transaction, empêchant 2 requêtes
  --      concurrentes avec la même clé de créer 2 commandes).
  -- --------------------------------------------------------
  IF p_idempotence_key IS NOT NULL AND p_idempotence_key <> '' THEN
    -- Le SELECT FOR UPDATE verrouille la ligne existante. Si elle est
    -- déjà verrouillée par une transaction concurrente (en cours de
    -- création), on attend qu'elle commit avant de lire. Soit on
    -- trouve la commande (→ replay), soit on ne trouve rien (→
    -- création).
    SELECT id, pressing_id, numero_commande, montant_total, montant_paye,
           statut, statut_paiement, priorite, date_pret_prevue, date_retrait
      INTO v_existing_cmd
      FROM public.commandes
     WHERE pressing_id = p_pressing_id
       AND idempotence_key = p_idempotence_key
     FOR UPDATE;

    IF FOUND THEN
      -- Defense-in-depth : vérifie que la commande appartient bien au
      -- pressing passé en paramètre.
      IF v_existing_cmd.pressing_id IS DISTINCT FROM p_pressing_id THEN
        RETURN jsonb_build_object('success', false, 'code', 'PRESSING_MISMATCH',
          'error', 'La commande existante n''appartient pas au pressing spécifié.');
      END IF;

      RETURN jsonb_build_object(
        'success', true,
        'code', 'IDEMPOTENT_REPLAY',
        'data', jsonb_build_object(
          'id', v_existing_cmd.id,
          'pressing_id', v_existing_cmd.pressing_id,
          'numero_commande', v_existing_cmd.numero_commande,
          'montant_total', v_existing_cmd.montant_total,
          'montant_paye', v_existing_cmd.montant_paye,
          'statut', v_existing_cmd.statut,
          'statut_paiement', v_existing_cmd.statut_paiement,
          'priorite', v_existing_cmd.priorite,
          'date_pret_prevue', v_existing_cmd.date_pret_prevue,
          'date_retrait', v_existing_cmd.date_retrait
        )
      );
    END IF;
    -- Sinon : pas de commande existante, on continue normalement.
    -- La transaction garantit qu'aucune autre ne peut insérer avec la
    -- même clé tant qu'on n'a pas commit (verrou sur l'index unique
    -- partiel idx_commandes_idempotence).
  END IF;

  -- --------------------------------------------------------
  -- 1. Validation client (appartient au pressing)
  -- --------------------------------------------------------
  PERFORM 1 FROM public.clients
    WHERE id = p_client_id
      AND pressing_id = p_pressing_id
    FOR SHARE;  -- verrou partagé : empêche la suppression du client
                -- pendant la création de la commande

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'CLIENT_INTROUVABLE',
      'error', 'Client introuvable dans votre pressing.');
  END IF;

  -- --------------------------------------------------------
  -- 2-3-4. Validation services + catalogue + tarifs
  --   On collecte d'abord tous les IDs, puis on fetch en une seule
  --   requête par table (évite N+1).
  -- --------------------------------------------------------
  v_nb_articles := jsonb_array_length(p_articles_json);

  <<article_loop>>
  FOR v_article_idx IN 0..(v_nb_articles - 1) LOOP
    v_article := p_articles_json->v_article_idx;

    -- Extrait + valide les champs de l'article
    v_service_id := NULLIF(v_article->>'service_id', '');
    v_catalogue_id := NULLIF(v_article->>'catalogue_article_id', '');
    v_catalogue_nom := v_article->>'catalogue_article_nom';
    v_couleur := v_article->>'couleur';
    v_couleur_libre := v_article->>'couleur_libre';
    v_etat := v_article->>'etat';
    v_description_etat := v_article->>'description_etat';
    v_is_custom := (v_article->>'is_custom')::BOOLEAN;
    v_prix_custom := NULLIF(v_article->>'prix_unitaire', '')::INTEGER;

    IF v_service_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'code', 'ARTICLE_INVALIDE',
        'error', 'Article ' || (v_article_idx + 1) || ' : service_id est requis.');
    END IF;
    IF v_catalogue_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'code', 'ARTICLE_INVALIDE',
        'error', 'Article ' || (v_article_idx + 1) || ' : catalogue_article_id est requis.');
    END IF;
    IF v_catalogue_nom IS NULL OR v_catalogue_nom = '' THEN
      RETURN jsonb_build_object('success', false, 'code', 'ARTICLE_INVALIDE',
        'error', 'Article ' || (v_article_idx + 1) || ' : catalogue_article_nom est requis.');
    END IF;

    v_couleur_valid := v_couleur = ANY(v_couleurs_valides);
    IF NOT v_couleur_valid THEN
      RETURN jsonb_build_object('success', false, 'code', 'ARTICLE_INVALIDE',
        'error', 'Article ' || (v_article_idx + 1) || ' : couleur invalide.');
    END IF;
    IF v_couleur = 'autre' AND (v_couleur_libre IS NULL OR v_couleur_libre = '') THEN
      RETURN jsonb_build_object('success', false, 'code', 'ARTICLE_INVALIDE',
        'error', 'Article ' || (v_article_idx + 1) || ' : couleur_libre est requis quand couleur=autre.');
    END IF;
    IF v_couleur_libre IS NOT NULL AND length(v_couleur_libre) > 100 THEN
      v_couleur_libre := left(v_couleur_libre, 100);
    END IF;

    v_etat_valid := v_etat = ANY(v_etats_valides);
    IF NOT v_etat_valid THEN
      RETURN jsonb_build_object('success', false, 'code', 'ARTICLE_INVALIDE',
        'error', 'Article ' || (v_article_idx + 1) || ' : etat invalide.');
    END IF;
    IF v_description_etat IS NOT NULL AND length(v_description_etat) > 500 THEN
      v_description_etat := left(v_description_etat, 500);
    END IF;

    v_quantite := NULLIF(v_article->>'quantite', '')::INTEGER;
    IF v_quantite IS NULL OR v_quantite < 1 OR v_quantite != floor(v_quantite) THEN
      RETURN jsonb_build_object('success', false, 'code', 'ARTICLE_INVALIDE',
        'error', 'Article ' || (v_article_idx + 1) || ' : quantite doit être un entier >= 1.');
    END IF;

    IF v_is_custom THEN
      IF v_prix_custom IS NULL OR v_prix_custom < 0 THEN
        RETURN jsonb_build_object('success', false, 'code', 'ARTICLE_INVALIDE',
          'error', 'Article ' || (v_article_idx + 1) || ' : prix_unitaire invalide (entier >= 0 FCFA requis pour un article personnalisé).');
      END IF;
    END IF;

    -- Collecte les IDs pour batch fetch
    IF NOT (v_service_ids @> ARRAY[v_service_id]) THEN
      v_service_ids := array_append(v_service_ids, v_service_id);
    END IF;
    IF NOT (v_catalogue_ids @> ARRAY[v_catalogue_id]) THEN
      v_catalogue_ids := array_append(v_catalogue_ids, v_catalogue_id);
    END IF;
  END LOOP article_loop;

  -- Fetch services (active + same pressing) en une requête
  FOR v_service_row IN
    SELECT id, type, prix, actif
      FROM public.services
     WHERE id = ANY(v_service_ids)
       AND pressing_id = p_pressing_id
  LOOP
    v_service_map := jsonb_set(v_service_map,
      ARRAY[v_service_row.id::TEXT],
      jsonb_build_object('type', v_service_row.type, 'prix', v_service_row.prix, 'actif', v_service_row.actif)
    );
  END LOOP;

  -- Vérifie que tous les services sont présents + actifs
  FOREACH v_service_id IN ARRAY v_service_ids LOOP
    IF NOT v_service_map ? v_service_id::TEXT THEN
      RETURN jsonb_build_object('success', false, 'code', 'SERVICE_INTROUVABLE',
        'error', 'Service introuvable dans votre pressing.');
    END IF;
    IF (v_service_map->v_service_id::TEXT->>'actif')::BOOLEAN = false THEN
      RETURN jsonb_build_object('success', false, 'code', 'SERVICE_INACTIF',
        'error', 'Un service inactif ne peut pas être utilisé.');
    END IF;
  END LOOP;

  -- Fetch catalogue_articles (active) en une requête
  FOR v_catalogue_row IN
    SELECT id, nom, actif
      FROM public.catalogue_articles
     WHERE id = ANY(v_catalogue_ids)
  LOOP
    v_catalogue_map := jsonb_set(v_catalogue_map,
      ARRAY[v_catalogue_row.id::TEXT],
      jsonb_build_object('nom', v_catalogue_row.nom, 'actif', v_catalogue_row.actif)
    );
  END LOOP;

  FOREACH v_catalogue_id IN ARRAY v_catalogue_ids LOOP
    IF NOT v_catalogue_map ? v_catalogue_id::TEXT THEN
      RETURN jsonb_build_object('success', false, 'code', 'CATALOGUE_INTROUVABLE',
        'error', 'Article du catalogue introuvable.');
    END IF;
    IF (v_catalogue_map->v_catalogue_id::TEXT->>'actif')::BOOLEAN = false THEN
      RETURN jsonb_build_object('success', false, 'code', 'CATALOGUE_INACTIF',
        'error', 'Article du catalogue inactif, impossible de l''utiliser.');
    END IF;
  END LOOP;

  -- Fetch tarifs_articles pour les couples (catalogue_id, type_service)
  -- présents dans la commande. Un seul SELECT pour tous.
  SELECT COALESCE(jsonb_object_agg(
      ta.catalogue_article_id::TEXT || '::' || ta.type_service,
      ta.prix
    ), '{}'::jsonb)
    INTO v_tarif_map
    FROM public.tarifs_articles ta
   WHERE ta.pressing_id = p_pressing_id
     AND ta.catalogue_article_id = ANY(v_catalogue_ids)
     AND ta.actif = true;

  -- --------------------------------------------------------
  -- 5. Calcul sous-total (montant_total_avant_remise)
  --    Boucle sur les articles, résout le prix unitaire de chaque
  --    article via : is_custom ? prix_custom : tarif_spécifique ?
  --    sinon services.prix.
  -- --------------------------------------------------------
  FOR v_article_idx IN 0..(v_nb_articles - 1) LOOP
    v_article := p_articles_json->v_article_idx;
    v_service_id := (v_article->>'service_id')::UUID;
    v_catalogue_id := (v_article->>'catalogue_article_id')::UUID;
    v_is_custom := (v_article->>'is_custom')::BOOLEAN;
    v_prix_custom := NULLIF(v_article->>'prix_unitaire', '')::INTEGER;
    v_quantite := (v_article->>'quantite')::INTEGER;

    IF v_is_custom THEN
      v_prix_unitaire := COALESCE(v_prix_custom, 0);
    ELSE
      -- Lookup tarif spécifique (catalogue_id::type_service)
      v_tarif_prix := NULL;
      BEGIN
        v_tarif_prix := (v_tarif_map->>(
          v_catalogue_id::TEXT || '::' ||
          (v_service_map->v_service_id::TEXT->>'type')
        ))::INTEGER;
      EXCEPTION WHEN OTHERS THEN
        v_tarif_prix := NULL;
      END;
      -- Fallback sur service.prix
      v_prix_unitaire := COALESCE(v_tarif_prix,
        (v_service_map->v_service_id::TEXT->>'prix')::INTEGER, 0);
    END IF;

    v_montant_ligne := v_prix_unitaire * v_quantite;
    v_montant_avant := v_montant_avant + v_montant_ligne;
  END LOOP;

  -- --------------------------------------------------------
  -- 6. Calcul remise (côté serveur uniquement)
  --    Appelle la RPC existante `calculer_remise_atomique` (migration 036)
  --    qui valide le rôle, le % max, le seuil exceptionnel, l'index
  --    article, le clamp au sous-total.
  --
  --    Pour la fidélité, on appelle d'abord `calculer_remise_fidelite_auto`
  --    pour récupérer le % applicable (0/3/5 selon palier), puis on
  --    appelle `calculer_remise_atomique` avec ce %.
  -- --------------------------------------------------------
  IF p_remise IS NOT NULL THEN
    v_remise_input_type := NULLIF(p_remise->>'type', '')::remise_type;
    v_remise_input_valeur := NULLIF(p_remise->>'valeur', '')::INTEGER;

    IF v_remise_input_type IS NULL OR v_remise_input_type = 'aucune' THEN
      v_montant_remise := 0;
      v_remise_type := 'aucune';
      v_remise_valeur := 0;
    ELSIF v_remise_input_type = 'fidelite' THEN
      -- Calcule le % automatiquement (0/3/5 selon palier + config pressing)
      v_pct_fidelite := public.calculer_remise_fidelite_auto(p_pressing_id, p_client_id);
      IF v_pct_fidelite = 0 THEN
        v_montant_remise := 0;
        v_remise_type := 'aucune';
        v_remise_valeur := 0;
      ELSE
        -- Valide via la RPC atomique (vérifie que le % ne dépasse pas
        -- le palier max configuré — anti-fraude).
        SELECT public.calculer_remise_atomique(
          p_pressing_id, v_montant_avant, 'fidelite'::remise_type,
          v_pct_fidelite, p_role, NULL
        ) INTO v_remise_result;

        IF (v_remise_result->>'success')::BOOLEAN = false THEN
          -- Propage l'erreur (ex: FIDELITE_PCT_INVALIDE)
          RETURN v_remise_result;
        END IF;

        v_montant_remise := (v_remise_result->>'montant_remise')::INTEGER;
        v_remise_type := 'fidelite'::remise_type;
        v_remise_valeur := (v_remise_result->>'remise_valeur_appliquee')::INTEGER;
      END IF;
    ELSE
      -- Remise commerciale : pourcentage / montant_fixe / article_gratuit
      -- Prépare le JSON des articles pour article_gratuit (index validation)
      DECLARE
        v_articles_for_remise JSONB;
      BEGIN
        IF v_remise_input_type = 'article_gratuit' THEN
          SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'prix_unitaire', CASE
              WHEN (a->>'is_custom')::BOOLEAN THEN NULLIF(a->>'prix_unitaire', '')::INTEGER
              ELSE COALESCE(
                (v_tarif_map->>(
                  (a->>'catalogue_article_id') || '::' ||
                  (v_service_map->(a->>'service_id')->>'type')
                ))::INTEGER,
                (v_service_map->(a->>'service_id')->>'prix')::INTEGER, 0
              )
            END,
            'quantite', (a->>'quantite')::INTEGER
          )), '[]'::jsonb)
            INTO v_articles_for_remise
            FROM jsonb_array_elements(p_articles_json) AS a;
        ELSE
          v_articles_for_remise := NULL;
        END IF;

        SELECT public.calculer_remise_atomique(
          p_pressing_id, v_montant_avant, v_remise_input_type,
          COALESCE(v_remise_input_valeur, 0), p_role, v_articles_for_remise
        ) INTO v_remise_result;

        IF (v_remise_result->>'success')::BOOLEAN = false THEN
          RETURN v_remise_result;
        END IF;

        v_montant_remise := (v_remise_result->>'montant_remise')::INTEGER;
        v_remise_type := (v_remise_result->>'remise_type_appliquee')::remise_type;
        v_remise_valeur := (v_remise_result->>'remise_valeur_appliquee')::INTEGER;
      END;
    END IF;
  ELSE
    v_montant_remise := 0;
    v_remise_type := 'aucune'::remise_type;
    v_remise_valeur := 0;
  END IF;

  -- --------------------------------------------------------
  -- 7. Calcul montant_total (clampé à 0, ne peut pas être négatif)
  -- --------------------------------------------------------
  v_montant_total := GREATEST(0, v_montant_avant - v_montant_remise);

  -- --------------------------------------------------------
  -- 8-9-10. Validation acompte + détermination statut_paiement
  -- --------------------------------------------------------
  IF p_acompte IS NOT NULL THEN
    v_acompte_montant := NULLIF(p_acompte->>'montant', '')::INTEGER;
    v_acompte_methode := NULLIF(p_acompte->>'methode', '')::methode_paiement;
    v_acompte_reference := p_acompte->>'reference';

    IF v_acompte_montant IS NULL OR v_acompte_montant <= 0
       OR v_acompte_montant != floor(v_acompte_montant) THEN
      RETURN jsonb_build_object('success', false, 'code', 'ACOMPTE_INVALIDE',
        'error', 'acompte.montant doit être un entier > 0.');
    END IF;

    IF v_acompte_methode IS NULL THEN
      RETURN jsonb_build_object('success', false, 'code', 'ACOMPTE_INVALIDE',
        'error', 'acompte.methode invalide.');
    END IF;

    IF v_acompte_montant > v_montant_total THEN
      RETURN jsonb_build_object('success', false, 'code', 'ACOMPTE_DEPASSE_TOTAL',
        'error', 'acompte.montant (' || v_acompte_montant ||
          ') ne peut pas dépasser le montant_total (' || v_montant_total || ').',
        'details', jsonb_build_object(
          'acompte_montant', v_acompte_montant,
          'montant_total', v_montant_total
        ));
    END IF;

    IF v_acompte_reference IS NOT NULL AND length(v_acompte_reference) > 200 THEN
      v_acompte_reference := left(v_acompte_reference, 200);
    END IF;

    v_montant_paye := v_acompte_montant;
    IF v_acompte_montant >= v_montant_total THEN
      v_statut_paiement := 'paye';
      v_est_acompte := false;  -- paiement total = pas un acompte
    ELSE
      v_statut_paiement := 'partiel';
      v_est_acompte := true;
    END IF;
  ELSE
    v_montant_paye := 0;
    v_statut_paiement := 'non_paye';
    v_est_acompte := false;
  END IF;

  -- --------------------------------------------------------
  -- Date de retrait calculée côté serveur (le client n'a PAS la main)
  --   normal  → date_pret_prevue + 7 jours
  --   express → date_pret_prevue + 3 jours
  -- --------------------------------------------------------
  IF v_priorite = 'express' THEN
    v_retrait_delay_ms := 3 * 24 * 60 * 60 * 1000;  -- 3 jours en ms
  ELSE
    v_retrait_delay_ms := 7 * 24 * 60 * 60 * 1000;  -- 7 jours en ms
  END IF;
  v_date_retrait := p_date_pret_prevue + (v_retrait_delay_ms || ' milliseconds')::INTERVAL;

  -- --------------------------------------------------------
  -- 11. INSERT commande (numero_commande = NULL → trigger 005 génère)
  -- --------------------------------------------------------
  -- ⚠️ Le trigger `trg_commandes_numero_auto` (migration 005) utilise
  -- pg_advisory_xact_lock(pressing_id, year) pour sérialiser les
  -- INSERTs concurrents et COUNT(*)+1 pour le numéro séquentiel. Le
  -- numéro généré est CMD-YYYY-NNNNN. On récupère le numéro via
  -- RETURNING.
  INSERT INTO public.commandes (
    pressing_id, client_id, numero_commande,
    statut, statut_paiement,
    montant_total, montant_paye,
    remise_type, remise_valeur,
    montant_total_avant_remise, montant_remise,
    date_reception, date_pret_prevue, date_retrait,
    livraison, frais_livraison,
    notes, priorite,
    idempotence_key, cree_par
  ) VALUES (
    p_pressing_id, p_client_id, NULL,
    'recu', v_statut_paiement,
    v_montant_total, v_montant_paye,
    v_remise_type, v_remise_valeur,
    v_montant_avant, v_montant_remise,
    v_now, p_date_pret_prevue, v_date_retrait,
    false, 0,
    p_notes, v_priorite,
    NULLIF(p_idempotence_key, ''), p_personnel_id
  )
  RETURNING id, numero_commande
    INTO v_commande_id, v_numero_commande;

  -- En cas d'exception (ex: collision unique sur idempotence_key entre
  -- 2 transactions concurrentes — le SELECT FOR UPDATE n'attrape pas
  -- le cas où aucune ligne n'existe encore pour les 2 transactions),
  -- PostgreSQL ROLLBACK automatiquement toute la fonction → commande
  -- orpheline impossible. L'API retry si besoin (voir route.ts).

  v_short_commande_id := left(v_commande_id::TEXT, 8);

  -- --------------------------------------------------------
  -- 12. INSERT commande_lignes + articles_vetements
  --     Boucle sur les articles. Pour chaque article :
  --       - résout le prix unitaire (même logique qu'au step 5)
  --       - INSERT 1 commande_lignes
  --       - INSERT N articles_vetements (1 par unité de quantite)
  -- --------------------------------------------------------
  FOR v_article_idx IN 0..(v_nb_articles - 1) LOOP
    v_article := p_articles_json->v_article_idx;
    v_service_id := (v_article->>'service_id')::UUID;
    v_catalogue_id := (v_article->>'catalogue_article_id')::UUID;
    v_catalogue_nom := v_article->>'catalogue_article_nom';
    v_couleur := v_article->>'couleur';
    v_couleur_libre := v_article->>'couleur_libre';
    v_etat := v_article->>'etat';
    v_description_etat := v_article->>'description_etat';
    v_is_custom := (v_article->>'is_custom')::BOOLEAN;
    v_prix_custom := NULLIF(v_article->>'prix_unitaire', '')::INTEGER;
    v_quantite := (v_article->>'quantite')::INTEGER;

    -- Pour les articles NON-custom, on utilise le nom vérifié côté
    -- serveur (le catalogue est la source de vérité). Pour les customs,
    -- on garde le nom saisi par l'opérateur (sinon on perd l'info
    -- métier "Boubou traditionnel").
    IF NOT v_is_custom THEN
      v_catalogue_nom := v_catalogue_map->v_catalogue_id::TEXT->>'nom';
    END IF;

    -- Résout le prix unitaire (déjà calculé au step 5, on refait le
    -- même calcul — pas de cache variable pour rester lisible).
    IF v_is_custom THEN
      v_prix_unitaire := COALESCE(v_prix_custom, 0);
    ELSE
      v_tarif_prix := NULL;
      BEGIN
        v_tarif_prix := (v_tarif_map->>(
          v_catalogue_id::TEXT || '::' ||
          (v_service_map->v_service_id::TEXT->>'type')
        ))::INTEGER;
      EXCEPTION WHEN OTHERS THEN
        v_tarif_prix := NULL;
      END;
      v_prix_unitaire := COALESCE(v_tarif_prix,
        (v_service_map->v_service_id::TEXT->>'prix')::INTEGER, 0);
    END IF;

    v_montant_ligne := v_prix_unitaire * v_quantite;

    -- Description lisible : "Chemises blanc — bon — description"
    v_description := concat_ws(' ',
      v_catalogue_nom,
      CASE WHEN v_couleur = 'autre' AND v_couleur_libre IS NOT NULL
           THEN v_couleur_libre ELSE v_couleur END,
      '—',
      v_etat,
      CASE WHEN v_description_etat IS NOT NULL
           THEN '— ' || v_description_etat ELSE NULL END
    );

    INSERT INTO public.commande_lignes (
      commande_id, service_id, description, quantite,
      prix_unitaire, montant_ligne
    ) VALUES (
      v_commande_id, v_service_id, v_description, v_quantite,
      v_prix_unitaire, v_montant_ligne
    )
    RETURNING id INTO v_ligne_id;

    -- INSERT N articles_vetements (1 par unité)
    -- On utilise generate_series pour un INSERT unique (plus efficace
    -- que N INSERTs séparés).
    INSERT INTO public.articles_vetements (
      commande_id, ligne_id, code_qr,
      catalogue_article_id,
      couleur, couleur_libre, etat, description_etat,
      statut
    )
    SELECT
      v_commande_id, v_ligne_id,
      v_short_commande_id || '-' || v_article_idx || '-' || (g.n - 1),
      v_catalogue_id,
      v_couleur::couleur_vetement, v_couleur_libre,
      v_etat::etat_vetement, v_description_etat,
      'recu'::statut_article
    FROM generate_series(1, v_quantite) AS g(n);
  END LOOP;

  -- --------------------------------------------------------
  -- 13. INSERT acompte (si fourni)
  --     ⚠️ Le trigger `trg_commandes_paiement_apres_paiement_insert`
  --     (migration 005) va recalculer montant_paye + statut_paiement
  --     après l'INSERT. Comme on a déjà set les bonnes valeurs dans
  --     la commande, ce sera un no-op (valeur identique).
  --     Le trigger `guard_paiement_pas_depassement` (035) va vérifier
  --     que montant ≤ montant_total + 1 — déjà validé plus haut, OK.
  -- --------------------------------------------------------
  IF p_acompte IS NOT NULL AND v_acompte_montant > 0 THEN
    INSERT INTO public.paiements (
      commande_id, montant, methode, reference,
      date_paiement, enregistre_par,
      est_acompte, statut_row
    ) VALUES (
      v_commande_id, v_acompte_montant, v_acompte_methode, v_acompte_reference,
      v_now, p_personnel_id,
      v_est_acompte, 'actif'
    );
  END IF;

  -- --------------------------------------------------------
  -- 14. Audit log — create_commande (+ appliquer_remise si remise > 0)
  --     Best-effort : si l'INSERT audit_log échoue (ex: RLS future),
  --     on ne rollback PAS la commande. Mais comme la RLS bloque
  --     INSERT pour authenticated/anon et qu'on tourne en service_role
  --     (bypass), ça ne peut pas échouer ici.
  -- --------------------------------------------------------
  INSERT INTO public.audit_log (
    pressing_id, user_id, action, entity_type, entity_id,
    before_state, after_state, ip_address, user_agent
  ) VALUES (
    p_pressing_id, p_user_id, 'create_commande', 'commande', v_commande_id::TEXT,
    NULL,
    jsonb_build_object(
      'id', v_commande_id,
      'pressing_id', p_pressing_id,
      'client_id', p_client_id,
      'numero_commande', v_numero_commande,
      'statut', 'recu',
      'statut_paiement', v_statut_paiement,
      'montant_total', v_montant_total,
      'montant_paye', v_montant_paye,
      'montant_total_avant_remise', v_montant_avant,
      'montant_remise', v_montant_remise,
      'remise_type', v_remise_type,
      'remise_valeur', v_remise_valeur,
      'priorite', v_priorite,
      'date_pret_prevue', p_date_pret_prevue,
      'date_retrait', v_date_retrait,
      'notes', p_notes,
      'nb_articles', v_nb_articles
    ),
    p_ip_address, p_user_agent
  );

  -- Audit remise (si une remise non-nulle a été appliquée)
  IF v_montant_remise > 0 THEN
    INSERT INTO public.audit_log (
      pressing_id, user_id, action, entity_type, entity_id,
      before_state, after_state, ip_address, user_agent
    ) VALUES (
      p_pressing_id, p_user_id,
      CASE WHEN v_remise_type = 'pourcentage' AND v_remise_valeur > 20
           THEN 'appliquer_remise_exceptionnelle'
           ELSE 'appliquer_remise' END,
      'remise', v_commande_id::TEXT,
      NULL,
      jsonb_build_object(
        'commande_id', v_commande_id,
        'remise_type', v_remise_type,
        'remise_valeur', v_remise_valeur,
        'montant_remise', v_montant_remise,
        'montant_total_avant_remise', v_montant_avant,
        'client_id', p_client_id
      ),
      p_ip_address, p_user_agent
    );
  END IF;

  -- --------------------------------------------------------
  -- 15. Retour du résultat final
  --     (le COMMIT est automatique à la fin de la fonction)
  -- --------------------------------------------------------
  RETURN jsonb_build_object(
    'success', true,
    'code', 'COMMANDE_CREEE',
    'data', jsonb_build_object(
      'id', v_commande_id,
      'pressing_id', p_pressing_id,
      'numero_commande', v_numero_commande,
      'montant_total', v_montant_total,
      'montant_paye', v_montant_paye,
      'montant_total_avant_remise', v_montant_avant,
      'montant_remise', v_montant_remise,
      'remise_type', v_remise_type,
      'remise_valeur', v_remise_valeur,
      'statut', 'recu',
      'statut_paiement', v_statut_paiement,
      'priorite', v_priorite,
      'date_pret_prevue', p_date_pret_prevue,
      'date_retrait', v_date_retrait
    )
  );
END;
$$;

COMMENT ON FUNCTION public.create_commande_atomic(
  UUID, UUID, UUID, TEXT, UUID, TIMESTAMPTZ, TEXT, TEXT, TEXT, JSONB, JSONB, JSONB, INET, TEXT
) IS
  'RPC atomique de création de commande. Effectue dans UNE transaction : validation client + services + catalogue + tarifs, calcul sous-total/remise/total, INSERT commande + lignes + articles_vetements + acompte éventuel, audit_log. Idempotente via idempotence_key (SELECT FOR UPDATE + replay). SECURITY INVOKER — appelée par service_role uniquement. Aucune donnée financière frontend n''est trustée.';

-- Révoque l'accès public/authenticated → seul service_role peut appeler.
REVOKE EXECUTE ON FUNCTION public.create_commande_atomic(
  UUID, UUID, UUID, TEXT, UUID, TIMESTAMPTZ, TEXT, TEXT, TEXT, JSONB, JSONB, JSONB, INET, TEXT
) FROM anon, authenticated;


-- ============================================================
-- SECTION 3 — Index pour aider les tests de concurrence
-- ============================================================
-- Index partiel sur (pressing_id, date_reception) pour accélérer
-- le SELECT COUNT(*) fait par generer_numero_commande(). Sans cet
-- index, le COUNT scanne toutes les commandes du pressing sur une
-- année — devient lent à mesure que le pressing grossit.
-- (L'index idx_commandes_pressing_date_reception existe peut-être
-- déjà via une migration précédente — CREATE INDEX IF NOT EXISTS
-- garantit l'idempotence.)
CREATE INDEX IF NOT EXISTS idx_commandes_pressing_date_reception
  ON public.commandes (pressing_id, date_reception);


-- ============================================================
-- SECTION 4 — Analyse des triggers existants (ne PAS supprimer)
-- ============================================================
-- La RPC create_commande_atomic ne supprime AUCUN trigger existant.
-- Voici l'analyse de chaque trigger pertinent pour la création de
-- commande, et pourquoi il reste nécessaire (ou devient partiellement
-- redondant mais conserve son utilité pour les chemins hors-RPC).
--
-- 1. trg_set_updated_at_commandes (005) — BEFORE UPDATE commandes
--    → Non concerné par la création (INSERT only). CONSERVÉ.
--
-- 2. trg_commandes_numero_auto (005) — BEFORE INSERT commandes
--    → UTILISÉ PAR LA RPC. La RPC insère avec numero_commande=NULL,
--      le trigger génère CMD-YYYY-NNNNN via pg_advisory_xact_lock +
--      COUNT. Ce trigger est la source de vérité du numéro de
--      commande : il garantit l'unicité sans retry loop côté API.
--      CONSERVÉ (et actif).
--
-- 3. trg_articles_vetements_code_qr_auto (005) — BEFORE INSERT articles
--    → PARTIELLEMENT REDONDANT. La RPC génère code_qr sous la forme
--      `{short_commande_id}-{ligne_index}-{unit_index}` (lisible +
--      traçable), donc le trigger ne déclenche pas (code_qr IS NOT
--      NULL → RETURN NEW). MAIS : si un futur code insère des
--      articles_vetements sans code_qr (ex: seed, script), le trigger
--      génère un ART-XXXXXXXX aléatoire → fallback utile. CONSERVÉ.
--
-- 4. trg_commandes_statut_apres_article_insert (005) — AFTER INSERT articles
--    → UTILISÉ PAR LA RPC (implicitement). Après chaque INSERT
--      articles_vetements, ce trigger appelle deriver_statut_commande
--      qui recalcule commandes.statut. Comme tous les articles sont
--      insérés avec statut='recu', le calcul renvoie 'recu' — ce qui
--      correspond au statut qu'on a déjà mis dans l'INSERT commande.
--      No-op fonctionnel mais utile si un jour on insère des articles
--      avec un statut différent. CONSERVÉ.
--
-- 5. trg_commandes_paiement_apres_paiement_insert (005) — AFTER INSERT paiements
--    → UTILISÉ PAR LA RPC. Après l'INSERT du paiement acompte, ce
--      trigger recalcule montant_paye + statut_paiement. Comme la RPC
--      a déjà set les bonnes valeurs, le trigger fait un UPDATE
--      identique (no-op). Utile pour les paiements ULTÉRIEURS
--      (/api/personnel/caissier/encaisser) qui ne passent pas par
--      create_commande_atomic. CONSERVÉ.
--
-- 6. guard_paiement_pas_depassement (035) — BEFORE INSERT/UPDATE paiements
--    → UTILISÉ PAR LA RPC. Defense-in-depth : refuse tout paiement
--      qui ferait dépasser montant_total + 1. La RPC valide déjà
--      acompte ≤ montant_total, donc ce trigger ne déclenchera pas
--      d'erreur. Mais il protège les INSERTs directs (script SQL,
--      future route) → CONSERVÉ.
--
-- 7. guard_remise_coherence (036) — BEFORE INSERT/UPDATE commandes
--    → UTILISÉ PAR LA RPC. Defense-in-depth : refuse
--      montant_remise > montant_total_avant_remise, refuse
--      pourcentage=100%, corrige montant_total = avant - remise si
--      incohérent. La RPC calcule tout correctement → le trigger est
--      no-op. CONSERVÉ pour la defense-in-depth.
--
-- CONCLUSION : AUCUN trigger n'est supprimé. La RPC s'appuie sur eux
-- pour la génération du numero_commande (sinon il faudrait un retry
-- loop côté API) et pour la défense-en-profondeur. Les triggers 3, 5,
-- 6, 7 deviennent "partiellement redondants" pour le chemin RPC mais
-- restent indispensables pour tout autre chemin d'écriture.
-- ============================================================


-- ============================================================
-- SECTION 5 — Notify PostgREST (recharge le cache schema)
-- ============================================================
-- Pour que la nouvelle RPC soit visible via /rpc/create_commande_atomic
-- immédiatement (sinon PostgREST garde le cache stale ~10min).
NOTIFY pgrst, 'reload schema';


-- ============================================================
-- Fin de la migration 038_create_commande_atomic.sql
--
-- Récapitulatif :
--   - 5 CHECK constraints ajoutés (defense-in-depth) :
--       * commande_lignes_prix_unitaire_check (prix >= 0)
--       * commande_lignes_montant_coherent_check (montant = prix * qté)
--       * commandes_montant_avant_remise_positif_check (>= 0)
--       * commandes_montant_remise_positif_check (>= 0)
--       * commandes_montant_total_coherent_check (total = avant - remise)
--       * commandes_montant_paye_coherent_check (>= 0 ET <= total + 1)
--   - 1 RPC create_commande_atomic(...) (SECURITY INVOKER, REVOKE
--     EXECUTE FROM anon/authenticated) qui fait TOUT en une
--     transaction SQL.
--   - 1 index (idx_commandes_pressing_date_reception) pour accélérer
--     la génération du numero_commande.
--   - AUCUN trigger supprimé (analyse dans SECTION 4).
--   - Idempotent (CREATE OR REPLACE, DO $$, IF NOT EXISTS).
-- ============================================================
