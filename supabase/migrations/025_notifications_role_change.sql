-- 025_notifications_role_change.sql
-- AUDIT-B-11: Track role changes for audit trail
ALTER TABLE public.personnel ADD COLUMN IF NOT EXISTS dernier_changement_role TIMESTAMPTZ;
ALTER TABLE public.personnel ADD COLUMN IF NOT EXISTS notes_changement_role TEXT;

COMMENT ON COLUMN public.personnel.dernier_changement_role IS 'Timestamp du dernier changement de rôle (audit trail)';
COMMENT ON COLUMN public.personnel.notes_changement_role IS 'Notes associées au dernier changement de rôle';
