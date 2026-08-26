// Secret scanner for the GPTBot repository (R0.3C prevention gate).
//
// Why this exists rather than only GitHub secret scanning: the R0.3 credential
// incident used generic, high-entropy values with no provider prefix. GitHub's
// scanner matches known provider patterns, so it produced zero alerts for five
// weeks while the material sat in a public repository. This scanner therefore
// checks two things:
//
//   1. provider-shaped credentials (fast, near-zero false positives);
//   2. generic high-entropy strings that appear on a line which also names a
//      credential (password / token / secret / key / pass), which is exactly
//      the shape the incident had.
//
// Findings are reported REDACTED: rule, path and line number only. The matched
// value, any fragment of it, its hash and its length are never printed, so the
// scanner output is safe to paste into CI logs, issues and reports.
//
// Usage:
//   npx tsx scripts/scan-secrets.ts             # scan tracked + untracked files
//   npx tsx scripts/scan-secrets.ts <path...>   # scan specific files
//
// Exit code 0 = clean, 1 = findings, 2 = usage/IO error.

import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';

export interface Rule {
  name: string;
  severity: 'critical' | 'high';
  pattern: RegExp;
  /** When set, the line must also look like it names a credential. */
  requiresCredentialContext?: boolean;
}

/**
 * A generic secret being ASSIGNED to a credential-named field.
 *
 * Requiring the assignment — label, delimiter, then value — rather than merely
 * spotting a credential word somewhere on the line is what keeps this usable.
 * Russian marketing copy in content/*.json talks about "ключ" and "токен"
 * constantly, and a lockfile is wall-to-wall high-entropy digests; neither is
 * an assignment to a credential field.
 *
 * Group 1 = the label, group 2 = the value. Neither is ever printed.
 */
export const CREDENTIAL_ASSIGNMENT =
  /(?:^|[\s"'`|*+>\-[({,])([A-Za-z_][A-Za-z0-9_\- ]{0,40}?(?:pass(?:word|wd)?|secret|token|api[_\- ]?key|apikey|credential|bearer))["'`]?\s*[:=]\s*["'`]?([A-Za-z0-9_\-+/]{24,})/i;

/** `Authorization: Bearer <value>` carries the value after the scheme, not the delimiter. */
export const BEARER_ASSIGNMENT = /bearer\s+["'`]?([A-Za-z0-9_\-+/.]{24,})/i;

/** Credential-naming word, used for markdown-table and prose detection. */
export const CREDENTIAL_WORD =
  /(pass(?:word|wd)?|secret|token|api[_\- ]?key|apikey|credential|bearer|логин|парол|секрет)/i;

/**
 * Markdown table row: `| LABEL | VALUE |`.
 *
 * The R0.3 incident file was written this way, which is precisely why the
 * assignment rule above missed all 23 of its versions during gate validation.
 * A credential named in one cell with a high-entropy value in another cell is
 * the same disclosure as `KEY=value`.
 */
/** Git object names are all over the governance tables and are not secrets. */
export const GIT_SHA_LIKE = /^[0-9a-f]{7,40}$/i;

export function scanTableRow(line: string): boolean {
  // Must look like an actual markdown table row: leading and trailing pipe.
  // Without this, a TypeScript union type (`... : Foo | null`) reads as a
  // two-cell table and produces false positives in ordinary source files.
  if (!/^\s*\|.*\|\s*$/.test(line)) return false;
  const cells = line.split('|').map((c) => c.trim()).filter(Boolean);
  if (cells.length < 2) return false;
  const labelled = cells.some((c) => CREDENTIAL_WORD.test(c) && c.length <= 80);
  if (!labelled) return false;
  // The value may sit in a descriptive cell that itself repeats the credential
  // name, so the value cell is NOT required to be credential-word-free — that
  // requirement is what made the first version of this gate miss the real
  // incident entirely.
  for (const cell of cells) {
    for (const tok of cell.match(/[A-Za-z0-9_\-+/]{24,}/g) ?? []) {
      if (GIT_SHA_LIKE.test(tok)) continue;
      if (HIGH_ENTROPY.test(tok)) return true;
    }
  }
  return false;
}

/** Content-addressed digests are not credentials. */
export const DIGEST_CONTEXT = /(integrity|sha256-|sha512-|sha1-|checksum|["']?hash["']?\s*[:=]|etag)/i;

/** A generic secret: long, mixed alphanumeric, no natural-language shape. */
export const HIGH_ENTROPY = /(?=[A-Za-z0-9_\-+/]{24,})(?=[^\s]*[A-Za-z])(?=[^\s]*[0-9])[A-Za-z0-9_\-+/]{24,}/;

export const RULES: Rule[] = [
  { name: 'github_pat_fine_grained', severity: 'critical', pattern: /\bgithub_pat_[A-Za-z0-9_]{20,}/ },
  { name: 'github_pat_classic', severity: 'critical', pattern: /\bghp_[A-Za-z0-9]{20,}/ },
  { name: 'github_other_token', severity: 'critical', pattern: /\bgh[osur]_[A-Za-z0-9]{20,}/ },
  { name: 'telegram_bot_token', severity: 'critical', pattern: /\b\d{8,10}:[A-Za-z0-9_-]{30,}/ },
  { name: 'openai_style_key', severity: 'critical', pattern: /\bsk-[A-Za-z0-9_-]{20,}/ },
  { name: 'slack_token', severity: 'critical', pattern: /\bxox[abprs]-[A-Za-z0-9-]{10,}/ },
  { name: 'aws_access_key_id', severity: 'critical', pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'private_key_block', severity: 'critical', pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: 'jwt_like', severity: 'high', pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./ },
  // The rule that would have caught the R0.3 incident.
  { name: 'generic_secret_in_credential_context', severity: 'high', pattern: CREDENTIAL_ASSIGNMENT, requiresCredentialContext: true },
];

/**
 * Narrow, documented exemptions. Each entry must name a specific file and a
 * specific reason. This list intentionally contains no directory wildcards:
 * a broad allowlist is how a real leak gets hidden from review.
 */
export const EXEMPT_FILES = new Map<string, string>([
  ['scripts/scan-secrets.ts', 'this scanner: contains the detection patterns themselves'],
  ['tests/secret-scan.test.ts', 'scanner tests: contain synthetic non-working fixtures'],
  ['.gitignore', 'ignore rules naming credential filenames'],
]);

/**
 * Placeholder shapes that are documentation, not credentials.
 *
 * Deliberately narrow: matching loose words such as "example" or "sample"
 * anywhere on the line would silence a real secret that merely sits next to
 * that word. Only explicit fill-me-in forms are accepted.
 */
export const PLACEHOLDER =
  /(REPLACE_ME|CHANGEME|CHANGE_ME|YOUR_[A-Z_]+|<[^>\s]{3,}>|\$\{[^}]+\}|x{8,}|\.{3,})/i;

const BINARY_OR_VENDOR =
  /(\.(png|jpe?g|webp|gif|ico|woff2?|ttf|eot|pdf|zip|mp4|mp3|svg|lock)$)|(^|\/)(node_modules|dist|build|\.wrangler)\//i;

/**
 * Paths whose very name says "this file documents credentials".
 *
 * Gate validation against the real R0.3 incident showed that same-line rules
 * miss it completely: the credential names and their values sit on different
 * lines of a prose/markdown document. For a file like this, ANY high-entropy
 * value is a finding — such a file should not carry one at all.
 */
export const CREDENTIAL_FILE = /(^|\/)(\.env($|\.)|.*credentials?[._-]|credentials?\.|.*[._-]secrets?\.|secrets?\.)/i;

/** How far a credential word may sit from its value and still count as context. */
export const PROXIMITY_LINES = 6;

export interface Finding {
  rule: string;
  severity: 'critical' | 'high';
  file: string;
  line: number;
}

/** Scan one file's text. Returns redacted findings — never the matched value. */
/** High-entropy tokens on a line, excluding git object names. */
function entropyTokens(line: string): string[] {
  return (line.match(/[A-Za-z0-9_\-+/]{24,}/g) ?? []).filter(
    (t) => HIGH_ENTROPY.test(t) && !GIT_SHA_LIKE.test(t),
  );
}

export function scanText(file: string, text: string): Finding[] {
  if (EXEMPT_FILES.has(file)) return [];
  const findings: Finding[] = [];
  const lines = text.split(/\r?\n/);

  // A credential-named file must not contain a high-entropy value anywhere.
  const isCredentialFile = CREDENTIAL_FILE.test(file);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.length > 4000) continue;
    if (PLACEHOLDER.test(line)) continue;

    if (isCredentialFile && !DIGEST_CONTEXT.test(line) && entropyTokens(line).length > 0) {
      findings.push({ rule: 'secret_in_credential_file', severity: 'critical', file, line: i + 1 });
      continue;
    }
    for (const rule of RULES) {
      if (rule.requiresCredentialContext) {
        // Content-addressed digests look like secrets but are not.
        if (DIGEST_CONTEXT.test(line)) continue;
        const assigned = CREDENTIAL_ASSIGNMENT.exec(line)?.[2];
        const bearer = BEARER_ASSIGNMENT.exec(line)?.[1];
        const value = assigned ?? bearer;
        const hasValue = value !== undefined && HIGH_ENTROPY.test(value);
        // A proximity rule (credential word within N lines of a high-entropy
        // value) was tried here and rejected: it caught 22/23 incident
        // versions but produced 268 findings across the Russian marketing
        // content, which talks about "токен" constantly. A gate that noisy
        // gets disabled, so detection for the incident's prose shape is
        // carried by CREDENTIAL_FILE above instead.
        if (!hasValue && !scanTableRow(line)) continue;
      } else if (!rule.pattern.test(line)) {
        continue;
      }
      findings.push({ rule: rule.name, severity: rule.severity, file, line: i + 1 });
      break; // one finding per line is enough to fail the gate
    }
  }
  return findings;
}

export function repositoryFiles(): string[] {
  // Include non-ignored, untracked source/artifacts too. A secret does not
  // become harmless merely because the author has not staged it yet. NUL
  // delimiters preserve paths containing spaces and non-ASCII characters.
  const out = execFileSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  return out.split('\u0000').filter(Boolean);
}

export function scanFiles(files: string[]): Finding[] {
  const findings: Finding[] = [];
  for (const f of files) {
    if (BINARY_OR_VENDOR.test(f)) continue;
    let text: string;
    try {
      if (statSync(f).size > 2 * 1024 * 1024) continue;
      text = readFileSync(f, 'utf8');
    } catch {
      continue;
    }
    if (text.includes('\u0000')) continue;
    findings.push(...scanText(f.replace(/\\/g, '/'), text));
  }
  return findings;
}

function main(): void {
  const args = process.argv.slice(2);
  const files = args.length ? args : repositoryFiles();
  const findings = scanFiles(files);

  if (findings.length === 0) {
    console.log(`secret-scan: clean (${files.length} files checked)`);
    process.exit(0);
  }

  console.error(`secret-scan: ${findings.length} finding(s) — values are never printed\n`);
  for (const f of findings) {
    console.error(`  [${f.severity}] ${f.rule}  ${f.file}:${f.line}`);
  }
  console.error(
    '\nRemove the secret, rotate it, and store the new value in the platform secret store.\n' +
      'If a finding is a false positive, make the line unambiguous (use a placeholder)\n' +
      'rather than widening EXEMPT_FILES.',
  );
  process.exit(1);
}

// Only run when invoked directly, so the module stays importable from tests.
const invokedDirectly =
  process.argv[1] !== undefined && /scan-secrets\.ts$/.test(process.argv[1].replace(/\\/g, '/'));
if (invokedDirectly) main();
