import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { resolve } from 'node:path';

import type { LeadRadarEvidence, LeadRadarSearchInput } from '../src/shared/lead-radar';
import {
  ensureLeadRadarSchema,
  extractCompanyPageFacts,
  LeadRadarStore,
  parseSearchInput,
  safePublicHttpUrl,
  scoreLead,
} from '../functions/platform/lead-radar';

function sqliteValue(value: unknown): SQLInputValue {
  if (
    value === null
    || typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'bigint'
    || value instanceof Uint8Array
  ) return value;
  throw new Error('unsupported sqlite fixture value');
}

class SqliteD1Statement {
  private bindings: SQLInputValue[] = [];

  constructor(private readonly sqlite: DatabaseSync, readonly sql: string) {}

  bind(...values: unknown[]): SqliteD1Statement {
    this.bindings = values.map(sqliteValue);
    return this;
  }

  runSync(): D1Result<unknown> {
    const result = this.sqlite.prepare(this.sql).run(...this.bindings);
    return { success: true, results: [], meta: { changes: Number(result.changes) } } as unknown as D1Result<unknown>;
  }

  async run(): Promise<D1Result<unknown>> { return this.runSync(); }

  async first<T>(): Promise<T | null> {
    return (this.sqlite.prepare(this.sql).get(...this.bindings) ?? null) as T | null;
  }

  async all<T>(): Promise<D1Result<T>> {
    return {
      success: true,
      results: this.sqlite.prepare(this.sql).all(...this.bindings) as T[],
      meta: { changes: 0 },
    } as unknown as D1Result<T>;
  }
}

class SqliteD1 {
  private readonly sqlite = new DatabaseSync(':memory:');

  constructor() { this.sqlite.exec('PRAGMA foreign_keys = ON'); }

  prepare(sql: string): SqliteD1Statement { return new SqliteD1Statement(this.sqlite, sql); }

  async batch(statements: readonly D1PreparedStatement[]): Promise<D1Result<unknown>[]> {
    this.sqlite.exec('BEGIN IMMEDIATE');
    try {
      const results = statements.map((statement) => {
        if (!(statement instanceof SqliteD1Statement)) throw new Error('foreign statement');
        return statement.runSync();
      });
      this.sqlite.exec('COMMIT');
      return results;
    } catch (error) {
      this.sqlite.exec('ROLLBACK');
      throw error;
    }
  }

  asD1(): D1Database { return this as unknown as D1Database; }
}

const SEARCH_INPUT: LeadRadarSearchInput = {
  niche: 'Стоматологии',
  city: 'Ташкент',
  country: 'UZ',
  offer: 'AI-бот для заявок',
  desiredCount: 20,
  telegramRequired: false,
  languages: ['ru', 'uz'],
};

function evidence(id: string, fieldPath: string, confidence = 0.94): LeadRadarEvidence {
  return {
    id,
    fieldPath,
    value: `${fieldPath}-value`,
    sourceUrl: 'https://example.uz/contacts',
    sourceType: 'company_website',
    observedAt: '2026-08-24T10:00:00.000Z',
    confidence,
    classification: 'fact',
  };
}

test('search input is bounded and language allowlisted', () => {
  const parsed = parseSearchInput({ ...SEARCH_INPUT, languages: ['ru', 'uz', 'bad', 'ru'] });
  assert.deepEqual(parsed.languages, ['ru', 'uz']);
  assert.throws(() => parseSearchInput({ ...SEARCH_INPUT, desiredCount: 500 }), /invalid_desired_count/);
  assert.throws(() => parseSearchInput({ ...SEARCH_INPUT, languages: [] }), /invalid_languages/);
});

test('website fetch allowlist blocks local and private network targets', () => {
  assert.equal(safePublicHttpUrl('https://example.uz/contact')?.hostname, 'example.uz');
  assert.equal(safePublicHttpUrl('http://127.0.0.1/admin'), null);
  assert.equal(safePublicHttpUrl('http://192.168.1.5/secret'), null);
  assert.equal(safePublicHttpUrl('file:///etc/passwd'), null);
  assert.equal(safePublicHttpUrl('https://service.local/path'), null);
});

test('company website extraction keeps generic contacts and evidence-backed signals', () => {
  const facts = extractCompanyPageFacts(new URL('https://clinic.example.uz/contacts'), `
    <html><body>
      <a href="https://t.me/example_clinic">Telegram</a>
      <p>Онлайн-запись и форма заявки</p>
      <p>Телефон: +998 90 123 45 67</p>
      <p>Почта: info@clinic.example.uz</p>
      <p>Иван: ivan@clinic.example.uz</p>
      <p>Открыли новый филиал</p>
    </body></html>
  `);
  assert.equal(facts.telegramUrl, 'https://t.me/example_clinic');
  assert.equal(facts.phone, '+998901234567');
  assert.equal(facts.genericEmail, 'info@clinic.example.uz');
  assert.ok(facts.signals.some((signal) => signal.type === 'online_booking'));
  assert.ok(facts.signals.some((signal) => signal.type === 'new_branch'));
  assert.equal(facts.evidence.some((item) => item.value.includes('ivan@')), false);
});

test('P1 requires both strong evidence and an active intent signal', () => {
  const allEvidence = [
    evidence('e1', 'company.category'),
    evidence('e2', 'locations.city'),
    evidence('e3', 'web.website'),
    evidence('e4', 'web.telegram'),
    evidence('e5', 'company_contacts.phone'),
    evidence('e6', 'signals.online_booking'),
    evidence('e7', 'signals.new_branch'),
  ];
  const withoutIntent = scoreLead({
    evidence: allEvidence,
    signals: [{ type: 'online_booking', label: 'онлайн-запись', classification: 'fact', evidenceIds: ['e6'], observedAt: allEvidence[0].observedAt }],
    website: 'https://example.uz', phone: '+998901234567', genericEmail: null,
    telegramUrl: 'https://t.me/example_clinic', category: 'Стоматология',
  });
  assert.notEqual(withoutIntent.priority, 'P1');

  const withIntent = scoreLead({
    evidence: allEvidence,
    signals: [
      { type: 'online_booking', label: 'онлайн-запись', classification: 'fact', evidenceIds: ['e6'], observedAt: allEvidence[0].observedAt },
      { type: 'new_branch', label: 'новый филиал', classification: 'fact', evidenceIds: ['e7'], observedAt: allEvidence[0].observedAt },
    ],
    website: 'https://example.uz', phone: '+998901234567', genericEmail: null,
    telegramUrl: 'https://t.me/example_clinic', category: 'Стоматология',
  });
  assert.equal(withIntent.priority, 'P1');
  assert.ok(withIntent.confidence >= 0.8);
});

test('store enforces tenant isolation on reads and lifecycle mutations', async () => {
  const fixture = new SqliteD1();
  const db = fixture.asD1();
  await ensureLeadRadarSchema(db);
  const store = new LeadRadarStore(db);
  const searchId = await store.createSearch('org-a', SEARCH_INPUT, '2026-08-24T10:00:00.000Z');
  const leadId = await store.insertLead('org-a', searchId, {
    canonicalKey: 'domain:example.uz',
    name: 'Example Clinic', category: 'Стоматология', city: 'Ташкент', country: 'UZ',
    address: 'Ташкент', website: 'https://example.uz', phone: '+998901234567',
    genericEmail: 'info@example.uz', telegramUrl: 'https://t.me/example_clinic',
    score: 84, confidence: 0.91, priority: 'P1', lifecycle: 'new', suppressed: false,
    scoreComponents: [], signals: [], evidence: [evidence('tenant-evidence', 'company.name')],
    discoveredAt: '2026-08-24T10:00:00.000Z', lastVerifiedAt: '2026-08-24T10:00:00.000Z',
  });

  assert.equal(await store.getSearch('org-b', searchId), null);
  assert.equal(await store.updateLifecycle('org-b', leadId, 'won', '2026-08-24T11:00:00.000Z'), false);
  const own = await store.getSearch('org-a', searchId);
  assert.equal(own?.leads[0]?.lifecycle, 'new');
  assert.equal(await store.updateLifecycle('org-a', leadId, 'qualified', '2026-08-24T11:00:00.000Z'), true);
  assert.equal((await store.getSearch('org-a', searchId))?.leads[0]?.lifecycle, 'qualified');
});

test('production migration creates every Lead Radar table and index', () => {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  sqlite.exec(readFileSync(resolve(import.meta.dirname, '../migrations/0036_lead_radar.sql'), 'utf8'));

  const tables = sqlite.prepare(`SELECT name FROM sqlite_master
    WHERE type = 'table' AND name LIKE 'lead_radar_%' ORDER BY name`).all()
    .map((row) => String(row.name));
  assert.deepEqual(tables, [
    'lead_radar_companies',
    'lead_radar_evidence',
    'lead_radar_searches',
  ]);

  const indexes = sqlite.prepare(`SELECT name FROM sqlite_master
    WHERE type = 'index' AND name LIKE 'idx_lead_radar_%' ORDER BY name`).all();
  assert.equal(indexes.length, 4);
});
