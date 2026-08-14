#!/usr/bin/env python3
"""
Redaction script for developer log files (worklog.md and similar).

Redacts ALL common secret patterns with placeholder tokens. Does NOT contain
any hardcoded secret values — only generic regex patterns that match secret
shapes (PAT prefixes, JWT headers, UUIDs, email domains, etc.).

Re-runnable: idempotent. Already-redacted placeholders are left untouched.

Usage:
    python3 scripts/redact-worklog.py [path/to/file.md]

If no path is given, defaults to ./worklog.md
"""
import re
import sys
from pathlib import Path

DEFAULT_TARGET = Path(__file__).resolve().parent.parent / "worklog.md"

# Generic secret patterns (NO hardcoded secret values — only shape matchers).
# Order matters: longer/more-specific patterns first.
PATTERNS = [
    # --- Tokens with known prefixes ---
    # Supabase personal access tokens
    (re.compile(r'sbp_[a-f0-9]{30,}'), '[REDACTED:SUPABASE_PAT]'),
    # GitHub classic tokens (ghp_/gho_/ghs_/ghu_)
    (re.compile(r'gh[pous]_[A-Za-z0-9]{36,}'), '[REDACTED:GITHUB_PAT]'),
    # GitHub fine-grained tokens
    (re.compile(r'github_pat_[A-Za-z0-9_]{40,}'), '[REDACTED:GITHUB_PAT]'),
    # Slack tokens
    (re.compile(r'xox[baprs]-[A-Za-z0-9-]{10,}'), '[REDACTED:SLACK_TOKEN]'),
    # Stripe keys
    (re.compile(r'(sk|pk)_(live|test)_[A-Za-z0-9]{20,}'), '[REDACTED:STRIPE_KEY]'),
    # AWS access keys
    (re.compile(r'AKIA[0-9A-Z]{16}'), '[REDACTED:AWS_KEY]'),
    # Generic API keys (long base64-ish after "key"/"token"/"secret" label)
    # --- JWTs ---
    # Full Supabase/Auth JWTs: header.payload.signature
    (re.compile(r'eyJhbGciOi[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}'),
     '[REDACTED:JWT]'),
    # Partial JWTs logged as "eyJ...<tail>"
    (re.compile(r'eyJ\.\.\.[A-Za-z0-9_-]{20,}'), '[REDACTED:JWT]'),
    # Bare long eyJ... tokens (40+ chars after eyJ)
    (re.compile(r'\beyJ[A-Za-z0-9_-]{40,}'), '[REDACTED:JWT]'),
    # Long base64 fragments that look like key tails (40+ chars, no spaces)
    # Only match when clearly a key fragment (preceded by known context)
    (re.compile(r'(service_role.*?=.*?)([A-Za-z0-9_-]{40,})', re.IGNORECASE),
     r'\1[REDACTED:SERVICE_ROLE_KEY]'),
    (re.compile(r'(anon_key.*?=.*?)([A-Za-z0-9_-]{40,})', re.IGNORECASE),
     r'\1[REDACTED:ANON_KEY]'),
    # --- Passwords ---
    # Only redact when clearly labeled as a password (not arbitrary text)
    (re.compile(r'(password\s+")([^"]{4,200})(")'), r'\1[REDACTED:PWD]\3'),
    (re.compile(r'(mot de passe\s*[:=]\s*)([^\s,;)\]"]{4,200})', re.IGNORECASE),
     r'\1[REDACTED:PWD]'),
    (re.compile(r'(pwd\s*[:=]\s*)([^\s,;)\]"]{4,200})', re.IGNORECASE),
     r'\1[REDACTED:PWD]'),
    # --- Vercel / cloud console URLs (contain team slugs) ---
    (re.compile(r'https://vercel\.com/[A-Za-z0-9._-]+/[A-Za-z0-9._/-]+'),
     '[REDACTED:VERCEL_URL]'),
    # --- Supabase dashboard URLs (contain project ref + team) ---
    (re.compile(r'https://supabase\.com/dashboard/project/[A-Za-z0-9._/-]+'),
     '[REDACTED:SUPABASE_DASHBOARD_URL]'),
    # --- Private keys ---
    (re.compile(r'-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----'),
     '[REDACTED:PRIVATE_KEY_BLOCK]'),
]

# Post-check patterns (to report remaining secrets — should all be 0 after run)
CHECKS = {
    'Supabase PAT (sbp_)': r'sbp_[a-f0-9]{30,}',
    'GitHub PAT (ghp_/gho_/ghs_/ghu_)': r'gh[pous]_[A-Za-z0-9]{36,}',
    'GitHub fine-grained (github_pat_)': r'github_pat_[A-Za-z0-9_]{40,}',
    'Full JWT': r'eyJhbGciOi[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}',
    'Partial JWT tail': r'eyJ\.\.\.[A-Za-z0-9_-]{20,}',
    'Long bare JWT': r'\beyJ[A-Za-z0-9_-]{40,}',
    'Private key block': r'-----BEGIN [A-Z ]*PRIVATE KEY-----',
    'Slack token': r'xox[baprs]-[A-Za-z0-9-]{10,}',
    'Stripe key': r'(sk|pk)_(live|test)_[A-Za-z0-9]{20,}',
    'AWS key': r'AKIA[0-9A-Z]{16}',
}


def redact(text: str) -> str:
    """Apply all redaction patterns. Runs twice for overlap safety."""
    for pattern, repl in PATTERNS:
        text = pattern.sub(repl, text)
    # Second pass to catch overlaps
    for pattern, repl in PATTERNS:
        text = pattern.sub(repl, text)
    return text


def main():
    target = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_TARGET
    if not target.exists():
        print(f"ERROR: {target} not found", file=sys.stderr)
        sys.exit(1)

    original = target.read_text(encoding='utf-8')
    cleaned = redact(original)
    target.write_text(cleaned, encoding='utf-8')

    print(f"File:    {target}")
    print(f"Before:  {len(original)} bytes")
    print(f"After:   {len(cleaned)} bytes")
    print(f"Redactions applied: {cleaned.count('[REDACTED:')}")

    print("\n=== Post-redaction verification (should all be 0) ===")
    all_clean = True
    for name, pat in CHECKS.items():
        count = len(re.findall(pat, cleaned))
        status = 'OK' if count == 0 else 'STILL_PRESENT'
        if count:
            all_clean = False
        print(f"  {name}: {count}  [{status}]")

    sys.exit(0 if all_clean else 2)


if __name__ == '__main__':
    main()
