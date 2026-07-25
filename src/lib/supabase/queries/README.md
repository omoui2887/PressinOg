# `/lib/supabase/queries/`

Ce dossier contient les **fonctions de requêtes Supabase réutilisables**,
organisées par fonctionnalité métier, afin de garder le code propre et
d'éviter de dupliquer la logique d'accès aux données dans les composants.

## Convention

Chaque fichier `.ts` regroupe les requêtes liées à une entité ou un module :

| Fichier (à créer) | Contenu                                                          |
|-------------------|------------------------------------------------------------------|
| `clients.ts`      | `listClients()`, `getClientById()`, `createClient()`, …         |
| `commandes.ts`    | `listCommandes()`, `getCommandeAvecLignes()`, `createCommande()` |
| `personnel.ts`    | `listPersonnel()`, `getPlanLimits()`, `desactiverEmploye()`     |
| `stock.ts`        | `listProduits()`, `checkSeuilAlerte()`, `mouvementStock()`      |
| `abonnements.ts`  | `getAbonnementActif()`, `checkLimitAtteinte()`                  |
| `stats.ts`        | `getDashboardStats()`, `getMRR()`, `getNouveauxPressingsMois()` |

## Bonnes pratiques

1. **Toujours utiliser le client serveur** (`getSupabaseServer()`) — les
   requêtes sont soumises à la RLS qui garantit l'isolation multi-tenant.

2. **Typage strict** avec `Database` de `@/lib/types/database.types.ts` :
   ```ts
   import { getSupabaseServer } from "@/lib/supabase/server";
   import type { Tables } from "@/lib/types/database.types";

   export async function listClients(): Promise<Tables<"clients">[]> {
     const supabase = await getSupabaseServer();
     const { data, error } = await supabase.from("clients").select("*");
     if (error) throw error;
     return data;
   }
   ```

3. **Gestion d'erreur centralisée** : chaque fonction lance une erreur
   typée (ou retourne un `Result<T>`) plutôt que de renvoyer `null`.

4. **Pas de logique métier** : ces fonctions ne font que des requêtes DB.
   La logique (calculs, validations métier) reste dans les Route Handlers
   ou les Server Components.

## État actuel

Pour l'instant, les requêtes sont inline dans les Route Handlers
(`/api/admin/clients/route.ts`, `/api/admin/personnel/route.ts`, etc.).
Le refactoring vers ce dossier se fera au fur et à mesure des prochains lots
pour factoriser la logique commune.
