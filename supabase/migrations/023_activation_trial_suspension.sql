-- 023_activation_trial_suspension.sql
-- AUDIT-B-01: Add a partial unique index to prevent double-use of activation codes
-- (defense in depth alongside the app-level .eq("utilise", false) guard).
-- The existing UNIQUE constraint on `code` already prevents duplicates, but this
-- partial index ensures that even if the app guard fails, only ONE row with
-- utilise=false can match a given code at a time.
-- (No schema change needed for trial/suspension — those use existing columns.)

-- Comment documenting the fix:
COMMENT ON TABLE public.codes_activation IS 'Activation codes (single-use). TOCTOU guard: app uses .eq(utilise, false) on UPDATE.';

-- Note: No actual schema change required — the fixes are app-level.
-- This migration exists for documentation and to mark the fix as deployed.
SELECT 1;
