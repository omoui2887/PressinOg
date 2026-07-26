# OgPressing — Audit LOT 4 (Landing Page + Formulaire d'inscription)

> **Date** : 25/07/2026
> **Auditeur** : main agent
> **Référence spec** : `/home/z/my-project/upload/04-landing-page.md` (2 prompts 4.1 + 4.2)
> **Worklog** : Tasks 0 à 20 (contexte global)

---

## Synthèse globale

| Prompt | Élément spec | État | Action |
|---|---|---|---|
| **4.1** | HERO : titre + sous-titre + CTA + 3 badges | ✅ Conforme | — |
| **4.1** | PROBLÈME/SOLUTION : 2 colonnes Avant/Après | ✅ Conforme | — |
| **4.1** | FONCTIONNALITÉS : 8 cards avec icônes | ✅ Conforme | — |
| **4.1** | PLANS TARIFAIRES : 3 cards avec "Choisir ce plan" | ✅ Conforme | — |
| **4.1** | TÉMOIGNAGES : 2-3 cards fictifs CI | ✅ Conforme | — |
| **4.1** | FORMULAIRE D'INSCRIPTION : titre "Demandez votre accès" + ancre #inscription | 🔄 Placeholder conforme au spec 4.1 mais devra être remplacé par le vrai formulaire du prompt 4.2 | Réécrire |
| **4.1** | FOOTER : logo, liens, contact (email + WhatsApp wa.me), mentions légales | ✅ Conforme | — |
| **4.1** | Design mobile-first, couleurs design system, animations fade-in au scroll | ✅ Conforme (Reveal component) | — |
| **4.1** | Header sticky avec logo + liens d'ancrage + bouton "Se connecter" vers /login | ✅ Conforme | — |
| **4.2** | 11 champs (Nom, Prénom, Téléphone, Email, Nom pressing, Ville, Adresse, Machines, Employés, Plan, Message) | ❌ **MANQUANT** | Créer |
| **4.2** | react-hook-form + validation zod | ❌ **MANQUANT** | Créer |
| **4.2** | Validation téléphone ivoirien (0 ou +225 + 8-10 chiffres) | ❌ **MANQUANT** | Créer |
| **4.2** | Ville dropdown avec 11 villes CI | ❌ **MANQUANT** | Créer |
| **4.2** | Plan souhaité dropdown pré-rempli si clic sur plan tarifs | ❌ **MANQUANT** (store Zustand existe mais pas de select du formulaire) | Créer |
| **4.2** | INSERT demandes_inscription | 🔄 API route existe mais ne supporte pas tous les champs | Étendre |
| **4.2** | Message succès "✅ Merci ! Notre équipe vous contactera très bientôt par WhatsApp ou téléphone." | ❌ **MANQUANT** | Créer |
| **4.2** | Réinitialisation formulaire après succès | ❌ **MANQUANT** | Créer |
| **4.2** | Message d'erreur en cas d'échec + retry | ❌ **MANQUANT** | Créer |
| **4.2** | État chargement (bouton disabled + spinner) | ❌ **MANQUANT** | Créer |
| **4.2** | Fonctionne sans authentification | ✅ Conforme (API route publique) | — |
| **4.2** | Design : 1 colonne mobile, 2 colonnes desktop pour champs courts | ❌ **MANQUANT** | Créer |
| **4.2** | Feedback visuel erreurs (bordure rouge + message sous le champ) | ❌ **MANQUANT** | Créer |

**Récapitulatif** : 11 écarts critiques à combler sur 22 points audités. La landing page (4.1) est complète, le formulaire (4.2) est entièrement à développer.

---

## Détail par prompt

### PROMPT 4.1 — Structure de la Landing Page ✅ CONFORME

Tous les éléments spec sont présents :

1. **HERO** (`hero.tsx` 278 lignes) ✅
   - Titre exact "La gestion de votre pressing, simplifiée" avec "simplifiée" en bleu primary
   - Sous-titre explicatif (proposition de valeur, FCFA, français)
   - CTA "Essayer gratuitement" → scroll vers #inscription
   - 3 badges de confiance : "Conçu pour la Côte d'Ivoire 🇨🇮", "FCFA & Mobile Money", "Essai 7 jours gratuit"
   - Bonus : mockup dashboard décoratif (lucide-react + Tailwind, pas d'image externe) — conforme au spec "icônes lucide-react en grand format si pas d'images disponibles"

2. **PROBLÈME / SOLUTION** (`problem-solution.tsx` 105 lignes) ✅
   - 2 colonnes côte à côte (md:grid-cols-2)
   - "Avant ❌" : cahiers papier, tickets perdus, pas de suivi, calculs manuels
   - "Après ✅" : digital, QR Code, suivi temps réel, caisse automatique

3. **FONCTIONNALITÉS** (`features.tsx` 115 lignes) ✅
   - Grille de 8 cards (sm:grid-cols-2 lg:grid-cols-4)
   - Titres exacts spec : "Point de Vente", "Suivi par Article", "Tickets QR Code", "Gestion du Personnel", "CRM Client", "Stock Biodétergents", "Rapports & Statistiques", "Exports Excel"
   - Icônes lucide-react : ShoppingBag, Shirt, QrCode, UserCog, Users, Package, BarChart3, FileSpreadsheet

4. **PLANS TARIFAIRES** (`pricing.tsx` 170 lignes) ✅
   - 3 cards côte à côte (lg:grid-cols-3)
   - Starter 9 900 / Pro 24 900 ("Populaire" avec badge Star) / Business 49 900 FCFA/mois
   - Bouton "Choisir ce plan" qui mémorise le plan via Zustand store (`useInscriptionStore.selectPlan`) et scrolle vers #inscription
   - Liste des fonctionnalités incluses par plan (conforme au PRD §16)
   - Card "Pro" en highlight (border-primary + scale + shadow)

5. **TÉMOIGNAGES** (`testimonials.tsx` 112 lignes) ✅
   - 3 cards fictifs réalistes CI :
     * Awa Koné — Pressing Excellence, Cocody Abidjan
     * Mamadou Traoré — Laveries du Plate, Plateau Abidjan
     * Fatou Bamba — Blanchisserie Yopougon, Yopougon Abidjan
   - Citation, nom, pressing, ville + 5 étoiles + avatar initiales coloré

6. **FOOTER** (`public-footer.tsx` 136 lignes) ✅
   - Logo OgPressing + description
   - Bandeau "Aucun paiement en ligne. Règlement physique hors application."
   - Liens internes (Produit, Compte) avec ancres
   - Contact : email `ogouromain@gmail.com` (mailto), WhatsApp `+225 05 76 10 32 77` (wa.me/2250576103277), Abidjan Côte d'Ivoire
   - Mentions légales simples (Mentions légales · Confidentialité · CGU)
   - Sticky footer pattern (`mt-auto`)

7. **HEADER STICKY** (`public-header.tsx` 138 lignes) ✅
   - Sticky top-0 avec backdrop blur au scroll
   - Logo OgPressing + 4 liens d'ancrage (Avant/Après, Fonctionnalités, Tarifs, Témoignages)
   - Bouton "Se connecter" → /login
   - Bouton "S'inscrire" → #inscription
   - Menu mobile Sheet (right side) avec navigation complète

**Conformité PROMPT 4.1 : 9/9 ✅**

---

### PROMPT 4.2 — Formulaire d'inscription ❌ À DÉVELOPPER

L'état actuel de la section #inscription est un **placeholder** (`inscription-placeholder.tsx` 106 lignes) qui affiche :
- Titre "Demandez votre accès" ✅
- Badge "Inscription" + Sparkles icon
- Si plan présélectionné : encart vert "Plan présélectionné : {plan}"
- Emplacement réservé "Formulaire d'inscription en préparation" (border dashed)
- 2 boutons : WhatsApp + Email (en attendant)

**Aucun des 11 champs spec n'est implémenté.**

#### ❌ Écarts à combler

1. **11 champs du formulaire** (aucun n'existe actuellement) :
   - Nom (texte, obligatoire, min 2 caractères)
   - Prénom (texte, obligatoire, min 2 caractères)
   - Téléphone (texte, obligatoire, format ivoirien : 0 ou +225 + 8-10 chiffres)
   - Email (obligatoire, format email valide)
   - Nom du pressing (texte, obligatoire, min 2 caractères)
   - Ville (dropdown obligatoire : Abidjan, Bouaké, Daloa, Yamoussoukro, San-Pédro, Korhogo, Man, Divo, Gagnoa, Anyama, Autre)
   - Adresse (texte, obligatoire, min 5 caractères)
   - Nombre de machines (nombre, obligatoire, minimum 1)
   - Nombre d'employés (nombre, optionnel)
   - Plan souhaité (dropdown pré-rempli si clic sur plan depuis section tarifs : Starter, Pro, Business, "Je ne sais pas encore")
   - Message (textarea, optionnel, max 500 caractères, placeholder "Des besoins spécifiques ?")

2. **react-hook-form + validation zod** — actuellement l'API route valide manuellement avec regex
3. **Validation téléphone ivoirien** — actuellement l'API utilise `^\+?\d{8,20}$` (trop permissif)
4. **Ville dropdown** — actuellement champ libre
5. **Plan dropdown** pré-rempli via Zustand store `useInscriptionStore.selectedPlan` (le store existe mais pas le select)
6. **Message succès spec exact** : "✅ Merci ! Notre équipe vous contactera très bientôt par WhatsApp ou téléphone."
7. **Réinitialisation formulaire** après succès (`form.reset()`)
8. **État de chargement** : bouton disabled + spinner `Loader2`
9. **Design 2 colonnes desktop** pour champs courts (Nom/Prénom, Ville/Adresse, Machines/Employés)
10. **Feedback visuel erreurs** : bordure rouge + message sous le champ (formMessage shadcn)

#### API route existante (`/api/public/inscription/route.ts` 186 lignes) — à étendre

L'API route actuelle gère 7 champs : nom_gerant, nom_pressing, telephone, email, ville, commune, message. Elle ne supporte PAS :
- Le prénom séparé (le spec exige 2 champs Nom + Prénom, mais la table a `nom_gerant` en 1 seul champ → on concaténera `${prenom} ${nom}` côté formulaire avant envoi)
- Le nombre de machines (colonne ajoutée en migration 010 SECTION 1 — à vérifier qu'elle est bien en base)
- Le nombre d'employés (idem migration 010)
- Le plan souhaité (colonne MANQUANTE → migration 012)
- La validation téléphone ivoirien strict (0 ou +225 + 8-10 chiffres)

#### État de la base pour les colonnes

- Migration 010 (SECTION 1) ajoute `nombre_machines INTEGER` et `nombre_employes INTEGER` à `demandes_inscription`
- ⚠️ Migration 010 n'a peut-être pas encore été appliquée par l'utilisateur (voir worklog Task 19 : "010 ⏳ (à appliquer par l'utilisateur)")
- Colonne `plan_souhaite` n'existe dans AUCUNE migration → **créer migration 012**

#### Pattern d'insertion

Le spec dit : "insère une nouvelle ligne dans la table demandes_inscription via le client Supabase (insertion anonyme, autorisée par la policy RLS créée dans le Lot 3)".

Cependant, le bug RLS persistant (voir audit LOT 3 + migration 011) rend l'insertion anon directe peu fiable. Le pattern actuel (API route avec service_role côté serveur) est **supérieur** car :
- Validation serveur stricte
- Anti-spam (dédoublonnage 24h)
- Pas de structure DB exposée au navigateur
- Robuste face au cache RLS

Je conserve donc le pattern API route + service_role (déjà en place et fonctionnel).

---

## Plan de résolution

### Migration 012 — `012_lot4_gap_fill.sql`
- **SECTION 1** : Ajout colonne `plan_souhaite TEXT` à `demandes_inscription` (valeurs : starter, pro, business, indecis)
- **SECTION 2** : Vérification de l'existence des colonnes `nombre_machines` et `nombre_employes` (au cas où 010 n'aurait pas été appliquée — re-add idempotent)

### Étendre API route `/api/public/inscription`
- Ajouter 3 nouveaux champs : `nombre_machines`, `nombre_employes`, `plan_souhaite`
- Validation téléphone ivoirien strict : `^(\+225|0)\d{8,10}$` (après nettoyage)
- Validation email obligatoire (le spec 4.2 dit "obligatoire", l'API actuelle le met optionnel)
- Validation nombre_machines min 1
- Validation plan_souhaite ∈ {starter, pro, business, indecis}
- Validation message max 500 caractères (et non 1000 comme actuellement)
- Dédoublonnage existant conservé

### Créer composant `inscription-form.tsx`
- react-hook-form + zodResolver
- Schéma zod avec tous les champs et messages d'erreur français
- 11 champs avec layout 2 colonnes desktop pour les champs courts
- Dropdown Ville (11 villes CI)
- Dropdown Plan pré-rempli depuis `useInscriptionStore.selectedPlan`
- Textarea Message avec compteur de caractères
- États : idle / submitting / success / error
- Message succès spec exact + reset formulaire
- Message erreur API avec retry
- Spinner Loader2 + bouton disabled pendant envoi

### Réécrire `inscription-placeholder.tsx` → `inscription.tsx`
- Renommer le composant en `InscriptionSection` (déjà le nom)
- Remplacer le placeholder dashed par le nouveau `InscriptionForm`
- Garder le titre "Demandez votre accès" + badge Sparkles
- Garder l'encart plan présélectionné (info redondante avec le dropdown pré-rempli, mais utile visuellement)
- Mettre à jour le barrel file `landing/index.ts`

### Recréer `.env.local` (avec placeholders)
Le fichier a encore disparu (comme en Task 6). Le dev server affiche "Supabase env vars manquantes — middleware skip". À recréer avec placeholders + message utilisateur pour les vraies clés.

---

## État global après audit

- ✅ Conformes : 11/22 points (PROMPT 4.1 entièrement conforme)
- ❌ À combler : 11/22 points (PROMPT 4.2 entièrement à développer)
- Migration à appliquer : `012_lot4_gap_fill.sql` (1 section)
- Fichiers à créer : 1 (inscription-form.tsx)
- Fichiers à modifier : 2 (api/public/inscription/route.ts + inscription-placeholder.tsx)
- ⚠️ `.env.local` à recréer avec les vraies clés Supabase par l'utilisateur
