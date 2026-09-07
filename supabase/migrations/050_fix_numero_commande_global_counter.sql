-- ============================================================
-- Migration 050 : Fix trigger generer_numero_commande (compteur global)
-- ------------------------------------------------------------
-- Bug : le trigger generer_numero_commande comptait les commandes
-- PAR PRESSING (WHERE pressing_id = NEW.pressing_id). La contrainte
-- UNIQUE sur numero_commande est GLOBALE. Donc si le pressing A
-- avait déjà CMD-2026-00001, un nouveau pressing B générait aussi
-- CMD-2026-00001 → collision → erreur 23505 → "Erreur lors de
-- l'appel à la RPC de création de commande".
--
-- Fix : le compteur est maintenant GLOBAL (toutes pressings confondus).
-- On compte toutes les commandes de l'année avec un numero au format
-- CMD-YYYY-NNNNN, et on incrémente. Cela garantit l'unicité globale.
-- ============================================================

CREATE OR REPLACE FUNCTION public.generer_numero_commande()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
    annee_courante    INT;
    compteur          INT;
    numero_genere     TEXT;
BEGIN
    -- Si l'app a déjà fourni un numero_commande, on le respecte.
    IF NEW.numero_commande IS NOT NULL AND NEW.numero_commande <> '' THEN
        RETURN NEW;
    END IF;

    annee_courante := EXTRACT(YEAR FROM COALESCE(NEW.date_reception, NOW()));

    -- Verrou advisory pour éviter 2 INSERT concurrents avec le même numéro.
    PERFORM pg_advisory_xact_lock(
        annee_courante,
        hashtext(CAST(NEW.pressing_id AS TEXT))
    );

    -- Compter les commandes existantes pour cette année (toutes pressings
    -- confondus) avec un numéro au format CMD-YYYY-NNNNN. On utilise un
    -- compteur GLOBAL pour éviter les collisions de numéro entre pressings
    -- (la contrainte UNIQUE sur numero_commande est globale).
    SELECT COUNT(*) + 1
      INTO compteur
      FROM public.commandes
     WHERE EXTRACT(YEAR FROM date_reception) = annee_courante
       AND numero_commande ~ '^CMD-[0-9]{4}-[0-9]{5}$';

    numero_genere := 'CMD-' || annee_courante || '-' || LPad(compteur::TEXT, 5, '0');
    NEW.numero_commande := numero_genere;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.generer_numero_commande() IS
  'Trigger BEFORE INSERT sur commandes : génère un numero_commande unique global au format CMD-YYYY-NNNNN. Le compteur est GLOBAL (toutes pressings confondus) pour éviter les collisions avec la contrainte UNIQUE.';

NOTIFY pgrst, 'reload schema';
