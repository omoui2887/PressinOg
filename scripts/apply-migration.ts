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
// Strategy 2: Postgres direct via pg (if available)
// ------------------------------------------------------------
async function applyViaPg(): Promise<boolean> {
  // Construit la connection string Supabase
  const connStr = `postgresql://postgres:${serviceKey}@db.${projectRef}.supabase.co:5432/postgres`;
  console.log(`→ Trying direct Postgres connection to db.${projectRef}.supabase.co...`);
  try {
    // Import dynamique de pg (peut ne pas être installé)
    const { Client } = await import("pg");
    const client = new Client({ connectionString: connStr, ssl: { rejectUnauthorized: false } });
    await client.connect();
    await client.query(sql);
    await client.end();
    console.log("✓ Migration applied via direct Postgres connection");
    return true;
  } catch (e: any) {
    console.error(`✗ Direct Postgres failed: ${e.message?.slice(0, 200)}`);
    return false;
  }
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
  console.error("  Manual options:");
  console.error("  1. Open Supabase Dashboard → SQL Editor → paste the SQL → Run");
  console.error(`  2. Set SUPABASE_PAT in .env.local and re-run`);
  console.error("  3. Install pg: bun add pg && re-run");
  process.exit(1);
}
