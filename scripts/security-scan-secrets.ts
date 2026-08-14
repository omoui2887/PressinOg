#!/usr/bin/env bun
/**
 * security-scan-secrets.ts
 * ============================================================================
 * e-pressing / OgPressing — Pre-commit secret scanner
 * ============================================================================
 *
 * Scans the working tree (or staged files) for common secret patterns and
 * reports findings WITHOUT revealing secret values.
 *
 * Usage:
 *   bun run scripts/security-scan-secrets.ts            # scan working tree
 *   bun run scripts/security-scan-secrets.ts --staged    # scan staged files only
 *   bun run scripts/security-scan-secrets.ts --history   # scan all git history (blobs)
 *
 * Exit codes:
 *   0 = no secrets found
 *   1 = secrets found (blocks commit in pre-commit hook)
 *   2 = scanner error
 *
 * Integration as a pre-commit hook:
 *   # .husky/pre-commit  OR  .git/hooks/pre-commit
 *   bun run scripts/security-scan-secrets.ts --staged
 *
 * Output format (never reveals secret values):
 *   SECRET_TYPE | FILE:LINE | STATUS
 *
 * ============================================================================
 */

import { execSync } from "node:child_process";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

// ---------------------------------------------------------------------------
// Secret patterns (shape matchers only — NO hardcoded secret values)
// Each pattern: [name, regex, severity]
// ---------------------------------------------------------------------------
type Pattern = {
  name: string;
  regex: RegExp;
  severity: "critical" | "high" | "medium";
};

const PATTERNS: Pattern[] = [
  // --- Critical: service-side keys that bypass RLS ---
  {
    name: "Supabase service_role JWT",
    regex: /eyJhbGciOi[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g,
    severity: "critical",
  },
  {
    name: "Supabase PAT (sbp_)",
    regex: /sbp_[a-f0-9]{30,}/g,
    severity: "critical",
  },
  // --- Critical: cloud provider tokens ---
  {
    name: "GitHub PAT (ghp_/gho_/ghs_/ghu_)",
    regex: /gh[pous]_[A-Za-z0-9]{36,}/g,
    severity: "critical",
  },
  {
    name: "GitHub fine-grained PAT",
    regex: /github_pat_[A-Za-z0-9_]{40,}/g,
    severity: "critical",
  },
  {
    name: "AWS access key",
    regex: /AKIA[0-9A-Z]{16}/g,
    severity: "critical",
  },
  {
    name: "AWS secret key (40-char base64 after label)",
    regex: /(?:aws_secret|secret_access_key)\s*[:=]\s*["']?[A-Za-z0-9/+=]{40}["']?/gi,
    severity: "critical",
  },
  // --- High: API tokens ---
  {
    name: "Slack token",
    regex: /xox[baprs]-[A-Za-z0-9-]{10,}/g,
    severity: "high",
  },
  {
    name: "Stripe secret key",
    regex: /sk_(live|test)_[A-Za-z0-9]{20,}/g,
    severity: "high",
  },
  {
    name: "Stripe restricted key",
    regex: /rk_(live|test)_[A-Za-z0-9]{20,}/g,
    severity: "high",
  },
  {
    name: "OpenAI API key",
    regex: /sk-[A-Za-z0-9]{40,}/g,
    severity: "high",
  },
  {
    name: "Google API key",
    regex: /AIza[0-9A-Za-z_-]{35}/g,
    severity: "high",
  },
  // --- High: private keys ---
  {
    name: "Private key block",
    regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY-----/g,
    severity: "high",
  },
  // --- Medium: bare JWTs (could be anon keys — public but flagged) ---
  {
    name: "Long bare JWT (eyJ... 40+ chars)",
    regex: /\beyJ[A-Za-z0-9_-]{40,}/g,
    severity: "medium",
  },
  // --- Medium: password assignments in code/config ---
  {
    name: "Password assignment in code",
    regex: /(?:password|passwd|pwd)\s*[:=]\s*["']([^"'\s]{4,200})["']/gi,
    severity: "medium",
  },
];

// ---------------------------------------------------------------------------
// Files & paths to SKIP (false-positive reduction)
// ---------------------------------------------------------------------------
const SKIP_DIRS = [
  "node_modules",
  ".next",
  ".git",
  "skills", // third-party tooling
  "tool-results",
  "agent-ctx",
  "upload",
  "download",
  ".git-backup-pre-purge",
];

const SKIP_FILES = [
  "package-lock.json",
  "bun.lock",
  "yarn.lock",
];

// Template files that contain PLACEHOLDER secrets (safe)
const TEMPLATE_FILES = [
  ".env.example",
  ".env.local.example",
  ".env.production.example",
];

// Allowlist of placeholder values that are NOT real secrets
const PLACEHOLDER_VALUES = [
  "YOUR_ANON_KEY",
  "YOUR_SERVICE_ROLE_KEY",
  "YOUR-PROJECT",
  "YOUR_PROJECT",
  "your-project",
  "your-supabase-url",
  "REPLACE_WITH",
  "YOUR_",
  "<your",
  "example",
  "placeholder",
  "changeme",
  "xxx",
  "test",
  "demo",
];

// ---------------------------------------------------------------------------
// Scanner
// ---------------------------------------------------------------------------
type Finding = {
  secretType: string;
  file: string;
  line: number;
  severity: string;
  status: string;
};

function isPlaceholder(value: string): boolean {
  const lower = value.toLowerCase();
  return PLACEHOLDER_VALUES.some((p) => lower.includes(p.toLowerCase()));
}

function isTemplateFile(filePath: string): boolean {
  return TEMPLATE_FILES.some((t) => filePath.endsWith(t));
}

function shouldSkip(filePath: string): boolean {
  const parts = filePath.split(sep);
  if (parts.some((p) => SKIP_DIRS.includes(p))) return true;
  if (SKIP_FILES.includes(parts[parts.length - 1])) return true;
  return false;
}

function scanContent(
  content: string,
  filePath: string,
  isTemplate: boolean
): Finding[] {
  const findings: Finding[] = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const { name, regex, severity } of PATTERNS) {
      // Reset regex lastIndex (global flag)
      regex.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = regex.exec(line)) !== null) {
        const matchedValue = match[0];
        // Skip placeholders
        if (isPlaceholder(matchedValue)) continue;
        // In template files, skip JWT-shaped placeholders (YOUR_...)
        if (isTemplate && matchedValue.includes("YOUR")) continue;

        findings.push({
          secretType: name,
          file: filePath,
          line: i + 1,
          severity,
          status: "FOUND",
        });
      }
    }
  }
  return findings;
}

function scanFile(filePath: string): Finding[] {
  if (!existsSync(filePath)) return [];
  if (shouldSkip(filePath)) return [];
  const stat = statSync(filePath);
  if (!stat.isFile()) return [];
  // Skip large files (> 1MB) — likely binaries
  if (stat.size > 1_000_000) return [];

  const isTemplate = isTemplateFile(filePath);
  let content: string;
  try {
    content = readFileSync(filePath, "utf-8");
  } catch {
    return [];
  }
  return scanContent(content, filePath, isTemplate);
}

function getWorkingTreeFiles(): string[] {
  try {
    const tracked = execSync("git ls-files", { encoding: "utf-8" })
      .trim()
      .split("\n")
      .filter(Boolean);
    return tracked;
  } catch {
    return [];
  }
}

function getStagedFiles(): string[] {
  try {
    const staged = execSync("git diff --cached --name-only --diff-filter=ACM", {
      encoding: "utf-8",
    })
      .trim()
      .split("\n")
      .filter(Boolean);
    return staged;
  } catch {
    return [];
  }
}

function getAllBlobs(): { sha: string; path: string }[] {
  try {
    const output = execSync("git rev-list --all --objects", {
      encoding: "utf-8",
    });
    const blobs: { sha: string; path: string }[] = [];
    for (const line of output.trim().split("\n")) {
      const [sha, path] = [line.slice(0, 40), line.slice(41)];
      if (sha && path) blobs.push({ sha, path });
    }
    return blobs;
  } catch {
    return [];
  }
}

function scanBlob(sha: string, path: string): Finding[] {
  if (shouldSkip(path)) return [];
  let content: string;
  try {
    content = execSync(`git cat-file -p ${sha}`, { encoding: "utf-8" });
  } catch {
    return [];
  }
  if (content.length > 1_000_000) return [];
  const isTemplate = isTemplateFile(path);
  return scanContent(content, `${path} (blob ${sha.slice(0, 8)})`, isTemplate);
}

// ---------------------------------------------------------------------------
// Client-side import safety check (SUPABASE_SERVICE_ROLE_KEY exposure)
// ---------------------------------------------------------------------------
function checkClientSideServiceRoleImport(): Finding[] {
  const findings: Finding[] = [];
  try {
    // Find all files importing the admin client
    const output = execSync(
      `git grep -l "from ['\\"]@/lib/supabase/admin" -- '*.ts' '*.tsx' || true`,
      { encoding: "utf-8" }
    );
    const files = output.trim().split("\n").filter(Boolean);
    for (const file of files) {
      if (!existsSync(file)) continue;
      const content = readFileSync(file, "utf-8");
      const firstLine = content.split("\n")[0] || "";
      if (firstLine.includes("use client")) {
        findings.push({
          secretType: "Client-side import of supabase/admin (SERVICE_ROLE exposure)",
          file,
          line: 1,
          severity: "critical",
          status: "FOUND",
        });
      }
    }
  } catch {
    // git grep returns non-zero when no matches — ignore
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main(): number {
  const args = process.argv.slice(2);
  const mode = args[0] || "--working-tree";

  console.log("=".repeat(72));
  console.log("e-pressing / OgPressing — Secret Scanner");
  console.log("=".repeat(72));
  console.log(`Mode: ${mode}`);
  console.log("");

  let findings: Finding[] = [];
  let filesScanned = 0;

  if (mode === "--staged") {
    const files = getStagedFiles();
    console.log(`Scanning ${files.length} staged file(s)...\n`);
    for (const f of files) {
      findings.push(...scanFile(f));
      filesScanned++;
    }
  } else if (mode === "--history") {
    const blobs = getAllBlobs();
    console.log(`Scanning ${blobs.length} git blob(s) across all history...\n`);
    for (const { sha, path } of blobs) {
      findings.push(...scanBlob(sha, path));
      filesScanned++;
    }
  } else {
    // --working-tree (default)
    const files = getWorkingTreeFiles();
    console.log(`Scanning ${files.length} tracked file(s) in working tree...\n`);
    for (const f of files) {
      findings.push(...scanFile(f));
      filesScanned++;
    }
  }

  // Always check client-side import safety
  findings.push(...checkClientSideServiceRoleImport());

  // Deduplicate findings
  const seen = new Set<string>();
  findings = findings.filter((f) => {
    const key = `${f.secretType}|${f.file}|${f.line}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Report
  if (findings.length === 0) {
    console.log(`\nNo secrets found across ${filesScanned} file(s) scanned.`);
    console.log("Status: CLEAN");
    return 0;
  }

  console.log(`\nFound ${findings.length} potential secret(s):\n`);
  console.log(
    "SECRET_TYPE".padEnd(45) +
      " | " +
      "FILE:LINE".padEnd(60) +
      " | SEVERITY | STATUS"
  );
  console.log("-".repeat(120));
  for (const f of findings) {
    const fileLine = `${f.file}:${f.line}`;
    console.log(
      f.secretType.padEnd(45) +
        " | " +
        fileLine.padEnd(60) +
        " | " +
        f.severity.padEnd(8) +
        " | " +
        f.status
    );
  }
  console.log("-".repeat(120));
  console.log(`\nTotal: ${findings.length} finding(s)`);
  console.log(
    `Critical: ${findings.filter((f) => f.severity === "critical").length} | ` +
      `High: ${findings.filter((f) => f.severity === "high").length} | ` +
      `Medium: ${findings.filter((f) => f.severity === "medium").length}`
  );

  const hasCritical = findings.some((f) => f.severity === "critical");
  const hasHigh = findings.some((f) => f.severity === "high");
  if (hasCritical || hasHigh) {
    console.log("\nBLOCKING COMMIT — critical/high severity secrets detected.");
    console.log("Rotate exposed secrets immediately, then remove from code.");
    return 1;
  }
  console.log("\nWARNING — medium severity findings (review recommended).");
  return 0;
}

const exitCode = main();
process.exit(exitCode);
