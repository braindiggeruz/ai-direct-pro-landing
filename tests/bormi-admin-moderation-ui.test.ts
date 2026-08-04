/**
 * The Bormi Admin moderation screens.
 *
 * The behaviour of the endpoints is proved in `bormi-admin-moderation.test.ts`
 * against a real database. What is left to prove is the surface: that the panel
 * reaches the contract that exists rather than inventing a second one, that it
 * cannot express an outcome the server has no transition for, and that the
 * things a moderation screen must never show are absent from the source rather
 * than merely absent from a screenshot.
 *
 * These are source-level assertions, and that is deliberate. A rendering test
 * proves a component renders; it does not prove that no future edit adds a
 * reporter's name to the row, because the fixture would simply be updated with
 * it. The properties below are the ones that must not drift.
 */
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MODERATION_DECISIONS,
  MODERATION_REASONS,
  MODERATION_STATES,
  REPORT_RESOLUTIONS,
} from '../functions/platform/admin/moderation';

const ROOT = new URL('../', import.meta.url);

async function source(path: string): Promise<string> {
  return readFile(new URL(path, ROOT), 'utf8');
}

/** Strip comments: a property must hold in the code, not in a sentence about it. */
function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const QUEUE = 'apps/bormi-admin/src/pages/Moderation.tsx';
const DETAIL = 'apps/bormi-admin/src/pages/ModerationDetail.tsx';
const REPORTS = 'apps/bormi-admin/src/pages/Reports.tsx';
const API = 'apps/bormi-admin/src/lib/api.ts';
const TEXT = 'apps/bormi-admin/src/lib/text.ts';
const APP = 'apps/bormi-admin/src/App.tsx';
const SHELL = 'apps/bormi-admin/src/components/AppShell.tsx';
const SCREENS = [QUEUE, DETAIL, REPORTS];

// ── The contract the screens reach ────────────────────────────────────────────

test('moderation UI: every read goes to the endpoints that exist', async () => {
  const api = code(await source(API));
  for (const path of [
    '/api/admin/moderation/listings?',
    '/api/admin/moderation/listings/${encodeURIComponent(id)}',
    '/api/admin/moderation/reports?',
  ]) {
    assert.ok(api.includes(path), `the client never calls ${path}`);
  }
  assert.match(api, /moderation\/listings\/\$\{encodeURIComponent\(id\)\}\/decision/);
  assert.match(api, /moderation\/reports\/\$\{encodeURIComponent\(id\)\}\/resolution/);
});

test('moderation UI: no screen builds a URL or talks to the network itself', async () => {
  // One module owns the session and the origin. A `fetch` in a screen would be
  // a second place a bearer token could end up.
  for (const path of SCREENS) {
    const screen = code(await source(path));
    assert.doesNotMatch(screen, /\bfetch\(/, `${path} fetches directly`);
    assert.doesNotMatch(screen, /\/api\/admin/, `${path} builds its own URL`);
    assert.doesNotMatch(screen, /localStorage/, `${path} touches storage`);
    assert.doesNotMatch(screen, /Authorization/, `${path} handles a credential`);
  }
});

test('moderation UI: the decision vocabulary is the server’s, and closed', async () => {
  const detail = code(await source(DETAIL));
  // Each of the four appears as a decision key, and nothing else does.
  const keys = [...detail.matchAll(/key: '([a-z_]+)',\n\s*label:/g)].map((match) => match[1]);
  assert.deepEqual([...keys].sort(), [...MODERATION_DECISIONS].sort());
  // There is no fifth outcome, and in particular nothing that returns a listing
  // to the queue: the server's `allowedFrom` has no transition into `pending`.
  for (const invented of ['restore', 'reopen', 'unreject', 'pending_again', 'publish']) {
    assert.doesNotMatch(
      detail, new RegExp(`key: '${invented}'`), `the screen offers ${invented}`,
    );
  }
  const reports = code(await source(REPORTS));
  const resolutions = [...reports.matchAll(/key: '([a-z]+)',\n\s*label:/g)].map((m) => m[1]);
  assert.deepEqual([...resolutions].sort(), [...REPORT_RESOLUTIONS].sort());
});

test('moderation UI: every state and reason the server may send has wording', async () => {
  const text = await source(TEXT);
  const module_ = await import('../apps/bormi-admin/src/lib/text');
  for (const state of MODERATION_STATES) {
    assert.ok(module_.MODERATION_STATE[state], `no wording for state ${state}`);
  }
  // The nine a moderator may choose, and the two a listing may arrive with.
  for (const reason of MODERATION_REASONS) {
    assert.ok(module_.MODERATION_REASON[reason], `no wording for reason ${reason}`);
  }
  assert.deepEqual(
    Object.keys(module_.MODERATION_REASON).sort(),
    [...MODERATION_REASONS].sort(),
    'the reason picker and the server disagree about the closed list',
  );
  // Entry reasons are displayed but never offered as a decision, exactly as on
  // the server: they say why a listing is in the queue, not why somebody ruled.
  for (const entry of ['new_seller_review', 'high_risk_category']) {
    assert.ok(module_.ANY_MODERATION_REASON[entry], `no wording for ${entry}`);
    assert.equal(module_.MODERATION_REASON[entry], undefined);
  }
  assert.ok(text.includes('market_moderation_audit'), 'the audit vocabulary is undocumented');
});

// ── Authority and safety ──────────────────────────────────────────────────────

test('moderation UI: a command sends a version and a key, never a status', async () => {
  const api = code(await source(API));
  assert.match(api, /expected_version: input\.expectedVersion/);
  assert.match(api, /idempotency_key: input\.idempotencyKey/);
  // The outcome is the server's to decide. Nothing in the client names a
  // moderation state or a product status as a thing to write.
  assert.doesNotMatch(api, /['"](approved|rejected|restricted|removed|published)['"]/);
  for (const path of SCREENS) {
    const screen = code(await source(path));
    assert.doesNotMatch(
      screen, /target_status|to_state:|product_status:\s*['"]/,
      `${path} chooses an outcome`,
    );
  }
});

test('moderation UI: one idempotency key per attempt, minted from the version', async () => {
  const detail = code(await source(DETAIL));
  const reports = code(await source(REPORTS));
  // A retry after a network error reuses the key so the server replays; a new
  // decision mints a new one. Both are minted at the moment the drawer opens.
  assert.match(detail, /setAttemptKey\(`mod-\$\{listing\.listing_id\}-\$\{decision\}-\$\{listing\.version\}/);
  assert.match(reports, /setAttemptKey\(`rep-\$\{report\.id\}-\$\{resolution\}-\$\{report\.version\}/);
  for (const screen of [detail, reports]) {
    assert.match(screen, /crypto\.randomUUID\(\)/);
  }
});

test('moderation UI: support sees the queue and is offered nothing to press', async () => {
  const queue = code(await source(QUEUE));
  const detail = code(await source(DETAIL));
  const reports = code(await source(REPORTS));
  for (const screen of [queue, detail, reports]) {
    assert.match(
      screen, /actor\.role !== 'platform_owner'/,
      'a screen does not distinguish the read-only role',
    );
  }
  // Hidden rather than disabled: a greyed-out decision still says the
  // capability is in this screen and merely withheld.
  assert.match(detail, /if \(readOnly\) \{/);
  assert.match(reports, /readOnly \|\| !isOpen\(report\)/);
});

test('moderation UI: nothing is optimistic, and every command re-reads', async () => {
  const detail = code(await source(DETAIL));
  const reports = code(await source(REPORTS));
  for (const screen of [detail, reports]) {
    assert.match(screen, /onDone\(\)/, 'a command does not refetch');
    assert.match(screen, /failure instanceof AdminApiError \? failure\.code : 'network_error'/);
    // A 409 means somebody ruled while this was open. The stale record is
    // replaced rather than left on screen to be decided a second time.
    assert.match(screen, /failure\.status === 409\) onDone\(\)/);
  }
  // The outcome shown is the one the server reported, not the one the button
  // hoped for: there is no state set before the await resolves.
  assert.doesNotMatch(detail, /setOutcome\('applied'\);\s*\n\s*(const|await)/);
});

test('moderation UI: the note is bounded on the way in, as it is on the way out', async () => {
  const detail = code(await source(DETAIL));
  assert.match(detail, /const MAX_NOTE = 500;/);
  assert.match(detail, /maxLength=\{MAX_NOTE\}/);
  assert.match(detail, /slice\(0, MAX_NOTE\)/);
  const server = code(await source('functions/platform/admin/moderation.ts'));
  assert.match(server, /MAX_NOTE_LENGTH = 500/, 'the two bounds have drifted apart');
});

// ── What must not be on a moderation screen ───────────────────────────────────

test('moderation UI: no screen can name a reporter or repeat what they wrote', async () => {
  for (const path of SCREENS) {
    // Comments are stripped: the property is about what a screen can render.
    // "Phone: cards" is a note about a breakpoint, and the drawer's warning not
    // to write a Telegram handle into an internal note is the opposite of a leak.
    const screen = code(await source(path));
    for (const forbidden of [
      'reporter', 'reporter_identity', 'reporterSessionHash', 'identity_id',
      'session_hash',
    ]) {
      assert.ok(
        !screen.toLowerCase().includes(forbidden.toLowerCase()),
        `${path} reads ${forbidden}`,
      );
    }
    // A reporter's own words are a different thing from the moderator's
    // internal note, which the drawer does send. The one that must not appear
    // is a note read off a report, and the contract test below is what makes
    // that impossible rather than merely absent.
    assert.doesNotMatch(screen, /report\.note|reports\[\d*\]\.note/, `${path} reads a report note`);
  }
});

test('moderation UI: the contract has no field a screen could leak', async () => {
  // The stronger statement, and the one a future edit cannot quietly undo: the
  // types the panel binds to carry no reporter, no identity, no session and no
  // contact detail. A screen cannot render a field that does not exist.
  const contracts = code(await source('apps/bormi-admin/src/lib/contracts.ts'));
  for (const name of [
    'ModerationRow', 'ModerationDetail', 'ModerationReportEntry', 'ReportRow',
  ]) {
    const start = contracts.indexOf(`export interface ${name}`);
    assert.notEqual(start, -1, `${name} is missing`);
    const body = contracts.slice(start, start + contracts.slice(start).indexOf('\n}'));
    for (const forbidden of [
      'identity', 'reporter', 'phone', 'telegram', 'session', 'note', 'email',
    ]) {
      assert.doesNotMatch(
        body, new RegExp(`\\b\\w*${forbidden}\\w*\\s*[?]?:`, 'i'),
        `${name} carries a ${forbidden} field`,
      );
    }
  }
});

test('moderation UI: a photograph is addressed by index, never by key', async () => {
  const api = code(await source(API));
  assert.match(api, /moderation\/listings\/\$\{encodeURIComponent\(id\)\}\/media\/\$\{index\}/);
  // No storage path, no bucket, no signed capability in an address.
  for (const path of [...SCREENS, API]) {
    const screen = code(await source(path));
    assert.doesNotMatch(screen, /classifieds\/\$\{|market\/\$\{|r2\./, `${path} builds a storage key`);
  }
  const detail = code(await source(DETAIL));
  // The bytes travel through the guarded fetch and the object URL is released;
  // an <img src> would be an unauthenticated request, and leaving the URL
  // attached pins the blob for the lifetime of the tab.
  assert.match(detail, /fetchModerationMedia\(id, index\)/);
  assert.match(detail, /URL\.revokeObjectURL/);
});

test('moderation UI: no screen writes SQL or reaches a database', async () => {
  for (const path of SCREENS) {
    const screen = code(await source(path));
    for (const forbidden of ['SELECT ', 'UPDATE ', 'INSERT ', 'D1Database', 'prepare(']) {
      assert.ok(!screen.includes(forbidden), `${path} contains ${forbidden}`);
    }
  }
});

// ── Reachability ──────────────────────────────────────────────────────────────

test('moderation UI: the screens are routed, lazy and in the menu', async () => {
  const app = code(await source(APP));
  for (const route of ['/moderation', '/moderation/:id', '/reports']) {
    assert.ok(app.includes(`path="${route}"`), `${route} is not routed`);
  }
  // One chunk per screen, like every other screen in this panel: the shell is
  // what every visit pays for.
  assert.match(app, /lazy\(\(\) => import\('\.\/pages\/Moderation'\)\)/);
  assert.match(app, /lazy\(\(\) => import\('\.\/pages\/ModerationDetail'\)\)/);
  assert.match(app, /lazy\(\(\) => import\('\.\/pages\/Reports'\)\)/);

  const shell = code(await source(SHELL));
  assert.match(shell, /to: '\/moderation', label: 'На модерации'/);
  assert.match(shell, /to: '\/reports', label: 'Жалобы'/);
  // A menu that lists a section and opens nothing is a menu that stops being
  // trusted, so both entries have an icon case of their own.
  assert.match(shell, /name === 'moderation'/);
  assert.match(shell, /name === 'reports'/);
});

test('moderation UI: fixtures stay synthetic and refuse to answer a command', async () => {
  const fixtures = await source('apps/bormi-admin/src/lib/fixtures.ts');
  assert.match(fixtures, /syntheticModerationQueue/);
  assert.match(fixtures, /syntheticModerationDetail/);
  assert.match(fixtures, /syntheticReports/);
  // Every invented seller says it is invented, and the address is unroutable.
  assert.match(fixtures, /example\.invalid/);
  assert.doesNotMatch(fixtures, /synthetic-owner@(?!example\.invalid)/);
  // A demo that answered "applied" would be a review signing off on a command
  // nobody exercised. Each command body is read on its own, so a guard in a
  // neighbouring function cannot stand in for a missing one here.
  const api = code(await source(API));
  for (const name of ['runModerationDecision', 'runReportResolution']) {
    const start = api.indexOf(`export async function ${name}`);
    assert.notEqual(start, -1, `${name} is missing`);
    const rest = api.slice(start + 1);
    const end = rest.indexOf('\nexport ');
    const body = end === -1 ? rest : rest.slice(0, end);
    assert.match(
      body,
      /if \(FIXTURE_MODE\) throw new AdminApiError\('fixture_mode_read_only'/,
      `${name} pretends to succeed under fixtures`,
    );
  }
});
