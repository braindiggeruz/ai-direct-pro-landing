import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { LeadRadarLead } from '../src/shared/lead-radar';
import {
  buildExportRows,
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

test('the export route is recognised only in its exact shape', () => {
  assert.equal(isExportPath(['searches', 'abc', 'export']), true);
  assert.equal(isExportPath(['searches', 'abc', 'enrichment']), false);
  assert.equal(isExportPath(['searches', 'abc']), false);
  assert.equal(isExportPath(['export']), false);
  assert.equal(isExportPath(['searches', 'abc', 'export', 'x']), false);
});

test('only reachable leads are exported, and fixed lines are not reachable', () => {
  const rows = buildExportRows([
    lead({ id: '1', name: 'Mobile Clinic', phone: '+998 90 123 45 67' }),
    // A Tashkent landline is not a messaging endpoint.
    lead({ id: '2', name: 'Landline Clinic', phone: '+998 71 123 45 67' }),
    lead({ id: '3', name: 'No Contact' }),
  ]);
  assert.deepEqual(rows.map((row) => row.company), ['Mobile Clinic']);
  assert.equal(rows[0]?.phone, '+998901234567');
});

test('do-not-contact and suppressed leads never reach an export', () => {
  const rows = buildExportRows([
    lead({ id: '1', name: 'DNC', phone: '+998901234567', lifecycle: 'do_not_contact' }),
    lead({ id: '2', name: 'Suppressed', phone: '+998901234568', suppressed: true }),
    lead({ id: '3', name: 'Fine', phone: '+998901234569' }),
  ]);
  assert.deepEqual(rows.map((row) => row.company), ['Fine']);
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

test('CSV is UTF-8 BOM prefixed, CRLF terminated and quotes separators', () => {
  const csv = renderCsv([{
    company: 'Клиника "Улыбка", Ташкент',
    phone: '+998901234567',
    telegram: null,
    website: null,
    address: 'ул. Навои 1',
    city: 'Ташкент',
    priority: 'p1',
    score: 42,
  }]);
  assert.ok(csv.startsWith('\uFEFF'), 'BOM keeps Cyrillic readable in Excel');
  assert.ok(csv.endsWith('\r\n'));
  assert.ok(!csv.includes('\n\n'), 'no bare LF leaks');
  assert.match(csv, /company,phone,telegram,website,address,city,priority,score/);
  assert.match(csv, /"Клиника ""Улыбка"", Ташкент"/, 'embedded quote and comma are escaped');
  assert.match(csv, /,\+998901234567,/, 'E.164 stays importable, not quote-prefixed');
});

test('CSV neutralises spreadsheet formulas in third-party text', () => {
  const csv = renderCsv([{
    company: '=cmd|\'/c calc\'!A1',
    phone: '+998901234567',
    telegram: null,
    website: null,
    address: null,
    city: 'Ташкент',
    priority: 'p1',
    score: 0,
  }]);
  assert.match(csv, /'=cmd/, 'a leading = would execute on open');
  assert.match(csv, /,\+998901234567,/, 'the phone itself is untouched');
});

test('CSV strips control characters instead of letting them corrupt the row', () => {
  const csv = renderCsv([{
    company: 'A\u0000B\u0007C\u007f',
    phone: '+998901234567',
    telegram: null,
    website: null,
    address: null,
    city: 'Tashkent',
    priority: 'p1',
    score: 0,
  }]);
  // CRLF is the row terminator and is itself a C0 control, so it is removed
  // before asserting that no stray control character survived into the cells.
  // Scanned by code point for the same reason the implementation is: a regex
  // literal holding control characters trips `no-control-regex`.
  const cells = csv.replace(/\r\n/g, '');
  const survived = [...cells].filter((char) => {
    const code = char.codePointAt(0) ?? 0;
    return code < 0x20 || code === 0x7f;
  });
  assert.deepEqual(survived, [], 'no C0 control or DEL survives');
  assert.match(cells, /A B C/, 'each one became a space');
});

test('vCard renders an importable single contact', () => {
  const vcf = renderVcf([{
    company: 'Клиника Улыбка',
    phone: '+998901234567',
    telegram: '@dentalclinic',
    website: 'https://clinic.uz',
    address: 'ул. Навои 1',
    city: 'Ташкент',
    priority: 'p1',
    score: 0,
  }]);
  assert.match(vcf, /^BEGIN:VCARD\r\nVERSION:3\.0\r\n/);
  assert.match(vcf, /FN:Клиника Улыбка/);
  assert.match(vcf, /TEL;TYPE=CELL,WORK:\+998901234567/);
  assert.match(vcf, /END:VCARD\r\n$/);
  assert.equal(vcf.split('BEGIN:VCARD').length - 1, 1);
});

test('vCard escapes structural characters instead of breaking the record', () => {
  const vcf = renderVcf([{
    company: 'A;B, C',
    phone: '+998901234567',
    telegram: null,
    website: null,
    address: null,
    city: 'Ташкент',
    priority: 'p1',
    score: 0,
  }]);
  assert.match(vcf, /FN:A\\;B\\, C/);
});

test('an empty search produces headers only, never a broken file', () => {
  assert.equal(renderCsv([]), '\uFEFFcompany,phone,telegram,website,address,city,priority,score\r\n');
  assert.equal(renderVcf([]), '\r\n');
});
