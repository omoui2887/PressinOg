-- ============================================================
-- Migration 049 : Renforcer l'intégrité de demandes_inscription
-- ------------------------------------------------------------
-- Recommandation M3 de l'audit A-DB :
--   - Validation du format email (regex simple)
--   - Validation du format téléphone ivoirien
--   - Unicité de l'email par pressing (un prospect ne peut pas
--     soumettre 2 demandes avec le même email)
-- ============================================================

-- 1. CHECK format email (regex simple — au moins x@y.z)
--    Idempotent : DROP IF EXISTS puis ADD
ALTER TABLE public.demandes_inscription
  DROP CONSTRAINT IF EXISTS demandes_email_format_check;
ALTER TABLE public.demandes_inscription
  ADD CONSTRAINT demandes_email_format_check
  CHECK (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$');

-- 2. CHECK format téléphone ivoirien (10 chiffres commençant par 0,
--    ou +225 suivi de 10 chiffres). La normalisation vers +225XXX
--    se fait côté application ; ici on valide juste le format brut.
ALTER TABLE public.demandes_inscription
  DROP CONSTRAINT IF EXISTS demandes_telephone_format_check;
ALTER TABLE public.demandes_inscription
  ADD CONSTRAINT demandes_telephone_format_check
  CHECK (
    telephone ~ '^(\+225\s?)?0[0-9]{9}$'
    OR telephone ~ '^\+225[0-9]{9}$'
    OR telephone ~ '^0[0-9]{9}$'
  );

-- 3. Unicité de l'email par pressing (un prospect ne peut pas soumettre
--    2 demandes actives avec le même email dans le même pressing).
--    Note : on ne met PAS de UNIQUE sur (pressing_id, email) car
--    demandes_inscription n'a pas de pressing_id (la demande est
--    soumise AVANT que le pressing soit créé). On met donc UNIQUE
--    sur email seul (un email = une demande max).
ALTER TABLE public.demandes_inscription
  DROP CONSTRAINT IF EXISTS demandes_inscription_email_uniq;
ALTER TABLE public.demandes_inscription
  ADD CONSTRAINT demandes_inscription_email_uniq UNIQUE (email);

NOTIFY pgrst, 'reload schema';
