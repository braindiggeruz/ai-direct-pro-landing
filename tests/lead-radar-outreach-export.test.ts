import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { LeadRadarEvidence, LeadRadarLead } from '../src/shared/lead-radar';
import type { LeadRadarContactCandidate } from '../src/shared/lead-radar-contacts';
import {
  buildLeadExport,
  exportHandlesNeedingCheck,
  isBotUsername,
  isPlaceholderPhone,
  type ExportRowV2,
  type TelegramHandleKind,
} from '../src/shared/lead-radar-export-contacts';
import {
  buildExportRows,
  EXPORT_CSV_HEADER,
  exportCityKey,
  exportNicheKey,
  isExportPath,
  renderCsv,
  renderVcf,
} from '../functions/api/admin/lead-radar/export-control';

/** Minimal lead. Only the fields the export actually reads need to be real. */
function lead(overrides: Partial<LeadRadarLead> & { id: string; name: string }): LeadRadarLead {
  return {
    searchId: 'search-1',
    category: 'stomatology',
    city: 'Ташкент',
    country: 'UZ',
    address: null,
    website: null,
    phone: null,
    genericEmail: null,
    telegramUrl: null,
    telegramContact: null,
    decisionMakers: [],
    enrichmentStatus: 'idle',
    enrichmentReason: null,
    enrichmentAttempts: 0,
    score: 0,
    confidence: 0,
    priority: 'p3',
    lifecycle: 'new',
    suppressed: false,
    scoreComponents: [],
    signals: [],
    evidence: [],
    discoveredAt: '2026-09-01T00:00:00.000Z',
    lastVerifiedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

function evidence(overrides: Partial<LeadRadarEvidence> & { id: string; fieldPath: string; value: string }): LeadRadarEvidence {
  return {
    sourceUrl: 'https://www.openstreetmap.org/node/101',
    sourceType: 'openstreetmap',
    observedAt: '2026-11-01T00:00:00.000Z',
    confidence: 0.8,
    classification: 'company_data',
    ...overrides,
  };
}

function candidate(overrides: Partial<LeadRadarContactCandidate> & { key: string; kind: 'phone' | 'telegram'; value: string }): LeadRadarContactCandidate {
  return {
    phoneType: null,
    ownership: 'unconfirmed',
    lookupEligible: true,
    reason: 'public_source',
    sourceUrl: 'https://clinic.example/contacts',
    evidenceIds: [],
    observedAt: '2026-11-01T00:00:00.000Z',
    ...overrides,
  };
}

function row(overrides: Partial<ExportRowV2> = {}): ExportRowV2 {
  return {
    company: 'Клиника Улыбка',
    niche: 'Стоматология',
    city: 'Ташкент',
    phoneMobile1: '+998901234567',
    phoneMobile2: null,
    phoneLandline: null,
    telegramUsername: null,
    telegramUrl: null,
    telegramType: null,
    contactStatus: 'unverified',
    source: 'openstreetmap',
    sourceUrl: null,
    sourceDate: null,
    stale: false,
    website: null,
    address: null,
    priority: 'p1',
    score: 0,
    ...overrides,
  };
}

// ── Route shape ──────────────────────────────────────────────────────────────

test('the export route is recognised only in its exact shape', () => {
  assert.equal(isExportPath(['searches', 'abc', 'export']), true);
  assert.equal(isExportPath(['searches', 'abc', 'enrichment']), false);
  assert.equal(isExportPath(['searches', 'abc']), false);
  assert.equal(isExportPath(['export']), false);
  assert.equal(isExportPath(['searches', 'abc', 'export', 'x']), false);
});

// ── Back-compatible projection (one phone, one handle) ──────────────────────

test('only reachable leads are exported, and fixed lines are not reachable', () => {
  const rows = buildExportRows([
    lead({ id: '1', name: 'Mobile Clinic', phone: '+998 90 123 45 67' }),
    // A Tashkent landline is not a messaging endpoint.
    lead({ id: '2', name: 'Landline Clinic', phone: '+998 71 123 45 67' }),
    lead({ id: '3', name: 'No Contact' }),
  ]);
  assert.deepEqual(rows.map((item) => item.company), ['Mobile Clinic']);
  assert.equal(rows[0]?.phone, '+998901234567');
});

test('do-not-contact and suppressed leads never reach an export', () => {
  const rows = buildExportRows([
    lead({ id: '1', name: 'DNC', phone: '+998901234567', lifecycle: 'do_not_contact' }),
    lead({ id: '2', name: 'Suppressed', phone: '+998901234568', suppressed: true }),
    lead({ id: '3', name: 'Fine', phone: '+998901234569' }),
  ]);
  assert.deepEqual(rows.map((item) => item.company), ['Fine']);
});

test('two leads sharing one phone collapse into a single recipient', () => {
  const rows = buildExportRows([
    lead({ id: '1', name: 'First', phone: '+998901234567' }),
    lead({ id: '2', name: 'Second', phone: '+998 90 123 45 67' }),
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.company, 'First', 'the first occurrence wins');
});

test('a telegram-only lead is still exportable', () => {
  const rows = buildExportRows([
    lead({ id: '1', name: 'TG Only', telegramUrl: 'https://t.me/DentalClinic' }),
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.phone, null);
  assert.equal(rows[0]?.telegram, '@dentalclinic');
});

// ── Contact model: what is kept ──────────────────────────────────────────────

test('every number of a multi-value phone tag is kept, mobiles first, landline in its own column', () => {
  const { rows, summary } = buildLeadExport([
    lead({
      id: '1',
      name: 'Multi Phone',
      evidence: [evidence({ id: 'e1', fieldPath: 'company_contacts.phone', value: '+998 71 200 00 01; +998 90 123 45 67; +998 93 765 43 21' })],
    }),
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.phoneMobile1 && rows[0].phoneMobile2 ? 2 : 0, 2, 'both mobiles survive');
  assert.deepEqual(new Set([rows[0]?.phoneMobile1, rows[0]?.phoneMobile2]), new Set(['+998901234567', '+998937654321']));
  assert.equal(rows[0]?.phoneLandline, '+998712000001');
  assert.equal(rows[0]?.source, 'openstreetmap');
  assert.equal(summary.withMobile, 1);
  assert.equal(summary.withLandline, 1);
});

test('a landline-only business stays in the file for calls, but not in the messaging projection', () => {
  const leads = [lead({ id: '1', name: 'Landline Clinic', phone: '+998 71 123 45 67' })];
  const full = buildLeadExport(leads);
  assert.equal(full.rows.length, 1);
  assert.equal(full.rows[0]?.phoneLandline, '+998711234567');
  assert.equal(full.rows[0]?.phoneMobile1, null);
  const messaging = buildLeadExport(leads, { includeLandlineOnly: false });
  assert.equal(messaging.rows.length, 0);
  assert.equal(messaging.summary.excludedLeads.landline_only, 1);
});

test('a bridge-verified corporate account is marked verified and wins the telegram column', () => {
  const { rows, summary } = buildLeadExport([
    lead({
      id: '1',
      name: 'Verified Clinic',
      telegramUrl: 'https://t.me/smile_dent_uz',
      telegramContact: {
        url: 'https://t.me/smile_dent_uz', username: 'smile_dent_uz', type: 'business', confidence: 0.95,
        reason: 'bridge_resolved_corporate', evidenceIds: [], verifiedAt: '2026-11-20T00:00:00.000Z', messageable: true,
      },
      evidence: [evidence({ id: 'e1', fieldPath: 'web.telegram.unknown', value: 'https://t.me/other_clinic_uz', sourceType: 'company_website', sourceUrl: 'https://clinic.example/', confidence: 0.6 })],
    }),
  ]);
  assert.equal(rows[0]?.telegramUsername, 'smile_dent_uz');
  assert.equal(rows[0]?.contactStatus, 'verified');
  assert.equal(rows[0]?.telegramType, 'business');
  assert.equal(rows[0]?.source, 'telegram_check');
  assert.equal(summary.withVerifiedTelegram, 1);
});

test('the same business found by several searches becomes one row (OSM object, phone or handle)', () => {
  const osm = 'https://www.openstreetmap.org/way/555';
  const { rows, summary } = buildLeadExport([
    lead({ id: 'a', searchId: 's1', name: 'Dent Plus', score: 10, evidence: [evidence({ id: 'e1', fieldPath: 'company_contacts.phone', value: '+998901112233', sourceUrl: osm })] }),
    lead({ id: 'b', searchId: 's2', name: 'Dent Plus clinic', score: 30, evidence: [evidence({ id: 'e2', fieldPath: 'name', value: 'Dent Plus', sourceUrl: osm })], telegramUrl: 'https://t.me/dentplus_uz' }),
    lead({ id: 'a', searchId: 's3', name: 'Dent Plus', score: 10, phone: '+998 90 111 22 33' }),
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.company, 'Dent Plus clinic', 'the strongest lead names the row');
  assert.equal(rows[0]?.phoneMobile1, '+998901112233');
  assert.equal(rows[0]?.telegramUsername, 'dentplus_uz');
  assert.equal(summary.excludedLeads.duplicate, 2);
});

test('a source older than two years is flagged stale, not dropped', () => {
  const { rows } = buildLeadExport([
    lead({ id: '1', name: 'Old Clinic', evidence: [evidence({ id: 'e1', fieldPath: 'company_contacts.phone', value: '+998901234567', observedAt: '2022-01-01T00:00:00.000Z' })] }),
  ], { now: new Date('2026-11-22T00:00:00.000Z') });
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.stale, true);
  assert.equal(rows[0]?.sourceDate, '2022-01-01T00:00:00.000Z');
});

// ── Contact model: what is cut, and why ─────────────────────────────────────

test('bots are cut by suffix, by deep link, by checked verdict and by the bridge verdict', () => {
  const verdicts = new Map<string, TelegramHandleKind>([['dental_helper', 'bot']]);
  const { rows, summary } = buildLeadExport([
    lead({ id: '1', name: 'Suffix', telegramUrl: 'https://t.me/DentClinicBot' }),
    lead({ id: '2', name: 'Deep link', telegramUrl: 'https://t.me/dent_booking?start=web' }),
    lead({ id: '3', name: 'Checked', telegramUrl: 'https://t.me/dental_helper' }),
    lead({
      id: '4', name: 'Bridge',
      telegramContact: {
        url: 'https://t.me/dent_assistant', username: 'dent_assistant', type: 'unknown', confidence: 0.7,
        reason: 'bridge_not_regular_user', evidenceIds: [], verifiedAt: '2026-11-20T00:00:00.000Z', messageable: false,
      },
    }),
  ], { verdicts });
  assert.equal(rows.length, 0);
  assert.equal(summary.excludedTelegram.bot, 4);
  assert.equal(summary.excludedLeads.no_contact, 4);
});

test('channels, groups and dead usernames are cut with their own reason', () => {
  const verdicts = new Map<string, TelegramHandleKind>([
    ['smile_news', 'channel'], ['smile_chat', 'group'], ['smile_gone', 'not_found'],
  ]);
  const { rows, summary } = buildLeadExport([
    lead({ id: '1', name: 'Channel', telegramUrl: 'https://t.me/smile_news', phone: '+998901000001' }),
    lead({ id: '2', name: 'Group', telegramUrl: 'https://t.me/smile_chat', phone: '+998901000002' }),
    lead({ id: '3', name: 'Dead', telegramUrl: 'https://t.me/smile_gone', phone: '+998901000003' }),
    lead({ id: '4', name: 'Preview', evidence: [evidence({ id: 'e4', fieldPath: 'web.telegram.unknown', value: 'https://t.me/s/smile_feed', sourceType: 'company_website', sourceUrl: 'https://smile.example/' })], phone: '+998901000004' }),
  ], { verdicts });
  assert.equal(rows.length, 4, 'the businesses stay reachable by phone');
  assert.ok(rows.every((item) => item.telegramUsername === null));
  assert.equal(summary.excludedTelegram.channel, 2);
  assert.equal(summary.excludedTelegram.group, 1);
  assert.equal(summary.excludedTelegram.not_found, 1);
});

test('personal accounts and web-studio handles are never exported as the company', () => {
  const { rows, summary } = buildLeadExport([
    lead({
      id: '1', name: 'Personal',
      contactCandidates: [candidate({ key: 'tg:doctor', kind: 'telegram', value: '@doctor_ivanova', ownership: 'personal' })],
    }),
    lead({
      id: '2', name: 'Vendor',
      evidence: [evidence({ id: 'e2', fieldPath: 'web.telegram.unknown', value: 'https://t.me/webstudio_uz', sourceType: 'company_website', sourceUrl: 'https://vendor.example/', confidence: 0.2 })],
    }),
  ]);
  assert.equal(rows.length, 0);
  assert.equal(summary.excludedTelegram.personal, 1);
  assert.equal(summary.excludedTelegram.vendor, 1);
});

test('placeholder, foreign, extension and personal numbers are cut', () => {
  const { rows, summary } = buildLeadExport([
    lead({ id: '1', name: 'Placeholder', phone: '+998 90 111 11 11' }),
    lead({ id: '2', name: 'Foreign', phone: '+7 916 123 45 67' }),
    lead({ id: '3', name: 'Extension', contactCandidates: [candidate({ key: 'p:ext', kind: 'phone', value: '+998712000001', reason: 'extension' })] }),
    lead({ id: '4', name: 'Personal', contactCandidates: [candidate({ key: 'p:own', kind: 'phone', value: '+998901234500', ownership: 'personal' })] }),
  ]);
  assert.equal(rows.length, 0);
  assert.equal(summary.excludedPhones.placeholder, 1);
  assert.equal(summary.excludedPhones.foreign, 1);
  assert.equal(summary.excludedPhones.extension, 1);
  assert.equal(summary.excludedPhones.personal, 1);
});

test('a number or handle shared by three or more businesses is a call-centre or studio, not theirs', () => {
  const leads = ['A', 'B', 'C'].map((name, index) => lead({
    id: String(index), name: `Clinic ${name}`, phone: '+998 90 555 44 33', telegramUrl: 'https://t.me/booking_center',
  }));
  const { rows, summary } = buildLeadExport(leads);
  assert.equal(rows.length, 0);
  assert.equal(summary.excludedPhones.shared, 3);
  assert.equal(summary.excludedTelegram.shared, 3);
});

test('one OSM object seen under several names keeps its own number (niche scope)', () => {
  const osm = 'https://www.openstreetmap.org/node/909';
  const names = ['Smile Dent', 'Смайл Дент', 'Smile Dent Clinic'];
  const { rows, summary } = buildLeadExport(names.map((name, index) => lead({
    id: `n${index}`, searchId: `s${index}`, name,
    evidence: [evidence({ id: `e${index}`, fieldPath: 'company_contacts.phone', value: '+998 90 777 66 55', sourceUrl: osm })],
  })));
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.phoneMobile1, '+998907776655');
  assert.equal(summary.excludedPhones.shared, undefined);
});

test('the summary counts handles whose type is still unknown', () => {
  const { summary } = buildLeadExport([
    lead({ id: '1', name: 'Unknown Type', telegramUrl: 'https://t.me/fresh_clinic' }),
    lead({ id: '2', name: 'Known User', telegramUrl: 'https://t.me/known_clinic' }),
  ], { verdicts: new Map<string, TelegramHandleKind>([['known_clinic', 'user']]) });
  assert.equal(summary.withTelegram, 2);
  assert.equal(summary.unclassifiedTelegram, 1);
});

test('lexical helpers: bot suffix and repeated-digit placeholders', () => {
  assert.equal(isBotUsername('DentClinicBot'), true);
  assert.equal(isBotUsername('dent_clinic'), false);
  assert.equal(isPlaceholderPhone('+998901111111'), true);
  assert.equal(isPlaceholderPhone('+998901234567'), false);
});

test('only unverified handles without a verdict are queued for the free public check', () => {
  const verdicts = new Map<string, TelegramHandleKind>([['known_clinic', 'user']]);
  const pending = exportHandlesNeedingCheck([
    lead({ id: '1', name: 'Known', telegramUrl: 'https://t.me/known_clinic' }),
    lead({ id: '2', name: 'Unknown', telegramUrl: 'https://t.me/fresh_clinic' }),
    lead({ id: '3', name: 'Bot', telegramUrl: 'https://t.me/fresh_clinic_bot' }),
  ], verdicts);
  assert.deepEqual(pending, ['fresh_clinic']);
});

// ── Niche scope keys ────────────────────────────────────────────────────────

test('niche and city keys survive spelling, case and script variants', () => {
  assert.equal(exportNicheKey('Стоматология'), exportNicheKey('стоматологии'));
  assert.notEqual(exportNicheKey('Стоматология'), exportNicheKey('Автосервис'));
  assert.equal(exportCityKey('Ташкент'), exportCityKey('Tashkent'));
  assert.equal(exportCityKey('Toshkent'), exportCityKey('ташкент'));
  assert.notEqual(exportCityKey('Самарканд'), exportCityKey('Ташкент'));
});

// ── File formats ────────────────────────────────────────────────────────────

test('CSV writes usernames without @ so TG Sender imports them, plus the t.me link', () => {
  const csv = renderCsv([row({ telegramUsername: 'dentalclinic', telegramUrl: 'https://t.me/dentalclinic', telegramType: 'unknown' })]);
  const [header, data] = csv.replace(/^\uFEFF/, '').trim().split('\r\n');
  assert.equal(header, EXPORT_CSV_HEADER.join(','));
  const cells = data!.split(',');
  assert.equal(cells[EXPORT_CSV_HEADER.indexOf('telegram_username')], 'dentalclinic');
  assert.equal(cells[EXPORT_CSV_HEADER.indexOf('telegram_url')], 'https://t.me/dentalclinic');
  assert.ok(!csv.includes("'@"), 'the formula guard never mangles a username');
});

test('CSV is UTF-8 BOM prefixed, CRLF terminated and quotes separators', () => {
  const csv = renderCsv([row({ company: 'Клиника "Улыбка", Ташкент', address: 'ул. Навои 1', score: 42 })]);
  assert.ok(csv.startsWith('\uFEFF'), 'BOM keeps Cyrillic readable in Excel');
  assert.ok(csv.endsWith('\r\n'));
  assert.ok(!csv.includes('\n\n'), 'no bare LF leaks');
  assert.match(csv, /"Клиника ""Улыбка"", Ташкент"/, 'embedded quote and comma are escaped');
  assert.match(csv, /,\+998901234567,/, 'E.164 stays importable, not quote-prefixed');
});

test('CSV neutralises spreadsheet formulas in third-party text', () => {
  const csv = renderCsv([row({ company: '=cmd|\'/c calc\'!A1' })]);
  assert.match(csv, /'=cmd/, 'a leading = would execute on open');
  assert.match(csv, /,\+998901234567,/, 'the phone itself is untouched');
});

test('CSV drops a malformed username or phone instead of guarding it', () => {
  const csv = renderCsv([row({ phoneMobile1: '=1+1', telegramUsername: '@bad name' })]);
  const cells = csv.replace(/^\uFEFF/, '').trim().split('\r\n')[1]!.split(',');
  assert.equal(cells[EXPORT_CSV_HEADER.indexOf('phone_mobile_1')], '');
  assert.equal(cells[EXPORT_CSV_HEADER.indexOf('telegram_username')], '');
  assert.equal(cells[EXPORT_CSV_HEADER.indexOf('telegram_url')], '');
});

test('CSV strips control characters instead of letting them corrupt the row', () => {
  const csv = renderCsv([row({ company: 'A\u0000B\u0007C\u007f' })]);
  // CRLF is the row terminator and is itself a C0 control, so it is removed
  // before asserting that no stray control character survived into the cells.
  const cells = csv.replace(/\r\n/g, '');
  const survived = [...cells].filter((char) => {
    const code = char.codePointAt(0) ?? 0;
    return code < 0x20 || code === 0x7f;
  });
  assert.deepEqual(survived, [], 'no C0 control or DEL survives');
  assert.match(cells, /A B C/, 'each one became a space');
});

test('vCard carries mobiles as CELL, the landline as WORK and Telegram in the note', () => {
  const vcf = renderVcf([row({
    phoneMobile2: '+998937654321',
    phoneLandline: '+998712000001',
    telegramUsername: 'dentalclinic',
    website: 'https://clinic.uz',
    address: 'ул. Навои 1',
  })]);
  assert.match(vcf, /^BEGIN:VCARD\r\nVERSION:3\.0\r\n/);
  assert.match(vcf, /FN:Клиника Улыбка/);
  assert.match(vcf, /TEL;TYPE=CELL,WORK:\+998901234567/);
  assert.match(vcf, /TEL;TYPE=CELL,WORK:\+998937654321/);
  assert.match(vcf, /TEL;TYPE=WORK,VOICE:\+998712000001/);
  assert.match(vcf, /NOTE:Telegram @dentalclinic https:\/\/t\.me\/dentalclinic/);
  assert.match(vcf, /END:VCARD\r\n$/);
  assert.equal(vcf.split('BEGIN:VCARD').length - 1, 1);
});

test('vCard escapes structural characters instead of breaking the record', () => {
  const vcf = renderVcf([row({ company: 'A;B, C' })]);
  assert.match(vcf, /FN:A\\;B\\, C/);
});

test('an empty export produces headers only, never a broken file', () => {
  assert.equal(renderCsv([]), `\uFEFF${EXPORT_CSV_HEADER.join(',')}\r\n`);
  assert.equal(renderVcf([]), '');
});
