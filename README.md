# OgPressing

**OgPressing** est un SaaS de gestion professionnelle de pressings à destination
de la Côte d'Ivoire. La plateforme couvre l'ensemble du métier d'un pressing
moderne : point de vente (POS) et suivi des commandes, gestion de la
production, CRM clients, gestion du personnel (employés & rôles), stock de
biodétergents, rapports & exports, ainsi qu'une couche multi-tenant
administée par un Super Admin (catalogue d'articles, abonnements, demandes
d'inscription, codes d'activation).

---

## Stack technique

| Couche | Technologie |
| --- | --- |
| Framework web | **Next.js 16** (App Router, Turbopack en dev, `output: "standalone"`) |
| Langage | **TypeScript 5** |
| Backend / BDD / Auth / Storage | **Supabase** (Postgres + Auth + Storage, RLS active) |
| ORM scaffold | **Prisma** (SQLite local pour dev — Supabase est la source de vérité en prod) |
| Styles | **Tailwind CSS 4** + `tailwindcss-animate` + `tw-animate-css` |
| Composants UI | **shadcn/ui** (style "new-york", lucide icons) |
| State client | **Zustand** |
| Data fetching | **TanStack Query** (React Query) |
| Formulaires | **React Hook Form** + **Zod** (+ `@hookform/resolvers`) |
| Notifications | **Sonner** |
| Déploiement | **Vercel** |

---

## Prérequis

- **Node.js 20+**
- **bun** (recommandé) ou **npm**
- Un compte **Supabase** (plan gratuit suffisant pour démarrer)

---

## Installation locale

1. **Cloner le dépôt**

   ```bash
   git clone <url-du-repo> ogpressing
   cd ogpressing
   ```

2. **Installer les dépendances**

   ```bash
   bun install
   ```

3. **Copier le modèle d'environnement et le remplir**

   ```bash
   cp .env.local.example .env.local
   ```

   Éditez `.env.local` et renseignez vos clés Supabase (voir les commentaires
   dans le fichier pour le détail de chaque variable).

4. **Créer le projet Supabase**

   - Créez un nouveau projet sur <https://supabase.com>.
   - Récupérez l'URL du projet, la clé `anon` et la clé `service_role` dans
     **Project Settings → API**.
   - Reportez ces valeurs dans `.env.local`.

5. **Exécuter les migrations SQL**

   Les migrations sont versionnées dans `supabase/migrations/` (de `001_enums.sql`
   à `014_lot15_catalogue_articles.sql`). Exécutez-les **dans l'ordre** dans
   l'éditeur SQL de Supabase (Dashboard → SQL Editor), ou via la CLI :

   ```bash
   supabase db push
   ```

6. **(Optionnel) Pousser le schéma Prisma local**

   Prisma n'est pas utilisé en production (Supabase est la source de vérité),
   mais le scaffold SQLite local peut servir pour des tests hors-ligne :

   ```bash
   bun run db:push
   ```

7. **Démarrer le serveur de développement**

   ```bash
   bun run dev
   ```

   L'application est disponible sur <http://localhost:3000>.

---

## Structure du projet

Le code source vit dans `src/` et utilise les **route groups** Next.js (les
parenthèses ne font pas partie de l'URL) pour organiser les espaces applicatifs :

```
src/
├── app/
│   ├── (public)/            # Landing, login, activation (visiteurs & prospects)
│   │   ├── page.tsx         # Landing page (hero, features, pricing, témoignages, inscription)
│   │   ├── login/
│   │   └── activation/      # Wizard d'activation par code (PRS-XXXX-XXXX)
│   ├── (admin)/             # Espace pressing connecté (gérant / caissier)
│   │   ├── admin/
│   │   │   ├── dashboard/   # KPIs, raccourcis, bannière d'abonnement
│   │   │   ├── commandes/   # POS + liste + détail + wizard 4 étapes
│   │   │   ├── clients/     # CRM (liste + détail + filtres + impayés)
│   │   │   ├── personnel/   # Employés, rôles, reset password
│   │   │   ├── services/    # Catalogue de services / tarifs
│   │   │   ├── stock/       # Stock biodétergents + mouvements
│   │   │   ├── rapports/    # Rapports journalier / hebdo / mensuel / exports
│   │   │   └── pressing/    # Config pressing (infos, horaires, abonnement)
│   ├── (personnel)/         # Espace employé (vue simplifiée des commandes)
│   │   └── personnel/
│   ├── (super-admin)/       # Espace Super Admin OgPressing (multi-tenant)
│   │   └── super-admin/
│   │       ├── dashboard/   # KPIs globaux, nouveaux pressings
│   │       ├── pressings/   # Liste / détails / suspensions
│   │       ├── abonnements/ # Renouvellements, alertes
│   │       ├── demandes/    # Demandes d'inscription, génération de codes
│   │       └── catalogue/   # Catalogue d'articles global (upload icônes)
│   ├── api/                 # Route handlers (tous server-side)
│   │   ├── admin/           # API pressing (personnel, services, clients, stock, commandes, rapports, pressing)
│   │   ├── super-admin/     # API multi-tenant (pressings, abonnements, demandes, catalogue)
│   │   └── public/          # API publique (inscription, activation, verify-code, catalogue-articles)
│   ├── layout.tsx           # Layout racine (Toasters lazy, fonts, metadata)
│   └── globals.css          # Design system (palette oklch, keyframes, gradients)
├── components/
│   ├── ui/                  # shadcn/ui (48 composants)
│   ├── shared/              # StatusBadge, BottomNav, Sidebar, EmptyState, QRScanner
│   └── ogpressing/          # Composants métier (admin/, personnel/, super-admin/, landing/)
├── lib/
│   ├── supabase/
│   │   ├── client.ts        # Client navigateur (anon key, soumise à RLS)
│   │   ├── server.ts        # Client serveur (cookies SSR, anon key, soumise à RLS)
│   │   ├── middleware.ts    # Middleware Edge (auth + cache rôle HMAC)
│   │   └── admin.ts         # ⚠️ Client ADMIN (service_role, contourne RLS — serveur uniquement)
│   ├── db.ts                # Prisma client (scaffold, non utilisé en runtime)
│   ├── motion/              # Variants Framer Motion + hooks accessibilité
│   └── utils/               # Format, export-xlsx
└── middleware.ts            # Route protection + cache rôle
```

---

## Déploiement (Vercel)

OgPressing est conçu pour un déploiement **Vercel** via le connecteur GitHub.

1. **Poussez le dépôt sur GitHub** (assurez-vous que `.env`, `.env.local` et
   `.env.production` ne sont **pas** commités — cf. `.gitignore`).

2. **Importez le projet sur Vercel**
   - Dashboard Vercel → **Add New → Project** → sélectionnez le repo.
   - Framework preset : **Next.js** (auto-détecté).
   - Build command : `bun run build` (ou `next build`).
   - Output directory : `.next` (auto).

3. **Configurez les variables d'environnement**
   Dans **Project Settings → Environment Variables**, ajoutez (cf.
   `.env.production.example` pour le détail) :

   | Variable | Exposée client ? | Sensible ? |
   | --- | :---: | :---: |
   | `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Non |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Non (RLS) |
   | `NEXT_PUBLIC_SITE_URL` | ✅ | Non |
   | `SUPABASE_SERVICE_ROLE_KEY` | ❌ Serveur only | ⚠️ **Oui — sensible** |
   | `OGP_ROLE_CACHE_SECRET` | ❌ Serveur only | Oui (recommandé) |

   ⚠️ **CRITIQUE** : `SUPABASE_SERVICE_ROLE_KEY` ne doit **JAMAIS** porter le
   préfixe `NEXT_PUBLIC_`. Sur Vercel, cochez la case **"Server only"** pour
   empêcher toute fuite vers le bundle client. Une clé `NEXT_PUBLIC_`-préfixée
   contournerait la RLS côté navigateur et exposerait l'ensemble des données
   de tous les pressings.

4. **Déployez** : Vercel build automatiquement à chaque push sur `main`.

5. **Post-déploiement (obligatoire)** :
   - **Changez le mot de passe par défaut du compte Super Admin** dans
     Supabase Auth (Dashboard → Authentication → Users → sélectionnez le
     Super Admin → "Send password reset" ou modifiez directement). Ne laissez
     JAMAIS le mot de passe par défaut en production.
   - Vérifiez que toutes les migrations SQL de `supabase/migrations/` ont été
     appliquées sur le projet Supabase de production.

---

## Scripts disponibles

| Script | Description |
| --- | --- |
| `bun run dev` | Démarre le serveur de développement Next.js (port 3000, Turbopack). |
| `bun run build` | Build de production (`next build` + copie des assets statiques dans `.next/standalone`). |
| `bun run start` | Démarre le serveur de production Node.js depuis `.next/standalone/server.js`. |
| `bun run lint` | Lance ESLint sur tout le projet (`eslint .`). |
| `bun run db:push` | Pousse le schéma Prisma vers la base locale SQLite (`prisma db push --accept-data-loss`). |
| `bun run db:generate` | Régénère le client Prisma (`prisma generate`). |

---

## Sécurité

### Clé `service_role` Supabase

La clé `SUPABASE_SERVICE_ROLE_KEY` **contourne totalement la RLS**. Elle est
utilisée **uniquement** par `src/lib/supabase/admin.ts` (fonction
`getSupabaseAdmin`), elle-même appelée exclusivement depuis des **route
handlers server-side** :

- `src/app/api/admin/personnel/route.ts` et `[id]/route.ts`
- `src/app/api/super-admin/catalogue/upload-icon/route.ts`
- `src/app/api/public/activation/route.ts`
- `src/app/api/public/activation/verify-code/route.ts`
- `src/app/api/public/inscription/route.ts`

Aucun composant client n'importe `@/lib/supabase/admin`. Les opérations
métier courantes (commandes, clients, paiements, stock) passent par
`src/lib/supabase/server.ts` ou `src/lib/supabase/client.ts` qui utilisent la
clé **anon** et sont donc filtrées par les politiques RLS de
`supabase/migrations/006_rls_policies.sql`.

### Règles d'or

- Ne **JAMAIS** préfixer `SUPABASE_SERVICE_ROLE_KEY` par `NEXT_PUBLIC_`.
- Ne **JAMAIS** importer `@/lib/supabase/admin` dans un composant marqué
  `"use client"`.
- Ne **JAMAIS** committer `.env`, `.env.local` ou `.env.production` (ils
  sont ignorés par `.gitignore`).
- **Changez le mot de passe par défaut du compte Super Admin** dans Supabase
  Auth avant toute mise en production.

---

## Licence

**Propriétaire — Tous droits réservés.**

Aucun fichier `LICENSE` n'est fourni avec ce dépôt. Toute reproduction,
distribution ou exploitation du code sans autorisation écrite explicite de
l'éditeur est interdite.
