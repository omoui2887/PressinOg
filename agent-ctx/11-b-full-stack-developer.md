# Task 11-b — PROMPT 11.2 — /admin/pressing (configuration générale)

**Agent** : full-stack-developer (LOT 11.2 pressing config)
**Task ID** : 11-b
**Réf spec** : `/home/z/my-project/upload/11-services-tarifs-config.md` (PROMPT 11.2)
**Réf patterns** : `src/app/api/admin/stock/route.ts`, `src/components/ogpressing/admin/stock/add-product-dialog.tsx`, `src/app/(admin)/layout.tsx`

## Objectif

Implémenter la page `/admin/pressing` (configuration générale du pressing) avec
3 onglets shadcn/ui (Tabs) :

1. **Informations générales** : Nom, Ville, Adresse, Téléphone, Email, Logo (upload)
2. **Horaires d'ouverture** : 7 jours × (Switch Fermé + 2 inputs time)
3. **Mon abonnement** : lecture seule (plan, statut, date_fin, montant + WhatsApp)

## Livrables (7 fichiers, 1 743 lignes)

| Fichier | Lignes | Rôle |
|---|---|---|
| `src/components/ogpressing/admin/pressing/pressing-helpers.tsx` | 234 | Constantes (JOURS_SEMAINE, PLANS_ABONNEMENT, STATUTS_ABONNEMENT, SUPER_ADMIN_PHONE/WHATSAPP), types (PressingInfo, AbonnementInfo, HorairesState, JourHoraire), converters horairesToState/horairesToDB |
| `src/app/api/admin/pressing/route.ts` | 405 | GET (pressing + dernier abonnement) + PATCH (nom/telephone/email/adresse/ville/logo_url/horaires). Manager actif requis. Validation horaires "HH:MM-HH:MM" |
| `src/components/ogpressing/admin/pressing/pressing-config-page.tsx` | 121 | Client orchestrator avec Tabs (grid-cols-3), fetch /api/admin/pressing, state pressing + abonnement + loading + activeTab |
| `src/components/ogpressing/admin/pressing/infos-generales-tab.tsx` | 501 | RHF + zod (nom 2-200, ville ≤100, adresse ≤500, tel ivoirien 10 chiffres, email), upload logo Storage bucket `logos` (non bloquant) |
| `src/components/ogpressing/admin/pressing/horaires-tab.tsx` | 241 | 7 jours × Switch Fermé + 2 inputs time + validation ouverture < fermeture + PATCH horaires |
| `src/components/ogpressing/admin/pressing/abonnement-tab.tsx` | 223 | 4 stats cards (Plan/Statut/Fin/Montant) + bannière warning si suspendu/expire + Card contact Super Admin + bouton WhatsApp (wa.me/2250576103277) |
| `src/app/(admin)/admin/pressing/page.tsx` | 18 | Remplace le placeholder AdminPagePlaceholder, render `<PressingConfigPage />` |

## Décisions clés

1. **API route (GET + PATCH) plutôt que Server Action** — convention projet
   (cf. PROJECT_CONTEXT + worklog Task 32 LOT 10). `getSupabaseServer()` + RLS.
2. **Manager requis pour GET et PATCH** — la page `/admin/pressing` est
   admin-only per spec LOT 11.2. Le helper `getConnectedManager()` vérifie
   `role === "manager" && actif && statut_compte === "actif"`.
3. **`pressing_id` jamais trusté depuis le body** — toujours `me.pressing_id`
   du JWT. Impossible de modifier un autre pressing via cette API.
4. **Logo Storage bucket `logos`** — upload côté client via
   `getSupabaseBrowser()` (comme FDS dans add-product-dialog.tsx). Échec
   non bloquant : `toast.warning` + continue sans logo. Le bucket n'est pas
   créé depuis le code.
5. **WhatsApp link** : `https://wa.me/2250576103277` — dérivé de
   `+225 05 76 10 32 77` (strip `+` et espaces → `2250576103277`). Le numéro
   ivoirien `05 76 10 32 77` est bien 10 chiffres commençant par `0`.
6. **Horaires jsonb format** : `{"lundi": "08:00-18:00", "dimanche": null}`.
   - `horairesToState` : null/undefined → fermé, string "HH:MM-HH:MM" → ouvert
   - `horairesToDB` : ferme=true → null, ferme=false → "HH:MM-HH:MM"
   - Défaut si horaires null : Lundi-Samedi 08:00-18:00, Dimanche fermé
7. **Validation horaires côté API** : regex `^(\d{2}):(\d{2})-(\d{2}):(\d{2})$`
   + plage 00-23h / 00-59min. Clés parmi `lundi|mardi|...|dimanche` uniquement.
8. **Validation client horaires** : pour chaque jour non fermé, ouverture <
   fermeture → toast.error précisant le jour concerné.
9. **Design system respecté** : primary bleu (#2563EB), secondary vert (#10B981),
   warning orange (#F59E0B), danger rouge (#EF4444). WhatsApp button en
   `bg-secondary` (vert).
10. **Mobile-first** : TabsList grid-cols-3 (3 onglets tiennent sur mobile),
    grid `grid-cols-2 lg:grid-cols-4` pour les 4 stats cards abonnement,
    layout flex-col → sm:flex-row pour les jours d'horaires.

## Vérifications

- `bun run lint` : **0 errors, 0 warnings** ✅ (après suppression de 2 directives
  eslint-disable inutilisées)
- Dev log : `GET /api/admin/pressing 401 in 163ms (compile: 157ms, render: 7ms)` ✅
  (compile OK, rendu OK, 401 attendu pour non-authentifié)
- `curl /admin/pressing` (non auth) → **HTTP 307** redirect vers
  `/login?next=%2Fadmin%2Fpressing` ✅
- `curl /api/admin/pressing` (non auth) → **HTTP 401** ✅

## Écarts par rapport au spec

Aucun écart fonctionnel. Quelques choix d'implémentation mineurs :

- **Card d'information WhatsApp** : J'ai encapsulé la card contact Super Admin
  dans un sous-composant `ContactCard` réutilisé dans les 2 cas (abonnement
  présent et abonnement null). Cela évite la duplication.
- **Bouton WhatsApp** : couleur `bg-secondary` (vert #10B981 du palette projet)
  plutôt qu'un vert WhatsApp dédié, pour rester cohérent avec le design system.
- **Logo preview** : utilisé `URL.createObjectURL(file)` pour la preview locale
  + cleanup via `URL.revokeObjectURL` dans un useEffect de cleanup pour éviter
  les fuites mémoire.
- **Onglet abonnement** : ajout d'un message informatif rappelant qu'aucun
  paiement n'est intégré dans l'app (conformément à PROJECT_CONTEXT.md §3).

## Statut final : ✅ Livré

- 7 fichiers créés (6 nouveaux + 1 page.tsx modifié)
- 1 743 lignes de code total
- Lint : 0 errors, 0 warnings
- Tests curl : 307 (page) + 401 (API) conformes aux attentes
- Worklog mis à jour (append Task 11-b)
