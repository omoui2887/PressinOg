#!/usr/bin/env bun
/**
 * OgPressing — Bootstrap du tout premier Super Admin
 * ============================================================================
 * Crée (ou met à jour) un utilisateur Supabase Auth ET sa ligne dans la table
 * `public.super_admins`, en une seule opération atomique et idempotente.
 *
 * ⚠️  POURQUOI CE SCRIPT EXISTE
 * ----------------------------------------------------------------------------
 * La table `super_admins` est protégée par RLS via la policy
 * `super_admin_full_access` (USING is_super_admin()). is_super_admin() est
 * elle-même un SECURITY DEFINER qui vérifie `EXISTS (SELECT 1 FROM
 * super_admins WHERE user_id = auth.uid())`.
 *
 * → Problème "œuf et poule" : AUCUN client anon/authentifié ne peut insérer
 *   la toute première ligne super_admins, car is_super_admin() retournerait
 *   false pour tous. Il faut donc utiliser la clé `service_role` (bypass RLS)
 *   pour le seed initial. C'est documenté dans 006_rls_policies.sql.
 *
 * ✅ CE SCRIPT utilise `getSupabaseAdmin()` (src/lib/supabase/admin.ts) qui
 *    charge la clé service_role depuis .env.local. Aucune secret n'est codé
 *    en dur — l'email, le mot de passe et le nom sont passés en CLI args.
 *
 * 🔒 SÉCURITÉ
 *   - Ce script ne LOGUE JAMAIS le mot de passe (seulement l'email et l'UUID).
 *   - Le mot de passe est transmis à l'API Supabase Auth sur HTTPS puis oublié.
 *   - `.env.local` (qui contient la service_role) est gitignored.
 *   - Ne pas committer d'identifiants en dur dans ce script.
 *
 * 📋 USAGE
 *   bun run scripts/seed-super-admin.ts <email> <password> [nom_complet] [telephone]
 *
 *   Exemples :
 *     bun run scripts/seed-super-admin.ts admin@example.com "Str0ng!Pass" "Alice Admin"
 *     bun run scripts/seed-super-admin.ts admin@example.com "Str0ng!Pass" "Alice" "+2250701020304"
 *
 * IDEMPOTENCE
 *   - Si l'utilisateur Auth existe déjà (même email), son mot de passe est
 *     mis à jour et email_confirm forcé à true (pas de double compte).
 *   - Si la ligne super_admins existe déjà (même email), elle est upserted
 *     (onConflict: 'email') — nom_complet/telephone/actif mis à jour.
 *   → Le script peut être relancé sans risque.
 *
 * EXIT CODES
 *   0 = succès (utilisateur créé ou mis à jour)
 *   1 = erreur (arguments manquants, échec API Supabase, etc.)
 * ============================================================================
 */
import { getSupabaseAdmin } from "../src/lib/supabase/admin";

// ---------------------------------------------------------------------------
// 1. Parsing des arguments CLI
// ---------------------------------------------------------------------------
const [emailRaw, password, nomCompletRaw, telephoneRaw] = process.argv.slice(2);

if (!emailRaw || !password) {
  console.error(
    "Usage: bun run scripts/seed-super-admin.ts <email> <password> [nom_complet] [telephone]\n"
  );
  console.error(
    "Exemple: bun run scripts/seed-super-admin.ts admin@example.com \"Str0ng!Pass\" \"Alice Admin\""
  );
  process.exit(1);
}

const email = emailRaw.trim().toLowerCase();
const nomComplet = (nomCompletRaw || "Super Admin").trim();
const telephone = telephoneRaw?.trim() || null;

// Validation basique de l'email
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error(`✗ Email invalide : "${email}"`);
  process.exit(1);
}

// Validation basique du mot de passe (Supabase requiert ≥ 6 caractères)
if (password.length < 6) {
  console.error("✗ Le mot de passe doit faire au moins 6 caractères (minimum Supabase Auth).");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 2. Client admin (service_role — bypass RLS)
// ---------------------------------------------------------------------------
const admin = getSupabaseAdmin();

// ---------------------------------------------------------------------------
// 3. Étape 1 — Créer ou mettre à jour l'utilisateur Supabase Auth
// ---------------------------------------------------------------------------
console.log(`\n[1/2] Gestion de l'utilisateur Auth ${email}...`);

// 3a. Rechercher un utilisateur existant par email
const { data: listData, error: listErr } = await admin.auth.admin.listUsers();

if (listErr) {
  console.error("✗ Impossible de lister les utilisateurs Auth :", listErr.message);
  process.exit(1);
}

const existingUser = listData.users.find(
  (u) => u.email?.toLowerCase() === email
);

let userId: string;

if (existingUser) {
  // 3b. Utilisateur existant → mise à jour du mot de passe + email_confirm
  console.log(`  → Utilisateur existant trouvé (id: ${existingUser.id}). Mise à jour...`);
  const { data: updated, error: updateErr } = await admin.auth.admin.updateUserById(
    existingUser.id,
    {
      password,
      email_confirm: true,
      // Réactive le compte s'il avait été bloqué
      ban_duration: "none",
    }
  );
  if (updateErr) {
    console.error("✗ Échec de la mise à jour utilisateur :", updateErr.message);
    process.exit(1);
  }
  userId = updated.user.id;
  console.log("  ✓ Mot de passe mis à jour, email confirmé.");
} else {
  // 3c. Nouvel utilisateur → createUser
  console.log("  → Aucun utilisateur existant. Création...");
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // pas besoin de confirmation par email
  });
  if (createErr) {
    console.error("✗ Échec de la création utilisateur :", createErr.message);
    process.exit(1);
  }
  userId = created.user.id;
  console.log(`  ✓ Utilisateur créé (id: ${userId}).`);
}

// ---------------------------------------------------------------------------
// 4. Étape 2 — Upsert de la ligne super_admins (service_role bypass RLS)
// ---------------------------------------------------------------------------
console.log(`\n[2/2] Upsert de la ligne super_admins...`);

const { error: upsertErr } = await admin.from("super_admins").upsert(
  {
    user_id: userId,
    nom_complet: nomComplet,
    email,
    telephone,
    actif: true,
  },
  { onConflict: "email" }
);

if (upsertErr) {
  console.error("✗ Échec de l'upsert super_admins :", upsertErr.message);
  console.error(
    "  (Vérifiez que la table super_admins existe et que la migration 002_tables.sql a été appliquée.)"
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 5. Vérification — relire la ligne pour confirmer
// ---------------------------------------------------------------------------
const { data: verify, error: verifyErr } = await admin
  .from("super_admins")
  .select("id, user_id, nom_complet, email, telephone, actif, created_at")
  .eq("email", email)
  .maybeSingle();

if (verifyErr || !verify) {
  console.error("✗ Vérification échouée — la ligne super_admins n'a pas pu être relue.");
  if (verifyErr) console.error("  Erreur :", verifyErr.message);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 6. Résumé
// ---------------------------------------------------------------------------
console.log("\n" + "=".repeat(60));
console.log("✓ SUPER ADMIN CONFIGURÉ AVEC SUCCÈS");
console.log("=".repeat(60));
console.log(`  Auth user ID : ${verify.user_id}`);
console.log(`  Email        : ${verify.email}`);
console.log(`  Nom complet  : ${verify.nom_complet}`);
console.log(`  Téléphone    : ${verify.telephone ?? "(non renseigné)"}`);
console.log(`  Actif        : ${verify.actif ? "✓ oui" : "✗ NON"}`);
console.log(`  Créé le      : ${verify.created_at}`);
console.log("=".repeat(60));
console.log("\nVous pouvez maintenant vous connecter sur /login avec :");
console.log(`  Email     : ${verify.email}`);
console.log("  Mot de passe : (celui passé en argument)");
console.log("\nRedirection attendue après login : /super-admin/dashboard\n");
