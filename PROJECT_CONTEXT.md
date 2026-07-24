# 📌 OgPressing — Contexte Global du Projet (Source de vérité)

> Ce fichier doit être relu et respecté à chaque nouveau prompt de développement.
> Toute contradiction entre un prompt utilisateur et ce document doit être
> signalée AVANT de coder.

---

## 1. Projet

| Attribut | Valeur |
|---|---|
| **Nom** | OgPressing |
| **Type** | SaaS de gestion professionnelle de pressings (blanchisseries/laveries) |
| **Marché cible** | Côte d'Ivoire (Afrique de l'Ouest) |
| **Langue UI** | Français simple, sans jargon technique |
| **Devise** | FCFA (XOF) — suffixe `" FCFA"` + séparateurs de milliers (ex : `12 500 FCFA`) |
| **Format date** | `JJ/MM/AAAA` |
| **Format heure** | `HH:mm` |

---

## 2. Stack technique (obligatoire)

| Composant | Technologie | Statut env. |
|---|---|---|
| Frontend | Next.js (App Router) + TypeScript + Tailwind + shadcn/ui | ✅ Next 16 installé (PRD dit 14 → **on garde 16**, App Router identique) |
| Backend/BDD | Supabase (PostgreSQL + Auth + RLS + Realtime + Storage) | ✅ Clients configurés dans `src/lib/supabase/` |
| QR Code | `qrcode.react` (génération) + `html5-qrcode` (scan) | ⏳ À installer quand nécessaire |
| Code-barres | `JsBarcode` (code128) | ⏳ À installer quand nécessaire |
| Export Excel | `xlsx` (SheetJS), génération côté client | ⏳ À installer quand nécessaire |
| Graphiques | `Recharts` | ✅ Déjà installé |
| Déploiement | GitHub + Vercel | (hors périmètre dev local) |

---

## 3. 🚨 PRINCIPE FONDAMENTAL — AUCUN PAIEMENT INTÉGRÉ

**Règle absolue, non négociable.**

- ❌ JAMAIS de passerelle de paiement (Stripe, CinetPay, PayDunya, API mobile money, SDK bancaire, etc.)
- ❌ JAMAIS de stockage de données bancaire (numéro de carte, CVV, token de paiement)
- ✅ Tous les paiements (clients pressing ET abonnements SaaS) se font **physiquement en dehors** de l'app
- ✅ L'app **enregistre uniquement de façon déclarative** :
  - `methode` : `especes` | `mobile_money` | `carte_bancaire`
  - `montant` : entier FCFA saisi par l'utilisateur
  - `reference` : texte libre optionnel (ex : code transaction mobile money)

> Si l'utilisateur demande une intégration de paiement → **STOP, signaler avant de coder.**

---

## 4. Utilisateurs et rôles

### 4.1 Super Admin (1 compte unique)
- Email : `ogouromain@gmail.com`
- Propriétaire de la plateforme OgPressing
- Accès global à tous les pressings et toutes leurs données
- Rôles : gérer demandes inscription, générer codes activation, gérer abonnements
- Accès technique via fonction SQL `is_super_admin()`

### 4.2 Admin (1 par pressing client)
- Créé via code d'activation fourni par le Super Admin
- Accès **uniquement** aux données de SON pressing (isolation stricte via `pressing_id`)
- Gère : personnel, tarifs, CRM, remises, configuration pressing

### 4.3 Personnel (7 rôles, créés exclusivement par l'Admin)

| Rôle | Permissions clés |
|---|---|
| **Manager** | Supervision, accès large (commandes, clients, stock, rapports en lecture, remises) |
| **Réceptionniste** | POS, création commandes, tickets QR, étiquettes code-barres |
| **Caissier** | Encaissement déclaratif, acomptes, soldes impayés |
| **Laveur** | Commandes assignées, statut lavage, consommation biodétergents |
| **Repassage** | Commandes assignées, statut repassage, anomalies |
| **Livreur** | Commandes à livrer, statut livraison, confirmation remise |
| **Comptable** | Rapports, exports .xlsx, impayés, dépenses |

> Isolation : un employé ne voit/agit QUE sur les données de son pressing.

---

## 5. Design System

### Principes
- **SIMPLE** : max 3 clics par tâche, 1 CTA principal par écran, français simple
- **RAPIDE** : chargement < 2s, feedback immédiat, recherche instantanée
- **RESPONSIVE / MOBILE-FIRST** : 80% mobile → bottom nav sur mobile, zones tactiles ≥ 44px
- **FACILE** : onboarding guidé, tooltips, placeholders explicites, zéro jargon

### Palette de couleurs
| Rôle | Hex | Usage |
|---|---|---|
| Primary | `#2563EB` | Boutons principaux, liens, éléments actifs |
| Secondary | `#10B981` | Succès, statut payé, validations |
| Warning | `#F59E0B` | Alertes stock bas, soldes impayés |
| Danger | `#EF4444` | Erreurs, suppressions, actions destructives |

---

## 6. Sécurité

- ✅ RLS activée sur TOUTES les tables Supabase, sans exception
- ✅ Chaque requête filtre par `pressing_id` (isolation multi-tenant)
- ✅ Super Admin via fonction `is_super_admin()`
- ✅ Aucune donnée bancaire stockée/traitée
- ✅ HTTPS via Vercel, JWT via Supabase Auth
- ✅ Codes d'activation `PRS-XXXX-XXXX` : usage unique, validité 7 jours, sans I/O/0/1

---

## 7. Conventions de code

### Côté serveur vs côté client
- **Server Components / Route Handlers / Server Actions** : `getSupabaseServer()` (soumis RLS)
- **Client Components** : `getSupabaseBrowser()` (soumis RLS, JWT utilisateur)
- **Opérations privilégiées** (seed, codes activation, abonnements) : `getSupabaseAdmin()` (⚠️ service_role, contourne RLS)

### Formatage
- Montants : helper `formatFCFA(montant: number): string` → `"12 500 FCFA"`
- Dates : helper `formatDateFR(iso: string): string` → `"24/07/2026"`
- Heures : helper `formatTimeFR(iso: string): string` → `"14:30"`

### Structure des dossiers (App Router)
```
src/
├── app/
│   ├── (public)/            → landing, login, activation
│   ├── (super-admin)/       → dashboard super admin
│   ├── (admin)/             → dashboard admin pressing
│   ├── (personnel)/         → dashboards par rôle
│   └── api/                 → route handlers
├── components/
│   ├── ui/                  → shadcn/ui (déjà présent)
│   └── ogpressing/          → composants métier OgPressing
└── lib/
    ├── supabase/            → clients (browser/server/admin)
    └── utils/               → helpers (FCFA, dates, etc.)
```

---

## 8. État d'avancement infrastructure

- ✅ `.env.local` créé avec clés Supabase (anon + service_role + PAT)
- ✅ `.gitignore` protège `.env*`
- ✅ `@supabase/supabase-js` + `@supabase/ssr` installés
- ✅ 3 clients Supabase créés dans `src/lib/supabase/` (client / server / admin)
- ✅ Base Supabase OgPressing accessible et **vierge** (prête à recevoir le schéma PRD §18)
- ✅ Dev server tourne sur `:3000`

---

## 9. Engagements

1. **Respecter ce contexte** dans chaque prompt, même si non répété
2. **Signaler toute contradiction** avant de coder (surtout demande de paiement)
3. **Frontend d'abord, backend ensuite** pour feedback visuel rapide
4. **Validation browser** à chaque livrable (Agent Browser)
5. **Ne jamais committer** de secret en clair
6. **Français simple** dans toute l'UI et les messages

---

*Dernière mise à jour : 24/07/2026 — Contexte initialisé*
