-- ============================================================
-- OgPressing — Migration 033 : Reload PostgREST schema cache
-- ============================================================
-- Fichier    : 033_reload_pgrst_schema.sql
-- Version    : 1.0
-- Description : Crée une fonction RPC `reload_pgrst_schema()` qui force
--               PostgREST à recharger son cache de schéma.
--
-- CONTEXTE / PROBLÈME :
--   PostgREST (le moteur REST derrière l'API Supabase) met en cache le
--   schéma de la base de données (tables, colonnes, enums, fonctions).
--   Ce cache est rafraîchi périodiquement (~5 min par défaut sur Supabase)
--   ou sur notification `NOTIFY pgrst, 'reload schema'`.
--
--   Quand une migration ajoute une colonne (ex: 024 → `idempotence_key`)
--   ou une valeur d'enum (ex: 024 → `statut_commande = 'annule'`), le
--   cache PostgREST reste STALE pendant la fenêtre de rafraîchissement.
--   Durant cette fenêtre :
--     - INSERT incluant la nouvelle colonne → PGRST204 "Could not find
--       the column in the schema cache"
--     - UPDATE/INSERT avec la nouvelle valeur d'enum → 22P02 "invalid
--       input value for enum"
--
--   Ces erreurs sont TRANSITOIRES (auto-résolution au refresh) mais
--   causent des 500/501 intermittents qui dégradent l'UX juste après
--   une migration.
--
-- SOLUTION :
--   1. Créer une fonction SECURITY DEFINER `reload_pgrst_schema()` qui
--      envoie `NOTIFY pgrst, 'reload schema'` → PostgREST recharge
--      immédiatement son cache.
--   2. L'app Next.js peut appeler cette fonction via RPC pour forcer
--      un reload + retry automatique quand elle détecte une erreur de
--      cache (PGRST204 ou 22P02 sur un enum/colonne connu).
--   3. On appelle aussi la fonction à la fin de CETTE migration pour
--      forcer le reload immédiat (au cas où le cache actuel soit stale).
--
-- SÉCURITÉ :
--   - La fonction est SECURITY DEFINER (s'exécute avec les privilèges
--     du propriétaire = postgres) car `NOTIFY` nécessite d'être dans
--     la session SQL active, ce qui est le cas via RPC.
--   - Accessible par `anon` et `authenticated` (GRANT EXECUTE) car le
--     reload du cache est une opération sûre (non destructive, ne fuit
--     aucune donnée). L'app Next.js utilise le client service_role pour
--     l'appel (bypass RLS), mais le GRANT public permet aussi les
--     appels depuis le client anon si nécessaire.
--   - Aucun paramètre, aucun retour → pas d'injection possible.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Fonction reload_pgrst_schema()
-- ------------------------------------------------------------
-- Envoie NOTIFY pgrst 'reload schema' pour forcer PostgREST à
-- recharger son cache. Idempotente (peut être appelée plusieurs fois).
-- Utilisée par src/lib/supabase/reload-schema.ts.
CREATE OR REPLACE FUNCTION public.reload_pgrst_schema()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- PostgREST écoute le canal 'pgrst' et recharge son cache quand
  -- il reçoit le payload 'reload schema'. Le reload prend ~100-500ms.
  NOTIFY pgrst, 'reload schema';
END;
$$;

COMMENT ON FUNCTION public.reload_pgrst_schema() IS
  'Force PostgREST à recharger son cache de schéma (utile après une migration qui ajoute colonnes/enums). Idempotente. Appelée par l’app Next.js (src/lib/supabase/reload-schema.ts) en cas d’erreur PGRST204 ou 22P02.';

-- ------------------------------------------------------------
-- 2. Permissions
-- ------------------------------------------------------------
-- Permet à tous les rôles d'appeler la fonction. Le reload du cache
-- est une opération sûre (non destructive).
GRANT EXECUTE ON FUNCTION public.reload_pgrst_schema() TO anon, authenticated, service_role;

-- ------------------------------------------------------------
-- 3. Reload immédiat (pour le cache actuel, au cas où)
-- ------------------------------------------------------------
-- Si cette migration est exécutée via le SQL Editor Supabase (qui
-- utilise le rôle service_role / postgres), l'appel direct NOTIFY
-- force le reload. La fonction n'est pas encore dans le cache
-- PostgREST à ce stade, donc on NOTIFY directement.
NOTIFY pgrst, 'reload schema';
