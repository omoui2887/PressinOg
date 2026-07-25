# OgPressing — Audit LOT 3 (Sécurité RLS + Authentification)

> **Date** : 24/07/2026
> **Auditeur** : main agent
> **Référence spec** : `/home/z/my-project/upload/03-authentification.md` (4 prompts 3.1 → 3.4)
> **Worklog** : Tasks 0 à 19 (contexte global)

---

## Synthèse globale

| Prompt | Élément spec | État | Action |
|---|---|---|---|
| **3.1** | 17 tables ENABLE RLS | ✅ Conforme | — |
| **3.1** | 33 policies d'isolation | ✅ Conforme | — |
| **3.1** | INSERT public demandes_inscription | ❌ **BUG persistant** | Migration 011 |
| **3.1** | SELECT public codes_activation (code, utilise) | ✅ Conforme | — |
| **3.2** | Page /login formulaire email+password | ✅ Existe | Réécrire |
| **3.2** | Bouton œil afficher/masquer mdp | ✅ Conforme | — |
| **3.2** | react-hook-form + zod | ❌ Plain useState | Réécrire |
| **3.2** | Lien "Pas encore de compte ? Activer mon compte" → /activation | ❌ Lien actuel → /#inscription | Réécrire |
| **3.2** | signInWithPassword() | ✅ Conforme | — |
| **3.2** | Rôle ordre : super_admins → pressing.admin_user_id → personnel | 🔄 Équivalent (schema uses personnel.user_id pour manager) | — |
| **3.2** | Redirection super admin → /super-admin/dashboard | ✅ Conforme | — |
| **3.2** | Redirection admin (manager) → /admin/dashboard | ✅ Conforme | — |
| **3.2** | Redirection personnel → /personnel/{role}/dashboard | ❌ Actuellement → /personnel | Réécrire |
| **3.2** | Erreur "Compte non reconnu" | ✅ Conforme | — |
| **3.2** | statut_compte='desactive' bloque | ✅ Conforme | — |
| **3.2** | mot_de_passe_temporaire=true → redirect changement mdp | ❌ **MANQUANT** | Réécrire + migration 011 |
| **3.2** | Spinner loading | ✅ Conforme | — |
| **3.2** | Page /personnel/changer-mot-de-passe | ❌ **MANQUANT** | Créer |
| **3.3** | Page /activation 2 étapes avec stepper | ❌ Mono-formulaire 3 cartes | Réécrire |
| **3.3** | Étape 1 : vérification code (bouton "Vérifier le code") | ❌ Pas de vérification séparée | Réécrire |
| **3.3** | Format PRS-XXXX-XXXX uppercase auto | ✅ Conforme (formatCode) | — |
| **3.3** | Étape 2 : formulaire complet | 🔄 Présent mais sans séparation | Réécrire |
| **3.3** | Villes CI en dropdown | ❌ Champ libre | Réécrire |
| **3.3** | Nom + Prénom responsable (2 champs) | ❌ "nom_complet" 1 champ | Réécrire |
| **3.3** | Adresse | 🔄 "commune" existant (équivalent) | — |
| **3.3** | zod validation | ❌ Validation manuelle | Réécrire |
| **3.3** | Banner "🎉 Essai gratuit 7 jours" | ❌ **MANQUANT** | Réécrire |
| **3.3** | signUp() client-side | 🔄 admin.createUser server-side (meilleur) | — |
| **3.3** | Redirection → /admin/dashboard | ❌ Actuellement → /login | Réécrire |
| **3.4** | Middleware /middleware.ts | ✅ Existe | Étendre |
| **3.4** | Non-auth → /login (routes protégées) | ✅ Conforme | — |
| **3.4** | Rôle déterminé via super_admins → pressing → personnel | 🔄 Équivalent (personnel inclut managers) | — |
| **3.4** | Cross-space prevention (admin ≠ /super-admin, etc.) | ✅ Conforme | — |
| **3.4** | Personnel ne peut pas accéder aux routes d'un autre rôle | ❌ **MANQUANT** | Étendre |
| **3.4** | statut_compte='desactive' → déconnexion auto | ✅ Conforme (via `actif === true && statut_compte === "actif"`) | — |
| **3.4** | Auth sur /login, /, /activation → redirect dashboard | ❌ **MANQUANT** | Étendre |
| **3.4** | Cache stratégie + explication | ❌ **MANQUANT** | Étendre |

**Récapitulatif** : 14 écarts critiques à combler sur 32 points audités.

---

## Détail par prompt

### PROMPT 3.1 — RLS policies

#### ✅ Conformes
- Migration `006_rls_policies.sql` créée et appliquée (Task 3, 10, 11)
- 17 tables ont RLS ENABLE
- 33 policies d'isolation multi-tenant opérationnelles
- `super_admin_full_access` + `isolation_pressing` sur toutes les tables avec pressing_id
- 2 fonctions SECURITY DEFINER : `is_super_admin()`, `get_pressing_id_utilisateur()`
- SELECT public codes_activation (code, utilise) ✅ testé : HTTP 200 avec anon
- SELECT codes_activation autres colonnes → 42501 ✅ testé : HTTP 401 (REVOKE + GRANT column-level enforced)
- anon SELECT sur tables protégées → tableau vide ✅ testé (deny by default)

#### ❌ Bug résiduel — INSERT public demandes_inscription

**Test live (audit LOT 3)** :
```
POST /rest/v1/demandes_inscription  (anon key)
Body: {"nom_gerant":"TEST","nom_pressing":"Test","telephone":"0700000000"}
→ HTTP 42501 "new row violates row-level security policy for table demandes_inscription"
```

**Diagnostic** :
- GRANT INSERT présent (sinon erreur serait "permission denied for table" — ce n'est pas le cas)
- Policy `demande_insert_public` TO anon WITH CHECK (true) → **absente de la base**
- Migrations 007 et 008 ont tenté de la créer, mais le SQL Editor Supabase (mode autocommit) a visiblement échoué silencieusement à ce statement précis (déjà constaté en Task 11/12)
- Impact : formulaire d'inscription landing page fonctionne via API route `/api/public/inscription` (service_role) — pas bloquant pour la production, mais ne respecte pas le spec "INSERT public direct via RLS"

**Fix** : Migration `011_lot3_gap_fill.sql` SECTION 1 — recréation robuste de la policy avec vérification post-exécution.

---

### PROMPT 3.2 — Page de connexion /login

**Fichier existant** : `src/app/(public)/login/page.tsx` (240 lignes)

#### ✅ Conformes
- Formulaire email + password
- Bouton œil (Eye/EyeOff) pour afficher/masquer le mot de passe
- signInWithPassword() côté client (Supabase browser)
- Vérification rôle : super_admins → personnel (avec `actif=true` et `statut_compte != 'desactive'`)
- Redirection super admin → /super-admin/dashboard
- Redirection manager → /admin/dashboard
- SignOut si compte désactivé
- Message "Votre compte n'est rattaché à aucun pressing" si aucun profil trouvé
- Spinner Loader2 pendant loading
- Design mobile-first, logo ShoppingBag (substitut au logo OgPressing)
- `window.location.href` au lieu de `router.push` (fix Task 17 pour bug preview iframe)

#### ❌ Écarts

1. **Pas de react-hook-form + zod** — utilisation de `useState` simple. Le spec exige une validation structurée.
   - Actuel : `useState` + contrôle manuel
   - Cible : `useForm` + `zodResolver` + schéma zod

2. **Lien activation non conforme**
   - Actuel : `/login` affiche "Pas encore de compte ? Inscrivez votre pressing" → `/#inscription` (scroll landing) + lien séparé "J'ai un code d'activation" → `/activation`
   - Cible spec : "Pas encore de compte ? Activer mon compte" → `/activation` (texte et cible précis)

3. **Redirection personnel non conforme**
   - Actuel : personnel non-manager → `/personnel` (route générique)
   - Cible spec : `/personnel/{role}/dashboard` (ex : `/personnel/caissier/dashboard`, `/personnel/laveur/dashboard`)

4. **mot_de_passe_temporaire non géré**
   - Spec : `personnel.mot_de_passe_temporaire=true` → rediriger après connexion vers `/personnel/changer-mot-de-passe` (changement obligatoire avant dashboard)
   - Actuel : aucune vérification de ce flag
   - Schema : la colonne `mot_de_passe_temporaire` BOOLEAN n'existe pas (seulement `mot_de_passe_temporaire_hash TEXT` pour BCrypt)
   - **Fix** : Migration 011 SECTION 2 ajoute `mot_de_passe_temporaire BOOLEAN NOT NULL DEFAULT FALSE` à `personnel`

5. **Page /personnel/changer-mot-de-passe MANQUANTE**
   - Le dossier `(personnel)/personnel/` ne contient que `page.tsx`
   - Aucune route pour le changement de mot de passe obligatoire
   - **Fix** : Créer la page avec formulaire nouveau mdp + confirmation, appel `supabase.auth.updateUser()`, puis `UPDATE personnel SET mot_de_passe_temporaire=false`, puis redirect vers le dashboard du rôle

---

### PROMPT 3.3 — Page d'activation /activation

**Fichier existant** : `src/app/(public)/activation/page.tsx` (413 lignes)

#### ✅ Conformes
- Route /activation existe
- Format code PRS-XXXX-XXXX avec uppercase automatique (fonction `formatCode`)
- API route `/api/public/activation` (server-side, service_role) — supérieur au spec (signUp client-side)
- Validation email + password ≥ 8 + correspondance passwords
- Création pressing (statut='essai') + personnel (manager) + abonnement (essai 7 jours) + marquage code utilise=true
- Rollback manuel en cas d'échec
- Messages d'erreur clairs en français

#### ❌ Écarts

1. **Pas de stepper 2 étapes**
   - Actuel : mono-formulaire avec 3 cartes (Code, Compte admin, Pressing) affichées ensemble
   - Cible spec : stepper visuel "Étape 1/2 → Étape 2/2"
     - Étape 1 : champ code + bouton "Vérifier le code" → vérifie en base que le code existe, n'est pas utilisé, n'est pas expiré
     - Étape 2 : affichée uniquement après validation du code, avec le formulaire de création de compte

2. **Pas de vérification préalable du code**
   - Actuel : tout est soumis en une fois à l'API `/api/public/activation`
   - Cible spec : vérification séparée à l'étape 1 (avant de montrer le formulaire de création de compte)
   - **Fix** : Créer endpoint `POST /api/public/activation/verify-code` qui valide le code et renvoie le plan associé

3. **Villes en champ libre au lieu de dropdown**
   - Actuel : `<Input>` libre pour "Ville"
   - Cible spec : dropdown avec villes CI : Abidjan, Bouaké, Daloa, Yamoussoukro, San-Pédro, Korhogo, Man, Divo, Gagnoa, Anyama, autre
   - **Fix** : Remplacer par composant `<Select>` shadcn

4. **Nom + Prénom responsable (2 champs)**
   - Actuel : `nom_complet` (1 champ)
   - Cible spec : `Nom du responsable` + `Prénom du responsable` (2 champs)
   - Note : la table `demandes_inscription` a `nom_gerant` (1 champ) — pour `personnel.nom_complet` on garde 1 champ en DB mais on demande 2 champs dans le formulaire et on concatène

5. **Pas de zod validation**
   - Actuel : validation manuelle dans l'API route (regex, length checks)
   - Cible spec : `react-hook-form` + `zod` côté client

6. **Pas de banner "🎉 Essai gratuit 7 jours"**
   - Spec : encart d'information en haut de l'étape 2
   - Actuel : mentionné uniquement en pied de formulaire
   - **Fix** : Ajouter une Card highlight avec icône 🎉 + texte "Vous bénéficiez d'un essai gratuit de 7 jours"

7. **Redirection finale non conforme**
   - Actuel : après succès → page succès avec bouton "Se connecter à mon compte" → `/login`
   - Cible spec : "Redirige vers /admin/dashboard avec un message de bienvenue"
   - **Fix** : Auto-connexion après activation (signInWithPassword) + window.location.href = '/admin/dashboard' avec toast de bienvenue

---

### PROMPT 3.4 — Middleware protection par rôle

**Fichier existant** : `src/middleware.ts` + `src/lib/supabase/middleware.ts` (190 lignes)

#### ✅ Conformes
- Middleware exécuté sur toutes les routes (matcher exclut fichiers statiques)
- Rafraîchit la session Supabase via `getUser()`
- Garde-fou si env vars manquantes → skip sans crash
- Non-auth sur route protégée → redirect `/login?next=...`
- Détermination rôle : super_admins → personnel
- Cross-space prevention : `/super-admin/*` check super_admins, `/admin/*` check personnel.role=manager, `/personnel/*` check personnel actif
- `statut_compte='desactive'` → redirect login (via check `actif === true && statut_compte === "actif"`)
- Propagation des cookies de session rafraîchie vers la réponse de redirection

#### ❌ Écarts

1. **Pas de restriction par rôle pour /personnel/{role}/**
   - Spec : "Empêche un membre du personnel d'accéder aux routes d'un rôle différent du sien (ex : un Laveur ne peut pas accéder à /personnel/caissier/*)"
   - Actuel : n'importe quel personnel actif peut accéder à n'importe quelle route /personnel/*
   - **Fix** : Extraire le segment de rôle de l'URL (`/personnel/caissier/dashboard` → `caissier`) et vérifier qu'il correspond au `personnel.role` de l'utilisateur

2. **Pas de redirect auth → dashboard**
   - Spec : "Si l'utilisateur est déjà authentifié et tente d'accéder à /login ou / (landing page) ou /activation, redirige-le automatiquement vers son dashboard"
   - Actuel : pas de check — un utilisateur authentifié peut visiter /login (le formulaire se soumettra à signInWithPassword qui retournera une erreur)
   - **Fix** : Si user présent et pathname ∈ {/, /login, /activation} → redirect vers le dashboard du rôle

3. **Pas de cache stratégie**
   - Spec : "Optimise cette logique pour éviter des requêtes Supabase redondantes à chaque navigation. Mets en cache le rôle dans un cookie de session sécurisé si possible, avec une durée de vie courte, ou utilise le JWT Supabase si des custom claims peuvent y être ajoutés."
   - Actuel : 2 requêtes Supabase par navigation sur route protégée (getUser + from(personnel/super_admins))
   - **Fix** : Cookie court `ogp_role_cache` (5 min, httpOnly, secure) contenant `{role, pressing_id, expires_at}` signé HMAC. Si présent et valide → skip DB query. Si absent ou expiré → requête + set cookie.
   - **Explication stratégie** : À inclure dans le code en commentaire et dans la réponse à l'utilisateur. Choix du cookie court signé vs custom JWT claims :
     - Custom JWT claims Supabase nécessite un trigger `on_auth_user_created` + edge function pour re-signer le JWT à chaque login — lourd à opérer
     - Cookie court (5 min) est simple, sécurisé (httpOnly + signed), et suffit car le middleware tourne sur TOUTES les requêtes → le cache hit rate est élevé pendant une session active
     - TTL court (5 min) garantit qu'un désactivation de compte (statut_compte=desactive) soit répercutée en max 5 min
     - Si le cookie est supprimé/modifié → fallback DB, donc pas de risque de sécurité

---

## Plan de résolution

### Migration 011 — `011_lot3_gap_fill.sql`
- **SECTION 1** : Recréation robuste de la policy `demande_insert_public` (DROP + CREATE + COMMENT isolés, vérification)
- **SECTION 2** : Ajout colonne `mot_de_passe_temporaire BOOLEAN NOT NULL DEFAULT FALSE` à `personnel`

### Task B (subagent) — Rewrite login + create /personnel/changer-mot-de-passe
- Réécrire `src/app/(public)/login/page.tsx` avec react-hook-form + zod + check mot_de_passe_temporaire + redirection /personnel/{role}/dashboard
- Créer `src/app/(personnel)/personnel/changer-mot-de-passe/page.tsx` + API route dédiée
- Lien "Pas encore de compte ? Activer mon compte" → /activation

### Task C (subagent) — Rewrite /activation en 2 étapes
- Réécrire `src/app/(public)/activation/page.tsx` avec stepper visuel 2 étapes
- Étape 1 : vérification code (via nouvel endpoint POST `/api/public/activation/verify-code`)
- Étape 2 : formulaire avec zod, dropdown villes CI, nom/prenom responsable (2 champs), banner "🎉 Essai gratuit 7 jours"
- Redirection finale auto-connexion + window.location.href = '/admin/dashboard'

### Task D (subagent) — Étendre middleware
- Ajouter routing par rôle pour /personnel/{role}/*
- Ajouter redirect auth → dashboard pour /, /login, /activation
- Ajouter cache cookie court signé HMAC `ogp_role_cache`
- Commenter la stratégie de cache dans le code

---

## État global après audit

- ✅ Conformes : 18/32 points
- ❌ À combler : 14/32 points (4 prompts audités)
- Migration à appliquer : `011_lot3_gap_fill.sql` (2 sections)
- Fichiers à (ré)écrire : 4 (login, activation, middleware, lib/supabase/middleware)
- Fichiers à créer : 2 (page changer-mot-de-passe, endpoint verify-code)
