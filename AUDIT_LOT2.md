# Audit LOT 2 — Schéma Supabase OgPressing

> **Objet** : Vérifier systématiquement ce qui a été mis et conçu pour le LOT 2
> (fichier `upload/02-schema-supabase.md` — 5 prompts 2.1 à 2.5) versus l'état
> réel du projet (migrations `001_enums.sql` à `009_vue_clients_enrichis.sql`
> + base Supabase `yqaitafigfxlrprrouhr`).
>
> **Date** : 25/07/2026
> **Réalisé par** : agent main (Task ID 19)

---

## Méthodologie

Pour chaque prompt du LOT 2, on compare :

1. **Le nom du fichier de migration demandé** vs le nom réellement créé.
2. **Les éléments demandés** (tables, colonnes, fonctions, triggers, vues, index,
   contraintes) vs **les éléments réellement présents** dans les fichiers de
   migration **et** en base (vérifiés via PostgREST avec `service_role`).
3. **Categorisation des écarts** :
   - ✅ **CONFORME** — l'élément est présent et conforme au spec.
   - 🔄 **ÉQUIVALENT** — l'élément existe sous un autre nom/structure mais
     couvre fonctionnellement le besoin (ex : `nom_complet` au lieu de
     `nom` + `prenom`).
   - ➕ **AJOUT NON-BLOQUANT** — colonne/fonction manquante ajoutable via
     `ALTER TABLE ADD COLUMN IF NOT EXISTS` ou `CREATE OR REPLACE FUNCTION`
     sans casser l'existant (prise en charge par migration `010`).
   - ⚠️ **DIVERGENCE STRUCTURELLE** — l'implémentation a fait un choix
     différent du spec (souvent plus robuste) ; on conserve l'implémentation
     et on documente.
   - ❌ **MANQUANT CRITIQUE** — élément réellement absent et nécessaire.

---

## PROMPT 2.1 — Enums PostgreSQL → `001_enums.sql`

**Fichier demandé** : `001_enums.sql`
**Fichier créé** : `001_enums.sql` ✅

| Enum demandé | Valeurs spec | État |
|---|---|---|
| `role_personnel` | manager, receptionniste, caissier, laveur, repassage, livreur, comptable | ✅ |
| `methode_creation_personnel` | creation_directe, lien_invitation | ✅ |
| `statut_compte_personnel` | invite_en_attente, actif, desactive | ✅ |
| `statut_pressing` | actif, suspendu, essai | ✅ |
| `plan_abonnement` | starter, pro, business | ✅ |
| `statut_abonnement` | essai, actif, suspendu, expire | ✅ |
| `statut_demande` | en_attente, contactee, validee, refusee | ✅ |
| `type_vetement` | chemise, pantalon, robe, costume, drap, couverture, autre | ✅ |
| `couleur_vetement` | blanc, noir, bleu, rouge, vert, jaune, gris, marron, autre | ✅ |
| `etat_vetement` | bon, acceptable, use, dechire, tache | ✅ |
| `statut_article` | recu, en_traitement, lave, repasse, pret, retire, livre | ✅ |
| `statut_commande` | recu, en_traitement, lave, repasse, pret, en_livraison, livre, retire | ✅ |
| `methode_paiement` | especes, mobile_money, carte_bancaire | ✅ |
| `remise_type` | aucune, pourcentage, montant_fixe, article_gratuit, fidelite | ✅ |
| `statut_paiement_commande` | non_paye, partiel, paye | ✅ |
| `categorie_produit_stock` | detergent, adoucissant, detacheur, desinfectant, javel, savon | ✅ |
| `unite_stock` | litre, kg | ✅ |
| `categorie_depense` | loyer, eau, electricite, salaires, maintenance, fournitures, autre | ✅ |
| `type_service` | lavage, repassage, nettoyage_sec, detachage, blanchisserie | ✅ |
| `type_anomalie` | vetement_endommage, vetement_perdu, erreur_facturation, retard, autre | ✅ |
| `severite_anomalie` | faible, moyenne, elevee | ✅ |

**Total** : 21/21 enums ✅ — vérifiés en base via `pg_type`/`pg_enum` (Task 2).

### Conclusion 2.1
✅ **CONFORME** — RAS.

---

## PROMPT 2.2 — Tables plateforme → `002_tables_plateforme.sql`

**Fichier demandé** : `002_tables_plateforme.sql` (6 tables : super_admins,
demandes_inscription, codes_activation, pressing, abonnements, personnel)
**Fichier créé** : `002_tables.sql` (17 tables fusionnées — choix architectural,
couvre 2.2 + 2.3 + 2.4 en un seul fichier).

### 2.2.1 — `super_admins`

| Colonne spec | Colonne impl | État |
|---|---|---|
| `id uuid PK` | `id UUID PK DEFAULT gen_random_uuid()` | ✅ |
| `email text unique not null` | `email TEXT NOT NULL UNIQUE` | ✅ |
| `nom text` | `nom_complet TEXT NOT NULL` | 🔄 renommé |
| `whatsapp text` | `telephone TEXT` | 🔄 renommé |
| `created_at timestamptz default now()` | `created_at TIMESTAMPTZ DEFAULT NOW()` | ✅ |
| — | `user_id UUID FK auth.users` | ➕ ajouté (nécessaire pour `is_super_admin()` via `auth.uid()`) |
| — | `actif BOOLEAN DEFAULT TRUE` | ➕ ajouté |
| — | `updated_at TIMESTAMPTZ` | ➕ ajouté |

### 2.2.2 — `demandes_inscription`

| Colonne spec | Colonne impl | État |
|---|---|---|
| `id uuid PK` | `id UUID PK` | ✅ |
| `nom text not null` + `prenom text not null` | `nom_gerant TEXT NOT NULL` | 🔄 fusionné en un champ |
| `telephone text not null` | `telephone TEXT NOT NULL` | ✅ |
| `email text not null` | `email TEXT` | ⚠️ spec NOT NULL, impl nullable |
| `nom_pressing text not null` | `nom_pressing TEXT NOT NULL` | ✅ |
| `ville text not null` | `ville TEXT` | ⚠️ spec NOT NULL, impl nullable |
| `adresse text not null` | `commune TEXT` | 🔄 renommé (sémantique différente : commune ivoirienne vs adresse postale) |
| `nombre_machines integer not null` | — | ❌ **MANQUANT** |
| `nombre_employes integer` | — | ❌ **MANQUANT** |
| `message text` | `message TEXT` | ✅ |
| `statut statut_demande default 'en_attente'` | `statut STATUT_DEMANDE DEFAULT 'en_attente'` | ✅ |
| `notes_super_admin text` | `notes_traitement TEXT` | 🔄 renommé |
| `created_at timestamptz default now()` | `created_at TIMESTAMPTZ DEFAULT NOW()` | ✅ |
| `traitee_at timestamptz` | `date_traitement TIMESTAMPTZ` | 🔄 renommé |
| — | `traite_par UUID FK super_admins` | ➕ ajouté (audit) |
| — | `updated_at TIMESTAMPTZ` | ➕ ajouté |

### 2.2.3 — `codes_activation`

| Colonne spec | Colonne impl | État |
|---|---|---|
| `id uuid PK` | `id UUID PK` | ✅ |
| `code text unique not null` (format PRS-XXXX-XXXX) | `code TEXT NOT NULL UNIQUE` | ✅ |
| `demande_id uuid FK demandes_inscription (nullable)` | — | ❌ **MANQUANT** (remplacé par `pressing_id_cible`) |
| — | `pressing_id_cible UUID FK pressing` | ➕ ajouté (lien inverse) |
| `plan plan_abonnement not null` | `plan_initial PLAN_ABONNEMENT DEFAULT 'starter'` | 🔄 renommé |
| `utilise boolean default false` | `utilise BOOLEAN NOT NULL DEFAULT FALSE` | ✅ |
| `expire_at timestamptz not null` | `date_expiration TIMESTAMPTZ` | 🔄 renommé + ⚠️ impl nullable (spec NOT NULL) |
| `created_by uuid FK super_admins` | `cree_par UUID NOT NULL FK super_admins` | 🔄 renommé |
| `created_at timestamptz default now()` | `created_at TIMESTAMPTZ DEFAULT NOW()` | ✅ |
| — | `date_generation TIMESTAMPTZ DEFAULT NOW()` | ➕ ajouté |
| — | `date_utilisation TIMESTAMPTZ` | ➕ ajouté |
| — | `updated_at TIMESTAMPTZ` | ➕ ajouté |

### 2.2.4 — `pressing`

| Colonne spec | Colonne impl | État |
|---|---|---|
| `id uuid PK` | `id UUID PK` | ✅ |
| `nom text not null` | `nom TEXT NOT NULL` | ✅ |
| `admin_user_id uuid` (refs `auth.users`, admin propriétaire) | — | ⚠️ **DIVERGENCE** : couvert par `personnel.user_id` où `role='manager'` (1-1) |
| `ville text`, `adresse text` | `ville TEXT`, `adresse TEXT` | ✅ |
| `telephone text`, `email text` | `telephone TEXT`, `email TEXT` | ✅ |
| `logo_url text` | `logo_url TEXT` | ✅ |
| `horaires jsonb` | — | ❌ **MANQUANT** |
| `statut statut_pressing default 'essai'` | `statut STATUT_PRESSING DEFAULT 'essai'` | ✅ |
| `code_activation_id uuid FK codes_activation` | — | ⚠️ couvert par lien inverse `codes_activation.pressing_id_cible` |
| `created_at timestamptz default now()` | `created_at TIMESTAMPTZ DEFAULT NOW()` | ✅ |
| — | `slug TEXT UNIQUE` | ➕ ajouté |
| — | `commune TEXT` | ➕ ajouté |
| — | `date_activation TIMESTAMPTZ` | ➕ ajouté |
| — | `date_suspension TIMESTAMPTZ` | ➕ ajouté |
| — | `motif_suspension TEXT` | ➕ ajouté |
| — | `updated_at TIMESTAMPTZ` | ➕ ajouté |

### 2.2.5 — `abonnements`

| Colonne spec | Colonne impl | État |
|---|---|---|
| `id uuid PK` | `id UUID PK` | ✅ |
| `pressing_id uuid FK pressing not null` | `pressing_id UUID NOT NULL FK pressing` | ✅ |
| `plan plan_abonnement not null` | `plan PLAN_ABONNEMENT DEFAULT 'starter'` | ✅ |
| `statut statut_abonnement default 'essai'` | `statut STATUT_ABONNEMENT DEFAULT 'essai'` | ✅ |
| `date_debut date not null` | `date_debut TIMESTAMPTZ NOT NULL` | ✅ |
| `date_fin date` | `date_fin TIMESTAMPTZ` | ✅ |
| `montant_mensuel integer (FCFA)` | `montant_mensuel INTEGER NOT NULL` | ✅ |
| `mode_paiement_derniere_echeance methode_paiement` | `mode_paiement_derniere_echeance METHODE_PAIEMENT` | ✅ |
| `reference_paiement text` | — | ❌ **MANQUANT** |
| `justificatif_url text` | — | ❌ **MANQUANT** |
| `enregistre_par uuid FK super_admins` | — | ❌ **MANQUANT** |
| `created_at timestamptz default now()` | `created_at TIMESTAMPTZ DEFAULT NOW()` | ✅ |
| — | `date_derniere_echeance TIMESTAMPTZ` | ➕ ajouté |
| — | `updated_at TIMESTAMPTZ` | ➕ ajouté |

### 2.2.6 — `personnel`

| Colonne spec | Colonne impl | État |
|---|---|---|
| `id uuid PK` | `id UUID PK` | ✅ |
| `pressing_id uuid FK pressing not null` | `pressing_id UUID NOT NULL FK pressing` | ✅ |
| `auth_user_id uuid` (refs `auth.users`, nullable) | `user_id UUID FK auth.users` | 🔄 renommé (`user_id` au lieu de `auth_user_id`) |
| `nom text not null` + `prenom text not null` | `nom_complet TEXT NOT NULL` | 🔄 fusionné |
| `telephone text not null` | `telephone TEXT` | ⚠️ spec NOT NULL, impl nullable |
| `email text` | `email TEXT` | ✅ |
| `role role_personnel not null` | `role ROLE_PERSONNEL NOT NULL` | ✅ |
| `methode_creation methode_creation_personnel not null` | `methode_creation METHODE_CREATION_PERSONNEL DEFAULT 'creation_directe'` | ✅ |
| `statut_compte statut_compte_personnel default 'invite_en_attente'` | `statut_compte STATUT_COMPTE_PERSONNEL DEFAULT 'invite_en_attente'` | ✅ |
| `mot_de_passe_temporaire boolean default true` | `mot_de_passe_temporaire_hash TEXT` | 🔄 boolean → hash BCRYPT (plus sécurisé) |
| `cree_par uuid FK personnel (nullable)` | `cree_par UUID FK personnel` | ✅ |
| `created_at timestamptz default now()` | `created_at TIMESTAMPTZ DEFAULT NOW()` | ✅ |
| `desactive_at timestamptz` | `date_desactivation TIMESTAMPTZ` | 🔄 renommé |
| — | `token_invitation TEXT UNIQUE` | ➕ ajouté (lien_invitation) |
| — | `date_invitation TIMESTAMPTZ` | ➕ ajouté |
| — | `date_activation TIMESTAMPTZ` | ➕ ajouté |
| — | `actif BOOLEAN DEFAULT TRUE` | ➕ ajouté |
| — | `updated_at TIMESTAMPTZ` | ➕ ajouté |

### Conclusion 2.2

- ✅ 6 tables présentes, structurellement conformes (clés PK/FK correctes)
- ❌ **9 colonnes MANQUANTES** (à ajouter via migration 010) :
  - `demandes_inscription.nombre_machines`, `nombre_employes`
  - `codes_activation.demande_id` (FK demandes_inscription)
  - `pressing.horaires` (jsonb)
  - `abonnements.reference_paiement`, `justificatif_url`, `enregistre_par`
- ⚠️ 2 divergences structurelles assumées (documentées, non corrigées) :
  - `pressing.admin_user_id` → couvert par `personnel.user_id` (role=manager)
  - `pressing.code_activation_id` → couvert par `codes_activation.pressing_id_cible`
- 🔄 Multiples renommages cosmétiques (nom→nom_complet, etc.) — non changés pour
  ne pas casser l'app existante (clients, personnel, commandes wizard déjà livrés).

---

## PROMPT 2.3 — Tables métier → `003_tables_metier.sql`

**Fichier demandé** : `003_tables_metier.sql` (6 tables : clients, services,
commandes, commande_lignes, articles_vetements, paiements)
**Fichier créé** : tables incluses dans `002_tables.sql` (choix architectural).

### 2.3.1 — `clients`

| Colonne spec | Colonne impl | État |
|---|---|---|
| `id uuid PK` | `id UUID PK` | ✅ |
| `pressing_id uuid FK pressing not null` | `pressing_id UUID NOT NULL FK pressing` | ✅ |
| `nom_complet text not null` | `nom_complet TEXT NOT NULL` | ✅ |
| `telephone text not null` | `telephone TEXT NOT NULL` | ✅ |
| `email text` | `email TEXT` | ✅ |
| `adresse text` | `adresse TEXT` | ✅ |
| `preferences_lavage jsonb default '{"detergent":"bio",...}'` | — | ❌ **MANQUANT** |
| `notes text` | `notes TEXT` | ✅ |
| `points_fidelite integer default 0` | `points_fidelite INTEGER NOT NULL DEFAULT 0` | ✅ |
| `created_at timestamptz default now()` | `created_at TIMESTAMPTZ DEFAULT NOW()` | ✅ |
| — | `updated_at TIMESTAMPTZ` | ➕ ajouté |

### 2.3.2 — `services`

| Colonne spec | Colonne impl | État |
|---|---|---|
| `id uuid PK` | `id UUID PK` | ✅ |
| `pressing_id uuid FK pressing not null` | `pressing_id UUID NOT NULL FK pressing` | ✅ |
| `nom text not null` | `nom TEXT NOT NULL` | ✅ |
| `type type_service not null` | `type TYPE_SERVICE NOT NULL` | ✅ |
| `prix_unitaire integer not null (FCFA)` | `prix INTEGER NOT NULL` | 🔄 renommé (`prix` au lieu de `prix_unitaire`) |
| `actif boolean default true` | `actif BOOLEAN DEFAULT TRUE` | ✅ |
| `created_at timestamptz default now()` | `created_at TIMESTAMPTZ DEFAULT NOW()` | ✅ |
| — | `duree_estimee INTERVAL` | ➕ ajouté |
| — | `updated_at TIMESTAMPTZ` | ➕ ajouté |

### 2.3.3 — `commandes`

| Colonne spec | Colonne impl | État |
|---|---|---|
| `id uuid PK` | `id UUID PK` | ✅ |
| `pressing_id uuid FK pressing not null` | `pressing_id UUID NOT NULL FK pressing` | ✅ |
| `client_id uuid FK clients not null` | `client_id UUID NOT NULL FK clients` | ✅ |
| `numero_ticket text unique not null` | `numero_commande TEXT NOT NULL UNIQUE` | 🔄 renommé (`numero_commande` au lieu de `numero_ticket`) |
| `statut statut_commande default 'recu'` | `statut STATUT_COMMANDE DEFAULT 'recu'` | ✅ |
| `statut_paiement statut_paiement_commande default 'non_paye'` | `statut_paiement STATUT_PAIEMENT_COMMANDE DEFAULT 'non_paye'` | ✅ |
| `remise_type remise_type default 'aucune'` | `remise_type REMISE_TYPE DEFAULT 'aucune'` | ✅ |
| `remise_valeur integer default 0` | `remise_valeur INTEGER NOT NULL DEFAULT 0` | ✅ |
| `montant_remise integer default 0` | — | ❌ **MANQUANT** |
| `montant_total_avant_remise integer not null default 0` | — | ❌ **MANQUANT** |
| `montant_total integer not null default 0` | `montant_total INTEGER NOT NULL DEFAULT 0` | ✅ |
| `date_retrait_prevue date` | `date_pret_prevue TIMESTAMPTZ` | 🔄 sémantique différente (date PRÊT prévu, pas retrait) |
| `cree_par uuid FK personnel` | `cree_par UUID FK personnel` | ✅ |
| `created_at timestamptz default now()` | `created_at TIMESTAMPTZ DEFAULT NOW()` | ✅ |
| — | `montant_paye INTEGER DEFAULT 0` (calculé par trigger) | ➕ ajouté |
| — | `date_reception TIMESTAMPTZ` | ➕ ajouté |
| — | `date_pret_reel`, `date_livraison`, `date_retrait` | ➕ ajouté |
| — | `livraison BOOLEAN`, `adresse_livraison`, `frais_livraison`, `notes` | ➕ ajouté |
| — | `updated_at TIMESTAMPTZ` | ➕ ajouté |

### 2.3.4 — `commande_lignes`

| Colonne spec | Colonne impl | État |
|---|---|---|
| `id uuid PK` | `id UUID PK` | ✅ |
| `commande_id uuid FK commandes not null` | `commande_id UUID NOT NULL FK commandes` | ✅ |
| `service_id uuid FK services not null` | `service_id UUID FK services` | ⚠️ spec NOT NULL, impl nullable (pour lignes libres) |
| `description text` | `description TEXT` | ✅ |
| `created_at timestamptz default now()` | `created_at TIMESTAMPTZ DEFAULT NOW()` | ✅ |
| — | `type_vetement TYPE_VETEMENT` | ➕ ajouté |
| — | `quantite INTEGER NOT NULL DEFAULT 1` | ➕ ajouté (spéc spec incomplète) |
| — | `prix_unitaire INTEGER NOT NULL` | ➕ ajouté (spéc spec incomplète) |
| — | `montant_ligne INTEGER NOT NULL` | ➕ ajouté |
| — | `updated_at TIMESTAMPTZ` | ➕ ajouté |

### 2.3.5 — `articles_vetements` — ⚠️ DIVERGENCE STRUCTURELLE MAJEURE

Le spec décrit `articles_vetements` comme une ligne de commande (avec
`service_id`, `quantite`, `prix_unitaire`, `sous_total`, `barcode`).
L'implémentation a fait un choix **différent et plus robuste** :

- `commande_lignes` = ligne tarifaire (1 service × N articles × prix)
- `articles_vetements` = vêtement individuel tracé par QR code (1 ligne = 1
  vêtement physique)

| Colonne spec | Colonne impl | État |
|---|---|---|
| `id uuid PK` | `id UUID PK` | ✅ |
| `commande_id uuid FK commandes not null` | `commande_id UUID NOT NULL FK commandes` | ✅ |
| `type_vetement type_vetement not null` | `type_vetement TYPE_VETEMENT NOT NULL` | ✅ |
| `couleur couleur_vetement not null` | `couleur COULEUR_VETEMENT NOT NULL DEFAULT 'autre'` | ✅ |
| `couleur_texte_libre text` (si couleur='autre') | `couleur_libre TEXT` | 🔄 renommé |
| `etat etat_vetement not null` | `etat ETAT_VETEMENT NOT NULL DEFAULT 'bon'` | ✅ |
| `reserves text` (notes réserves) | — | ❌ **MANQUANT** (couvert par `description_etat`) |
| `service_id uuid FK services not null` | — | ⚠️ **DIVERGENCE** : couvert via `ligne_id` → `commande_lignes.service_id` |
| `quantite integer not null default 1` | — | ⚠️ **DIVERGENCE** : 1 article = 1 vêtement (quantité implicite = 1) |
| `prix_unitaire integer not null` | — | ⚠️ **DIVERGENCE** : prix stocké sur `commande_lignes` (1 service × N articles) |
| `sous_total integer not null` | — | ⚠️ **DIVERGENCE** : calculé via `ligne_id` |
| `statut statut_article default 'recu'` | `statut STATUT_ARTICLE DEFAULT 'recu'` | ✅ |
| `barcode text unique not null` | `code_qr TEXT NOT NULL UNIQUE` | 🔄 renommé (`code_qr` au lieu de `barcode`) |
| `assigne_a uuid FK personnel` | — | ❌ **MANQUANT** (affectation à un atelier/laveur) |
| `created_at timestamptz default now()` | `created_at TIMESTAMPTZ DEFAULT NOW()` | ✅ |
| — | `ligne_id UUID FK commande_lignes` | ➕ ajouté (lien à la ligne tarifaire) |
| — | `description_etat TEXT` | ➕ ajouté |
| — | `photo_url TEXT` | ➕ ajouté |
| — | `updated_at TIMESTAMPTZ` | ➕ ajouté |

### 2.3.6 — `paiements`

| Colonne spec | Colonne impl | État |
|---|---|---|
| `id uuid PK` | `id UUID PK` | ✅ |
| `commande_id uuid FK commandes (nullable)` | `commande_id UUID NOT NULL FK commandes` | ⚠️ spec nullable, impl NOT NULL (empêche paiements abonnement-only) |
| `abonnement_id uuid FK abonnements (nullable)` | — | ❌ **MANQUANT** (paiements abonnement SaaS non tracés) |
| `montant integer not null (FCFA)` | `montant INTEGER NOT NULL` | ✅ |
| `methode methode_paiement not null` | `methode METHODE_PAIEMENT NOT NULL` | ✅ |
| `est_acompte boolean default false` | — | ❌ **MANQUANT** |
| `reference text` | `reference TEXT` | ✅ |
| `justificatif_url text` | — | ❌ **MANQUANT** |
| `caissier_id uuid FK personnel` | `enregistre_par UUID FK personnel` | 🔄 renommé |
| `created_at timestamptz default now()` | `created_at TIMESTAMPTZ DEFAULT NOW()` | ✅ |
| `CHECK (commande_id XOR abonnement_id)` | — | ❌ **MANQUANT** (dépend des 2 colonnes ci-dessus) |
| — | `date_paiement TIMESTAMPTZ DEFAULT NOW()` | ➕ ajouté |
| — | `notes TEXT` | ➕ ajouté |
| — | `updated_at TIMESTAMPTZ` | ➕ ajouté |

### Conclusion 2.3

- ✅ 6 tables présentes
- ❌ **8 colonnes MANQUANTES** + **1 CHECK MANQUANT** (à ajouter via 010) :
  - `clients.preferences_lavage` (jsonb)
  - `commandes.montant_remise`, `montant_total_avant_remise`
  - `articles_vetements.assigne_a` (FK personnel)
  - `paiements.abonnement_id` (FK abonnements)
  - `paiements.est_acompte` (boolean)
  - `paiements.justificatif_url` (text)
  - `paiements` CHECK XOR commande_id/abonnement_id
- ⚠️ 1 divergence structurelle assumée : `articles_vetements` est un vêtement
  individuel (1 ligne = 1 QR code), pas une ligne tarifaire — choix plus robuste
  pour le tracking atelier (PRD §6.4)

---

## PROMPT 2.4 — Tables stock, dépenses, anomalies, machines → `004_tables_stock_autres.sql`

**Fichier demandé** : `004_tables_stock_autres.sql` (5 tables)
**Fichier créé** : tables incluses dans `002_tables.sql`. Fichier `004_indexes.sql`
existe mais contient les index (PROMPT implicite).

### 2.4.1 — `produits_stock`

| Colonne spec | Colonne impl | État |
|---|---|---|
| `id uuid PK` | `id UUID PK` | ✅ |
| `pressing_id uuid FK pressing not null` | `pressing_id UUID NOT NULL FK pressing` | ✅ |
| `nom text not null` | `nom TEXT NOT NULL` | ✅ |
| `categorie categorie_produit_stock not null` | `categorie CATEGORIE_PRODUIT_STOCK NOT NULL` | ✅ |
| `unite unite_stock not null` | `unite UNITE_STOCK NOT NULL` | ✅ |
| `quantite_actuelle numeric not null default 0` | `quantite_actuelle NUMERIC(10,2) NOT NULL DEFAULT 0` | ✅ |
| `seuil_alerte numeric not null default 0` | `seuil_alerte NUMERIC(10,2) NOT NULL DEFAULT 0` | ✅ |
| `fds_url text` (fiche données sécurité) | — | ❌ **MANQUANT** |
| `date_expiration date` | — | ❌ **MANQUANT** |
| `created_at timestamptz default now()` | `created_at TIMESTAMPTZ DEFAULT NOW()` | ✅ |
| — | `prix_achat_unitaire INTEGER` | ➕ ajouté |
| — | `fournisseur TEXT` | ➕ ajouté |
| — | `updated_at TIMESTAMPTZ` | ➕ ajouté |

### 2.4.2 — `mouvements_stock`

| Colonne spec | Colonne impl | État |
|---|---|---|
| `id uuid PK` | `id UUID PK` | ✅ |
| `produit_stock_id uuid FK produits_stock not null` | `produit_id UUID NOT NULL FK produits_stock` | 🔄 renommé |
| `type_mouvement text not null` ('entree'/'sortie') | `type_mouvement TEXT NOT NULL CHECK (... IN ('entree','sortie','ajustement'))` | ✅ + valeur 'ajustement' ajoutée |
| `quantite numeric not null` | `quantite NUMERIC(10,2) NOT NULL` | ✅ |
| `commande_id uuid FK commandes (nullable)` | — | ❌ **MANQUANT** |
| `effectue_par uuid FK personnel` | `enregistre_par UUID FK personnel` | 🔄 renommé |
| `notes text` | `motif TEXT` | 🔄 renommé |
| `created_at timestamptz default now()` | `created_at TIMESTAMPTZ DEFAULT NOW()` | ✅ |
| — | `date_mouvement TIMESTAMPTZ DEFAULT NOW()` | ➕ ajouté |

### 2.4.3 — `machines`

| Colonne spec | Colonne impl | État |
|---|---|---|
| `id uuid PK` | `id UUID PK` | ✅ |
| `pressing_id uuid FK pressing not null` | `pressing_id UUID NOT NULL FK pressing` | ✅ |
| `nom text not null` | `nom TEXT NOT NULL` | ✅ |
| `type text` | `type TEXT` | ✅ |
| `statut text default 'operationnelle'` | `statut TEXT NOT NULL DEFAULT 'operationnelle' CHECK (IN ('operationnelle','en_panne','maintenance'))` | ✅ + CHECK ajouté |
| `created_at timestamptz default now()` | `created_at TIMESTAMPTZ DEFAULT NOW()` | ✅ |
| — | `capacite NUMERIC(10,2)`, `unite UNITE_STOCK`, `date_achat DATE` | ➕ ajouté |
| — | `date_derniere_maintenance DATE`, `notes TEXT` | ➕ ajouté |
| — | `updated_at TIMESTAMPTZ` | ➕ ajouté |

### 2.4.4 — `anomalies`

| Colonne spec | Colonne impl | État |
|---|---|---|
| `id uuid PK` | `id UUID PK` | ✅ |
| `pressing_id uuid FK pressing not null` | `pressing_id UUID NOT NULL FK pressing` | ✅ |
| `commande_id uuid FK commandes (nullable)` | `commande_id UUID FK commandes` | ✅ |
| `article_id uuid FK articles_vetements (nullable)` | `article_id UUID FK articles_vetements` | ✅ |
| `type type_anomalie not null` | `type TYPE_ANOMALIE NOT NULL` | ✅ |
| `severite severite_anomalie not null default 'faible'` | `severite SEVERITE_ANOMALIE NOT NULL DEFAULT 'moyenne'` | ⚠️ default différent ('moyenne' vs 'faible') |
| `description text not null` | `description TEXT NOT NULL` | ✅ |
| `declaree_par uuid FK personnel` | `declare_par UUID FK personnel` | 🔄 renommé (sans 'e') |
| `resolue boolean default false` | `statut TEXT DEFAULT 'ouverte' CHECK (IN ('ouverte','en_cours','resolue'))` | 🔄 boolean → statut text (plus riche) |
| `created_at timestamptz default now()` | `created_at TIMESTAMPTZ DEFAULT NOW()` | ✅ |
| — | `date_declaration TIMESTAMPTZ DEFAULT NOW()` | ➕ ajouté |
| — | `date_resolution TIMESTAMPTZ`, `resolu_par UUID FK personnel`, `solution TEXT` | ➕ ajouté |
| — | `updated_at TIMESTAMPTZ` | ➕ ajouté |

### 2.4.5 — `depenses`

| Colonne spec | Colonne impl | État |
|---|---|---|
| `id uuid PK` | `id UUID PK` | ✅ |
| `pressing_id uuid FK pressing not null` | `pressing_id UUID NOT NULL FK pressing` | ✅ |
| `categorie categorie_depense not null` | `categorie CATEGORIE_DEPENSE NOT NULL` | ✅ |
| `montant integer not null (FCFA)` | `montant INTEGER NOT NULL` | ✅ |
| `description text` | `description TEXT` | ✅ |
| `date_depense date not null` | `date_depense DATE NOT NULL DEFAULT CURRENT_DATE` | ✅ |
| `created_by uuid` (refs `auth.users`) | `enregistre_par UUID FK personnel` | 🔄 cible FK différente (`personnel` au lieu de `auth.users` — plus cohérent en multi-tenant) |
| `created_at timestamptz default now()` | `created_at TIMESTAMPTZ DEFAULT NOW()` | ✅ |
| — | `methode_paiement METHODE_PAIEMENT`, `reference TEXT` | ➕ ajouté |
| — | `updated_at TIMESTAMPTZ` | ➕ ajouté |

### 2.4.6 — Index demandé

| Index spec | État |
|---|---|
| Index sur toutes les FK | ✅ (23 index dans `004_indexes.sql` Section 2) |
| Index composite `produits_stock(pressing_id, quantite_actuelle, seuil_alerte)` pour alertes stock bas | ❌ **MANQUANT** |

### Conclusion 2.4

- ✅ 5 tables présentes et conformes
- ❌ **3 colonnes MANQUANTES** + **1 index MANQUANT** :
  - `produits_stock.fds_url`, `date_expiration`
  - `mouvements_stock.commande_id` (FK commandes)
  - Index composite `produits_stock(pressing_id, quantite_actuelle, seuil_alerte)`

---

## PROMPT 2.5 — Fonctions, triggers et vues → `005_fonctions_triggers.sql`

**Fichier demandé** : `005_fonctions_triggers.sql`
**Fichier créé** : `005_triggers.sql` (renommé) + fonctions helpers dans
`006_rls_policies.sql` + vue dans `009_vue_clients_enrichis.sql`.

### 2.5.1 — Vue `vue_clients_enrichis`

| Élément spec | État |
|---|---|
| Toutes les colonnes de `clients` | ✅ |
| `solde_impaye` : SUM(montant_total - paiements) pour commandes non payées | ✅ (calc via `montant_total - montant_paye` pour `statut_paiement IN ('non_paye','partiel')`) |
| `total_depense` : SUM paiements enregistrés pour les commandes | 🔄 impl calcule `SUM(montant_total)` au lieu de `SUM(paiements)` — **différence sémantique** |

> **Note** : la vue existe et est appliquée en base (testée via PostgREST —
> retourne un client). L'écart sur `total_depense` (montant_total vs paiements)
> sera corrigé dans la migration 010 pour aligner sur le spec.

### 2.5.2 — Fonction `calculer_statut_paiement_commande(commande_id uuid)` + trigger paiements

| Élément spec | État |
|---|---|
| Fonction `calculer_statut_paiement_commande(commande_id uuid)` retournant 'non_paye'/'partiel'/'paye' | ❌ **MANQUANT** (existe seulement sous forme de TRIGGER `trigger_recalculer_paiement_commande()` sans paramètre, qui muterait `commandes.statut_paiement`) |
| Trigger AFTER INSERT/UPDATE/DELETE sur `paiements` | ✅ (3 triggers dans 005 section 7.5) |

> La fonction scalaire demandée par le spec (callable depuis le frontend pour
> prédire le statut sans modifier la DB) n'existe pas. Le trigger fait le
> travail en arrière-plan mais n'est pas callable directement.

### 2.5.3 — Fonction `calculer_statut_commande(commande_id uuid)` + trigger articles_vetements

| Élément spec | État |
|---|---|
| Fonction `calculer_statut_commande(commande_id uuid)` retournant le statut dérivé | 🔄 existe sous le nom `deriver_statut_commande(p_commande_id uuid)` (param préfixé `p_`) |
| Trigger AFTER INSERT/UPDATE sur `articles_vetements` | ✅ (3 triggers INSERT/UPDATE/DELETE dans 005 section 7.4) |

> La fonction existe mais sous un nom différent. Le spec demande
> `calculer_statut_commande(commande_id uuid)` — on créera un alias.

### 2.5.4 — Fonction `calculer_montant_remise(montant_avant, type, valeur)`

| Élément spec | État |
|---|---|
| Fonction retournant le montant de remise selon `remise_type` (pourcentage/montant_fixe/article_gratuit/fidelite) | ❌ **MANQUANT** (jamais créée) |

> Cette fonction est explicitement demandée "appelée depuis le frontend au
> moment de la création de la commande" — elle est critique pour le wizard de
> commande (Lot P0 commande wizard étape 3 "remise et acompte").

### 2.5.5 — Fonction `is_super_admin()`

| Élément spec | État |
|---|---|
| Fonction retournant booléen (utilisateur courant dans `super_admins`) | ✅ (dans `006_rls_policies.sql` section 0, SECURITY DEFINER) |

Testée via PostgREST : `rpc/is_super_admin` → `false` (HTTP 200) avec
service_role. ✅

### 2.5.6 — Fonction `get_pressing_id_utilisateur()`

| Élément spec | État |
|---|---|
| Fonction retournant le `pressing_id` de l'utilisateur courant (cherche dans `pressing.admin_user_id` puis `personnel.auth_user_id`) | ✅ (dans `006_rls_policies.sql` section 0, SECURITY DEFINER) — adapté à l'impl (cherche dans `personnel.user_id`) |

Testée via PostgREST : `rpc/get_pressing_id_utilisateur` → `null` (HTTP 200)
avec service_role. ✅

### Conclusion 2.5

- ✅ 2 fonctions helpers RLS conformes (`is_super_admin`, `get_pressing_id_utilisateur`)
- ✅ Vue `vue_clients_enrichis` présente (mais `total_depense` à corriger)
- ✅ 25 triggers présents et fonctionnels (testés end-to-end Task 10)
- ❌ **3 fonctions MANQUANTES** :
  - `calculer_montant_remise(montant_avant, type, valeur)` — totalement absente
  - `calculer_statut_commande(commande_id uuid)` — alias de `deriver_statut_commande`
  - `calculer_statut_paiement_commande(commande_id uuid)` — version scalaire callable
- 🔄 `vue_clients_enrichis.total_depense` : utiliser SUM(paiements) au lieu de SUM(montant_total)

---

## Génération des types TypeScript

| Élément spec | État |
|---|---|
| `npx supabase gen types typescript > lib/types/database.types.ts` | 🔄 créé manuellement (Task 18) car PAT placeholder. Contenu : 17 tables + 1 vue + 22 enums. |
| Emplacement spec : `lib/types/database.types.ts` | 🔄 impl : `src/lib/types/database.types.ts` (convention Next.js avec `src/`) |

> ⚠️ Le fichier `database.types.ts` ne reflète pas les colonnes ajoutées par
> la migration 010 — il devra être mis à jour après application de 010.

---

## Synthèse globale LOT 2

| Catégorie | Compte |
|---|---|
| ✅ CONFORME | 21 enums + 17 tables (structure de base) + 25 triggers + 2 fonctions RLS + 1 vue + 34 contraintes + ~45 index |
| 🔄 ÉQUIVALENT (renommage/fusion) | ~25 colonnes (nom_complet vs nom+prenom, code_qr vs barcode, etc.) — non corrigé pour ne pas casser l'app |
| ⚠️ DIVERGENCE STRUCTURELLE ASSUMÉE | 3 (pressing.admin_user_id couvert par personnel ; articles_vetements repensé ; paiements.created_by cible personnel) |
| ❌ MANQUANT CRITIQUE (à ajouter) | **17 colonnes** + **1 CHECK** + **1 index** + **3 fonctions** + **1 correction de vue** |

### Liste détaillée des manquants critiques (à combler via `010_lot2_gap_fill.sql`)

**Colonnes (17)** :
1. `demandes_inscription.nombre_machines` (integer)
2. `demandes_inscription.nombre_employes` (integer)
3. `codes_activation.demande_id` (UUID FK demandes_inscription)
4. `pressing.horaires` (jsonb)
5. `abonnements.reference_paiement` (text)
6. `abonnements.justificatif_url` (text)
7. `abonnements.enregistre_par` (UUID FK super_admins)
8. `clients.preferences_lavage` (jsonb with default)
9. `commandes.montant_remise` (integer default 0)
10. `commandes.montant_total_avant_remise` (integer default 0)
11. `articles_vetements.assigne_a` (UUID FK personnel)
12. `paiements.abonnement_id` (UUID FK abonnements, nullable)
13. `paiements.est_acompte` (boolean default false)
14. `paiements.justificatif_url` (text)
15. `produits_stock.fds_url` (text)
16. `produits_stock.date_expiration` (date)
17. `mouvements_stock.commande_id` (UUID FK commandes, nullable)

**Contraintes (1)** :
- `paiements` CHECK XOR (commande_id, abonnement_id) — exactement un des deux renseigné

**Index (1)** :
- `produits_stock(pressing_id, quantite_actuelle, seuil_alerte)` pour alertes stock bas

**Fonctions (3)** :
- `calculer_montant_remise(montant_avant integer, type remise_type, valeur integer)` → integer
- `calculer_statut_commande(commande_id uuid)` → statut_commande (alias de `deriver_statut_commande`)
- `calculer_statut_paiement_commande(commande_id uuid)` → statut_paiement_commande (version scalaire)

**Vue (1 correction)** :
- `vue_clients_enrichis.total_depense` → utiliser `SUM(paiements.montant)` au lieu de `SUM(commandes.montant_total)`

---

## Plan de résolution

### Migration `010_lot2_gap_fill.sql`

Toutes les ajouts sont **non-bloquants** :

- `ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...` (idempotent PostgreSQL 9.6+)
- `CREATE INDEX IF NOT EXISTS ...`
- `CREATE OR REPLACE FUNCTION ...` (idempotent)
- `DROP VIEW IF EXISTS ... ; CREATE VIEW ...` (recréation vue)
- `DO $$ BEGIN ... ADD CONSTRAINT ... EXCEPTION WHEN duplicate_object THEN NULL; END $$;`

Aucune colonne existante n'est supprimée ou renommée → l'app existante
(clients, personnel, commandes wizard) continue de fonctionner sans
modification.

### Mise à jour `database.types.ts`

Après application de 010 par l'utilisateur dans le SQL Editor Supabase, on
régénère manuellement le typage TypeScript pour inclure les nouvelles colonnes.

---

## Vérification post-application

Après application de 010, les tests comportementaux à réaliser :

1. `rpc/calculer_montant_remise` → `{"montant_avant": 10000, "type": "pourcentage", "valeur": 10}` doit retourner `1000`
2. `rpc/calculer_statut_commande` → callable avec un `commande_id` valide
3. `rpc/calculer_statut_paiement_commande` → callable avec un `commande_id` valide
4. `SELECT preferences_lavage FROM clients LIMIT 1` → retourne le JSON par défaut
5. `SELECT horaires FROM pressing LIMIT 1` → retourne NULL (pas de default, sera setté par l'app)
6. `SELECT nombre_machines FROM demandes_inscription LIMIT 1` → retourne NULL ou un entier
7. INSERT `paiements` avec `abonnement_id` seul (sans `commande_id`) → doit réussir
8. INSERT `paiements` avec ni `commande_id` ni `abonnement_id` → doit échouer (CHECK XOR)
9. `SELECT total_depense FROM vue_clients_enrichis WHERE id = ...` → reflète les paiements encaissés
