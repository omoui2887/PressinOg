# Migrations SQL Phase 4 — P4-E

Ce document synthétise les migrations SQL générées par l'agent **P4-E**
pour clôturer les correctifs Phase 4 (P4-A → P4-D). Toutes les
migrations sont **idempotentes** et **non exécutées** (l'utilisateur
doit les appliquer manuellement via le SQL Editor Supabase).

## Liste des nouvelles migrations

| # | Fichier | Objet | Phase 4 / Audit | Description courte |
|---|---------|-------|-----------------|--------------------|
| 022 | `022_fix_services_manquants.sql` | Backfill services | (pré-Phase 4) | Pour chaque pressing existant, garantit la présence des 5 services standards (lavage, repassage, nettoyage_sec, detachage, blanchisserie) dans `public.services`. Utilise `::text` cast sur les comparaisons d'enum pour éviter 22P02. |
| 026 | `026_fix_security_definer_leak.sql` | Hardening SECURITY DEFINER | Phase 4 #11 / AUDIT §2.5 | Complément à 018 : re-déclare les 3 fonctions en SECURITY INVOKER + ajoute un check `pressing_id` explicite dans `calculer_statut_commande` et `calculer_statut_paiement_commande` (defense-in-depth). REVOKE EXECUTE FROM anon sur `is_super_admin`, `get_pressing_id_utilisateur`, `current_pressing_id`, `is_pressing_manager`. |
| 027 | `027_audit_log.sql` | Audit log | AUDIT-B-13 | Crée la table `public.audit_log` (10 colonnes) qui journalise les actions sensibles (commandes, personnel, abonnements, pressings). RLS : SELECT (SA + personnel du pressing) / INSERT (service_role uniquement — `WITH CHECK (false)` bloque les clients). 4 index. |
| 028 | `028_cascade_suspension_personnel.sql` | Cascade désactivation personnel | AUDIT-B-10 | Trigger DB-level AFTER UPDATE OF statut ON pressing : désactive automatiquement tout le personnel actif (`statut_compte='desactive'`, `actif=false`) quand `pressing.statut` passe à 'suspendu'. Defense-in-depth côté DB (le complément de la cascade applicative P4-D). |
| 029 | `029_workflow_transitions_guard.sql` | Workflow transitions guard | AUDIT-B-08 | Trigger DB-level BEFORE UPDATE OF statut ON commandes : bloque les transitions invalides (ex: 'livre' → 'en_traitement') en levant `check_violation`. Matrice 9×9 alignée sur `src/lib/workflow/commande-statut.ts` (P4-D). |
| 030 | `030_modes_paiement_caissier.sql` | Champs caissier | Phase 4 #13 | Ajoute la colonne `personnel.numero_caisse` (TEXT). Pose 2 CHECK constraints : `check_numero_caisse_caissier_only` et `check_modes_paiement_caissier_only` (les champs caissier ne peuvent être renseignés QUE pour le rôle 'caissier'). Backfill NULL sur les non-caissiers. |
| 031 | `031_notes_limit_enforcement.sql` | Notes length limit | Phase 4 #19 | Ajoute un CHECK `check_notes_max_length` (`notes ≤ 2000 chars`) sur 4 tables : `commandes`, `clients`, `paiements`, `machines`. Defense-in-depth côté DB (le complément des schémas Zod `.max(2000)` P4-C). |
| 032 | `032_index_audit_log.sql` | Index additionnels | (perf) | 5 index additionnels pour les nouvelles tables/colonnes : audit_log global chronological, audit_log (pressing_id, action, created_at), commandes express queue, personnel audit RH, tarifs_articles POS lookup, services POS lookup. |

## Ordre d'exécution

Les migrations **doivent** être appliquées dans l'ordre numérique :

```
022 → 026 → 027 → 028 → 029 → 030 → 031 → 032
```

Toutes sont idempotentes — un re-jeu après succès ne provoque pas d'erreur.

## Notes importantes

### Migration 022 (services manquants)
- Adapté au schéma réel de `002_tables.sql` : la colonne s'appelle `type` (pas `type_service`) et son type est l'enum `type_service`. La colonne `nom` est NOT NULL → fournie pour chaque service. `duree_estimee` est de type INTERVAL → `'24 hours'::interval`.
- Cast `::text` systématique sur les comparaisons d'enum pour éviter l'erreur PostgreSQL 22P02.
- La 6e valeur `laver_repasser` (migration 021) n'est **pas** backfillée automatiquement : elle est créée à la demande par le manager via la table `tarifs_articles` (migration 020).

### Migration 026 (security definer)
- Complément défense-en-profondeur à la migration 018 (qui avait déjà recréé les 3 fonctions fuyardes en SECURITY INVOKER).
- Ajoute un check `pressing_id` explicite dans `calculer_statut_commande` et `calculer_statut_paiement_commande` : même si un futur dev rebascule en SECURITY DEFINER, le check empêche la fuite cross-tenant.
- Le check accepte `v_user_pressing IS NULL` (cas service_role légitime — API routes Next.js) pour ne pas casser les appels serveur.

### Migration 027 (audit log)
- La colonne `entity_id` est de type TEXT (et non UUID) car plusieurs types d'entités coexistent avec différents types d'IDs.
- L'INSERT est bloqué aux clients via `WITH CHECK (false)` → seul `service_role` (bypass RLS) peut insérer. Empêche la falsification du journal.
- UPDATE/DELETE : pas de policy → interdits par défaut (RLS deny-by-default). Le journal est immutable.

### Migration 028 (cascade)
- Le trigger ne se déclenche QUE sur la transition (non-suspendu → suspendu). La réactivation d'un pressing ne réactive PAS automatiquement le personnel (décision P4-D : le manager doit explicitement réactiver chaque employé).

### Migration 029 (workflow guard)
- La matrice est **alignée** sur `src/lib/workflow/commande-statut.ts` (P4-D) : 9 statuts (recu, en_traitement, lave, repasse, pret, en_livraison, livre, retire, annule). 'paye' n'est PAS un `statut_commande` (c'est un `statut_paiement_commande`).
- 'livre', 'retire', 'annule' sont TERMINAUX (liste vide).
- Le trigger est BEFORE UPDATE (pas AFTER) pour pouvoir RAISE EXCEPTION et bloquer l'UPDATE.

### Migration 030 (modes paiement caissier)
- La colonne `modes_paiement_autorises` est déjà présente (migration 019, JSONB NOT NULL DEFAULT). Aucune modification → on ajoute juste un CHECK sur le rôle.
- La colonne `numero_caisse` n'existait PAS avant cette migration (manque documenté par P4-D worklog ligne ~1296).

### Migration 031 (notes limit)
- Cible UNIQUEMENT les tables avec une colonne `notes` TEXT exact : `commandes`, `clients`, `paiements`, `machines`.
- Ne cible PAS `personnel.notes_changement_role` ni `demandes_inscription.notes_traitement` (colonnes différentes, non exposées via les schémas Zod P4-C).
- Utilise `length()` (compte en caractères UTF-8) et non `octet_length()` (compte en octets) — important pour les accents/emojis.

### Migration 032 (index additionnels)
- Complète les index déjà créés par 004 (général) et 027 (audit_log).
- Tous les index sont CREATE INDEX IF NOT EXISTS → idempotents.
- Index partiels (WHERE) pour réduire la taille disque et accélérer les requêtes fréquentes.

## Vérification post-application

Après avoir appliqué toutes les migrations, l'utilisateur peut vérifier :

```sql
-- Vérifier que les 5 services standards existent pour chaque pressing
SELECT pressing_id, COUNT(*) AS nb_services
FROM public.services
WHERE type::text IN ('lavage', 'repassage', 'nettoyage_sec', 'detachage', 'blanchisserie')
GROUP BY pressing_id
HAVING COUNT(*) < 5;
-- Attendu : 0 ligne (tous les pressings ont les 5 services)

-- Vérifier que les fonctions de calcul sont SECURITY INVOKER
SELECT proname, prosecdef
FROM pg_proc
WHERE proname IN ('deriver_statut_commande', 'calculer_statut_commande',
                   'calculer_statut_paiement_commande');
-- Attendu : prosecdef = false pour les 3

-- Vérifier que la table audit_log existe avec sa RLS
SELECT tablename, rowsecurity
FROM pg_tables
WHERE tablename = 'audit_log';
-- Attendu : rowsecurity = true

-- Vérifier que les triggers sont en place
SELECT tgname, tgrelid::regclass, tgenabled
FROM pg_trigger
WHERE tgname IN ('trg_cascade_suspension_personnel',
                  'trg_check_commande_statut_transition');
-- Attendu : 2 lignes, tgenabled = 'O' (origin)

-- Vérifier que les CHECK constraints sont en place
SELECT conname, conrelid::regclass
FROM pg_constraint
WHERE conname IN ('check_numero_caisse_caissier_only',
                   'check_modes_paiement_caissier_only',
                   'check_notes_max_length');
-- Attendu : au moins 6 lignes (2 caissier + 4 notes)
```
