# AUDIT DE SÉCURITÉ — OgPressing

**Date** : 01/08/2026
**Périmètre** : Application complète (src/, supabase/migrations/, config, dépendances)
**Méthodologie** : Checklist 9 sections / 50+ items, analyse statique exhaustive par 5 agents parallèles
**Codebase** : Next.js 16 (App Router, TS) + Supabase (PostgreSQL, RLS, Storage, Auth)

---

## 1. Évaluation de la Posture de Sécurité

### 🔴 CRITIQUE

La base de code présente **une exposition active de données** et plusieurs contournements d'authentification exploitables. L'isolation multi-tenant (Section 9), critère le plus déterminant pour ce produit, est **fiable côté base de données** (RLS sur 18/18 tables, `WITH CHECK` systématique, `auth.uid()` partout, aucune fuite cross-pressing sur les policies) mais **compromise côté stockage de fichiers** (buckets Storage sans policy, FDS et justificatifs potentiellement publics) et **affaiblie côté configuration** (middleware fail-open si variables d'env manquantes, mot de passe Super Admin fuité dans l'historique git public).

**Résumé exécutif** : Le socle RLS Supabase est solide et l'isolation `pressing_id` via `get_pressing_id_utilisateur()` est correctement appliquée à toutes les tables métier. Cependant, **trois vulnérabilités critiques** exigent une action immédiate : (1) le mot de passe Super Admin par défaut `OgPressing2026!` est commité en clair dans `worklog.md` sur un dépôt GitHub **public** ; (2) les buckets Supabase Storage (`fds`, `justificatifs`) n'ont aucune policy RLS et sont accédés via `getPublicUrl()` — les Fiches de Données de Sécurité et justificatifs de paiement sont donc potentiellement accessibles à tout internet ; (3) le middleware `updateSession()` fail-open (laisse passer toutes les requêtes) si `NEXT_PUBLIC_SUPABASE_ANON_KEY` est manquante. À cela s'ajoutent 76 vulnérabilités de dépendances (dont 1 critique sur `next-auth` qui n'est même pas utilisé) et l'absence totale de rate limiting sur les endpoints d'activation.

---

## 2. Conclusions Critiques et Hautes

### 🔴 CRITIQUE

---

```
┌─────────────────────────────────────────────────────────┐
│ CONCLUSION #1                                            │
├──────────┬────────────────────────────────────────────────┤
│ Sévérité │ CRITIQUE                                       │
│ Catégorie│ Secret codé en dur / Fuite git                 │
│ Emplacement│ worklog.md:676,696,700,982 (+ historique git)│
│ CWE      │ CWE-798 (Use of Hard-coded Credentials)        │
├──────────┴────────────────────────────────────────────────┤
│ Ce qui ne va pas :                                        │
│ Le mot de passe Super Admin par défaut "OgPressing2026!"  │
│ (compte ogouromain@gmail.com) apparaît en clair dans      │
│ worklog.md, fichier tracké dans git. Le dépôt distant     │
│ https://github.com/omoui2887/PressinOg.git est PUBLIC.    │
│ Mots de passe additionnels fuités : TestLot5_2026!,       │
│ TestLot6_2026!, Test1234! (4 comptes test).               │
│                                                            │
│ Pourquoi c'est important :                                │
│ N'importe qui sur internet peut récupérer le mot de passe │
│ du compte Super Admin (accès global à TOUS les pressings, │
│ toutes les données clients, toutes les factures). C'est   │
│ une compromission totale du SaaS. Les comptes test        │
│ (admin1@ogpressing.ci etc.) donnent accès aux données du  │
│ pressing de démo qui pourrait contenir de vraies données. │
│                                                            │
│ Le code vulnérable :                                       │
│ worklog.md:676                                             │
│   - Mot de passe Super Admin : OgPressing2026!            │
│ worklog.md:696                                             │
│   - Compte: ogouromain@gmail.com                          │
│   - Mot de passe: OgPressing2026!                         │
│                                                            │
│ La correction :                                            │
│ 1. Pivoter IMMÉDIATEMENT le mot de passe Super Admin via  │
│    Supabase Dashboard → Authentication → Users → Reset.   │
│ 2. Pivoter tous les mots de passe test (admin1, etc.).    │
│ 3. Purger l'historique git :                              │
│    git filter-repo --replace-text <(echo 'OgPressing2026!│
│    ==>***REDACTED***') --force                            │
│    git push --force --all                                 │
│ 4. OU plus simple : privatiser le dépôt GitHub            │
│    (Settings → Danger Zone → Change visibility).          │
│ 5. Ajouter worklog.md au .gitignore (contient des secrets)│
│                                                            │
│ Effort : ~30 minutes (pivot) + ~60 minutes (git purge)    │
└─────────────────────────────────────────────────────────┘
```

---

```
┌─────────────────────────────────────────────────────────┐
│ CONCLUSION #2                                            │
├──────────┬────────────────────────────────────────────────┤
│ Sévérité │ CRITIQUE                                       │
│ Catégorie│ RLS Storage manquant / Fuite de fichiers       │
│ Emplacement│ src/components/ogpressing/admin/stock/       │
│           │ add-product-dialog.tsx:120                    │
│           │ src/components/ogpressing/admin/stock/        │
│           │ edit-product-dialog.tsx:122                   │
│           │ src/components/ogpressing/super-admin/        │
│           │ abonnements/renouvellement-dialog.tsx:192,199 │
│           │ supabase/migrations/ (aucune policy storage)  │
│ CWE      │ CWE-284 (Improper Access Control)              │
├──────────┴────────────────────────────────────────────────┤
│ Ce qui ne va pas :                                        │
│ Aucune des 15 migrations SQL ne crée de policy RLS sur    │
│ storage.objects. Les buckets `fds` (Fiches de Données de  │
│ Sécurité) et `justificatifs` (justificatifs de paiement)  │
│ sont accédés via getPublicUrl(), qui génère une URL       │
│ publique devinable. Si ces buckets sont créés comme       │
│ publics via le Dashboard (cas trivial par défaut), tous   │
│ les FDS et justificatifs de paiement de tous les pressings│
│ sont accessibles à internet.                              │
│                                                            │
│ Pourquoi c'est important :                                │
│ Les FDS contiennent des données de sécurité sur les       │
│ produits chimiques (composition, dangers, premiers        │
│ secours) — données sensibles business. Les justificatifs  │
│ de paiement contiennent des informations financières.     │
│ Le PRD exige que ces fichiers soient accessibles          │
│ UNIQUEMENT au pressing concerné et au Super Admin.        │
│                                                            │
│ Le code vulnérable :                                       │
│ // add-product-dialog.tsx:118-122                         │
│ const { data } = supabase.storage                         │
│   .from('fds')                                            │
│   .getPublicUrl(path); // URL publique !                  │
│                                                            │
│ // renouvellement-dialog.tsx:195-199                      │
│ const { data: signed } = await supabase.storage           │
│   .from('justificatifs')                                  │
│   .createSignedUrl(path, 60*60*24*365*10); // 10 ANS !    │
│                                                            │
│ La correction :                                            │
│ -- Nouvelle migration 016_storage_buckets.sql             │
│ INSERT INTO storage.buckets (id, name, public)            │
│ VALUES ('fds', 'fds', false),                             │
│        ('justificatifs', 'justificatifs', false),         │
│        ('logos', 'logos', true),                          │
│        ('catalogue-articles', 'catalogue-articles', true)│
│ ON CONFLICT (id) DO NOTHING;                              │
│                                                            │
│ CREATE POLICY "fds_isolation" ON storage.objects          │
│ FOR SELECT USING (                                        │
│   bucket_id = 'fds' AND EXISTS (                          │
│     SELECT 1 FROM produits_stock ps                       │
│     JOIN personnel p ON p.pressing_id = ps.pressing_id    │
│     WHERE ps.fds_url = name AND p.user_id = auth.uid()    │
│   ) OR public.is_super_admin()                            │
│ );                                                         │
│ -- (idem pour justificatifs)                              │
│                                                            │
│ Côté app : remplacer getPublicUrl() par route serveur     │
│ qui génère createSignedUrl(path, 3600) après vérification │
│ pressing_id.                                               │
│                                                            │
│ Effort : ~4 heures                                         │
└─────────────────────────────────────────────────────────┘
```

---

```
┌─────────────────────────────────────────────────────────┐
│ CONCLUSION #3                                            │
├──────────┬────────────────────────────────────────────────┤
│ Sévérité │ CRITIQUE                                       │
│ Catégorie│ Contournement d'authentification (fail-open)    │
│ Emplacement│ src/middleware.ts:564-574 (updateSession)     │
│ CWE      │ CWE-636 (Not Failing Securely/Fail-open)       │
├──────────┴────────────────────────────────────────────────┤
│ Ce qui ne va pas :                                        │
│ Si NEXT_PUBLIC_SUPABASE_ANON_KEY (ou URL) est manquante   │
│ ou mal chargée, le middleware logge un warning et         │
│ appelle NextResponse.next() — laissant passer TOUTES les  │
│ requêtes vers /admin/*, /personnel/*, /super-admin/*.     │
│ L'authentification est désactivée silencieusement.        │
│                                                            │
│ Pourquoi c'est important :                                │
│ En production, si une variable d'env est perdue lors      │
│ d'un déploiement Vercel (mise à jour, rollback, env       │
│ supprimé par erreur), l'application démarre sans auth.    │
│ Tous les utilisateurs anonymes accèdent à toutes les      │
│ données. Le dev log confirme que ce mode est déjà actif   │
│ en dev ("Supabase env vars manquantes — middleware skip").│
│                                                            │
│ Le code vulnérable :                                       │
│ // src/middleware.ts:564-574                              │
│ if (!process.env.NEXT_PUBLIC_SUPABASE_URL ||              │
│     !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {         │
│   console.warn("[updateSession] Supabase env vars " +     │
│     "manquantes — middleware skip (auth désactivée)");    │
│   return NextResponse.next({ request }); // FAIL-OPEN !   │
│ }                                                          │
│                                                            │
│ La correction :                                            │
│ // Fail-closed : rediriger vers /login avec erreur        │
│ if (!process.env.NEXT_PUBLIC_SUPABASE_URL ||              │
│     !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {         │
│   console.error("[FATAL] Supabase env vars manquantes");  │
│   const url = req.nextUrl.clone();                        │
│   url.pathname = "/login";                                │
│   url.searchParams.set("error", "config_incomplète");     │
│   return NextResponse.redirect(url);                      │
│ }                                                          │
│                                                            │
│ // + Créer src/lib/env.ts qui valide au boot :            │
│ const required = [                                         │
│   "NEXT_PUBLIC_SUPABASE_URL",                              │
│   "NEXT_PUBLIC_SUPABASE_ANON_KEY",                         │
│   "SUPABASE_SERVICE_ROLE_KEY",                             │
│ ];                                                         │
│ for (const k of required) {                                │
│   if (!process.env[k]) throw new Error(`Missing ${k}`);   │
│ }                                                          │
│                                                            │
│ Effort : ~15 minutes                                       │
└─────────────────────────────────────────────────────────┘
```

---

```
┌─────────────────────────────────────────────────────────┐
│ CONCLUSION #4                                            │
├──────────┬────────────────────────────────────────────────┤
│ Sévérité │ CRITIQUE                                       │
│ Catégorie│ Validation upload absente (côté serveur)        │
│ Emplacement│ src/components/ogpressing/admin/stock/       │
│           │ add-product-dialog.tsx:183                    │
│           │ src/components/ogpressing/admin/stock/        │
│           │ edit-product-dialog.tsx:183                   │
│           │ src/components/ogpressing/admin/pressing/     │
│           │ infos-generales-tab.tsx (upload logo)         │
│ CWE      │ CWE-434 (Unrestricted Upload of File Type)     │
├──────────┴────────────────────────────────────────────────┤
│ Ce qui ne va pas :                                        │
│ 3 flux d'upload sur 4 se font côté CLIENT via la clé     │
│ anon Supabase, contournant totalement le serveur. La     │
│ validation MIME est client-only (contournable en         │
│ modifiant la requête). Aucune validation magic number.    │
│ La validation FDS utilise && au lieu d'une logique stricte│
│ permettant d'uploader un exécutable renommé .pdf.         │
│                                                            │
│ Pourquoi c'est important :                                │
│ Un attaquant authentifié peut uploader un fichier         │
│ malveillant (ex: script SVG avec <script>, PDF piégé,    │
│ exécutable renommé) dans les buckets Storage. Si le       │
│ bucket est public, le fichier est servi à tous les        │
│ utilisateurs → XSS stockée, phishing, exécution de code.  │
│                                                            │
│ Le code vulnérable :                                       │
│ // add-product-dialog.tsx:183                             │
│ if (file.type !== "application/pdf" &&                    │
│     !file.name.toLowerCase().endsWith(".pdf")) {          │
│   // erreur — MAIS si file.type="application/x-msdownload"│
│   // et file.name="malware.pdf", la 2e condition est      │
│   // FALSE (endsWith .pdf = true), donc && = false,       │
│   // le bloc erreur n'est PAS exécuté → upload autorisé   │
│ }                                                          │
│                                                            │
│ La correction :                                            │
│ // 1. Migrer vers routes serveur dédiées :                │
│ //    POST /api/admin/stock/[id]/fds (multipart/form-data)│
│ //    POST /api/admin/pressing/logo                       │
│                                                            │
│ // 2. Validation serveur stricte :                        │
│ const ALLOWED = new Set(["application/pdf"]);             │
│ if (!ALLOWED.has(file.type)) return 400;                  │
│ if (file.size > 5_000_000) return 413;                    │
│ // 3. Magic number check :                                │
│ const buf = await file.arrayBuffer();                     │
│ const sig = new Uint8Array(buf.slice(0, 4));              │
│ if (!(sig[0]===0x25 && sig[1]===0x50 &&                   │
│       sig[2]===0x44 && sig[3]===0x46)) return 400; // %PDF│
│                                                            │
│ Effort : ~6 heures (3 routes serveur + refonte UI)        │
└─────────────────────────────────────────────────────────┘
```

---

```
┌─────────────────────────────────────────────────────────┐
│ CONCLUSION #5                                            │
├──────────┬────────────────────────────────────────────────┤
│ Sévérité │ HAUTE                                          │
│ Catégorie│ Vulnérabilités de dépendances (76 au total)     │
│ Emplacement│ package.json (next-auth@4.24.13, next@16.1.3) │
│ CWE      │ CWE-1104 (Use of Unmaintained Third Party       │
│           │ Components)                                    │
├──────────┴────────────────────────────────────────────────┤
│ Ce qui ne va pas :                                        │
│ `bun audit` rapporte 76 vulnérabilités : 1 critique,     │
│ 39 hautes, 31 moyennes, 5 basses. La plus grave :        │
│ next-auth@4.24.13 (GHSA-7rqj-j65f-68wh, CRITIQUE —       │
│ bypass homoglyph du @ dans l'email normalizer). Or       │
│ next-auth n'est MÊME PAS importé dans src/ (0 occurrence) │
│ — le projet utilise exclusivement Supabase Auth.         │
│                                                            │
│ Pourquoi c'est important :                                │
│ Les vulnérabilités transitives dans next-auth, sharp,     │
│ xlsx, next-intl peuvent être exploitées si un endpoint    │
│ les expose. next-auth critique permettrait un bypass      │
│ d'authentification si le code l'utilisait.                │
│                                                            │
│ Le code vulnérable :                                       │
│ // package.json                                           │
│ "next-auth": "4.24.13",  // UNUSED, CRITICAL vuln        │
│ "next": "16.1.3",        // update to ≥16.2.5             │
│ "sharp": "0.34.5",       // update to ≥0.35.0             │
│ "xlsx": "0.18.5",        // CDN SheetJS ≥0.20.x           │
│                                                            │
│ La correction :                                            │
│ bun remove next-auth next-intl @reactuses/core gsap \     │
│   react-syntax-highlighter @mdxeditor/editor \            │
│   react-markdown uuid z-ai-web-dev-sdk                    │
│ bun update next@latest sharp@latest                       │
│ # xlsx : migrer vers CDN SheetJS                          │
│                                                            │
│ Effort : ~30 minutes (suppression) + ~2h (updates + test) │
└─────────────────────────────────────────────────────────┘
```

---

```
┌─────────────────────────────────────────────────────────┐
│ CONCLUSION #6                                            │
├──────────┬────────────────────────────────────────────────┤
│ Sévérité │ HAUTE                                          │
│ Catégorie│ Absence de rate limiting                        │
│ Emplacement│ src/app/api/public/activation/route.ts        │
│           │ src/app/api/public/activation/verify-code/     │
│           │ route.ts                                      │
│           │ src/app/(public)/login/page.tsx                │
│ CWE      │ CWE-307 (Improper Restriction of Excessive     │
│           │ Authentication Attempts)                       │
├──────────┴────────────────────────────────────────────────┤
│ Ce qui ne va pas :                                        │
│ Aucun rate limiting sur les endpoints d'authentification  │
│ et d'activation. Les codes d'activation à 8 caractères    │
│ (alphabet réduit sans I/O/0/1 = 31^8 ≈ 8.5 milliards)    │
│ ne sont pas protégés contre le brute-force. Aucun         │
│ middleware de limitation, aucune lib tierce, aucun 429.   │
│                                                            │
│ Pourquoi c'est important :                                │
│ Un attaquant peut spammer /api/public/activation/verify-  │
│ code pour deviner un code d'activation valide et créer    │
│ un compte Admin pirate sur un pressing. Le brute-force    │
│ à 1000 req/s trouve un code en ~85 jours en moyenne —    │
│ mais avec une distribution de codes faible et du          │
│ parallelisme, c'est exploitable. Le spam de /login permet │
│ le credential stuffing.                                   │
│                                                            │
│ Le code vulnérable :                                      │
│ // Aucun code de rate limiting — absence totale           │
│ // rg "rate.?limit|throttle|429" → 0 résultat             │
│                                                            │
│ La correction :                                            │
│ bun add @upstash/ratelimit @upstash/redis                 │
│                                                            │
│ // src/lib/rate-limit.ts                                  │
│ import { Ratelimit } from "@upstash/ratelimit";           │
│ import { Redis } from "@upstash/redis";                   │
│ export const ratelimit = new Ratelimit({                  │
│   redis: Redis.fromEnv(),                                 │
│   limiter: Ratelimit.slidingWindow(5, "1 m"),             │
│ });                                                        │
│                                                            │
│ // Dans /api/public/activation/verify-code/route.ts :     │
│ const { success } = await ratelimit.limit(                │
│   `activate:${ip}`                                        │
│ );                                                         │
│ if (!success) return NextResponse.json(                   │
│   { error: "Trop de tentatives" }, { status: 429 }        │
│ );                                                         │
│                                                            │
│ Effort : ~3 heures                                          │
└─────────────────────────────────────────────────────────┘
```

---

```
┌─────────────────────────────────────────────────────────┐
│ CONCLUSION #7                                            │
├──────────┬────────────────────────────────────────────────┤
│ Sévérité │ HAUTE                                          │
│ Catégorie│ Route callback d'auth manquante                 │
│ Emplacement│ src/app/auth/callback/route.ts (MANQUANT)     │
│           │ src/app/api/admin/personnel/route.ts:459-462   │
│ CWE      │ CWE-287 (Improper Authentication)               │
├──────────┴────────────────────────────────────────────────┤
│ Ce qui ne va pas :                                        │
│ Aucune route /auth/callback n'existe pour échanger les   │
│ codes PKCE des liens d'invitation par email. Le flux      │
│ d'invitation (inviteUserByEmail avec redirectTo           │
│ /personnel/changer-mot-de-passe) ne peut pas fonctionner :│
│ la page changer-mot-de-passe appelle getUser() qui        │
│ retournera null sans échange de code → redirect /login.   │
│ De plus, le redirectTo utilise request.nextUrl.origin     │
│ (open redirect via header Host spoofé).                   │
│                                                            │
│ Pourquoi c'est important :                                │
│ Les employés invités par email ne peuvent PAS activer     │
│ leur compte (flux cassé). L'open redirect permet à un     │
│ attaquant de faire partir l'email d'invitation avec un    │
│ lien https://evil.com/?code=<PKCE> → leak du code         │
│ d'invitation.                                             │
│                                                            │
│ Le code vulnérable :                                       │
│ // api/admin/personnel/route.ts:459-462                   │
│ const redirectTo = process.env.NEXT_PUBLIC_SITE_URL       │
│   ?? request.nextUrl.origin; // ← spoofable via Host !    │
│ await supabaseAdmin.auth.inviteUserByEmail(email, {       │
│   redirectTo: `${redirectTo}/personnel/changer-mot-de-...`,│
│ });                                                        │
│                                                            │
│ La correction :                                            │
│ // 1. Créer src/app/auth/callback/route.ts :              │
│ import { NextResponse } from "next/server";               │
│ import { createMiddlewareClient } from "@supabase/ssr";   │
│ export async function GET(req) {                          │
│   const url = new URL(req.url);                           │
│   const code = url.searchParams.get("code");              │
│   const next = url.searchParams.get("next") ?? "/";       │
│   if (code) {                                             │
│     const supabase = createMiddlewareClient({ req });     │
│     await supabase.auth.exchangeCodeForSession(code);     │
│   }                                                        │
│   return NextResponse.redirect(`${origin}${next}`);       │
│ }                                                          │
│                                                            │
│ // 2. Refuser l'invitation si SITE_URL non défini :       │
│ const redirectTo = process.env.NEXT_PUBLIC_SITE_URL;      │
│ if (!redirectTo) return NextResponse.json(                │
│   { error: "Configuration incomplète" }, { status: 500 }  │
│ );                                                         │
│                                                            │
│ Effort : ~1 heure                                           │
└─────────────────────────────────────────────────────────┘
```

---

```
┌─────────────────────────────────────────────────────────┐
│ CONCLUSION #8                                            │
├──────────┬────────────────────────────────────────────────┤
│ Sévérité │ HAUTE                                          │
│ Catégorie│ Fuite d'informations dans les erreurs           │
│ Emplacement│ 7 routes API exposent err.message au client    │
│           │ - api/admin/commandes/route.ts (POST, ×4)      │
│           │ - api/admin/personnel/route.ts (POST, ×2)      │
│           │ - api/admin/personnel/[id]/route.ts (×2)       │
│           │ - api/public/activation/route.ts (×5 throws)   │
│           │ - api/super-admin/catalogue/upload-icon        │
│ CWE      │ CWE-209 (Generation of Error Message Containing │
│           │ Sensitive Information)                         │
├──────────┴────────────────────────────────────────────────┤
│ Ce qui ne va pas :                                        │
│ Plusieurs routes retournent err.message brut au client,   │
│ ce qui peut exposer des détails internes : noms de        │
│ tables, colonnes SQL, contraintes, chemins de fichiers,   │
│ voire des noms de variables d'environnement dans les      │
│ erreurs Supabase.                                         │
│                                                            │
│ Pourquoi c'est important :                                │
│ Un attaquant utilise ces messages pour cartographier      │
│ le schéma de base de données (table X existe, colonne Y   │
│ manquante) et affiner ses attaques (inference SQL,        │
│ IDOR).                                                    │
│                                                            │
│ Le code vulnérable :                                       │
│ // api/admin/commandes/route.ts (POST catch)              │
│ catch (err) {                                             │
│   return NextResponse.json(                               │
│     { success: false, error: err.message }, // ← LEAK     │
│     { status: 500 }                                       │
│   );                                                       │
│ }                                                          │
│                                                            │
│ La correction :                                            │
│ catch (err) {                                             │
│   console.error("[api/commandes] erreur:", err); // log   │
│   return NextResponse.json(                               │
│     { success: false, error: "Erreur interne" },          │
│     { status: 500 }                                       │
│   );                                                       │
│ }                                                          │
│                                                            │
│ Effort : ~1 heure (7 routes à corriger)                   │
└─────────────────────────────────────────────────────────┘
```

---

```
┌─────────────────────────────────────────────────────────┐
│ CONCLUSION #9                                            │
├──────────┬────────────────────────────────────────────────┤
│ Sévérité │ HAUTE                                          │
│ Catégorie│ Validation par schéma absente (Zod)             │
│ Emplacement│ Toutes les routes src/app/api/**/route.ts     │
│           │ (0 import Zod dans le dossier api)             │
│ CWE      │ CWE-20 (Improper Input Validation)              │
├──────────┴────────────────────────────────────────────────┤
│ Ce qui ne va pas :                                        │
│ Aucune route API n'utilise Zod (ou équivalent) pour      │
│ valider le body. La validation est manuelle (typeof,      │
│ regex, includes), répétitive et inconsistante. Certains   │
│ champs ne sont pas validés du tout (ex: reference         │
│ paiements sans slice cohérent).                           │
│                                                            │
│ Pourquoi c'est important :                                │
│ Sans validation par schéma centralisée, des données       │
│ malformées peuvent atteindre la base (injection de        │
│ caractères spéciaux, champs trop longs causing DoS,       │
│ types inattendus causant des erreurs runtime). La         │
│ validation manuelle est sujette à l'oubli sur les         │
│ nouvelles routes.                                         │
│                                                            │
│ Le code vulnérable :                                       │
│ // Pattern typique (api/admin/clients/route.ts) :         │
│ const body = await req.json();                            │
│ if (!body.nom || typeof body.nom !== "string") {          │
│   return 400; // pas de validation longueur/format        │
│ }                                                          │
│ // body.notes accepté sans slice, pas de max length       │
│                                                            │
│ La correction :                                            │
│ bun add zod                                               │
│                                                            │
│ // src/lib/validations/client.ts                          │
│ import { z } from "zod";                                  │
│ export const createClientSchema = z.object({              │
│   nom_complet: z.string().min(2).max(100),                │
│   telephone: z.string().regex(/^\+225[0-9\s]+$/),         │
│   email: z.string().email().optional(),                   │
│   notes: z.string().max(2000).optional(),                 │
│ });                                                        │
│                                                            │
│ // Dans la route :                                         │
│ const parsed = createClientSchema.safeParse(body);        │
│ if (!parsed.success) return NextResponse.json(            │
│   { error: parsed.error.flatten() }, { status: 400 }      │
│ );                                                         │
│                                                            │
│ Effort : ~8 heures (couvrir les ~30 routes d'écriture)    │
└─────────────────────────────────────────────────────────┘
```

---

## 3. Victoires Rapides (< 10 minutes chacune)

1. **Fail-closed middleware** (Conclusion #3) : remplacer `NextResponse.next()` par `NextResponse.redirect("/login?error=config")` — 5 lignes, 15 min.
2. **Supprimer next-auth** (Conclusion #5) : `bun remove next-auth` supprime 1 vuln critique + 2 hautes — 1 min.
3. **Masquer err.message** (Conclusion #8) : remplacer `{ error: err.message }` par `{ error: "Erreur interne" }` sur 7 routes — 10 min.
4. **Réduire signed URL justificatifs** de 10 ans à 1 heure : `renouvellement-dialog.tsx:199` changer `60*60*24*365*10` en `3600` — 1 min.
5. **Corriger validation MIME FDS** : remplacer `&&` par `AND` strict (`if (file.type !== "application/pdf")` seul) — 2 min.
6. **Refuser invitation sans SITE_URL** (Conclusion #7) : 3 lignes de garde — 5 min.
7. **Ajouter worklog.md au .gitignore** (Conclusion #1) : 1 ligne — 1 min.
8. **Désactiver ignoreBuildErrors** dans next.config.ts : corrige les 75 erreurs TS cachées — 1 min (après fix TS).
9. **Échapper `id` dans chart.tsx:83** avec `CSS.escape(id)` — 1 min.
10. **Réduire console.error côté client** dans login/activation/changer-mot-de-passe : ne logger que `err.message` (pas l'objet complet) — 10 min.

---

## 4. Plan de Remédiation Priorisé

Toutes les conclusions ordonnées par (1) sévérité puis (2) effort :

| # | Conclusion | Sévérité | Effort | Action |
|---|------------|----------|--------|--------|
| 1 | #1 — Mot de passe Super Admin fuité | CRITIQUE | 30 min | Pivoter mot de passe + purger git/privatiser dépôt |
| 2 | #3 — Middleware fail-open | CRITIQUE | 15 min | Fail-closed + validation env au boot |
| 3 | #2 — RLS Storage manquant | CRITIQUE | 4 h | Migration 016 + policies + signed URLs |
| 4 | #4 — Uploads client sans validation serveur | CRITIQUE | 6 h | Migrer vers routes serveur + magic number |
| 5 | #7 — Route /auth/callback manquante | HAUTE | 1 h | Créer route + fixer open redirect |
| 6 | #5 — Dépendances vulnérables | HAUTE | 30 min | Supprimer 9 deps + update next/sharp |
| 7 | #6 — Absence rate limiting | HAUTE | 3 h | @upstash/ratelimit sur /activation, /login |
| 8 | #8 — Fuite err.message | HAUTE | 1 h | Masquer sur 7 routes |
| 9 | #9 — Validation Zod absente | HAUTE | 8 h | Schémas Zod sur ~30 routes |
| 10 | 9.10 — Codes activation non robustes SQL | MOYENNE | 2 h | Fonction SQL activer_code() atomique |
| 11 | 2.5 — Fonctions SECURITY DEFINER leakantes | MOYENNE | 1 h | Ajouter filtre pressing_id dans 3 fonctions |
| 12 | 3.8 — Open redirect invitation | MOYENNE | 5 min | Refuser si SITE_URL non défini |
| 13 | 9.7 — Champs caissier non implémentés | MOYENNE | 4 h | Implémenter modes_paiement_autorises etc. |
| 14 | 9.11 — Restriction modes paiement | MOYENNE | 2 h | Valider contre personnel.modes_paiement_autorises |
| 15 | 9.9 — Scan QR sans check pressing_id client | MOYENNE | 1 h | Ajouter comparaison côté client (RLS atténue) |
| 16 | 1.4 — console.log/error (~110 occ.) | BASSE | 2 h | Réduire / ne logger que message |
| 17 | 1.6 — Validation env au démarrage | BASSE | 30 min | src/lib/env.ts + instrumentation.ts |
| 18 | 3.2 — Middleware pas strictement deny-by-default | BASSE | 30 min | Refactor matcher en liste blanche |
| 19 | 4.3 — Notes clients non tronquées | BASSE | 15 min | Ajouter slice sur notes dans PATCH |
| 20 | 8.3 — SVG XSS potentiel sur upload-icon | BASSE | 30 min | Restreindre ou sanitizer SVG |
| 21 | 5.4 — Packages obsolètes (next, sharp, xlsx) | BASSE | 2 h | Updates + tests |
| 22 | ignoreBuildErrors: true dans next.config | BASSE | 4 h | Corriger 75 erreurs TS + désactiver |

**Effort total estimé** : ~50 heures pour remédiation complète (critique + haute = ~24 h).

---

## 5. Ce qui est Déjà Bien Fait

À NE PAS CASSER — patterns sécurisés à conserver :

1. **RLS activé sur 18/18 tables** (migration 006 + additions) — toutes les tables métier ont RLS, y compris `catalogue_articles` (ajoutée en 014).
2. **Clauses `WITH CHECK` systématiques** sur les policies INSERT/UPDATE de `commandes`, `articles_vetements`, `paiements`, `personnel` — empêche l'usurpation de `pressing_id`.
3. **`auth.uid()` partout, jamais `user_metadata`** — grep exhaustif confirme 0 utilisation de `auth.jwt()->'user_metadata'` dans les policies.
4. **Fonctions `is_super_admin()` et `get_pressing_id_utilisateur()` SECURITY DEFINER non détournables** — utilisent `auth.uid()`, `SET search_path = public`, aucun paramètre, pas de user_metadata.
5. **Aucune injection SQL** — pas d'`EXECUTE` dynamique, pas de `format()` avec entrée utilisateur, `||` uniquement pour concaténation plpgsql sûre.
6. **Isolation multi-tenant vérifiée** — toutes les policies `isolation_pressing` filtrent par `pressing_id = get_pressing_id_utilisateur()` ou EXISTS sur table parent RLS-filtrée. Test statique sur 8 tables métier : aucune fuite.
7. **Accès public partiel maîtrisé** — `demandes_inscription` : INSERT-anon-only via `policy_insert_anonyme`, SELECT/UPDATE/DELETE interdits à anon. `codes_activation` : lecture anon limitée aux colonnes `code, utilise` via `GRANT` column-level (n'expose pas `demande_id`/`cree_par`).
8. **`getUser()` partout, jamais `getSession()`** — grep confirme 0 `getSession()` dans le code. Toutes les routes API et le middleware valident le JWT auprès des serveurs Supabase.
9. **Aucune mutation via GET** — toutes les opérations de modification utilisent POST/PATCH/PUT/DELETE.
10. **Cookies httpOnly** — Supabase SSR gère les tokens en cookies httpOnly, aucun localStorage pour les tokens.
11. **Aucun secret codé en dur dans src/** — les clés Supabase viennent de `process.env`, aucun `eyJ` JWT codé en dur.
12. **`.gitignore` couvre `.env*`** — vérifié, aucun fichier .env réel tracké dans git.
13. **`SUPABASE_SERVICE_ROLE_KEY` sans préfixe `NEXT_PUBLIC_`** — confirmé partout, jamais exposée au client.
14. **Source maps désactivées en production** — `productionBrowserSourceMaps` absent de next.config.ts (default false).
15. **CORS sécurisé par défaut** — aucun header CORS posé, same-origin par défaut. Pas de combinaison dangereuse Allow-Origin:* + Allow-Credentials.
16. **Aucun package de paiement** (Stripe, CinetPay, PayDunya, Flutterwave) — conforme au PRD "aucun paiement intégré".
17. **Lockfile commité** — `bun.lock` présent dans le dépôt.
18. **Blocage effectif des comptes désactivés** — `actif === true && statut_compte === 'actif'` vérifié à chaque handler API, pas seulement à l'auth. Le cache middleware HMAC 5 min n'est posé QUE pour comptes actifs.
19. **Rôles vérifiés sur /personnel/** — `getConnectedCaissier`/`getConnectedLivreur` vérifient `role === 'caissier'`/`'livreur'`. Un laveur ne peut pas encaisser.
20. **`pressing_id` toujours dérivé de la session** — aucune route ne truste `body.pressing_id`/`body.user_id`/`body.role`. RLS en défense en profondeur.
21. **1 seul `dangerouslySetInnerHTML`** dans `chart.tsx:83` — pas d'input utilisateur, risque nul actuellement (mais à échapper par précaution).

---

## 6. Résumé de la Checklist

### Section 1 — Variables d'Environnement et Secrets
- 1.1 ✅ Secrets codés en dur : aucun dans src/ (mais voir 9.5 pour worklog.md)
- 1.2 ✅ Couverture .gitignore
- 1.3 ✅ Pas de fuite de préfixe public
- 1.4 ⚠️ ~110 console.log/error, stack traces côté client
- 1.5 ✅ Source maps désactivées
- 1.6 ⬚ N/A — pas de validation env au démarrage (voir Conclusion #3)

### Section 2 — Sécurité Base de Données (Supabase)
- 2.1 ✅ RLS activé sur 18/18 tables
- 2.2 ✅ Policies SELECT+INSERT existent partout
- 2.3 ✅ Clauses WITH CHECK présentes
- 2.4 ✅ `auth.uid()` partout, pas de user_metadata
- 2.5 ⚠️ 3 fonctions SECURITY DEFINER leakent le statut cross-pressing
- 2.6 ❌ Aucune policy RLS Storage (buckets `fds`, `justificatifs` exposés)
- 2.7 ✅ Pas d'injection SQL
- 2.8 ✅ `is_super_admin()` / `get_pressing_id_utilisateur()` solides

### Section 3 — Authentification et Sessions
- 3.1 ✅ Middleware protège /admin, /super-admin, /personnel
- 3.2 ⚠️ Pas strictement deny-by-default (prefix-based)
- 3.3 ✅ `getUser()` partout, 0 `getSession()`
- 3.4 ❌ Route /auth/callback manquante (flux invitation cassé)
- 3.5 ✅ Cookies httpOnly
- 3.6 ✅ Routes API protégées
- 3.7 ✅ Vérification croisée des rôles
- 3.8 ⚠️ Flux mot de passe temporaire OK, mais open redirect invitation

### Section 4 — Validation Côté Serveur
- 4.1 ❌ Aucun Zod, validation manuelle inconsistante
- 4.2 ✅ Identité toujours depuis la session, jamais du body
- 4.3 ✅ Pas de XSS (1 dangerouslySetInnerHTML sûr, React échappe par défaut)
- 4.4 ✅ Pas de mutation via GET
- 4.5 ⚠️ 7 routes exposent err.message au client
- 4.6 ⬚ N/A — aucun webhook

### Section 5 — Dépendances
- 5.1 ❌ 76 vulnérabilités (1 critique, 39 hautes, 31 moyennes, 5 basses)
- 5.2 ✅ Aucun package halluciné ou paiement
- 5.3 ✅ Lockfile commité (bun.lock)
- 5.4 ❌ Packages obsolètes (next, next-auth, sharp, xlsx)
- 5.5 ⚠️ 9 dépendances inutilisées (3 avec vuln)

### Section 6 — Rate Limiting
- 6.1 ⬚ N/A — aucune API externe payante appelée
- 6.2 ⚠️ /login protégé par Supabase, /activation NON protégé
- 6.3 ⬚ N/A — aucun rate limiting implémenté

### Section 7 — CORS
- 7.1 ✅ Aucun header CORS (same-origin par défaut)
- 7.2 ✅ N/A (pas de combinaison Allow-Origin + Allow-Credentials)

### Section 8 — Téléchargements de Fichiers
- 8.1 ❌ Validation MIME/taille/magic-number absente côté serveur (3/4 flux client)
- 8.2 ❌ FDS et justificatifs via getPublicUrl (publics)
- 8.3 ✅ Fichiers vers Supabase Storage (pas dans web root)

### Section 9 — Isolation Multi-Tenant (CRITIQUE)
- 9.1 ✅ Isolation croisée vérifiée (8 tables métier, RLS solide)
- 9.2 ✅ `get_pressing_id_utilisateur()` fiable (auth.uid, null si non rattaché)
- 9.3 ✅ `is_super_admin()` via table dédiée (pas user_metadata)
- 9.4 ✅ Aucune intégration de paiement
- 9.5 ❌ Mot de passe Super Admin fuité dans worklog.md (git public)
- 9.6 ✅ Policies demandes_inscription / codes_activation correctes
- 9.7 ⚠️ Isolation personnel OK, mais champs caissier non implémentés
- 9.8 ✅ Comptes désactivés bloqués à chaque requête
- 9.9 ⚠️ Scan QR sans check pressing_id client (RLS atténue)
- 9.10 ❌ Codes activation : expiration/usage unique non vérifiés en SQL
- 9.11 ❌ Restriction modes paiement caissier non implémentée

---

## Synthèse finale

| Niveau | Count | Items |
|--------|-------|-------|
| ✅ PASSE | 28 | Socle RLS, auth, isolation, CORS, sans-paiement |
| ⚠️ PARTIEL | 9 | Console leaks, middleware, validation manuelle, QR scan, champs caissier |
| ❌ ÉCHOUE | 11 | #1-#4 critiques + Zod + rate limiting + err.message + 9.10/9.11 + deps |
| ⬚ N/A | 3 | 1.6, 4.6, 6.1 (mais 1.6 et 6.1 deviennent ❌ via #3 et #6) |

**Verdict global** : 🔴 **CRITIQUE** — 4 vulnérabilités critiques exigent une action immédiate avant toute mise en production. L'isolation multi-tenant (Section 9) est **fiable côté base de données** mais **compromise côté stockage de fichiers** et **affaiblie côté configuration/middleware**. Le socle RLS est solide et ne doit PAS être cassé lors des correctifs.

**Priorité absolue** (avant tout déploiement) :
1. Pivoter le mot de passe Super Admin + purger git (Conclusion #1)
2. Fail-closed le middleware (Conclusion #3)
3. Créer les policies RLS Storage + signed URLs (Conclusion #2)
4. Migrer les uploads vers routes serveur (Conclusion #4)
