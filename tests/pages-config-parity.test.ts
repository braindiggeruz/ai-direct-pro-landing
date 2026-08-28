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

const config = fs.readFileSync(path.join(process.cwd(), 'wrangler.toml'), 'utf8');

const varsBlock = (): string => {
  const at = config.indexOf('\n[vars]');
  assert.notEqual(at, -1, 'wrangler.toml has no [vars] table');
  const rest = config.slice(at + '\n[vars]'.length);
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
const LEAD_RADAR_VARS: Record<string, string> = {
  LEAD_RADAR_ADMISSION_ENABLED: 'true',
  LEAD_RADAR_PROCESSING_ENABLED: 'true',
  LEAD_RADAR_CONTACT_ENABLED: 'false',
  LEAD_RADAR_TELEGRAM_DISCOVERY_ENABLED: 'true',
  LEAD_RADAR_TELEGRAM_TRANSPORT_MODE: 'local_bridge',
  LEAD_RADAR_TELEGRAM_ACCOUNT_ENABLED: 'true',
  LEAD_RADAR_TELEGRAM_CAMPAIGN_ENABLED: 'true',
  LEAD_RADAR_TELEGRAM_CAMPAIGN_AUTOSEND_ENABLED: 'true',
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

test('the integrated release keeps legacy outreach closed and campaign limits unchanged', () => {
  // Campaign availability was explicitly approved. Legacy Business outreach
  // remains disabled. Recipient basis/identity/approval are independent server
  // gates, covered by the campaign API and preflight regression tests.
  const declared = declaredVars();
  assert.equal(declared.get('LEAD_RADAR_CONTACT_ENABLED'), 'false');
  assert.equal(declared.get('LEAD_RADAR_TELEGRAM_CAMPAIGN_DAILY_LIMIT'), '30');
  assert.equal(declared.get('LEAD_RADAR_TELEGRAM_CAMPAIGN_MIN_INTERVAL_SECONDS'), '120');
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
