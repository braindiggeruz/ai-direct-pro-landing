// GPTBot Agents — import-boundary checker for the platform namespaces.
//
// Rules (AGENTS.md §1, ARCHITECTURE.md; legacy functions/lib/** is exempt):
//   platform/** must not import agents/**, channels/**, or functions/lib/**
//               (lib only via a line-level "LEGACY-SHIM" marker);
//   agents/**   may import platform/** only (never channels/**);
//   channels/** may import platform/** only (never agents/**);
//   none of the three spaces may export Cloudflare Pages handlers
//               (onRequest*) — a stray export would turn a scaffold module
//               into a live route.
//
// Pure core (checkBoundaries) is unit-tested with fixtures, including
// negative ones; the CLI wrapper scans the real tree and exits non-zero on
// any violation. Run: npx tsx scripts/check-agent-boundaries.ts
import fs from 'node:fs';
import path from 'node:path';

export type Space = 'platform' | 'agents' | 'channels';

export interface SourceFile {
  /** Path relative to repo root, posix separators, e.g. functions/agents/x.ts */
  path: string;
  content: string;
}

export interface Violation {
  file: string;
  rule: string;
  detail: string;
}

const SPACE_PREFIX: Record<Space, string> = {
  platform: 'functions/platform/',
  agents: 'functions/agents/',
  channels: 'functions/channels/',
};

/** Forbidden import targets per space (target space or legacy lib). */
const FORBIDDEN: Record<Space, Array<{ target: string; rule: string }>> = {
  platform: [
    { target: 'functions/agents/', rule: 'platform must not import agents' },
    { target: 'functions/channels/', rule: 'platform must not import channels' },
    { target: 'functions/lib/', rule: 'platform must not import legacy lib (use LEGACY-SHIM marker)' },
  ],
  agents: [
    { target: 'functions/channels/', rule: 'agents must not import channels' },
    { target: 'functions/lib/', rule: 'agents must not import legacy lib' },
  ],
  channels: [
    { target: 'functions/agents/', rule: 'channels must not import agents' },
    { target: 'functions/lib/', rule: 'channels must not import legacy lib' },
  ],
};

const HANDLER_EXPORT =
  /export\s+(?:const|let|var|function|async\s+function)\s+(onRequest(?:Get|Post|Put|Delete|Patch|Head|Options)?)\b/;

// import … from '…'; export … from '…'; import('…'); require('…')
const IMPORT_RE =
  /(?:import|export)\s+(?:[^'"]*?from\s+)?['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

function spaceOf(filePath: string): Space | null {
  for (const [space, prefix] of Object.entries(SPACE_PREFIX) as Array<[Space, string]>) {
    if (filePath.startsWith(prefix)) return space;
  }
  return null;
}

/** Resolve a relative specifier against the importing file to a repo path. */
function resolveSpecifier(fromFile: string, spec: string): string {
  if (!spec.startsWith('.')) return spec; // bare specifier (package or alias)
  const dir = path.posix.dirname(fromFile);
  return path.posix.normalize(path.posix.join(dir, spec));
}

export function checkBoundaries(files: readonly SourceFile[]): Violation[] {
  const violations: Violation[] = [];
  for (const file of files) {
    const space = spaceOf(file.path);
    if (!space) continue;

    const handler = HANDLER_EXPORT.exec(file.content);
    if (handler) {
      violations.push({
        file: file.path,
        rule: 'no Cloudflare Pages handler exports in platform/agents/channels',
        detail: `exports ${handler[1]} — this would become a live route`,
      });
    }

    const lines = file.content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      IMPORT_RE.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = IMPORT_RE.exec(line)) !== null) {
        const spec = match[1] ?? match[2] ?? match[3];
        if (!spec) continue;
        const resolved = resolveSpecifier(file.path, spec);
        // Alias support: '@/x' maps to src/ in this repo (vite/tsconfig paths);
        // src imports are outside these rules, but keep the resolution honest.
        const target = resolved.startsWith('@/') ? resolved.replace('@/', 'src/') : resolved;
        for (const forbidden of FORBIDDEN[space]) {
          if (!target.includes(forbidden.target.replace(/\/$/, '/')) &&
              !`${target}/`.startsWith(forbidden.target)) continue;
          if (forbidden.target === 'functions/lib/' && line.includes('LEGACY-SHIM')) continue;
          violations.push({
            file: `${file.path}:${i + 1}`,
            rule: forbidden.rule,
            detail: `import '${spec}' resolves to ${target}`,
          });
        }
      }
    }
  }
  return violations;
}

export function scanTree(root: string): SourceFile[] {
  const out: SourceFile[] = [];
  for (const prefix of Object.values(SPACE_PREFIX)) {
    const abs = path.join(root, prefix);
    if (!fs.existsSync(abs)) continue;
    const stack = [abs];
    while (stack.length) {
      const dir = stack.pop()!;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) stack.push(full);
        else if (/\.(ts|tsx)$/.test(entry.name)) {
          out.push({
            path: path.relative(root, full).split(path.sep).join('/'),
            content: fs.readFileSync(full, 'utf8'),
          });
        }
      }
    }
  }
  return out;
}

// CLI entry — only when executed directly, never on import (keeps the module
// side-effect-free for tests).
const isDirectRun = process.argv[1]?.replace(/\\/g, '/').endsWith('check-agent-boundaries.ts') === true;
if (isDirectRun) {
  const root = path.resolve(import.meta.dirname, '..');
  const violations = checkBoundaries(scanTree(root));
  if (violations.length === 0) {
    console.log('agent-boundaries: OK (no violations)');
  } else {
    for (const violation of violations) {
      console.error(`✗ ${violation.file}\n  rule: ${violation.rule}\n  ${violation.detail}`);
    }
    console.error(`agent-boundaries: ${violations.length} violation(s)`);
    process.exit(1);
  }
}
