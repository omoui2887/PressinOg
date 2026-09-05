/**
 * predev script — recrée .env.local s'il est manquant.
 *
 * Lit les valeurs par défaut depuis .env.defaults (gitignored) si présent,
 * sinon depuis .env.local.example (template sans secrets réels).
 *
 * Usage : appelé automatiquement par `bun run dev` via le hook predev.
 */
const fs = require("fs");
const path = require("path");

const envLocalPath = path.join(process.cwd(), ".env.local");
const envDefaultsPath = path.join(process.cwd(), ".env.defaults");
const envExamplePath = path.join(process.cwd(), ".env.local.example");

if (fs.existsSync(envLocalPath)) {
  console.log("[predev] .env.local déjà présent — rien à faire.");
  process.exit(0);
}

// Priorité 1 : .env.defaults (valeurs réelles, gitignored)
if (fs.existsSync(envDefaultsPath)) {
  fs.copyFileSync(envDefaultsPath, envLocalPath);
  console.log("[predev] .env.local recréé depuis .env.defaults ✓");
  process.exit(0);
}

// Priorité 2 : .env.local.example (template sans secrets)
if (fs.existsSync(envExamplePath)) {
  console.warn(
    "[predev] ⚠️  .env.local manquant ET .env.defaults manquant."
  );
  console.warn(
    "[predev] ⚠️  Copie de .env.local.example — vous devez remplir les valeurs réelles."
  );
  fs.copyFileSync(envExamplePath, envLocalPath);
  console.log("[predev] .env.local créé depuis .env.local.example (À REMPLIR)");
  process.exit(0);
}

// Aucun template trouvé — on ne peut rien faire
console.error(
  "[predev] ❌ .env.local manquant et aucun template trouvé (.env.defaults ni .env.local.example)."
);
console.error("[predev] ❌ Créez .env.local manuellement avec les variables Supabase.");
process.exit(0); // non bloquant pour ne pas empêcher le dev
