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
  buildLeadRadarQueryPlan,
  candidateFromOsmElement,
  extractCompanyPageFacts,
  extractOfficialSiteContacts,
  consumeLeadRadarQueueMessage,
  enqueueLeadRadarSearch,
  LeadRadarService,
  LeadRadarBusyError,
  LeadRadarStore,
  parseSearchInput,
  robotsAllows,
  safePublicHttpUrl,
  scoreLead,
  verifyCompanyWebsiteBinding,
  type LeadRadarQueueMessage,
  type LeadRadarQueueSender,
  type SourceCandidate,
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

  constructor() {
    this.sqlite.exec('PRAGMA foreign_keys = ON');
    for (const migration of [
      '0036_lead_radar.sql',
      '0041_lead_radar_search_leases.sql',
      '0042_lead_radar_decision_makers.sql',
      '0043_lead_radar_async_funnel.sql',
      '0044_lead_radar_telegram_business.sql',
    ]) {
      this.sqlite.exec(readFileSync(resolve(import.meta.dirname, `../migrations/${migration}`), 'utf8'));
    }
  }

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

class MemoryLeadRadarQueue implements LeadRadarQueueSender {
  readonly messages: LeadRadarQueueMessage[] = [];

  async send(message: LeadRadarQueueMessage): Promise<void> {
    this.messages.push(structuredClone(message));
  }

  async sendBatch(messages: Array<{ body: LeadRadarQueueMessage }>): Promise<void> {
    for (const message of messages) this.messages.push(structuredClone(message.body));
  }
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
    sourceClaim: 'official_site_proximity',
    contactReviewStatus: 'approved',
    contactReviewedAt: '2026-08-24T10:05:00.000Z',
  };
}

function sourceCandidate(overrides: Partial<SourceCandidate> = {}): SourceCandidate {
  return {
    sourceId: 'osm-node-1',
    sourceUrl: 'https://www.openstreetmap.org/node/1',
    name: 'Example Clinic',
    category: 'Стоматология',
    city: 'Ташкент',
    country: 'UZ',
    address: 'Ташкент',
    website: null,
    phone: null,
    genericEmail: null,
    telegramUrl: null,
    telegramContact: null,
    decisionMakers: [],
    enrichmentStatus: 'terminal',
    enrichmentReason: 'no_website',
    enrichmentAttempts: 0,
    evidence: [evidence('async-company', 'company.name')],
    signals: [],
    ...overrides,
  };
}

test('search input is bounded and language allowlisted', () => {
  const parsed = parseSearchInput({ ...SEARCH_INPUT, languages: ['ru', 'uz', 'bad', 'ru'] });
  assert.deepEqual(parsed.languages, ['ru', 'uz']);
  assert.throws(() => parseSearchInput({ ...SEARCH_INPUT, desiredCount: 500 }), /invalid_desired_count/);
  assert.throws(() => parseSearchInput({ ...SEARCH_INPUT, languages: [] }), /invalid_languages/);
});

test('OSM query planning is versioned, language-aware, and requests source metadata', () => {
  const plan = buildLeadRadarQueryPlan(
    { ...SEARCH_INPUT, niche: 'Сувениры', languages: ['uz', 'en'] },
    [41.1, 69.1, 41.4, 69.5],
  );
  assert.equal(plan.version, 'osm-overpass-v3');
  assert.deepEqual(plan.languageTags, ['name:uz', 'name:en']);
  assert.match(plan.query, /\["name:uz"~/);
  assert.match(plan.query, /\["name:en"~/);
  assert.match(plan.query, /out meta center/);
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

test('company website extraction keeps safe generic contacts and evidence-backed signals', () => {
  const facts = extractCompanyPageFacts(new URL('https://clinic.example.uz/contacts'), `
    <html><body>
      <a href="https://t.me/example_clinic">Telegram</a>
      <p>Онлайн-запись и форма заявки</p>
      <p>Телефон: +998 90 123 45 67</p>
      <p>Почта: info@clinic.example.uz</p>
      <p>Иван: ivan@clinic.example.uz</p>
      <p>Открыли новый филиал</p>
    </body></html>
  `, true, '2026-08-25T10:00:00.000Z');
  assert.equal(facts.telegramUrl, null);
  assert.ok(facts.evidence.some((item) => item.fieldPath === 'web.telegram.unknown'));
  assert.equal(facts.phone, '+998901234567');
  assert.equal(facts.genericEmail, 'info@clinic.example.uz');
  assert.ok(facts.signals.some((signal) => signal.type === 'online_booking'));
  assert.ok(facts.signals.some((signal) => signal.type === 'new_branch'));
  assert.equal(facts.signals.find((signal) => signal.type === 'new_branch')?.classification, 'model_inference');
  assert.equal(facts.evidence.some((item) => item.value.includes('ivan@')), false);
});

test('OpenStreetMap website and Telegram remain unverified candidates', () => {
  const candidate = candidateFromOsmElement({
    type: 'node',
    id: 42,
    tags: {
      name: 'Example Clinic',
      website: 'https://clinic.example.uz',
      telegram: '@example_clinic',
      'addr:city': 'Ташкент',
    },
  }, SEARCH_INPUT, 'Клиника');
  assert.ok(candidate);
  assert.equal(candidate?.telegramContact?.type, 'unknown');
  assert.equal(candidate?.telegramContact?.messageable, false);
  assert.equal(candidate?.telegramUrl, null);
  assert.ok(candidate?.evidence.some((item) => (
    item.fieldPath === 'web.website_candidate' && item.classification === 'model_inference'
  )));
  assert.ok(candidate?.evidence.some((item) => (
    item.fieldPath === 'web.telegram.unknown' && item.classification === 'model_inference'
  )));
});

test('OSM discovery separates requested geography from source facts and rejects inactive companies', () => {
  const contextOnly = candidateFromOsmElement({
    type: 'node',
    id: 43,
    lat: 41.311081,
    lon: 69.240562,
    timestamp: '2026-08-20T08:00:00Z',
    tags: { name: 'Context Only Clinic' },
  }, SEARCH_INPUT, 'Клиника');
  assert.ok(contextOnly);
  assert.equal(contextOnly?.evidence.some((item) => item.fieldPath === 'locations.city'), false);
  assert.ok(contextOnly?.evidence.some((item) => (
    item.fieldPath === 'search_context.requested_city' && item.classification === 'model_inference'
  )));
  assert.ok(contextOnly?.evidence.some((item) => (
    item.fieldPath === 'locations.coordinates' && item.classification === 'fact'
  )));

  const inactive = candidateFromOsmElement({
    type: 'way', id: 44, tags: { name: 'Closed Clinic', disused: 'yes' },
  }, SEARCH_INPUT, 'Клиника');
  assert.equal(inactive, null);
});

test('OSM name selection follows the requested language order', () => {
  const candidate = candidateFromOsmElement({
    type: 'node',
    id: 45,
    tags: { name: 'Default name', 'name:ru': 'Русское имя', 'name:uz': 'O‘zbekcha nom' },
  }, { ...SEARCH_INPUT, languages: ['uz', 'ru'] }, 'Клиника');
  assert.equal(candidate?.name, 'O‘zbekcha nom');
});

test('only a fresh explicitly dated high-intent page may contribute to P1', () => {
  const page = new URL('https://clinic.example.uz/news');
  const undated = extractCompanyPageFacts(
    page,
    '<html><body>Открыли новый филиал</body></html>',
    true,
    '2026-08-25T10:00:00.000Z',
  );
  assert.equal(undated.signals[0]?.classification, 'model_inference');

  const dated = extractCompanyPageFacts(
    page,
    '<html><head><meta property="article:published_time" content="2026-08-20T08:00:00Z"></head><body>Открыли новый филиал</body></html>',
    true,
    '2026-08-25T10:00:00.000Z',
  );
  assert.equal(dated.signals[0]?.classification, 'fact');
  assert.equal(dated.signals[0]?.observedAt, '2026-08-20T08:00:00.000Z');
});

test('a directory website must bind to the expected company before exposing a human LPR', () => {
  const pageUrl = new URL('https://wrong-site.example.uz/team');
  const html = `
    <html>
      <head><title>Other Medical Holdings</title><meta property="og:title" content="Other Medical Holdings"></head>
      <body>
        <div>Иван Иванов — генеральный директор
          <a href="https://t.me/ivan_director">Telegram</a>
        </div>
        <a href="tel:+998901112233">+998 90 111 22 33</a>
        <a href="mailto:info@other-medical.uz">info@other-medical.uz</a>
      </body>
    </html>
  `;
  const binding = verifyCompanyWebsiteBinding(
    { name: 'Target Dental', phone: '+998 90 999 88 77', address: 'Ташкент' },
    [{ url: pageUrl, html }],
  );
  assert.equal(binding.verified, false);

  const facts = extractCompanyPageFacts(pageUrl, html, binding.verified);
  assert.deepEqual(facts.decisionMakers, []);
  assert.equal(facts.telegramContact, null);
  assert.equal(facts.telegramUrl, null);
  assert.equal(facts.phone, null);
  assert.equal(facts.genericEmail, null);
  assert.deepEqual(facts.signals, []);
  assert.equal(facts.evidence.some((item) => item.fieldPath.startsWith('decision_makers.')), false);
  assert.equal(facts.evidence.some((item) => item.fieldPath.startsWith('web.telegram.')), false);
});

test('company website binding accepts an expected name or exact public phone', () => {
  const namePage = {
    url: new URL('https://target.example.uz/'),
    html: '<title>Target Dental — стоматология</title>',
  };
  assert.deepEqual(
    verifyCompanyWebsiteBinding({ name: 'Target Dental MChJ', phone: null }, [namePage]),
    { verified: true, method: 'company_name', sourceUrl: 'https://target.example.uz/' },
  );

  const phonePage = {
    url: new URL('https://target.example.uz/contact'),
    html: '<a href="tel:+998901234567">Позвонить</a>',
  };
  assert.deepEqual(
    verifyCompanyWebsiteBinding({ name: 'Unrelated Brand', phone: '+998 90 123 45 67' }, [phonePage]),
    { verified: true, method: 'phone', sourceUrl: 'https://target.example.uz/contact' },
  );
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

  const unlabeledOfficialLink = classifyTelegramContact({
    username: 'aziza_public',
    context: 'Telegram',
    isOfficialCompanyPage: true,
    hasNamedDecisionMaker: false,
  });
  assert.equal(unlabeledOfficialLink.type, 'unknown');
  assert.equal(unlabeledOfficialLink.messageable, false);

  const unknown = classifyTelegramContact({
    username: 'aziza_public',
    context: 'Telegram',
    isOfficialCompanyPage: false,
    hasNamedDecisionMaker: false,
  });
  assert.equal(unknown.type, 'unknown');
  assert.equal(unknown.messageable, false);

  const verifiedHumanQueue = [bot, channel, group, business, unlabeledOfficialLink, unknown]
    .filter((contact) => contact.type === 'human' && contact.messageable);
  assert.deepEqual(verifiedHumanQueue, []);
});

test('only an exact Organization sameAs can upgrade an unlabeled official-site Telegram link to business', () => {
  const verifiedAt = '2026-08-24T10:00:00.000Z';
  const organization = extractOfficialSiteContacts(new URL('https://clinic.example.uz/'), `
    <script type="application/ld+json">{
      "@type":"Organization",
      "name":"Example Clinic",
      "sameAs":["https://t.me/example_clinic"]
    }</script>
  `, verifiedAt);
  assert.equal(organization.telegramContact?.type, 'business');
  assert.equal(organization.telegramContact?.confidence, 0.94);
  assert.equal(organization.telegramContact?.messageable, false);

  const unlabeled = extractOfficialSiteContacts(new URL('https://clinic.example.uz/'), `
    <footer><a href="https://t.me/aziza_public">Telegram</a></footer>
  `, verifiedAt);
  assert.equal(unlabeled.telegramContact?.type, 'unknown');
  assert.equal(unlabeled.telegramContact?.messageable, false);

  const person = extractOfficialSiteContacts(new URL('https://clinic.example.uz/team'), `
    <script type="application/ld+json">{
      "@type":"Person",
      "name":"Азиза Каримова",
      "jobTitle":"коммерческий директор",
      "sameAs":["https://t.me/aziza_karimova"]
    }</script>
  `, verifiedAt);
  assert.equal(person.telegramContact?.type, 'human');
  assert.equal(person.telegramContact?.messageable, false);
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
  assert.equal(facts.telegramContact?.messageable, false);
  assert.equal(facts.telegramContact?.url, 'https://t.me/aziza_karimova');
  assert.equal(facts.telegramContact?.verifiedAt, verifiedAt);
  assert.ok((facts.telegramContact?.confidence ?? 0) >= 0.7);
  assert.ok((facts.telegramContact?.confidence ?? 1) < 1);
  assert.ok((facts.telegramContact?.evidenceIds.length ?? 0) > 0);

  const decisionMaker = facts.decisionMakers.find((item) => item.name === 'Азиза Каримова');
  assert.ok(decisionMaker);
  assert.equal(decisionMaker.role.toLocaleLowerCase('ru'), 'коммерческий директор');
  assert.equal(decisionMaker.contactType, 'human');
  assert.equal(decisionMaker.telegramUrl, 'https://t.me/aziza_karimova');
  assert.equal(decisionMaker.sourceUrl, 'https://clinic.example.uz/team');
  assert.equal(decisionMaker.verifiedAt, verifiedAt);
  assert.equal(decisionMaker.contactReviewStatus, 'unreviewed');
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

test('JSON-LD Person with a bot sameAs stays bot evidence and cannot be manually approved', async () => {
  const facts = extractOfficialSiteContacts(new URL('https://clinic.example.uz/team'), `
    <script type="application/ld+json">{
      "@type":"Person",
      "name":"Азиза Каримова",
      "jobTitle":"коммерческий директор",
      "sameAs":["https://t.me/aziza_sales_bot"]
    }</script>
  `, '2026-08-24T10:00:00.000Z');
  assert.equal(facts.telegramContact?.type, 'bot');
  assert.equal(facts.telegramContact?.messageable, false);
  const person = facts.decisionMakers.find((item) => item.name === 'Азиза Каримова');
  assert.equal(person?.contactType, 'bot');

  const fixture = new SqliteD1();
  const db = fixture.asD1();
  const store = new LeadRadarStore(db);
  const searchId = await store.createSearch('org-a', SEARCH_INPUT, '2026-08-24T10:00:00.000Z');
  const leadId = await store.insertLead('org-a', searchId, {
    canonicalKey: 'domain:clinic.example.uz', name: 'Clinic', category: 'Стоматология',
    city: 'Ташкент', country: 'UZ', address: null, website: 'https://clinic.example.uz',
    phone: null, genericEmail: null, telegramUrl: facts.telegramContact?.url ?? null,
    telegramContact: facts.telegramContact, decisionMakers: facts.decisionMakers,
    score: 50, confidence: 0.7, priority: 'P3', lifecycle: 'new', suppressed: false,
    scoreComponents: [], signals: [], evidence: facts.evidence,
    discoveredAt: '2026-08-24T10:00:00.000Z', lastVerifiedAt: '2026-08-24T10:00:00.000Z',
  });
  assert.ok(leadId);
  assert.equal(await store.reviewDecisionMaker(
    'org-a', leadId ?? '', person?.id ?? '', 'approved', '2026-08-24T10:05:00.000Z',
  ), null);
});

test('manual approval is fail-closed and authoritatively recomputes contactability', async () => {
  const verifiedAt = '2026-08-24T05:00:00.000Z';
  const facts = extractOfficialSiteContacts(new URL('https://clinic.example.uz/team'), `
    <section><p>Азиза Каримова — коммерческий директор</p>
    <a href="https://t.me/aziza_karimova">Личный Telegram Азизы Каримовой</a></section>
  `, verifiedAt);
  const fixture = new SqliteD1();
  const db = fixture.asD1();
  const store = new LeadRadarStore(db);
  const searchId = await store.createSearch('org-a', SEARCH_INPUT, verifiedAt);
  const initial = scoreLead({
    category: 'Стоматология', website: 'https://clinic.example.uz', phone: null,
    genericEmail: null, telegramUrl: facts.telegramContact?.url ?? null,
    telegramContact: facts.telegramContact, decisionMakers: facts.decisionMakers,
    evidence: facts.evidence, signals: [],
  });
  const leadId = await store.insertLead('org-a', searchId, {
    canonicalKey: 'domain:clinic.example.uz', name: 'Clinic', category: 'Стоматология',
    city: 'Ташкент', country: 'UZ', address: null, website: 'https://clinic.example.uz',
    phone: null, genericEmail: null, telegramUrl: facts.telegramContact?.url ?? null,
    telegramContact: facts.telegramContact, decisionMakers: facts.decisionMakers,
    score: initial.score, confidence: initial.confidence, priority: initial.priority,
    lifecycle: 'new', suppressed: false, scoreComponents: initial.components,
    signals: [], evidence: facts.evidence, discoveredAt: verifiedAt, lastVerifiedAt: verifiedAt,
  });
  const person = facts.decisionMakers[0];
  assert.ok(leadId && person);
  const reviewed = await store.reviewDecisionMaker(
    'org-a', leadId ?? '', person?.id ?? '', 'approved', '2026-08-24T05:05:00.000Z',
  );
  assert.equal(reviewed?.contactReviewStatus, 'approved');
  const lead = (await store.getSearch('org-a', searchId))?.leads[0];
  assert.equal(lead?.telegramContact?.messageable, true);
  assert.ok((lead?.score ?? 0) > initial.score);
  assert.equal(lead?.scoreComponents.find((item) => item.key === 'contactability')?.score, 20);
});

test('telegram-required preference retains a lead whose only Telegram endpoint is a bot', async () => {
  const fixture = new SqliteD1();
  const db = fixture.asD1();
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
  assert.equal(result.leads.length, 1);
  assert.equal(result.leads[0]?.telegramContact?.type, 'bot');
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
  }, new Date('2026-08-25T10:00:00.000Z'));
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
  }, new Date('2026-08-25T10:00:00.000Z'));
  assert.equal(withIntent.priority, 'P1');
  assert.ok(withIntent.confidence >= 0.8);

  const staleIntent = scoreLead({
    evidence: allEvidence,
    signals: [{
      type: 'new_branch', label: 'новый филиал', classification: 'fact',
      evidenceIds: ['e7'], observedAt: '2025-01-01T00:00:00.000Z',
    }],
    website: 'https://example.uz', phone: '+998901234567', genericEmail: null,
    telegramUrl: null, telegramContact: null, decisionMakers: [], category: 'Стоматология',
  }, new Date('2026-08-25T10:00:00.000Z'));
  assert.notEqual(staleIntent.priority, 'P1');
  assert.deepEqual(staleIntent.components.find((item) => item.key === 'intent')?.evidenceIds, []);
});

test('geo score ignores a requested city or inferred location without source proof', () => {
  const inferredCity = evidence('geo-context', 'locations.city');
  inferredCity.classification = 'model_inference';
  const scored = scoreLead({
    evidence: [inferredCity], signals: [], website: null, phone: null, genericEmail: null,
    telegramUrl: null, telegramContact: null, decisionMakers: [], category: 'Клиника',
  }, new Date('2026-08-25T10:00:00.000Z'));
  const geo = scored.components.find((item) => item.key === 'geo_fit');
  assert.equal(geo?.score, 6);
  assert.deepEqual(geo?.evidenceIds, []);
});

test('niche score requires a sourced category instead of a fallback label', () => {
  const fallbackOnly = scoreLead({
    evidence: [evidence('name-only', 'company.name')],
    signals: [], website: null, phone: null, genericEmail: null,
    telegramUrl: null, telegramContact: null, decisionMakers: [], category: 'Стоматология',
  }, new Date('2026-08-25T10:00:00.000Z'));
  const sourced = scoreLead({
    evidence: [evidence('category-fact', 'company.category')],
    signals: [], website: null, phone: null, genericEmail: null,
    telegramUrl: null, telegramContact: null, decisionMakers: [], category: 'dentist',
  }, new Date('2026-08-25T10:00:00.000Z'));

  const fallbackComponent = fallbackOnly.components.find((item) => item.key === 'niche_fit');
  const sourcedComponent = sourced.components.find((item) => item.key === 'niche_fit');
  assert.equal(fallbackComponent?.score, 12);
  assert.deepEqual(fallbackComponent?.evidenceIds, []);
  assert.equal(sourcedComponent?.score, 25);
  assert.deepEqual(sourcedComponent?.evidenceIds, ['category-fact']);
});

test('store enforces tenant isolation on reads and lifecycle mutations', async () => {
  const fixture = new SqliteD1();
  const db = fixture.asD1();
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
  const rawSuppressed = await db.prepare(`SELECT phone, phone_digits, generic_email, telegram_url,
    telegram_contact_json, decision_makers_json FROM lead_radar_companies
    WHERE org_id = 'org-a' AND canonical_key = 'domain:example.uz'`).all<{
      phone: string | null; phone_digits: string | null; generic_email: string | null;
      telegram_url: string | null; telegram_contact_json: string; decision_makers_json: string;
    }>();
  assert.ok((rawSuppressed.results ?? []).length >= 2);
  for (const row of rawSuppressed.results ?? []) {
    assert.equal(row.phone, null);
    assert.equal(row.phone_digits, null);
    assert.equal(row.generic_email, null);
    assert.equal(row.telegram_url, null);
    assert.equal(row.telegram_contact_json, 'null');
    assert.equal(row.decision_makers_json, '[]');
  }
  const rawEvidence = await db.prepare(`SELECT COUNT(*) AS count FROM lead_radar_evidence evidence
    INNER JOIN lead_radar_companies company ON company.id = evidence.company_id
    WHERE company.org_id = 'org-a' AND company.canonical_key = 'domain:example.uz'`)
    .first<{ count: number }>();
  assert.equal(Number(rawEvidence?.count ?? -1), 0);
  const originalSuppression = (await store.listSuppressions('org-a'))
    .find((item) => item.canonicalKey === 'domain:example.uz');
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
  assert.deepEqual((await store.listSuppressions('org-a'))
    .find((item) => item.canonicalKey === 'domain:example.uz'), originalSuppression);

  const futureSearch = await store.createSearch('org-a', SEARCH_INPUT, '2026-08-24T11:02:00.000Z');
  assert.equal(await store.insertLead('org-a', futureSearch, makeLead('dnc-future')), null);
});

test('personal contact retention purge removes stale raw Telegram, people, and evidence', async () => {
  const fixture = new SqliteD1();
  const db = fixture.asD1();
  const store = new LeadRadarStore(db);
  const searchId = await store.createSearch('org-a', SEARCH_INPUT, '2026-06-01T10:00:00.000Z');
  const leadId = await store.insertLead('org-a', searchId, {
    canonicalKey: 'domain:stale.example.uz', name: 'Stale Clinic', category: 'Стоматология',
    city: 'Ташкент', country: 'UZ', address: null, website: 'https://stale.example.uz',
    phone: null, genericEmail: null, telegramUrl: 'https://t.me/aziza_karimova',
    telegramContact: { ...personalTelegram('stale-telegram'), verifiedAt: '2026-06-01T10:00:00.000Z' },
    decisionMakers: [{
      ...decisionMaker('stale-person', 'stale-telegram'),
      verifiedAt: '2026-06-01T10:00:00.000Z',
      contactReviewedAt: '2026-06-01T10:05:00.000Z',
    }],
    score: 70, confidence: 0.8, priority: 'P2', lifecycle: 'new', suppressed: false,
    scoreComponents: [], signals: [], evidence: [
      evidence('stale-person', 'decision_makers.named_role'),
      evidence('stale-telegram', 'web.telegram.human'),
    ],
    enrichmentStatus: 'enriched', enrichmentReason: 'enriched', enrichmentAttempts: 1,
    discoveredAt: '2026-06-01T10:00:00.000Z', lastVerifiedAt: '2026-06-01T10:00:00.000Z',
  });
  assert.ok(leadId);
  assert.equal(await store.purgeExpiredPersonalContacts(
    '2026-07-25T00:00:00.000Z', '2026-08-24T00:00:00.000Z',
  ), 1);
  const raw = await db.prepare(`SELECT telegram_url, telegram_contact_json, decision_makers_json
    FROM lead_radar_companies WHERE org_id = ? AND id = ?`).bind('org-a', leadId).first<{
      telegram_url: string | null; telegram_contact_json: string; decision_makers_json: string;
    }>();
  assert.equal(raw?.telegram_url, null);
  assert.equal(raw?.telegram_contact_json, 'null');
  assert.equal(raw?.decision_makers_json, '[]');
  assert.equal(Number((await db.prepare(`SELECT COUNT(*) AS count FROM lead_radar_evidence
    WHERE org_id = ? AND company_id = ?`).bind('org-a', leadId).first<{ count: number }>())?.count ?? -1), 0);
});

test('do-not-contact purges a transitive three-hop identity closure and persists every alias', async () => {
  const fixture = new SqliteD1();
  const db = fixture.asD1();
  const store = new LeadRadarStore(db);
  const firstSearch = await store.createSearch('org-a', SEARCH_INPUT, '2026-08-24T04:00:00.000Z');
  const aliasSearch = await store.createSearch('org-a', SEARCH_INPUT, '2026-08-24T04:01:00.000Z');
  const bridgeSearch = await store.createSearch('org-a', SEARCH_INPUT, '2026-08-24T04:02:00.000Z');
  const thirdHopSearch = await store.createSearch('org-a', SEARCH_INPUT, '2026-08-24T04:03:00.000Z');
  const makeSparse = (canonicalKey: string, name: string, phone: string, website: string | null, id: string) => ({
    canonicalKey, name, category: 'Стоматология', city: 'Ташкент', country: 'UZ',
    address: null, website, phone, genericEmail: null, telegramUrl: null,
    telegramContact: null, decisionMakers: [], score: 40, confidence: 0.6,
    priority: 'P3' as const, lifecycle: 'new' as const, suppressed: false,
    scoreComponents: [], signals: [], evidence: [evidence(id, 'company.name')],
    discoveredAt: '2026-08-24T04:00:00.000Z', lastVerifiedAt: '2026-08-24T04:00:00.000Z',
  });
  const selected = await store.insertLead('org-a', firstSearch, makeSparse(
    'domain:shared.example.uz', 'Clinic A', '+998901111111', 'https://shared.example.uz', 'alias-a',
  ));
  assert.ok(selected);
  const alias = await store.insertLead('org-a', aliasSearch, makeSparse(
    'domain:shared.example.uz', 'Clinic B', '+998902222222', 'https://shared.example.uz', 'alias-b',
  ));
  const bridge = await store.insertLead('org-a', bridgeSearch, makeSparse(
    'domain:other.example.uz', 'Clinic C', '+998902222222', 'https://other.example.uz', 'alias-c',
  ));
  const thirdHop = await store.insertLead('org-a', thirdHopSearch, makeSparse(
    'domain:other.example.uz', 'Clinic D', '+998903333333', 'https://other.example.uz', 'alias-d',
  ));
  assert.ok(alias && bridge && thirdHop);
  assert.equal(await store.updateLifecycle(
    'org-a', selected ?? '', 'do_not_contact', '2026-08-24T05:00:00.000Z',
  ), true);
  const fingerprints = await store.listSuppressions('org-a');
  assert.ok(fingerprints.some((item) => item.canonicalKey === 'suppression:phone:998902222222'
    && item.phoneDigits === '998902222222'));
  assert.ok(fingerprints.some((item) => item.canonicalKey === 'suppression:phone:998903333333'
    && item.phoneDigits === '998903333333'));
  const purged = await db.prepare(`SELECT id, phone, phone_digits, generic_email, telegram_url,
    telegram_contact_json, decision_makers_json, suppressed FROM lead_radar_companies
    WHERE org_id = ? AND id IN (?, ?, ?, ?)`).bind(
    'org-a', selected, alias, bridge, thirdHop,
  ).all<{
    id: string; phone: string | null; phone_digits: string | null; generic_email: string | null;
    telegram_url: string | null; telegram_contact_json: string; decision_makers_json: string; suppressed: number;
  }>();
  assert.equal((purged.results ?? []).length, 4);
  for (const row of purged.results ?? []) {
    assert.equal(row.suppressed, 1);
    assert.equal(row.phone, null);
    assert.equal(row.phone_digits, null);
    assert.equal(row.generic_email, null);
    assert.equal(row.telegram_url, null);
    assert.equal(row.telegram_contact_json, 'null');
    assert.equal(row.decision_makers_json, '[]');
  }
  const futureSearch = await store.createSearch('org-a', SEARCH_INPUT, '2026-08-24T06:00:00.000Z');
  assert.equal(await store.insertLead('org-a', futureSearch, makeSparse(
    'name:new-brand:ташкент', 'New Brand', '+998903333333', null, 'alias-future',
  )), null);
});

test('search lease is exclusive and only its owner can release it', async () => {
  const fixture = new SqliteD1();
  const db = fixture.asD1();
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

test('async discovery retains every candidate with telegramRequired and queue replay is idempotent', async () => {
  const fixture = new SqliteD1();
  const db = fixture.asD1();
  const queue = new MemoryLeadRadarQueue();
  const at = new Date('2026-08-24T12:00:00.000Z');
  const created = await enqueueLeadRadarSearch(
    new LeadRadarStore(db),
    'org-a',
    { ...SEARCH_INPUT, telegramRequired: true, desiredCount: 5 },
    queue,
    at,
  );
  assert.equal(created.search.phase, 'queued');
  const discoveryMessage = queue.messages.shift();
  assert.ok(discoveryMessage);
  const botEvidence = evidence('async-bot', 'web.telegram.bot');
  const candidate = sourceCandidate({
    telegramUrl: 'https://t.me/example_sales_bot',
    telegramContact: {
      url: 'https://t.me/example_sales_bot', username: 'example_sales_bot', type: 'bot',
      confidence: 0.99, reason: 'bot handle', evidenceIds: [botEvidence.id],
      verifiedAt: at.toISOString(), messageable: false,
    },
    evidence: [evidence('async-company', 'company.name'), botEvidence],
  });
  const first = await consumeLeadRadarQueueMessage(db, discoveryMessage, queue, {
    now: () => at,
    discover: async () => ({ candidates: [candidate], sourceWarnings: [], rawDiscoveredCount: 1 }),
  });
  assert.equal(first.outcome, 'completed');
  const result = await new LeadRadarStore(db).getSearch('org-a', created.search.id);
  assert.equal(result?.leads.length, 1);
  assert.equal(result?.search.funnel.candidateCount, 1);
  assert.equal(result?.search.funnel.processedCount, 1);
  assert.equal(result?.search.verifiedCount, 0);
  assert.equal(result?.search.funnel.websiteCount, 0);
  assert.equal(result?.search.funnel.personalTelegramCount, 0);
  assert.equal(result?.search.telegramCount, 0);
  assert.equal(result?.search.phase, 'completed');

  const replay = await consumeLeadRadarQueueMessage(db, discoveryMessage, queue, { now: () => at });
  assert.equal(replay.outcome, 'duplicate');
  assert.equal((await new LeadRadarStore(db).getSearch('org-a', created.search.id))?.leads.length, 1);
});

test('async enrichment keeps partial leads through bounded retry and terminal failure', async () => {
  const fixture = new SqliteD1();
  const db = fixture.asD1();
  const queue = new MemoryLeadRadarQueue();
  const start = new Date('2026-08-24T13:00:00.000Z');
  const created = await enqueueLeadRadarSearch(
    new LeadRadarStore(db), 'org-a', { ...SEARCH_INPUT, desiredCount: 5 }, queue, start,
  );
  const discoveryMessage = queue.messages.shift();
  assert.ok(discoveryMessage);
  await consumeLeadRadarQueueMessage(db, discoveryMessage, queue, {
    now: () => start,
    discover: async () => ({
      candidates: [sourceCandidate({
        website: 'https://example.uz',
        enrichmentStatus: 'pending',
        enrichmentReason: null,
      })],
      sourceWarnings: [],
      rawDiscoveredCount: 1,
    }),
  });
  const enrichmentMessage = queue.messages.shift();
  assert.ok(enrichmentMessage);
  const unavailable = async () => ({
    facts: null,
    reason: 'source_unavailable' as const,
    retryable: true,
  });
  const first = await consumeLeadRadarQueueMessage(db, enrichmentMessage, queue, {
    now: () => start,
    enrichWebsite: unavailable,
  });
  assert.equal(first.outcome, 'retry_wait');
  let result = await new LeadRadarStore(db).getSearch('org-a', created.search.id);
  assert.equal(result?.leads.length, 1);
  assert.equal(result?.leads[0]?.enrichmentStatus, 'queued');

  const secondAt = new Date(start.getTime() + 46_000);
  const second = await consumeLeadRadarQueueMessage(db, enrichmentMessage, queue, {
    now: () => secondAt,
    enrichWebsite: unavailable,
  });
  assert.equal(second.outcome, 'retry_wait');
  const thirdAt = new Date(secondAt.getTime() + 91_000);
  const third = await consumeLeadRadarQueueMessage(db, enrichmentMessage, queue, {
    now: () => thirdAt,
    enrichWebsite: unavailable,
  });
  assert.equal(third.outcome, 'dead_letter');
  result = await new LeadRadarStore(db).getSearch('org-a', created.search.id);
  assert.equal(result?.leads.length, 1);
  assert.equal(result?.leads[0]?.enrichmentStatus, 'terminal');
  assert.equal(result?.leads[0]?.enrichmentReason, 'retry_exhausted');
  assert.equal(result?.leads[0]?.enrichmentAttempts, 3);
  assert.equal(result?.search.phase, 'completed');
  assert.equal(result?.search.status, 'partial');
  const deadLetterReplay = await consumeLeadRadarQueueMessage(db, enrichmentMessage, queue, {
    now: () => new Date(thirdAt.getTime() + 1_000),
    enrichWebsite: unavailable,
  });
  assert.deepEqual(deadLetterReplay, third);
});

test('reachable site without sales evidence is terminal and is not retried', async () => {
  const fixture = new SqliteD1();
  const db = fixture.asD1();
  const queue = new MemoryLeadRadarQueue();
  const at = new Date('2026-08-24T14:00:00.000Z');
  const created = await enqueueLeadRadarSearch(
    new LeadRadarStore(db), 'org-a', { ...SEARCH_INPUT, desiredCount: 5 }, queue, at,
  );
  const discoveryMessage = queue.messages.shift();
  assert.ok(discoveryMessage);
  await consumeLeadRadarQueueMessage(db, discoveryMessage, queue, {
    now: () => at,
    discover: async () => ({
      candidates: [sourceCandidate({ website: 'https://example.uz', enrichmentStatus: 'pending', enrichmentReason: null })],
      sourceWarnings: [], rawDiscoveredCount: 1,
    }),
  });
  const enrichmentMessage = queue.messages.shift();
  assert.ok(enrichmentMessage);
  let enrichmentExpected: unknown;
  const outcome = await consumeLeadRadarQueueMessage(db, enrichmentMessage, queue, {
    now: () => at,
    enrichWebsite: async (_website, expected) => {
      enrichmentExpected = expected;
      return {
        reason: 'no_relevant_evidence',
        retryable: false,
        facts: {
          website: 'https://example.uz', phone: null, genericEmail: null,
          telegramUrl: null, telegramContact: null, decisionMakers: [],
          evidence: [evidence('site-active', 'web.website')],
          signals: [],
        },
      };
    },
  });
  assert.equal(outcome.outcome, 'completed');
  assert.deepEqual(enrichmentExpected, {
    name: 'Example Clinic',
    phone: null,
    address: 'Ташкент',
  });
  const result = await new LeadRadarStore(db).getSearch('org-a', created.search.id);
  assert.equal(result?.leads[0]?.enrichmentStatus, 'terminal');
  assert.equal(result?.leads[0]?.enrichmentReason, 'no_relevant_evidence');
  assert.equal(result?.leads[0]?.enrichmentAttempts, 1);
});

test('async funnel keeps processed, verified, and first-party website counters independent', async () => {
  const fixture = new SqliteD1();
  const db = fixture.asD1();
  const queue = new MemoryLeadRadarQueue();
  const at = new Date('2026-08-24T14:30:00.000Z');
  const created = await enqueueLeadRadarSearch(
    new LeadRadarStore(db), 'org-a', { ...SEARCH_INPUT, desiredCount: 1 }, queue, at,
  );
  const discoveryMessage = queue.messages.shift();
  assert.ok(discoveryMessage);
  await consumeLeadRadarQueueMessage(db, discoveryMessage, queue, {
    now: () => at,
    discover: async () => ({
      candidates: [sourceCandidate({
        website: 'https://example.uz', enrichmentStatus: 'pending', enrichmentReason: null,
      })],
      sourceWarnings: [], rawDiscoveredCount: 1,
    }),
  });
  const enrichmentMessage = queue.messages.shift();
  assert.ok(enrichmentMessage);
  const completed = await consumeLeadRadarQueueMessage(db, enrichmentMessage, queue, {
    now: () => new Date(at.getTime() + 1_000),
    enrichWebsite: async () => ({
      reason: 'enriched' as const,
      retryable: false,
      facts: {
        website: 'https://example.uz', phone: '+998901234567', genericEmail: 'info@example.uz',
        telegramUrl: null, telegramContact: null, decisionMakers: [], signals: [],
        evidence: [
          evidence('verified-site', 'web.website'),
          evidence('verified-phone', 'company_contacts.phone'),
        ],
      },
    }),
  });
  assert.equal(completed.outcome, 'completed');
  const result = await new LeadRadarStore(db).getSearch('org-a', created.search.id);
  assert.equal(result?.search.funnel.candidateCount, 1);
  assert.equal(result?.search.funnel.processedCount, 1);
  assert.equal(result?.search.funnel.enrichedCount, 1);
  assert.equal(result?.search.verifiedCount, 1);
  assert.equal(result?.search.funnel.websiteCount, 1);
});

test('queue poison is acknowledged and job claim recovery is fenced and tenant-scoped', async () => {
  const fixture = new SqliteD1();
  const db = fixture.asD1();
  const queue = new MemoryLeadRadarQueue();
  assert.deepEqual(
    await consumeLeadRadarQueueMessage(db, { schema: 'gptbot.lead-radar.job.v1', job_id: '../bad' }, queue),
    { outcome: 'invalid' },
  );
  const store = new LeadRadarStore(db);
  const at = '2026-08-24T15:00:00.000Z';
  const searchId = await store.createSearch('org-a', SEARCH_INPUT, at);
  const job = await store.createJob('org-a', searchId, null, 'discovery', 'recovery-test', at, 2);
  assert.equal(await store.claimJob('org-b', job.id, at, '2026-08-24T15:01:00.000Z'), null);
  const first = await store.claimJob('org-a', job.id, at, '2026-08-24T15:01:00.000Z');
  assert.ok(first?.leaseOwner);
  const recovered = await store.claimJob(
    'org-a', job.id, '2026-08-24T15:02:00.000Z', '2026-08-24T15:03:00.000Z',
  );
  assert.ok(recovered?.leaseOwner);
  assert.notEqual(recovered?.leaseOwner, first?.leaseOwner);
  await store.completeJob('org-a', job.id, first?.leaseOwner ?? '', '2026-08-24T15:02:01.000Z');
  assert.equal((await store.getJob(job.id))?.status, 'running');
  await store.completeJob('org-a', job.id, recovered?.leaseOwner ?? '', '2026-08-24T15:02:01.000Z');
  assert.equal((await store.getJob(job.id))?.status, 'completed');
});

test('async search admission rejects an immediate second submit per tenant', async () => {
  const fixture = new SqliteD1();
  const db = fixture.asD1();
  const queue = new MemoryLeadRadarQueue();
  const at = new Date();
  await enqueueLeadRadarSearch(new LeadRadarStore(db), 'org-a', SEARCH_INPUT, queue, at);
  await assert.rejects(
    enqueueLeadRadarSearch(new LeadRadarStore(db), 'org-a', SEARCH_INPUT, queue, at),
    LeadRadarBusyError,
  );
  await enqueueLeadRadarSearch(
    new LeadRadarStore(db), 'org-a', SEARCH_INPUT, queue, new Date(at.getTime() + 4_000),
  );
  await assert.rejects(
    enqueueLeadRadarSearch(
      new LeadRadarStore(db), 'org-a', SEARCH_INPUT, queue, new Date(at.getTime() + 8_000),
    ),
    LeadRadarBusyError,
  );
  await enqueueLeadRadarSearch(new LeadRadarStore(db), 'org-b', SEARCH_INPUT, queue, at);
});

test('atomic admission enforces ten searches per hour without counting rejected attempts', async () => {
  const fixture = new SqliteD1();
  const db = fixture.asD1();
  const store = new LeadRadarStore(db);
  const start = new Date('2026-08-24T00:00:00.000Z');
  for (let index = 0; index < 10; index += 1) {
    const at = new Date(start.getTime() + index * 1_000);
    const admitted = await store.createSearchIfAdmitted('org-a', SEARCH_INPUT, at);
    assert.ok(admitted.id);
    await store.finishSearch('org-a', admitted.id ?? '', {
      status: 'ready', candidateCount: 0, verifiedCount: 0,
      p1Count: 0, p2Count: 0, p3Count: 0, telegramCount: 0,
      errorCode: null, completedAt: at.toISOString(),
    });
  }
  const blocked = await store.createSearchIfAdmitted(
    'org-a', SEARCH_INPUT, new Date(start.getTime() + 10_000),
  );
  assert.equal(blocked.id, null);
  assert.ok(blocked.retryAfterSeconds > 3_500);
  const count = await db.prepare(`SELECT COUNT(*) AS count FROM lead_radar_searches
    WHERE org_id = 'org-a'`).first<{ count: number }>();
  assert.equal(Number(count?.count ?? 0), 10);
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
  sqlite.exec(readFileSync(resolve(import.meta.dirname, '../migrations/0043_lead_radar_async_funnel.sql'), 'utf8'));
  sqlite.exec(readFileSync(resolve(import.meta.dirname, '../migrations/0044_lead_radar_telegram_business.sql'), 'utf8'));

  const tables = sqlite.prepare(`SELECT name FROM sqlite_master
    WHERE type = 'table' AND name LIKE 'lead_radar_%' ORDER BY name`).all()
    .map((row) => String(row.name));
  assert.deepEqual(tables, [
    'lead_radar_companies',
    'lead_radar_evidence',
    'lead_radar_geocode_cache',
    'lead_radar_job_effects',
    'lead_radar_jobs',
    'lead_radar_search_leases',
    'lead_radar_searches',
    'lead_radar_source_throttles',
    'lead_radar_suppressions',
    'lead_radar_tg_business_connections',
    'lead_radar_tg_company_chats',
    'lead_radar_tg_connect_nonces',
    'lead_radar_tg_send_approvals',
    'lead_radar_tg_send_effects',
    'lead_radar_tg_webhook_updates',
  ]);

  const indexes = sqlite.prepare(`SELECT name FROM sqlite_master
    WHERE type = 'index' AND name LIKE 'idx_lead_radar_%' ORDER BY name`).all();
  assert.equal(indexes.length, 28);

  const companyColumns = sqlite.prepare('PRAGMA table_info(lead_radar_companies)').all()
    .map((row) => String(row.name));
  assert.ok(companyColumns.includes('telegram_contact_json'));
  assert.ok(companyColumns.includes('decision_makers_json'));
  assert.ok(companyColumns.includes('enrichment_status'));
  const searchColumns = sqlite.prepare('PRAGMA table_info(lead_radar_searches)').all()
    .map((row) => String(row.name));
  assert.ok(searchColumns.includes('phase'));
  assert.ok(searchColumns.includes('raw_discovered_count'));
  assert.equal(
    sqlite.prepare("SELECT telegram_count FROM lead_radar_searches WHERE id = 'legacy-search'").get()?.telegram_count,
    3,
  );
});
