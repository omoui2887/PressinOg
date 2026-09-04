CREATE OR REPLACE FUNCTION public.create_commande_atomic(p_pressing_id uuid, p_user_id uuid, p_personnel_id uuid, p_role text, p_client_id uuid, p_date_pret_prevue timestamp with time zone, p_notes text DEFAULT NULL::text, p_priorite text DEFAULT 'normal'::text, p_idempotence_key text DEFAULT NULL::text, p_articles_json jsonb DEFAULT NULL::jsonb, p_remise jsonb DEFAULT NULL::jsonb, p_acompte jsonb DEFAULT NULL::jsonb, p_ip_address inet DEFAULT NULL::inet, p_user_agent text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
    -- catalogue_article_id est OPTIONNEL (colonne nullable en DB).
    -- Si non fourni, le service.prix sera utilisé comme fallback.
    -- catalogue_article_nom : fallback sur le nom du service plus tard.

    v_couleur_valid := v_couleur = ANY(v_couleurs_valides);
    IF NOT v_couleur_valid THEN
      -- Fallback sur 'autre' si couleur invalide ou absente
      v_couleur := 'autre';
    END IF;
    IF v_couleur = 'autre' AND (v_couleur_libre IS NULL OR v_couleur_libre = '') THEN
      v_couleur_libre := NULL;
    END IF;
    IF v_couleur_libre IS NOT NULL AND length(v_couleur_libre) > 100 THEN
      v_couleur_libre := left(v_couleur_libre, 100);
    END IF;

    v_etat_valid := v_etat = ANY(v_etats_valides);
    IF NOT v_etat_valid THEN
      -- Fallback sur 'bon' si etat invalide ou absent
      v_etat := 'bon';
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
    IF v_catalogue_id IS NOT NULL AND NOT (v_catalogue_ids @> ARRAY[v_catalogue_id]) THEN
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

  -- Fetch catalogue_articles SEULEMENT si des catalogue_ids ont été collectés
  IF array_length(v_catalogue_ids, 1) IS NOT NULL THEN
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
  END IF;

  -- Fetch tarifs_articles SEULEMENT si des catalogue_ids ont été collectés
  IF array_length(v_catalogue_ids, 1) IS NOT NULL THEN
    SELECT COALESCE(jsonb_object_agg(
        ta.catalogue_article_id::TEXT || '::' || ta.type_service,
        ta.prix
      ), '{}'::jsonb)
      INTO v_tarif_map
      FROM public.tarifs_articles ta
     WHERE ta.pressing_id = p_pressing_id
       AND ta.catalogue_article_id = ANY(v_catalogue_ids)
       AND ta.actif = true;
  END IF;

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
        IF v_catalogue_id IS NOT NULL THEN
          v_tarif_prix := (v_tarif_map->>(
            v_catalogue_id::TEXT || '::' ||
            (v_service_map->v_service_id::TEXT->>'type')
          ))::INTEGER;
        ELSE
          v_tarif_prix := NULL;
        END IF;
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
    v_catalogue_id := NULLIF(v_article->>'catalogue_article_id', '')::UUID;
    v_catalogue_nom := v_article->>'catalogue_article_nom';
    v_couleur := COALESCE(NULLIF(v_article->>'couleur', ''), 'autre');
    v_couleur_libre := v_article->>'couleur_libre';
    v_etat := COALESCE(NULLIF(v_article->>'etat', ''), 'bon');
    v_description_etat := v_article->>'description_etat';
    v_is_custom := COALESCE((v_article->>'is_custom')::BOOLEAN, false);
    v_prix_custom := NULLIF(v_article->>'prix_unitaire', '')::INTEGER;
    v_quantite := (v_article->>'quantite')::INTEGER;

    -- Pour les articles NON-custom, on utilise le nom vérifié côté
    -- serveur (le catalogue est la source de vérité). Pour les customs,
    -- on garde le nom saisi par l'opérateur. Si catalogue_id IS NULL ou
    -- absent du map, on fallback sur le nom du service.
    IF NOT v_is_custom THEN
      IF v_catalogue_id IS NOT NULL AND v_catalogue_map ? v_catalogue_id::TEXT THEN
        v_catalogue_nom := v_catalogue_map->v_catalogue_id::TEXT->>'nom';
      ELSIF v_catalogue_nom IS NULL OR v_catalogue_nom = '' THEN
        v_catalogue_nom := v_service_map->v_service_id::TEXT->>'nom';
      END IF;
    END IF;

    -- Résout le prix unitaire (déjà calculé au step 5, on refait le
    -- même calcul — pas de cache variable pour rester lisible).
    IF v_is_custom THEN
      v_prix_unitaire := COALESCE(v_prix_custom, 0);
    ELSE
      v_tarif_prix := NULL;
      BEGIN
        IF v_catalogue_id IS NOT NULL THEN
          v_tarif_prix := (v_tarif_map->>(
            v_catalogue_id::TEXT || '::' ||
            (v_service_map->v_service_id::TEXT->>'type')
          ))::INTEGER;
        ELSE
          v_tarif_prix := NULL;
        END IF;
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
$function$

