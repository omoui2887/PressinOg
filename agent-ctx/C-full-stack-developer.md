# Task C — full-stack-developer — Rewrite /activation (2 étapes)

**Date** : 24/07/2026
**Task ID** : C (LOT 3 — Prompt 3.3)
**Agent** : full-stack-developer

## Rappel de la tâche

Combler les écarts identifiés dans `AUDIT_LOT3.md` pour le **PROMPT 3.3** :
1. Créer l'endpoint `POST /api/public/activation/verify-code` (vérification préalable du code côté serveur avec service_role car RLS limite `anon` aux colonnes `code, utilise`).
2. Réécrire `/activation` avec un stepper visuel 2 étapes, `react-hook-form + zod`, dropdown des villes CI, 2 champs nom/prénom responsable, banner "🎉 Essai gratuit 7 jours", auto-connexion `signInWithPassword` + `window.location.href = '/admin/dashboard'`.

## Travail effectué

### Lecture du contexte (préalable)
- `worklog.md` — sections Tasks 11, 12, 13 (page activation initiale, super admin, login)
- `AUDIT_LOT3.md` — 7 écarts identifiés sur PROMPT 3.3 (stepper, vérif code, dropdown villes, nom/prénom, zod, banner essai, redirection finale)
- `upload/03-authentification.md` lignes 89-125 — spec PROMPT 3.3
- Fichiers actuels : `src/app/(public)/activation/page.tsx` (mono-formulaire 3 cartes), `src/app/api/public/activation/route.ts` (à conserver)
- `package.json` : packages `react-hook-form`, `zod@4`, `@hookform/resolvers@5`, `@radix-ui/react-select` déjà installés → aucune installation nécessaire
- `src/lib/types/index.ts` — type `PlanAbonnement` + `ApiResponse<T>` disponibles
- `src/components/ui/form.tsx` + `select.tsx` + `alert.tsx` disponibles

### Livrables créés/modifiés

1. **NOUVEAU** — `src/app/api/public/activation/verify-code/route.ts` (145 lignes)
   - `POST /api/public/activation/verify-code` — valide `{ code }` au format `PRS-XXXX-XXXX`
   - Utilise `getSupabaseAdmin()` (service_role, bypass RLS) pour interroger `codes_activation` (colonnes `id, utilise, date_expiration, plan_initial`)
   - 3 cas d'erreur distincts (400) avec messages en français conformes au spec :
     - Code introuvable → `MSG_INVALIDE` (+ numéro WhatsApp support)
     - Déjà utilisé → `MSG_DEJA_UTILISE`
     - Expiré → `MSG_EXPIRE`
   - 1 cas succès (200) → `{ success: true, data: { code_id, plan } }`
   - `export const dynamic = "force-dynamic"`
   - Limite de body 2 000 octets, gestion JSON invalide, normalisation MAJUSCULES

2. **RÉÉCRITURE** — `src/app/(public)/activation/page.tsx` (899 lignes → réécrit propre)
   - `use client` — page entièrement interactive
   - **Stepper visuel** : 2 pastilles 1 et 2 reliées par une ligne, pastille active remplie en `bg-primary`, label "Étape 1/2 : Vérification du code" / "Étape 2/2 : Création du compte", icône `ShieldCheck` sur la pastille 1 quand validée
   - **ÉTAPE 1** : un seul champ code avec `formatCode()` (MAJ auto, format `PRS-XXXX-XXXX`), bouton "Vérifier le code" + spinner `Loader2`, lien WhatsApp support. Validation locale via `codeSchema` zod. POST `/api/public/activation/verify-code`. Si OK → mémorise `{ code, code_id, plan }` dans state React et passe à l'étape 2.
   - **ÉTAPE 2** : react-hook-form + zodResolver avec `compteSchema`
     - Schéma zod complet : `nom_pressing` (2-100), `ville` (Select, requis), `commune` (optionnel, max 100), `email` (email valide), `password` (min 8) + `confirmPassword` (refine correspondance), `nom_responsable` (2-50), `prenom_responsable` (2-50), `telephone` (refine 8-20 chiffres)
     - Tous les messages d'erreur en français
     - **Banner highlight** en haut : `Card` avec `border-secondary/30 bg-secondary/10`, icône `PartyPopper`, texte "🎉 Vous bénéficiez d'un essai gratuit de 7 jours" + plan associé
     - 2 Cards : "Informations du pressing" (Store) + "Compte administrateur" (ShieldCheck)
     - **Dropdown villes CI** : `Select` shadcn avec 11 options (Abidjan, Bouaké, Daloa, Yamoussoukro, San-Pédro, Korhogo, Man, Divo, Gagnoa, Anyama, Autre)
     - **2 champs responsable** : `prenom_responsable` + `nom_responsable` séparés (concaténés `${prenom} ${nom}` pour `nom_complet` DB)
     - **Bouton œil** sur le champ mot de passe (state `showPassword`), pas sur la confirmation
     - Bouton "Créer mon compte" full width size lg bg-primary
     - Bouton "Modifier le code d'activation" (ghost) pour revenir à l'étape 1
   - **Soumission** :
     - POST `/api/public/activation` (route existante, non modifiée) avec body complet (code + nom_complet concaténé + email + password + nom_pressing + telephone + ville + commune)
     - Succès → `supabase.auth.signInWithPassword({ email, password })` côté client (auto-connexion)
     - Toast sonner : "Bienvenue sur OgPressing ! Votre essai gratuit de 7 jours commence maintenant."
     - `window.location.href = '/admin/dashboard'` (PAS router.push — pour forcer le rechargement et initialiser la session côté serveur)
     - Fallback : si signIn échoue → toast + redirect `/login`
     - Gestion erreurs : message renvoyé par l'API (ex : "Cet email est déjà utilisé..." → 409) affiché dans `Alert` rouge. Cas spécial : si l'erreur mentionne "code" + "déjà été utilisé/expiré/invalide" → retour étape 1 (le code a été consommé entre-temps)
   - Design : mobile-first `max-w-2xl`, padding `p-6` Cards, logo ShoppingBag en carré arrondi `bg-primary`, lien "Retour à l'accueil" en haut à gauche, gradient subtil `from-primary/5 to-background`, le layout `(public)/layout.tsx` gère déjà le sticky footer (`min-h-screen flex flex-col` + `mt-auto` implicite via `flex-1`)

### Vérifications

- ✅ `bunx eslint "src/app/(public)/activation/page.tsx" "src/app/api/public/activation/verify-code/route.ts"` → 0 erreur (clean)
- ✅ `bunx tsc --noEmit --skipLibCheck` → 0 erreur sur mes fichiers (1 erreur pré-existante dans `api/public/activation/route.ts:319` — fichier non modifié, hors périmètre)
- ✅ Aucune installation de package nécessaire (tous déjà présents dans `package.json`)
- ⚠️ Dev server non lancé au moment du test (port 3000 non écoutant). Compilation vérifiée indirectement par tsc + eslint.

## Décisions clés

1. **Vérification côté serveur (service_role) obligatoire** : `anon` ne peut SELECT que `(code, utilise)` sur `codes_activation` (policy `code_read_public` + GRANT column-level). Les colonnes `date_expiration`, `plan_initial`, `id` ne sont pas accessibles → l'endpoint `verify-code` doit utiliser `getSupabaseAdmin()`. Documenté en commentaire dans le fichier.

2. **State local (useState) pour étape 1 + react-hook-form pour étape 2** : l'étape 1 est volontairement simple (un seul champ, validation minime par `codeSchema`) → state local suffit. L'étape 2 a 9 champs avec validation croisée (password/confirm) → `react-hook-form + zodResolver`.

3. **Concaténation nom/prénom côté client** : la DB `personnel.nom_complet` reste 1 champ, mais le formulaire UI propose 2 champs séparés (PROMPT 3.3) → `${prenom} ${nom}` envoyé à l'API.

4. **Auto-connexion vs signUp client-side** : le spec original disait `supabase.auth.signUp()` côté client, mais l'audit LOT 3 note que l'implémentation actuelle via `admin.createUser()` côté serveur est **supérieure** (évite l'email de confirmation, gestion centralisée des erreurs, rollback transactionnel). Je conserve donc l'architecture serveur et ajoute l'auto-connexion `signInWithPassword` côté client après succès — c'est le pattern "post-auth" recommandé par le worklog (Task 17 — `window.location.href` PAS `router.push`).

5. **Messages d'erreur parfaits avec l'API existante** : l'API `/api/public/activation` renvoie déjà les messages conformes au spec ("Cet email est déjà utilisé...", "Ce code a déjà été utilisé...", "Ce code a expiré..."). Je les surface directement sans transformation.

6. **Plan affiché dans le banner essai** : la valeur `plan` renvoyée par `verify-code` est affichée dans le banner ("Plan pro — toutes les fonctionnalités débloquées..."), ce qui donne du contexte à l'utilisateur.

7. **Bouton "Modifier le code"** : ajout d'un bouton ghost sur l'étape 2 pour revenir à l'étape 1 (meilleure UX que le stepper non cliquable). Si l'utilisateur revient en arrière, le code reste en mémoire dans `codeValue` et `verified`, mais l'étape 1 réaffiche le champ pré-rempli — l'utilisateur peut re-valider.

8. **Cas rare : code consommé entre étape 1 et étape 2** : l'API `/api/public/activation` re-vérifie le code. Si entre-temps quelqu'un d'autre l'a utilisé, l'erreur remonte → je détecte le pattern "code" + ("déjà été utilisé" | "expiré" | "invalide") dans le message et je renvoie l'utilisateur à l'étape 1 avec le message d'erreur (plutôt que de l'afficher sur l'étape 2 où ça n'aurait pas de sens).

## Fichiers touchés

| Fichier | Action | Lignes |
|---|---|---|
| `src/app/api/public/activation/verify-code/route.ts` | CRÉÉ | 145 |
| `src/app/(public)/activation/page.tsx` | RÉÉCRIT | ~710 |

## Écarts PROMPT 3.3 comblés (cf. AUDIT_LOT3.md §PROMPT 3.3)

| Écart | Statut | Implémentation |
|---|---|---|
| 1. Pas de stepper 2 étapes | ✅ | Composant `Stepper` local avec 2 pastilles + ligne + labels |
| 2. Pas de vérification préalable | ✅ | Endpoint `POST /verify-code` + UI étape 1 |
| 3. Villes en champ libre | ✅ | `Select` shadcn avec 11 villes CI |
| 4. Nom + Prénom responsable | ✅ | 2 champs `nom_responsable` + `prenom_responsable` séparés, concaténés avant envoi |
| 5. Pas de zod | ✅ | `compteSchema` zod v4 avec `zodResolver` + `react-hook-form` |
| 6. Pas de banner essai | ✅ | Card `bg-secondary/10 border-secondary/30` avec `PartyPopper` + texte exact |
| 7. Redirection finale non conforme | ✅ | Auto-connexion + `window.location.href = '/admin/dashboard'` + toast sonner |
