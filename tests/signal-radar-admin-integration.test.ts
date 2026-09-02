// Signal Radar ↔ admin shell integration (Ф1 navigation + Ф2 cockpit).
//
// These guard the wiring, not the radar engine itself: the cockpit section
// must never fake a zero, the Next Best Actions queue must surface hot demand
// above routine work, and the sidebar must keep every existing test id while
// showing a live counter.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { buildNextBestActions, pluralRu, type NextBestAction } from '../src/shared/next-actions';
import type { BuildInput } from '../src/shared/next-actions';
import { loadSignalRadar } from '../functions/api/admin/cockpit';
import { Sidebar } from '../src/admin/components/Sidebar.tsx';

const ROOT = path.resolve(import.meta.dirname, '..');
(globalThis as typeof globalThis & { React: typeof React }).React = React;

const COCKPIT_API = readFileSync(path.join(ROOT, 'functions/api/admin/cockpit.ts'), 'utf8');
const COCKPIT_PAGE = readFileSync(path.join(ROOT, 'src/admin/pages/Cockpit.tsx'), 'utf8');
const COCKPIT_SHARED = readFileSync(path.join(ROOT, 'src/shared/cockpit.ts'), 'utf8');
const ADMIN_APP = readFileSync(path.join(ROOT, 'src/admin/AdminApp.tsx'), 'utf8');
const I18N = readFileSync(path.join(ROOT, 'src/admin/i18n/ru.ts'), 'utf8');

// ─────────────────────────────────────────────────────────────────────────────
// Ф2 — cockpit section loader
// ─────────────────────────────────────────────────────────────────────────────

// Minimal D1 stand-in: enough for `prepare().bind().first()` and `prepare().first()`.
function fakeDb(options: { tables?: string[]; rows?: Record<string, number>; throwOn?: string } = {}) {
  const tables = options.tables ?? [];
  const rows = options.rows ?? {};
  const counterFor = (sql: string): number => {
    if (sql.includes("state='new'")) return rows.leadsNew ?? 0;
    if (sql.includes("state='sent'")) return rows.leadsSent ?? 0;
    if (sql.includes("status='watching'")) return rows.watching ?? 0;
    return 0;
  };
  return {
    prepare(sql: string) {
      if (options.throwOn && sql.includes(options.throwOn)) {
        throw new Error('D1 offline');
      }
      return {
        sql,
        bind: () => ({ first: async () => ({ cnt: counterFor(sql) }) }),
        first: async () => {
          const hit = tables.find((t) => sql.includes(`'${t}'`));
          return hit ? { name: hit } : null;
        },
      };
    },
  };
}

function envWith(db: unknown, mode?: string) {
  return { GPTBOT_DRAFTS_DB: db, LEAD_RADAR_SIGNAL_AUTOJOIN_MODE: mode } as unknown as Parameters<typeof loadSignalRadar>[0];
}

test('cockpit reports the radar as not installed when the D1 binding is missing', async () => {
  const summary = await loadSignalRadar(envWith(undefined));
  assert.deepEqual(summary, { installed: false, mode: 'discover', leadsNew: 0, leadsSent: 0, watching: 0 });
});

test('cockpit reports the radar as not installed when migration 0057 is not applied', async () => {
  const summary = await loadSignalRadar(envWith(fakeDb({ tables: ['some_other_table'] })));
  assert.equal(summary.installed, false);
  assert.equal(summary.leadsNew, 0);
});

test('cockpit counts new leads, sent leads and watched targets for the owner org', async () => {
  const db = fakeDb({
    tables: ['lead_radar_signal_leads'],
    rows: { leadsNew: 3, leadsSent: 12, watching: 8 },
  });
  const summary = await loadSignalRadar(envWith(db, 'channels'));
  assert.deepEqual(summary, { installed: true, mode: 'channels', leadsNew: 3, leadsSent: 12, watching: 8 });
});

test('cockpit falls back to the discover mode when the env var is unset', async () => {
  const db = fakeDb({ tables: ['lead_radar_signal_leads'], rows: { leadsNew: 1 } });
  const summary = await loadSignalRadar(envWith(db, undefined));
  assert.equal(summary.installed, true);
  assert.equal(summary.mode, 'discover');
});

test('a real D1 failure propagates instead of faking "no demand"', async () => {
  const db = fakeDb({ tables: ['lead_radar_signal_leads'], throwOn: 'lead_radar_signal_targets' });
  await assert.rejects(() => loadSignalRadar(envWith(db)), /D1 offline/);
});

test('the signal section is isolated inside its own timeit and lands in sectionsFailed', () => {
  assert.match(COCKPIT_API, /signal: Section<SignalRadarSummary>/);
  assert.match(COCKPIT_API, /timeit\(\(\) => loadSignalRadar\(env\)\)/);
  assert.match(COCKPIT_API, /\.\.\.\(signal\.ok \? \[\] : \['signal'\]\)/);
  assert.match(COCKPIT_API, /signal,/);
});

test('the shared cockpit contract carries the signal section and the SPA reads it', () => {
  assert.match(COCKPIT_SHARED, /export interface CockpitSignalRadar/);
  assert.match(COCKPIT_SHARED, /signal: CockpitSection<CockpitSignalRadar>/);
  assert.match(COCKPIT_PAGE, /data\?\.signal/);
  assert.match(COCKPIT_PAGE, /cockpit-signal-panel/);
});

// ─────────────────────────────────────────────────────────────────────────────
// Ф2 — Next Best Actions
// ─────────────────────────────────────────────────────────────────────────────

function baseInput(overrides: Partial<BuildInput> = {}): BuildInput {
  return {
    audit: null,
    content: null,
    drafts: null,
    autopilot: null,
    health: null,
    sectionsFailed: [],
    signal: null,
    ...overrides,
  };
}

function radarActions(actions: NextBestAction[]): NextBestAction[] {
  return actions.filter((a) => a.category === 'radar');
}

test('hot demand produces a radar action that leads the queue', () => {
  const actions = buildNextBestActions(baseInput({
    signal: { installed: true, leadsNew: 3 },
    drafts: { pending_review: 5, needs_revision: 0, last_pending_id: 'd1', last_pending_admin_url: null, last_pending_title: null },
  }));
  const radar = radarActions(actions);
  assert.equal(radar.length, 1);
  assert.equal(radar[0].weight, 900);
  assert.equal(radar[0].risk, 'high');
  assert.equal(radar[0].action_path, '/admin-tools/signal-radar');
  assert.match(radar[0].title, /^3 заявки из Telegram/);
  // Demand outranks the drafts queue (820).
  assert.equal(actions[0].category, 'radar');
});

test('the radar action agrees the noun and the verb with the count', () => {
  const golden: Array<[number, string]> = [
    [1, '1 заявка из Telegram ждёт ответа'],
    [2, '2 заявки из Telegram ждут ответа'],
    [5, '5 заявок из Telegram ждут ответа'],
    [11, '11 заявок из Telegram ждут ответа'],
    [21, '21 заявка из Telegram ждёт ответа'],
    [111, '111 заявок из Telegram ждут ответа'],
    [114, '114 заявок из Telegram ждут ответа'],
  ];
  for (const [n, expected] of golden) {
    const [action] = radarActions(buildNextBestActions(baseInput({ signal: { installed: true, leadsNew: n } })));
    assert.equal(action.title, expected, `n=${n}`);
  }
});

test('pluralRu picks the one/few/many form by Russian rules', () => {
  const forms = ['черновик', 'черновика', 'черновиков'] as const;
  const table: Array<[number, string]> = [
    [1, 'черновик'], [2, 'черновика'], [4, 'черновика'], [5, 'черновиков'],
    [11, 'черновиков'], [14, 'черновиков'], [21, 'черновик'], [22, 'черновика'],
    [25, 'черновиков'], [101, 'черновик'], [111, 'черновиков'], [114, 'черновиков'],
    [0, 'черновиков'],
  ];
  for (const [n, expected] of table) {
    assert.equal(pluralRu(n, forms), expected, `n=${n}`);
  }
});

// Regression lock: the shipped `plural()` helper appended one masculine suffix
// to every stem, producing «5 страницов», «3 пара», «1 паров» in the cockpit.
test('no generated action title ever carries a broken plural or verb agreement', () => {
  const BROKEN = ['страницов', 'паров', 'заявков', 'черновиков ожидает', 'черновика ожидает'];
  for (let n = 0; n <= 30; n += 1) {
    const actions = buildNextBestActions(baseInput({
      audit: {
        orphanPages: n, missingFaq: n, missingCanonical: n, ruUzPairsMissing: n,
        mojibakePages: n, brokenInternalLinks: n, duplicateTitle: n, missingTitle: n,
      },
      drafts: { pending_review: n, needs_revision: n, last_pending_id: 'd', last_pending_admin_url: null, last_pending_title: null },
      signal: { installed: true, leadsNew: n },
    }));
    for (const a of actions) {
      for (const bad of BROKEN) {
        assert.doesNotMatch(a.title, new RegExp(bad.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `n=${n}: ${a.title}`);
      }
    }
  }
});

test('audit and draft titles agree with the count across the whole 1..25 range', () => {
  const golden: Array<[number, Record<string, string>]> = [
    [1, { orphans: '1 страница без входящих ссылок', pairs: '1 пара RU↔UZ не комплектна', pending: '1 AI-черновик ожидает вашей проверки' }],
    [2, { orphans: '2 страницы без входящих ссылок', pairs: '2 пары RU↔UZ не комплектны', pending: '2 AI-черновика ожидают вашей проверки' }],
    [5, { orphans: '5 страниц без входящих ссылок', pairs: '5 пар RU↔UZ не комплектны', pending: '5 AI-черновиков ожидают вашей проверки' }],
    [11, { orphans: '11 страниц без входящих ссылок', pairs: '11 пар RU↔UZ не комплектны', pending: '11 AI-черновиков ожидают вашей проверки' }],
    [21, { orphans: '21 страница без входящих ссылок', pairs: '21 пара RU↔UZ не комплектна', pending: '21 AI-черновик ожидает вашей проверки' }],
  ];
  for (const [n, expected] of golden) {
    const actions = buildNextBestActions(baseInput({
      audit: { orphanPages: n, ruUzPairsMissing: n },
      drafts: { pending_review: n, needs_revision: 0, last_pending_id: 'd', last_pending_admin_url: null, last_pending_title: null },
    }));
    const byId = new Map(actions.map((a) => [a.id, a.title]));
    assert.equal(byId.get(`audit-orphans`), expected.orphans, `orphans n=${n}`);
    assert.equal(byId.get(`audit-hreflang-pairs`), expected.pairs, `pairs n=${n}`);
    assert.equal(byId.get(`drafts-pending-d`), expected.pending, `pending n=${n}`);
  }
});

test('no radar action when the module is not installed, has no new leads, or is unknown', () => {
  assert.deepEqual(radarActions(buildNextBestActions(baseInput({ signal: null }))), []);
  assert.deepEqual(radarActions(buildNextBestActions(baseInput({ signal: { installed: false, leadsNew: 0 } }))), []);
  // installed:false with a stale count must stay silent — the radar is not live.
  assert.deepEqual(radarActions(buildNextBestActions(baseInput({ signal: { installed: false, leadsNew: 7 } }))), []);
  assert.deepEqual(radarActions(buildNextBestActions(baseInput({ signal: { installed: true, leadsNew: 0 } }))), []);
});

// ─────────────────────────────────────────────────────────────────────────────
// Ф1 — sidebar navigation
// ─────────────────────────────────────────────────────────────────────────────

const NAV_TEST_IDS = [
  'nav-cockpit', 'nav-lead-radar', 'nav-signal-radar', 'nav-owner-center',
  'nav-pages', 'nav-blog', 'nav-ai-drafts', 'nav-seo-autopilot',
  'nav-internal-links', 'nav-seo-booster', 'nav-indexnow', 'nav-redirects', 'nav-settings',
];

function renderSidebar(props: { role?: string; signalBadge?: number } = {}): string {
  return renderToStaticMarkup(
    React.createElement(MemoryRouter, { initialEntries: ['/admin-tools/'] },
      React.createElement(Sidebar, props)),
  );
}

test('the sidebar keeps every navigation test id after the regroup', () => {
  const markup = renderSidebar();
  for (const id of NAV_TEST_IDS) {
    assert.match(markup, new RegExp(`data-testid="${id}"`), id);
  }
});

test('the sidebar renders the five group headings', () => {
  const markup = renderSidebar();
  for (const title of ['Обзор', 'Радары', 'Платформа', 'Контент', 'SEO']) {
    assert.match(markup, new RegExp(`>${title}<`), title);
  }
});

test('the signal badge shows the exact count, is capped at 9+, and hides at zero', () => {
  assert.match(renderSidebar({ signalBadge: 3 }), /bg-red-500[^>]*>3</);
  assert.match(renderSidebar({ signalBadge: 12 }), /bg-red-500[^>]*>9\+</);
  assert.doesNotMatch(renderSidebar({ signalBadge: 0 }), /bg-red-500/);
  assert.doesNotMatch(renderSidebar({}), /bg-red-500/);
});

test('the badge never renders on a nav item other than Signal Radar', () => {
  const markup = renderSidebar({ signalBadge: 5 });
  const badgeIndex = markup.indexOf('bg-red-500');
  const signalIndex = markup.indexOf('data-testid="nav-signal-radar"');
  assert.ok(badgeIndex > signalIndex, 'badge must sit inside the signal radar link');
  // Only one badge total.
  assert.equal(markup.split('bg-red-500').length - 1, 1);
});

test('support_readonly keeps only the owner centre and no badge', () => {
  const markup = renderSidebar({ role: 'support_readonly', signalBadge: 4 });
  assert.match(markup, /data-testid="nav-owner-center"/);
  for (const id of NAV_TEST_IDS.filter((x) => x !== 'nav-owner-center')) {
    assert.doesNotMatch(markup, new RegExp(`data-testid="${id}"`), id);
  }
  assert.doesNotMatch(markup, /bg-red-500/);
});

test('the shell polls the radar overview and skips it for support_readonly', () => {
  assert.match(ADMIN_APP, /signalRadarOverview\(\)/);
  assert.match(ADMIN_APP, /signalBadge=\{signalBadge\}/);
  assert.match(ADMIN_APP, /session\?\.role === 'support_readonly'/);
});

test('every new sidebar and cockpit string lives in the ru dictionary', () => {
  for (const key of ['group_overview', 'group_radars', 'group_platform', 'group_content', 'group_seo']) {
    assert.match(I18N, new RegExp(`${key}:`), key);
  }
  for (const key of ['title', 'new_leads', 'watching', 'mode', 'open_radar', 'empty', 'not_installed', 'install_hint']) {
    assert.match(I18N, new RegExp(`${key}:\\s*'[^']+'`), key);
  }
});

test('the cockpit never links the radar KPI to a foreign origin', () => {
  assert.doesNotMatch(COCKPIT_PAGE, /signal-radar["'`]\s*,?\s*\n?\s*[^/]*https?:\/\//);
});

// ─────────────────────────────────────────────────────────────────────────────
// Ф6 — reachability: a count the operator cannot open is not a feature
//
// Production note that produced this block: the page said "1 заявка" on a
// tile, buried that one заявка under a tall setup panel and a 40-row source
// table, and the first question back was "а как мне её посмотреть?".
// ─────────────────────────────────────────────────────────────────────────────

const SIGNAL_PAGE = readFileSync(path.join(ROOT, 'src/admin/pages/SignalRadar.tsx'), 'utf8');
const UI_SOURCE = readFileSync(path.join(ROOT, 'src/admin/components/ui.tsx'), 'utf8');

test('the inbox is rendered above the controls, not below them', () => {
  const inbox = SIGNAL_PAGE.indexOf('<LeadInbox');
  const controls = SIGNAL_PAGE.indexOf('<ControlCard');
  assert.ok(inbox > 0, 'the inbox must be rendered');
  assert.ok(controls > 0, 'the controls must be rendered');
  assert.ok(inbox < controls, 'the operator opens this page for leads, not for setup');
});

test('the sources table is behind a collapsed section', () => {
  const sources = SIGNAL_PAGE.indexOf('<TargetsCard');
  const collapsible = SIGNAL_PAGE.indexOf('signal-section-');
  assert.ok(sources > collapsible, 'the long source table must not sit open by default');
  assert.match(SIGNAL_PAGE, /defaultOpen\s*=\s*false/);
});

test('the lead-count tile is a shortcut to the inbox', () => {
  assert.match(SIGNAL_PAGE, /scrollToSection\(ANCHOR\.inbox\)/);
  assert.match(SIGNAL_PAGE, /scrollToSection\(ANCHOR\.sources\)/);
  assert.match(SIGNAL_PAGE, /id=\{ANCHOR\.inbox\}/);
  assert.match(UI_SOURCE, /onOpen\?: \(\) => void/);
  // The hint tells the operator what the number will do before they click.
  assert.match(SIGNAL_PAGE, /показать \$\{totals\.leadsNew\}/);
});

test('setup sections stay one click away rather than being deleted', () => {
  assert.match(SIGNAL_PAGE, /signal-section-\$\{title\.toLowerCase\(\)\}/);
  assert.match(SIGNAL_PAGE, /defaultOpen/);
});
