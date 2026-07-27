// Boundary rules for functions/{platform,agents,channels} + registry safety.
// Run: node --import tsx --test tests/agent-boundaries.test.ts
//
// The checker is proven with NEGATIVE fixtures (in-memory SourceFile objects,
// never broken production files): a rule that only ever passes is untested.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { checkBoundaries, scanTree, type SourceFile } from '../scripts/check-agent-boundaries';
import {
  registerAgent,
  getAgent,
  listAgents,
  clearAgentsForTests,
  DuplicateAgentIdError,
} from '../functions/agents/registry';
import type { AgentManifest } from '../functions/platform/contracts';

const ROOT = path.resolve(import.meta.dirname, '..');

// ── Real tree must be clean ────────────────────────────────────────────────
test('current platform/agents/channels tree has zero violations', () => {
  const files = scanTree(ROOT);
  assert.ok(files.length >= 10, `expected scaffold files, got ${files.length}`);
  const violations = checkBoundaries(files);
  assert.deepEqual(violations, []);
});

// ── Negative fixtures: every rule must actually fire ───────────────────────
const fixture = (p: string, content: string): SourceFile => ({ path: p, content });

test('platform importing agents is flagged', () => {
  const v = checkBoundaries([
    fixture('functions/platform/events/bus.ts', "import { registerAgent } from '../../agents/registry';"),
  ]);
  assert.equal(v.length, 1);
  assert.match(v[0].rule, /platform must not import agents/);
  assert.match(v[0].file, /functions\/platform\/events\/bus\.ts:1/);
});

test('platform importing channels is flagged', () => {
  const v = checkBoundaries([
    fixture('functions/platform/runtime/loop.ts', "import { tg } from '../../channels/telegram/api';"),
  ]);
  assert.equal(v.length, 1);
  assert.match(v[0].rule, /platform must not import channels/);
});

test('agents importing channels is flagged (relative escape included)', () => {
  const v = checkBoundaries([
    fixture('functions/agents/sotuvchi/manifest.ts', "import { adapter } from '../../channels/telegram';"),
    fixture('functions/agents/deep/nested/x.ts', "import { y } from './../../../channels/index';"),
  ]);
  assert.equal(v.length, 2);
  for (const violation of v) assert.match(violation.rule, /agents must not import channels/);
});

test('channels importing agents is flagged', () => {
  const v = checkBoundaries([
    fixture('functions/channels/telegram/webhook.ts', "import { listAgents } from '../../agents';"),
  ]);
  assert.equal(v.length, 1);
  assert.match(v[0].rule, /channels must not import agents/);
});

test('platform legacy import is allowed only in the isolated P0.5 adapter', () => {
  const flagged = checkBoundaries([
    fixture('functions/platform/ai/facade.ts', "import { chatComplete } from '../../lib/gpt-chat/openrouter-chat';"),
  ]);
  assert.equal(flagged.length, 1);
  assert.match(flagged[0].rule, /legacy lib/);
  const misplacedMarker = checkBoundaries([
    fixture(
      'functions/platform/ai/facade.ts',
      "import { chatComplete } from '../../lib/gpt-chat/openrouter-chat'; // LEGACY-SHIM: misplaced",
    ),
  ]);
  assert.equal(misplacedMarker.length, 1);
  const allowed = checkBoundaries([
    fixture(
      'functions/platform/ai/drivers/legacy.ts',
      "import { chatComplete } from '../../../lib/gpt-chat/openrouter-chat'; // LEGACY-SHIM: isolated P0.5 adapter",
    ),
  ]);
  assert.deepEqual(allowed, []);
  const missingMarker = checkBoundaries([
    fixture(
      'functions/platform/ai/drivers/legacy.ts',
      "import { chatComplete } from '../../../lib/gpt-chat/openrouter-chat';",
    ),
  ]);
  assert.equal(missingMarker.length, 1);
});

test('Cloudflare handler exports are flagged in all three spaces', () => {
  const v = checkBoundaries([
    fixture('functions/platform/index.ts', 'export const onRequestGet = () => new Response("x");'),
    fixture('functions/agents/registry.ts', 'export async function onRequestPost() {}'),
  ]);
  assert.equal(v.length, 2);
  for (const violation of v) assert.match(violation.rule, /handler exports/);
  assert.match(v[0].detail, /onRequestGet/);
});

test('valid imports pass: agents→platform, channels→platform, dynamic import', () => {
  const v = checkBoundaries([
    fixture('functions/agents/sotuvchi/manifest.ts', "import type { AgentManifest } from '../../platform/contracts';"),
    fixture('functions/channels/telegram/adapter.ts', "import type { ChannelAdapter } from '../../platform/contracts';"),
    fixture('functions/platform/runtime/loader.ts', "const m = await import('./manifest-cache');"),
  ]);
  assert.deepEqual(v, []);
});

// ── Registry ───────────────────────────────────────────────────────────────
const demoManifest = (id: string): AgentManifest => ({
  id,
  version: '0.0.1',
  locales: ['ru'],
  capabilities: ['handoff'],
  tools: [],
});

test('registry: type-safe register/get/list and duplicate detection', () => {
  clearAgentsForTests();
  registerAgent(demoManifest('demo-a'));
  registerAgent(demoManifest('demo-b'));
  assert.equal(getAgent('demo-a')?.version, '0.0.1');
  assert.equal(listAgents().length, 2);
  assert.throws(() => registerAgent(demoManifest('demo-a')), DuplicateAgentIdError);
  clearAgentsForTests();
  assert.equal(listAgents().length, 0);
});

test('registry starts empty in production (no agents registered at import)', () => {
  clearAgentsForTests();
  assert.equal(listAgents().length, 0);
});
