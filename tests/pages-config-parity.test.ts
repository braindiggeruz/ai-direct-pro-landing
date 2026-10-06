// Both `main` and the Lead Radar branch deploy to the SAME Cloudflare Pages
// project, `ai-direct-pro-landing`. `wrangler pages deploy` does not merge
// configuration: it replaces the production var set and binding set wholesale
// with whatever the deploying branch's wrangler.toml declares. Whichever branch
// ships last therefore defines production entirely.
//
// On 2026-08-26 that cost the site its measurement. `main` deployed at 11:35 UTC
// with the bounded analytics loader; the Lead Radar branch deployed at 11:40 UTC
// and again at 16:01 UTC, and because its tree still carried the 30 000 ms
// loader, the fix survived in production for five minutes. The reverse is just
// as destructive and is what this file guards: deploying `main` while its
// wrangler.toml lacks the Lead Radar block silently deletes the gateway Service
// Binding, the private campaign-media R2 bucket and fifteen feature flags from
// production, with no error and no diff to look at afterwards.
//
// So this test does not check that the config is "nice". It checks that this
// branch is a superset of what the other branch needs, which is the only
// property that makes a deploy from here non-destructive.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { hydrateRuntimeConfig } from '../functions/lib/runtime-config';
import { resolveLeadRadarCapabilities } from '../functions/platform/lead-radar/capabilities';
import { automationWorkerVars } from './helpers/wrangler-vars';

const config = fs.readFileSync(path.join(process.cwd(), 'wrangler.toml'), 'utf8');

const varsBlock = (): string => {
  const header = '\n[vars.GPTBOT_RUNTIME_CONFIG]';
  const at = config.indexOf(header);
  assert.notEqual(at, -1, 'wrangler.toml has no packed GPTBOT_RUNTIME_CONFIG table');
  const rest = config.slice(at + header.length);
  const next = rest.search(/\n\[/);
  return next === -1 ? rest : rest.slice(0, next);
};

const declaredVars = (): Map<string, string> => {
  const found = new Map<string, string>();
  for (const line of varsBlock().split('\n')) {
    const match = /^([A-Z0-9_]+)\s*=\s*"(.*)"$/.exec(line.trim());
    if (match) found.set(match[1], match[2]);
  }
  return found;
};

// Owner-approved integrated release, 2026-08-28 (d629b4b). The later SEO-only
// deployment accidentally restored the older false flags and removed the UI.
// This combined branch must preserve the approved values, not the obsolete
// 2026-08-27 snapshot. A true feature flag is NOT recipient authorization.
//
// LEAD_RADAR_CONTACT_ENABLED was 'false' at d629b4b and the owner deliberately
// flipped it to 'true' on 2026-09-01 — this is the operator's own B2B
// prospecting tool and the pause was blocking all outreach. That decision is
// recorded here so the pin tracks reality instead of a stale snapshot. It does
// NOT relax who may be messaged: the fail-closed ownership and endpoint-type
// rules, the daily limits and LEAD_RADAR_ALLOWED_ORGS below stay pinned, and an
// empty allowlist remains a hard pause even with this boolean set to true.
//
// LEAD_RADAR_TELEGRAM_CAMPAIGN_AUTOSEND_ENABLED moved the other way on
// 2026-09-30 (paid-chat plan D12): the paired sender is a live personal
// Telegram account, so approved campaigns must not go out on their own.
// Preparing and approving campaigns stays available; sending does not.
const LEAD_RADAR_VARS: Record<string, string> = {
  LEAD_RADAR_ADMISSION_ENABLED: 'true',
  LEAD_RADAR_PROCESSING_ENABLED: 'true',
  LEAD_RADAR_CONTACT_ENABLED: 'true',
  LEAD_RADAR_TELEGRAM_DISCOVERY_ENABLED: 'true',
  LEAD_RADAR_TELEGRAM_TRANSPORT_MODE: 'local_bridge',
  LEAD_RADAR_TELEGRAM_ACCOUNT_ENABLED: 'true',
  LEAD_RADAR_TELEGRAM_CAMPAIGN_ENABLED: 'true',
  LEAD_RADAR_TELEGRAM_CAMPAIGN_AUTOSEND_ENABLED: 'false',
  LEAD_RADAR_PERSONAL_RETENTION_DAYS: '30',
  LEAD_RADAR_ALLOWED_ORGS: 'owner_8ee98dc3040f160b308166b0',
  LEAD_RADAR_MAX_DISPATCH_PER_TICK: '5',
  LEAD_RADAR_TELEGRAM_BOT_USERNAME: '',
  LEAD_RADAR_CONTACT_DAILY_LIMIT: '10',
  LEAD_RADAR_TELEGRAM_CAMPAIGN_DAILY_LIMIT: '30',
  LEAD_RADAR_TELEGRAM_CAMPAIGN_MIN_INTERVAL_SECONDS: '120',
};

test('every Lead Radar production var is declared on this branch too', () => {
  const declared = declaredVars();
  for (const [key, expected] of Object.entries(LEAD_RADAR_VARS)) {
    assert.ok(
      declared.has(key),
      `${key} is missing from wrangler.toml; deploying this branch would delete ` +
        'it from production, because a Pages deploy replaces the whole var set',
    );
    assert.equal(
      declared.get(key),
      expected,
      `${key} disagrees with what the Lead Radar branch ships; the last branch ` +
        'to deploy wins, so the two must stay identical',
    );
  }
});

// The automation Worker never sees the Pages vars. It reads its own [vars],
// which every Worker deploy replaces wholesale, and it is the component that
// actually sends campaigns (workers/automation-worker.ts). A switch flipped in
// wrangler.toml alone makes the admin UI report "paused" while the Worker keeps
// sending from the paired account.
test('the automation Worker carries the same Lead Radar switches, with autosend off', () => {
  const pages = declaredVars();
  const worker = automationWorkerVars();
  for (const [key, expected] of Object.entries(LEAD_RADAR_VARS)) {
    assert.equal(worker.get(key), expected, `${key}: the Worker copy in wrangler.automation.toml disagrees`);
  }
  for (const [key, value] of worker) {
    if (pages.has(key)) assert.equal(value, pages.get(key), `${key} differs between Pages and the Worker`);
  }
  assert.equal(worker.get('LEAD_RADAR_TELEGRAM_CAMPAIGN_AUTOSEND_ENABLED'), 'false');
});

test('production Pages offers campaigns to the owner but reports autosend paused', () => {
  // Production reads the packed text var, not the table (see the note above
  // [vars] in wrangler.toml), so resolve the capabilities from that.
  const packed = /GPTBOT_RUNTIME_CONFIG_JSON\s*=\s*'''([^']+)'''/u.exec(config)?.[1];
  assert.ok(packed, 'wrangler.toml has no packed GPTBOT_RUNTIME_CONFIG_JSON');
  const env = hydrateRuntimeConfig({
    GPTBOT_RUNTIME_CONFIG_JSON: packed,
    // Production has both secrets and the private binding; stand-ins here, so
    // that only the flags decide the outcome.
    LEAD_RADAR_TELEGRAM_CAMPAIGN_DATA_KEY: Buffer.alloc(32, 7).toString('base64url'),
    LEAD_RADAR_TELEGRAM_INTERNAL_SERVICE_TOKEN: Buffer.alloc(32, 9).toString('base64url'),
    LEAD_RADAR_TELEGRAM_ACCOUNT_SERVICE: { fetch: async () => new Response(null) } as unknown as Fetcher,
  });
  const capabilities = resolveLeadRadarCapabilities(env, LEAD_RADAR_VARS.LEAD_RADAR_ALLOWED_ORGS);
  assert.equal(capabilities.telegramAccountEnabled, true);
  assert.equal(capabilities.campaignOutreachEnabled, true);
  assert.equal(capabilities.campaignAutoSendEnabled, false);
});

test('the integrated release keeps campaign limits unchanged after outreach was enabled', () => {
  // Campaign availability was explicitly approved. Legacy Business outreach was
  // then opened by the owner's own decision on 2026-09-01 — see the note on
  // LEAD_RADAR_VARS above for why that pin moved from false to true.
  //
  // What must NOT move are the throughput limits and the recipient allowlist.
  // Those are the difference between an enabled switch and a blast, so this
  // test now pins them harder than it did when outreach was simply off.
  // Recipient basis, identity and approval are independent server gates,
  // covered by the campaign API and preflight regression tests.
  const declared = declaredVars();
  assert.equal(declared.get('LEAD_RADAR_CONTACT_ENABLED'), 'true');
  assert.equal(declared.get('LEAD_RADAR_TELEGRAM_CAMPAIGN_DAILY_LIMIT'), '30');
  assert.equal(declared.get('LEAD_RADAR_TELEGRAM_CAMPAIGN_MIN_INTERVAL_SECONDS'), '120');
  assert.equal(declared.get('LEAD_RADAR_CONTACT_DAILY_LIMIT'), '10');
  // A hard pause even with every boolean above set to true.
  assert.equal(declared.get('LEAD_RADAR_ALLOWED_ORGS'), 'owner_8ee98dc3040f160b308166b0');
});

test('the Lead Radar bindings this branch does not use are still declared', () => {
  // Nothing on main reads these. They are here only so that a deploy from main
  // does not remove them from the project.
  assert.match(
    config,
    /\[\[r2_buckets\]\]\s*\nbinding = "LEAD_RADAR_CAMPAIGN_MEDIA"\s*\nbucket_name = "gptbot-lead-radar-campaign-media"/,
    'the private campaign-media R2 binding is missing',
  );
  assert.match(
    config,
    /\[\[services\]\]\s*\nbinding = "LEAD_RADAR_TELEGRAM_ACCOUNT_SERVICE"\s*\nservice = "gptbot-lead-radar-telegram-account"/,
    'the Telegram gateway Service Binding is missing',
  );
});

test('the bindings main does use are still declared', () => {
  // Same failure mode, other direction: these are what the site itself needs.
  for (const binding of ['GPTBOT_DRAFTS_DB', 'LOGIN_ATTEMPTS', 'MARKET_MEDIA', 'AUTOMATION_QUEUE']) {
    assert.ok(config.includes(`binding = "${binding}"`), `${binding} is missing from wrangler.toml`);
  }
});

test('the Pages project name and output directory are unchanged', () => {
  // A typo here creates a second Pages project instead of updating this one,
  // and the domain keeps pointing at the old deployment.
  assert.match(config, /^name = "ai-direct-pro-landing"$/m);
  assert.match(config, /^pages_build_output_dir = "dist"$/m);
});

// The studio's settings (functions/lib/studio/config.ts) are their own text
// variable. Written below [vars.GPTBOT_RUNTIME_CONFIG] the line would belong
// to that table, production would never see it, and the studio would stay off
// without a word; a key in the chat's packed JSON would eat the chat's room.
test('STUDIO_RUNTIME_CONFIG_JSON is a top-level [vars] text variable, valid JSON, every studio switch off', async () => {
  const { STUDIO_CONFIG_DEFAULTS, STUDIO_CONFIG_KEYS, parseStudioConfig } = await import('../functions/lib/studio/config');
  const { RUNTIME_CONFIG_KEYS } = await import('../functions/lib/runtime-config');
  const lines = config.split(/\r?\n/);
  const start = lines.indexOf('[vars]');
  const end = lines.findIndex((line, index) => index > start && line.startsWith('['));
  assert.ok(start !== -1 && end > start, 'wrangler.toml has no [vars] table followed by another table');
  const studioLines = lines.flatMap((line, index) => (line.includes('STUDIO_RUNTIME_CONFIG_JSON') && !line.startsWith('#') ? [index] : []));
  assert.equal(studioLines.length, 1, 'STUDIO_RUNTIME_CONFIG_JSON must be set exactly once');
  assert.ok(studioLines[0] > start && studioLines[0] < end, 'STUDIO_RUNTIME_CONFIG_JSON must sit between [vars] and the next table');

  // Wrangler itself reads it as a top-level var, outside the nested table.
  const { experimental_readRawConfig } = await import('wrangler');
  const vars = (experimental_readRawConfig({ config: path.join(process.cwd(), 'wrangler.toml') }).rawConfig as { vars?: Record<string, unknown> }).vars ?? {};
  const raw = vars.STUDIO_RUNTIME_CONFIG_JSON;
  assert.equal(typeof raw, 'string');
  assert.ok(!('STUDIO_RUNTIME_CONFIG_JSON' in ((vars.GPTBOT_RUNTIME_CONFIG ?? {}) as object)));

  const packed = JSON.parse(raw as string) as Record<string, unknown>;
  assert.equal(JSON.stringify(packed), raw, 'keep the JSON compact, like the chat packed variable');
  assert.ok(Buffer.byteLength(raw as string) <= 5120, 'Pages caps a text variable at 5 KiB');
  assert.deepEqual(Object.keys(packed), [...STUDIO_CONFIG_KEYS]);
  assert.deepEqual(packed, STUDIO_CONFIG_DEFAULTS);
  const studio = parseStudioConfig(raw);
  assert.deepEqual(
    [studio.api, studio.paidService, studio.freeDeck, studio.fullDeck, studio.photo, studio.payments, studio.events,
      studio.clickAmountsConfirmed, studio.turnstilePaid, studio.ga4Mp],
    [false, false, false, false, false, 'off', false, false, false, false],
  );
  // No secret ever lives in a public variable.
  assert.doesNotMatch(raw as string, /SECRET|CREDENTIALS|API_KEY|TOKEN/);

  // Tools split wrangler.toml on the nested table's header (scripts/paid-chat/ingest-keys.ts,
  // tests/legal-oferta.test.ts): it must appear once, never quoted in a comment above it.
  assert.equal(config.split('[vars.GPTBOT_RUNTIME_CONFIG]').length, 2);
  // The chat's config carries no studio key, in either copy or in its allowlist.
  const chat = JSON.parse(/GPTBOT_RUNTIME_CONFIG_JSON\s*=\s*'''([^']+)'''/u.exec(config)![1]) as Record<string, string>;
  assert.deepEqual(Object.keys(chat).filter((key) => key.startsWith('STUDIO_')), []);
  assert.deepEqual([...declaredVars().keys()].filter((key) => key.startsWith('STUDIO_')), []);
  assert.deepEqual(RUNTIME_CONFIG_KEYS.filter((key: string) => key.startsWith('STUDIO_')), []);
});
