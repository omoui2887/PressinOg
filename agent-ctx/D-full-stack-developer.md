# Task D — Étendre middleware (PROMPT 3.4)

**Agent** : full-stack-developer
**Task ID** : D
**Réf spec** : `/home/z/my-project/upload/03-authentification.md` lignes 129-156
**Réf audit** : `/home/z/my-project/AUDIT_LOT3.md` section PROMPT 3.4
**Fichier cible** : `src/lib/supabase/middleware.ts`

## Objectif

Combler les 3 écarts identifiés dans l'audit LOT 3 pour le PROMPT 3.4 :

1. **Restriction par rôle** pour `/personnel/{role}/*` (un Laveur ne peut pas accéder à `/personnel/caissier/*`).
2. **Redirect auth → dashboard** pour `/`, `/login`, `/activation` quand l'utilisateur est déjà connecté.
3. **Cache stratégie** : cookie court `ogp_role_cache` (5 min, httpOnly, secure, sameSite=lax) signé HMAC-SHA256 via Web Crypto API (Edge Runtime compatible).

## Plan

- Lire middleware existant (190 lignes) → `updateSession` + `createMiddlewareClient`.
- Ajouter 4 helpers cache : `signRoleCache`, `verifyRoleCache`, `setRoleCacheCookie`, `clearRoleCacheCookie`.
- Ajouter helpers métier : `fetchRoleFromDB`, `computeDashboardTarget`, `extractPersonnelRoleFromPath`.
- Refactoriser `createMiddlewareClient` pour exposer `responseRef` (mutable) au lieu d'une `response` capturée (bug latent : setAll réassigne response, l'appelant perdait la référence).
- Réécrire `updateSession` avec les 3 nouvelles fonctionnalités + intégration cache.
- Conserver : garde-fou env vars, getUser, non-auth → /login?next=..., propagation cookies sur redirect.
- Lint + dev.log check + append worklog.

## Statut final : ✅ Livré

- Fichier modifié : `src/lib/supabase/middleware.ts` (190 → 725 lignes)
- `bun run lint` : 0 erreur, 0 warning
- `npx tsc --noEmit --skipLibCheck` : 0 erreur sur le fichier (1 import `SupabaseClient` corrigé depuis `@supabase/supabase-js` au lieu de `@supabase/ssr`)
- Dev server : non actif au moment de la livraison (même constat que Task C précédente). Validation par lint + tsc + revue manuelle.
- Worklog mis à jour (append Task D, 67 lignes ajoutées)

## Livrables

1. **4 helpers cache HMAC** : `signRoleCache`, `verifyRoleCache`, `setRoleCacheCookie`, `clearRoleCacheCookie`, `getCacheSecret` (Web Crypto API, Edge-compatible)
2. **3 helpers métier** : `fetchRoleFromDB`, `computeDashboardTarget`, `extractPersonnelRoleFromPath`
3. **`createMiddlewareClient` refactorisé** : retourne `{ supabase, responseRef }` au lieu de `{ supabase, response }` pour éviter le bug latent de capture par valeur (setAll réassigne `response`)
4. **`updateSession` réécrite** avec 9 étapes documentées inline :
   - garde-fou env vars
   - getUser() (rafraîchit session)
   - non-auth → /login?next=
   - cache cookie read (verifyRoleCache + user_id check anti-rejeu)
   - cache miss → fetchRoleFromDB + setRoleCacheCookie (si actif)
   - profil non trouvé → signOut + /login?error=compte_non_reconnu
   - compte désactivé → signOut + /login?error=compte_desactive
   - compte invite_en_attente → /login?error=compte_non_actif (sans signOut)
   - redirect auth→dashboard pour /, /login, /activation (computeDashboardTarget avec priorité mot_de_passe_temporaire)
   - cross-space + restriction par rôle /personnel/{role}/* avec redirect ?error=acces_refuse

## Stratégie cache (réponse au spec)

- **Quoi** : cookie `ogp_role_cache` (httpOnly, secure, sameSite=lax, maxAge=5min) signé HMAC-SHA256.
- **Pourquoi pas custom JWT claims Supabase** : nécessiterait trigger + edge function pour re-signer le JWT à chaque login. JWT Supabase valable 1h = trop long pour répercuter désactivation.
- **TTL 5 min** : compromis perf/sécurité. Désactivation répercutée en max 5 min (cache miss → DB query → signOut). On ne cache JAMAIS un compte désactivé.
- **Sécurité** : signature HMAC empêche falsification client. `user_id` dans payload + check `payload.user_id === user.id` empêche rejeu cross-user après déconnexion/reconnexion. Possibilité de surcharger la clé via `OGP_ROLE_CACHE_SECRET` (var d'env serveur-only) pour sécurité maximale en production.
- **Fallback silencieux** : cookie absent/modifié/expiré → DB query + re-set cookie. Pas de risque.
