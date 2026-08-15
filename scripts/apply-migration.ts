#!/usr/bin/env bun
/**
 * OgPressing — Applique une migration SQL au projet Supabase live
 * ----------------------------------------------------------------------------
 * Utilise la clé service_role (bypass RLS) pour exécuter le SQL brut via
 * l'endpoint REST /rest/v1/rpc ou directement via le endpoint SQL.
 *
 * Puisque Supabase REST n'expose pas d'endpoint SQL brut, on utilise
 * le client supabase-js avec la méthode `rpc()` pour appeler une fonction
 * qui exécute le SQL — MAIS cela nécessiterait une fonction existante.
 *
 * Alternative : on découpe la migration en étapes et on utilise les
 * appels REST/PostgREST disponibles (create table, alter, etc. ne sont
 * PAS exposés via REST).
 *
 * → Solution retenue : utiliser l'endpoint Management API de Supabase
 *   (POST /v1/projects/{ref}/database/query) qui accepte du SQL brut,
 *   authentifié via le Personal Access Token (SUPABASE_PAT).
 *
 *   Si SUPABASE_PAT n'est pas configuré (cas ici), on bascule sur
 *   l'exécution via psql direct en construisant la connection string.
 *
 * Usage : bun run scripts/apply-migration.ts <migration-file.sql>
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// Charger .env.local manuellement (Bun ne le fait pas automatiquement pour les scripts)
const envLocalPath = resolve(".env.local");
if (existsSync(envLocalPath)) {
  const envContent = readFileSync(envLocalPath, "utf8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

const file = process.argv[2];
if (!file) {
  console.error("Usage: bun run scripts/apply-migration.ts <migration-file.sql>");
  process.exit(1);
}

const sqlPath = resolve(file);
const sql = readFileSync(sqlPath, "utf8");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const pat = process.env.SUPABASE_PAT;
// Mot de passe base de données (Dashboard → Project Settings → Database → Database password)
// Permet la connexion au pooler si la clé service_role JWT n'est pas acceptée.
const dbPassword = process.env.SUPABASE_DB_PASSWORD;

if (!supabaseUrl) {
  console.error("✗ NEXT_PUBLIC_SUPABASE_URL manquant dans .env.local");
  process.exit(1);
}

const projectRef = supabaseUrl.replace("https://", "").split(".")[0];

// ------------------------------------------------------------
// Strategy 1: Management API (requires SUPABASE_PAT)
// ------------------------------------------------------------
async function applyViaManagementApi(): Promise<boolean> {
  if (!pat) return false;
  console.log(`→ Trying Supabase Management API (project: ${projectRef})...`);
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${pat}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    }
  );
  if (!res.ok) {
    const text = await res.text();
    console.error(`✗ Management API failed (${res.status}): ${text.slice(0, 200)}`);
    return false;
  }
  console.log("✓ Migration applied via Management API");
  return true;
}

// ------------------------------------------------------------
// Strategy 2: Postgres via Supabase pooler (session mode, port 5432)
// ------------------------------------------------------------
// Le host direct db.{ref}.supabase.co:5432 est REFUSÉ par défaut sur
// Supabase (IPv6 + port fermé). Le POOLER (aws-0-{region}.pooler.supabase.com)
// est accessible en IPv4 et accepte la clé service_role JWT comme mot de
// passe pour l'utilisateur `postgres.{ref}`.
//
// Comme on ne connaît pas la région a priori (il faudrait un PAT pour
// interroger la Management API), on essaie les régions les plus communes
// jusqu'à trouver celle qui héberge le projet.
//
// Pooler session mode = port 5432 (requis pour DDL comme CREATE FUNCTION).
// Pooler transaction mode = port 6543 (ne supporte pas les requêtes
// multi-statements préparées).
const POOLER_PREFIXES = ["aws-0", "aws-1"];
const POOLER_REGIONS = [
  // Europe
  "eu-west-1",
  "eu-west-2",
  "eu-central-1",
  "eu-north-1",
  // North America
  "us-east-1",
  "us-east-2",
  "us-west-1",
  "us-west-2",
  "ca-central-1",
  // Asia Pacific
  "ap-east-1",
  "ap-northeast-1",
  "ap-northeast-2",
  "ap-southeast-1",
  "ap-southeast-2",
  "ap-south-1",
  // South America
  "sa-east-1",
];

async function applyViaPg(): Promise<boolean> {
  const candidates: string[] = [];
  for (const prefix of POOLER_PREFIXES) {
    for (const region of POOLER_REGIONS) {
      candidates.push(`${prefix}-${region}.pooler.supabase.com`);
    }
  }
  // Liste des mots de passe à essayer : DB password d'abord (si présent),
  // puis service_role JWT (accepté par Supavisor sur certains projets).
  const passwords: { label: string; value: string }[] = [];
  if (dbPassword) passwords.push({ label: "DB_PASSWORD", value: dbPassword });
  if (serviceKey) passwords.push({ label: "service_role JWT", value: serviceKey });
  if (passwords.length === 0) {
    console.error("✗ No password available (set SUPABASE_DB_PASSWORD or SUPABASE_SERVICE_ROLE_KEY).");
    return false;
  }
  console.log(`→ Trying Supabase pooler (project: ${projectRef}, ${candidates.length} hosts × ${passwords.length} creds)...`);
  const { Client } = await import("pg");
  const user = `postgres.${projectRef}`;

  for (const cred of passwords) {
    for (const host of candidates) {
      const connStr = `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(cred.value)}@${host}:5432/postgres`;
      const client = new Client({
        connectionString: connStr,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 8000,
      });
      try {
        process.stdout.write(`  · ${host}:5432 [${cred.label}] ... `);
        await client.connect();
        console.log("CONNECTED");
        // Exécute la migration entière en une seule transaction
        await client.query("BEGIN");
        try {
          await client.query(sql);
          await client.query("COMMIT");
          console.log("✓ Migration applied via Supabase pooler (" + host + ", " + cred.label + ")");
          await client.end();
          return true;
        } catch (e: any) {
          await client.query("ROLLBACK");
          throw e;
        }
      } catch (e: any) {
        const msg = e.message?.slice(0, 150) || String(e);
        console.log(`FAIL (${e.code || "ERR"}: ${msg})`);
        try { await client.end(); } catch {}
        // Si l'erreur est d'authentification, on continue avec un autre host/cred.
        // Si l'erreur est de syntaxe SQL, on s'arrête (la migration est fautive).
        if (/syntax error|duplicate|already exists|does not exist/i.test(msg) && !/Tenant|project not found|password|authentication/i.test(msg)) {
          console.error(`\n✗ SQL error (not a region/auth issue): ${msg}`);
          return false;
        }
        // Sinon on continue avec le host suivant
      }
    }
  }
  console.error("✗ All pooler hosts/creds failed.");
  return false;
}

// ------------------------------------------------------------
// Strategy 3: Execute via supabase-js rpc (service_role can call functions)
// We split the migration into individual statements and execute them.
// But DDL (CREATE FUNCTION) can't run via RPC. So this only works for
// the function CALL, not creation.
// ------------------------------------------------------------

// ------------------------------------------------------------
// Main
// ------------------------------------------------------------
console.log(`\n=== Applying migration: ${file} ===\n`);

const applied =
  (await applyViaManagementApi()) || (await applyViaPg());

if (!applied) {
  console.error("\n✗ Could not apply migration automatically.");
  console.error("");
  console.error("  ⚠️  Le sandbox ne peut pas atteindre la base Supabase :");
  console.error("     - host direct db.{ref}.supabase.co → IPv6 only (sandbox = IPv4)");
  console.error("     - pooler aws-0/aws-1.*.pooler.supabase.com → 'tenant not found' sur toutes les régions");
  console.error("     - Management API → nécessite un PAT (SUPABASE_PAT vide)");
  console.error("");
  console.error("  ▶ Pour appliquer la migration, choisissez UNE de ces 3 options :");
  console.error("");
  console.error("  [Option A — recommandée] Générer un PAT et le mettre dans .env.local :");
  console.error("    1. https://supabase.com/dashboard/account/tokens");
  console.error("    2. Generate new token → copier la valeur (sbp_...)");
  console.error("    3. Ajouter dans .env.local : SUPABASE_PAT=sbp_...");
  console.error(`    4. Re-run: bun run scripts/apply-migration.ts ${file}`);
  console.error("");
  console.error("  [Option B] Utiliser le mot de passe DB :");
  console.error("    1. Dashboard → Project Settings → Database → Database password");
  console.error("    2. Ajouter dans .env.local : SUPABASE_DB_PASSWORD=...");
  console.error(`    3. Re-run: bun run scripts/apply-migration.ts ${file}`);
  console.error("");
  console.error("  [Option C — manuelle] Copier-coller dans le SQL Editor :");
  console.error("    1. https://supabase.com/dashboard/project/" + projectRef + "/sql/new");
  console.error(`    2. Copier le contenu de: ${file}`);
  console.error("    3. Cliquer Run");
  console.error("");
  console.error(`  📋 Le SQL corrigé (bug $$ corrigé) est dans: ${sqlPath}`);
  process.exit(1);
}
