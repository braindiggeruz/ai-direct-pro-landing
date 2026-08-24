import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { resolve } from 'node:path';

import type {
  LeadRadarDecisionMaker,
  LeadRadarEvidence,
  LeadRadarSearchInput,
  LeadRadarTelegramContact,
} from '../src/shared/lead-radar';
import type { LeadRadarSource } from '../functions/platform/lead-radar';
import {
  classifyTelegramContact,
  ensureLeadRadarSchema,
  extractCompanyPageFacts,
  extractOfficialSiteContacts,
  LeadRadarService,
  LeadRadarStore,
  parseSearchInput,
  robotsAllows,
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

function personalTelegram(evidenceId: string): LeadRadarTelegramContact {
  return {
    url: 'https://t.me/aziza_karimova',
    username: 'aziza_karimova',
    type: 'human',
    confidence: 0.96,
    reason: 'Ссылка указана рядом с именем и ролью руководителя',
    evidenceIds: [evidenceId],
    verifiedAt: '2026-08-24T10:00:00.000Z',
    messageable: true,
  };
}

function decisionMaker(personEvidenceId: string, telegramEvidenceId: string): LeadRadarDecisionMaker {
  return {
    id: `dm-${personEvidenceId}`,
    name: 'Азиза Каримова',
    role: 'коммерческий директор',
    telegramUrl: 'https://t.me/aziza_karimova',
    telegramUsername: 'aziza_karimova',
    contactType: 'human',
    confidence: 0.96,
    evidenceIds: [personEvidenceId, telegramEvidenceId],
    sourceUrl: 'https://example.uz/team',
    evidence: 'Азиза Каримова — коммерческий директор',
    verifiedAt: '2026-08-24T10:00:00.000Z',
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
  assert.equal(safePublicHttpUrl('https://user:pass@example.uz/path'), null);
  assert.equal(safePublicHttpUrl('https://example.uz:8443/path'), null);
  assert.equal(safePublicHttpUrl('https://127.0.0.1.nip.io/path'), null);
  assert.equal(safePublicHttpUrl('https://localtest.me/path'), null);
});

test('robots policy honors the product group, path rules, and allow precedence', () => {
  const robots = `
    User-agent: *
    Disallow: /private/
    User-agent: GPTBot-Lead-Radar
    Disallow: /contact
    Allow: /contact/public$
  `;
  assert.equal(robotsAllows(robots, new URL('https://example.uz/contact')), false);
  assert.equal(robotsAllows(robots, new URL('https://example.uz/contact/public')), true);
  assert.equal(robotsAllows(robots, new URL('https://example.uz/about')), true);
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

test('Telegram classification never promotes bots, broadcasts, groups, or unknown handles into the human LPR queue', () => {
  const bot = classifyTelegramContact({
    username: 'aziza_sales_bot',
    context: 'Азиза Каримова — коммерческий директор. Написать в Telegram.',
    isOfficialCompanyPage: true,
    hasNamedDecisionMaker: true,
  });
  assert.equal(bot.type, 'bot');
  assert.equal(bot.messageable, false);

  const channel = classifyTelegramContact({
    username: 'clinic_news',
    context: 'Азиза Каримова — директор. Официальный Telegram-канал компании.',
    isOfficialCompanyPage: true,
    hasNamedDecisionMaker: true,
  });
  assert.equal(channel.type, 'channel');
  assert.equal(channel.messageable, false);

  const group = classifyTelegramContact({
    username: 'clinic_community',
    context: 'Азиза Каримова — директор. Открытая Telegram-группа и общий чат.',
    isOfficialCompanyPage: true,
    hasNamedDecisionMaker: true,
  });
  assert.equal(group.type, 'group');
  assert.equal(group.messageable, false);

  const business = classifyTelegramContact({
    username: 'example_clinic',
    context: 'Официальный Telegram компании Example Clinic.',
    isOfficialCompanyPage: true,
    hasNamedDecisionMaker: false,
  });
  assert.equal(business.type, 'business');
  assert.notEqual(business.type, 'human');
  assert.equal(business.messageable, false);

  const unknown = classifyTelegramContact({
    username: 'aziza_public',
    context: 'Telegram',
    isOfficialCompanyPage: false,
    hasNamedDecisionMaker: false,
  });
  assert.equal(unknown.type, 'unknown');
  assert.equal(unknown.messageable, false);

  const verifiedHumanQueue = [bot, channel, group, business, unknown]
    .filter((contact) => contact.type === 'human' && contact.messageable);
  assert.deepEqual(verifiedHumanQueue, []);
});

test('official-site named role plus a direct public Telegram profile is accepted conservatively', () => {
  const verifiedAt = '2026-08-24T10:00:00.000Z';
  const facts = extractOfficialSiteContacts(new URL('https://clinic.example.uz/team'), `
    <html><body>
      <section class="leadership-card">
        <h2>Руководство</h2>
        <p>Азиза Каримова — коммерческий директор</p>
        <a href="https://t.me/aziza_karimova">Личный Telegram Азизы Каримовой</a>
      </section>
    </body></html>
  `, verifiedAt);

  assert.equal(facts.telegramContact?.type, 'human');
  assert.equal(facts.telegramContact?.messageable, true);
  assert.equal(facts.telegramContact?.url, 'https://t.me/aziza_karimova');
  assert.equal(facts.telegramContact?.verifiedAt, verifiedAt);
  assert.ok((facts.telegramContact?.confidence ?? 0) >= 0.8);
  assert.ok((facts.telegramContact?.confidence ?? 1) < 1);
  assert.ok((facts.telegramContact?.evidenceIds.length ?? 0) > 0);

  const decisionMaker = facts.decisionMakers.find((item) => item.name === 'Азиза Каримова');
  assert.ok(decisionMaker);
  assert.equal(decisionMaker.role.toLocaleLowerCase('ru'), 'коммерческий директор');
  assert.equal(decisionMaker.contactType, 'human');
  assert.equal(decisionMaker.telegramUrl, 'https://t.me/aziza_karimova');
  assert.equal(decisionMaker.sourceUrl, 'https://clinic.example.uz/team');
  assert.equal(decisionMaker.verifiedAt, verifiedAt);
  assert.ok(decisionMaker.evidenceIds.length >= 2);
  assert.ok(decisionMaker.evidence.includes('Азиза Каримова'));
});

test('a Telegram bot beside a named role never enters the verified human LPR queue', () => {
  const facts = extractOfficialSiteContacts(new URL('https://clinic.example.uz/team'), `
    <html><body>
      <section>
        <p>Азиза Каримова — коммерческий директор</p>
        <a href="https://t.me/aziza_sales_bot">Записаться через Telegram-бота</a>
      </section>
    </body></html>
  `, '2026-08-24T10:00:00.000Z');

  assert.equal(facts.telegramContact?.type, 'bot');
  assert.equal(facts.telegramContact?.messageable, false);
  assert.equal(
    facts.decisionMakers.some((item) => item.contactType === 'human' && Boolean(item.telegramUrl)),
    false,
  );
});

test('telegram-required service queue persists no lead whose only Telegram endpoint is a bot', async () => {
  const fixture = new SqliteD1();
  const db = fixture.asD1();
  await ensureLeadRadarSchema(db);
  const source: LeadRadarSource = {
    id: 'bot-only-fixture',
    async discover() {
      const botEvidence = evidence('bot-only-telegram', 'web.telegram.bot', 0.99);
      return {
        sourceWarnings: [],
        candidates: [{
          sourceId: 'bot-only-company',
          sourceUrl: 'https://example.uz/team',
          name: 'Example Clinic',
          category: 'Стоматология',
          city: 'Ташкент',
          country: 'UZ',
          address: 'Ташкент',
          website: 'https://example.uz',
          phone: '+998901234567',
          genericEmail: 'info@example.uz',
          telegramUrl: 'https://t.me/aziza_sales_bot',
          telegramContact: {
            url: 'https://t.me/aziza_sales_bot',
            username: 'aziza_sales_bot',
            type: 'bot' as const,
            confidence: 0.99,
            reason: 'Лексические признаки Telegram-бота',
            evidenceIds: [botEvidence.id],
            verifiedAt: botEvidence.observedAt,
            messageable: false,
          },
          decisionMakers: [{
            ...decisionMaker('bot-only-person', botEvidence.id),
            telegramUrl: 'https://t.me/aziza_sales_bot',
            telegramUsername: 'aziza_sales_bot',
            contactType: 'bot' as const,
          }],
          evidence: [
            evidence('bot-only-company-name', 'company.name'),
            evidence('bot-only-person', 'decision_makers.named_role'),
            botEvidence,
          ],
          signals: [],
        }],
      };
    },
  };

  const result = await new LeadRadarService(new LeadRadarStore(db), [source]).run('org-a', {
    ...SEARCH_INPUT,
    desiredCount: 5,
    telegramRequired: true,
  });
  assert.equal(result.search.verifiedCount, 0);
  assert.equal(result.search.telegramCount, 0);
  assert.deepEqual(result.leads, []);
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
    telegramUrl: 'https://t.me/example_clinic', telegramContact: null,
    decisionMakers: [], category: 'Стоматология',
  });
  assert.notEqual(withoutIntent.priority, 'P1');

  const withIntent = scoreLead({
    evidence: allEvidence,
    signals: [
      { type: 'online_booking', label: 'онлайн-запись', classification: 'fact', evidenceIds: ['e6'], observedAt: allEvidence[0].observedAt },
      { type: 'new_branch', label: 'новый филиал', classification: 'fact', evidenceIds: ['e7'], observedAt: allEvidence[0].observedAt },
    ],
    website: 'https://example.uz', phone: '+998901234567', genericEmail: null,
    telegramUrl: 'https://t.me/example_clinic', telegramContact: null,
    decisionMakers: [], category: 'Стоматология',
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
  const telegramEvidenceId = 'tenant-telegram';
  const personEvidenceId = 'tenant-decision-maker';
  const leadId = await store.insertLead('org-a', searchId, {
    canonicalKey: 'domain:example.uz',
    name: 'Example Clinic', category: 'Стоматология', city: 'Ташкент', country: 'UZ',
    address: 'Ташкент', website: 'https://example.uz', phone: '+998901234567',
    genericEmail: 'info@example.uz', telegramUrl: 'https://t.me/aziza_karimova',
    telegramContact: personalTelegram(telegramEvidenceId),
    decisionMakers: [decisionMaker(personEvidenceId, telegramEvidenceId)],
    score: 84, confidence: 0.91, priority: 'P1', lifecycle: 'new', suppressed: false,
    scoreComponents: [], signals: [], evidence: [
      evidence('tenant-evidence', 'company.name'),
      evidence(personEvidenceId, 'decision_makers.named_role'),
      evidence(telegramEvidenceId, 'web.telegram.human'),
    ],
    discoveredAt: '2026-08-24T10:00:00.000Z', lastVerifiedAt: '2026-08-24T10:00:00.000Z',
  });

  assert.equal(await store.getSearch('org-b', searchId), null);
  assert.equal(await store.updateLifecycle('org-b', leadId, 'won', '2026-08-24T11:00:00.000Z'), false);
  const own = await store.getSearch('org-a', searchId);
  assert.equal(own?.leads[0]?.lifecycle, 'new');
  assert.equal(own?.leads[0]?.telegramContact?.type, 'human');
  assert.equal(own?.leads[0]?.decisionMakers[0]?.name, 'Азиза Каримова');
  assert.equal((await store.listOverview('org-a')).totals.telegram, 1);
  assert.equal((await store.listOverview('org-b')).totals.telegram, 0);
  assert.equal(await store.updateLifecycle('org-a', leadId, 'qualified', '2026-08-24T11:00:00.000Z'), true);
  assert.equal((await store.getSearch('org-a', searchId))?.leads[0]?.lifecycle, 'qualified');
});

test('do-not-contact suppresses duplicate history and future inserts within one tenant', async () => {
  const fixture = new SqliteD1();
  const db = fixture.asD1();
  await ensureLeadRadarSchema(db);
  const store = new LeadRadarStore(db);
  const firstSearch = await store.createSearch('org-a', SEARCH_INPUT, '2026-08-24T10:00:00.000Z');
  const secondSearch = await store.createSearch('org-a', SEARCH_INPUT, '2026-08-24T10:01:00.000Z');
  const sparseSearch = await store.createSearch('org-a', SEARCH_INPUT, '2026-08-24T10:01:30.000Z');
  const otherSearch = await store.createSearch('org-b', SEARCH_INPUT, '2026-08-24T10:02:00.000Z');
  const makeLead = (evidenceId: string) => {
    const personEvidenceId = `${evidenceId}-person`;
    const telegramEvidenceId = `${evidenceId}-telegram`;
    return {
      canonicalKey: 'domain:example.uz',
      name: 'Example Clinic', category: 'Стоматология', city: 'Ташкент', country: 'UZ',
      address: 'Ташкент', website: 'https://example.uz', phone: '+998901234567',
      genericEmail: 'info@example.uz', telegramUrl: 'https://t.me/aziza_karimova',
      telegramContact: personalTelegram(telegramEvidenceId),
      decisionMakers: [decisionMaker(personEvidenceId, telegramEvidenceId)],
      score: 84, confidence: 0.91, priority: 'P1' as const, lifecycle: 'new' as const, suppressed: false,
      scoreComponents: [], signals: [], evidence: [
        evidence(evidenceId, 'company.name'),
        evidence(personEvidenceId, 'decision_makers.named_role'),
        evidence(telegramEvidenceId, 'web.telegram.human'),
      ],
      discoveredAt: '2026-08-24T10:00:00.000Z', lastVerifiedAt: '2026-08-24T10:00:00.000Z',
    };
  };
  const firstLead = await store.insertLead('org-a', firstSearch, makeLead('dnc-first'));
  assert.ok(firstLead);
  assert.ok(await store.insertLead('org-a', secondSearch, makeLead('dnc-second')));
  assert.ok(await store.insertLead('org-b', otherSearch, makeLead('dnc-other')));
  const sparseLead = await store.insertLead('org-a', sparseSearch, {
    ...makeLead('dnc-sparse'),
    name: 'Example Clinic Rebrand',
    website: null,
    phone: null,
    genericEmail: null,
    telegramUrl: null,
    telegramContact: null,
    decisionMakers: [],
  });
  assert.ok(sparseLead);

  assert.equal(await store.updateLifecycle('org-a', firstLead, 'do_not_contact', '2026-08-24T11:00:00.000Z'), true);
  const originalSuppression = (await store.listSuppressions('org-a'))[0];
  assert.deepEqual(originalSuppression, {
    canonicalKey: 'domain:example.uz',
    domain: 'example.uz',
    phoneDigits: '998901234567',
    nameCityKey: 'example-clinic:ташкент',
  });
  const historicalDuplicate = (await store.getSearch('org-a', secondSearch))?.leads[0];
  assert.equal(historicalDuplicate?.suppressed, true);
  assert.equal(historicalDuplicate?.telegramUrl, null);
  assert.equal(historicalDuplicate?.telegramContact, null);
  assert.deepEqual(historicalDuplicate?.decisionMakers, []);
  assert.equal(historicalDuplicate?.phone, null);
  assert.equal(
    historicalDuplicate?.evidence.some((item) => (
      item.fieldPath.startsWith('web.telegram') || item.fieldPath.startsWith('decision_makers')
    )),
    false,
  );
  assert.equal(await store.updateLifecycle('org-a', historicalDuplicate?.id ?? '', 'qualified', '2026-08-24T11:01:00.000Z'), false);
  const otherTenantLead = (await store.getSearch('org-b', otherSearch))?.leads[0];
  assert.equal(otherTenantLead?.suppressed, false);
  assert.equal(otherTenantLead?.telegramContact?.type, 'human');
  assert.equal(otherTenantLead?.decisionMakers.length, 1);
  assert.deepEqual(await store.listSuppressions('org-b'), []);

  assert.equal(await store.updateLifecycle('org-a', sparseLead, 'do_not_contact', '2026-08-24T11:01:30.000Z'), true);
  assert.deepEqual((await store.listSuppressions('org-a'))[0], originalSuppression);

  const futureSearch = await store.createSearch('org-a', SEARCH_INPUT, '2026-08-24T11:02:00.000Z');
  assert.equal(await store.insertLead('org-a', futureSearch, makeLead('dnc-future')), null);
});

test('search lease is exclusive and only its owner can release it', async () => {
  const fixture = new SqliteD1();
  const db = fixture.asD1();
  await ensureLeadRadarSchema(db);
  const store = new LeadRadarStore(db);
  const first = await store.acquireSearchLease(
    'org-a', 'lease-a', '2026-08-24T10:00:00.000Z',
    '2026-08-24T10:03:00.000Z', '2026-08-24T10:00:00.000Z',
  );
  assert.equal(first.acquired, true);
  const blocked = await store.acquireSearchLease(
    'org-a', 'lease-b', '2026-08-24T10:00:10.000Z',
    '2026-08-24T10:03:10.000Z', '2026-08-24T10:00:10.000Z',
  );
  assert.equal(blocked.acquired, false);
  assert.equal(blocked.retryAfterSeconds, 170);
  await store.releaseSearchLease('org-a', 'wrong-lease', '2026-08-24T10:00:11.000Z', '2026-08-24T10:00:14.000Z');
  assert.equal((await store.acquireSearchLease(
    'org-a', 'lease-c', '2026-08-24T10:00:12.000Z',
    '2026-08-24T10:03:12.000Z', '2026-08-24T10:00:12.000Z',
  )).acquired, false);
  await store.releaseSearchLease('org-a', 'lease-a', '2026-08-24T10:00:13.000Z', '2026-08-24T10:00:16.000Z');
  assert.equal((await store.acquireSearchLease(
    'org-a', 'lease-d', '2026-08-24T10:00:16.000Z',
    '2026-08-24T10:03:16.000Z', '2026-08-24T10:00:16.000Z',
  )).acquired, true);
});

test('production migration creates every Lead Radar table and index', () => {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  sqlite.exec(readFileSync(resolve(import.meta.dirname, '../migrations/0036_lead_radar.sql'), 'utf8'));
  sqlite.exec(readFileSync(resolve(import.meta.dirname, '../migrations/0041_lead_radar_search_leases.sql'), 'utf8'));
  sqlite.exec(`INSERT INTO lead_radar_searches (
    id, org_id, input_json, status, candidate_count, verified_count,
    p1_count, p2_count, p3_count, telegram_count, error_code, created_at, completed_at
  ) VALUES (
    'legacy-search', 'org-a', '{}', 'ready', 3, 3,
    0, 0, 3, 3, NULL, '2026-08-20T10:00:00.000Z', '2026-08-20T10:01:00.000Z'
  )`);
  sqlite.exec(readFileSync(resolve(import.meta.dirname, '../migrations/0042_lead_radar_decision_makers.sql'), 'utf8'));

  const tables = sqlite.prepare(`SELECT name FROM sqlite_master
    WHERE type = 'table' AND name LIKE 'lead_radar_%' ORDER BY name`).all()
    .map((row) => String(row.name));
  assert.deepEqual(tables, [
    'lead_radar_companies',
    'lead_radar_evidence',
    'lead_radar_geocode_cache',
    'lead_radar_search_leases',
    'lead_radar_searches',
    'lead_radar_source_throttles',
    'lead_radar_suppressions',
  ]);

  const indexes = sqlite.prepare(`SELECT name FROM sqlite_master
    WHERE type = 'index' AND name LIKE 'idx_lead_radar_%' ORDER BY name`).all();
  assert.equal(indexes.length, 10);

  const companyColumns = sqlite.prepare('PRAGMA table_info(lead_radar_companies)').all()
    .map((row) => String(row.name));
  assert.ok(companyColumns.includes('telegram_contact_json'));
  assert.ok(companyColumns.includes('decision_makers_json'));
  assert.equal(
    sqlite.prepare("SELECT telegram_count FROM lead_radar_searches WHERE id = 'legacy-search'").get()?.telegram_count,
    0,
  );
});
