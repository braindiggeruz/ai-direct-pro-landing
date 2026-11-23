import { ownerError, type OwnerHandlerContext } from '../../../platform/admin';
import {
  assertLeadRadarRuntimeSchema,
  LeadRadarSchemaUnavailableError,
  LeadRadarStore,
} from '../../../platform/lead-radar';
import { resolveLeadRadarIntent, normalizeLeadRadarIntentText } from '../../../platform/lead-radar/intent';
import {
  checkTelegramHandlesPublicly,
  readTelegramHandleVerdicts,
} from '../../../platform/lead-radar/telegram-handle-check';
import type { LeadRadarLead } from '../../../../src/shared/lead-radar';
import {
  buildLeadExport,
  exportHandlesNeedingCheck,
  type ExportRowV2,
  type ExportSummary,
  type TelegramHandleKind,
} from '../../../../src/shared/lead-radar-export-contacts';
import { parseLeadRadarTelegramLocator } from '../../../../src/shared/lead-radar-contacts';

/**
 * Outreach export (rebuilt after the owner audit of 22.11.2026).
 *
 * Turns one search — or every search of the same niche and city — into a
 * contact file the owner can import into TG Sender, a phone book, a dialer or
 * WhatsApp. Bots, channels, groups, personal accounts, dead usernames,
 * web-studio handles, placeholder, foreign and call-centre numbers are left
 * out with a reason (see X-Export-Summary). Usernames are written without `@`
 * so the CSV formula guard never turns them into `'@x`, which TG Sender's
 * importer rejected.
 *
 * Read-only and owner-scoped: it never marks anything as contacted, never
 * sends, never widens DNC. The only side effect is the shared public-handle
 * cache filled by the free t.me page check.
 */

type ExportFormat = 'csv' | 'vcf';
type ExportScope = 'search' | 'niche';

/** Kept for callers that still read the old shape (one phone, one handle). */
export interface ExportRow {
  company: string;
  phone: string | null;
  telegram: string | null;
  website: string | null;
  address: string | null;
  city: string;
  priority: string;
  score: number;
}

export function isExportPath(parts: string[]): boolean {
  return parts.length === 3 && parts[0] === 'searches' && parts[2] === 'export';
}

/** Characters a spreadsheet evaluates as the start of a formula. */
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

/** C0 controls and DEL cannot occur in a real company name and would corrupt
 *  the row structure. Filtered by code point rather than a regex literal so the
 *  `no-control-regex` lint rule stays satisfied without an exemption. */
function stripControlCharacters(value: string): string {
  let out = '';
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    out += code < 0x20 || code === 0x7f ? ' ' : char;
  }
  return out;
}

/**
 * Quote and neutralize a free-text cell.
 *
 * OSM `name`, `address` and `website` tags are contributed by the public and
 * can legitimately begin with `=`. Written verbatim into a CSV they become a
 * formula when the owner opens the file. E.164 phone values are not passed
 * through here: they are digits plus a leading `+` produced by our own
 * normalizer, so they are structurally safe, and prefixing them would break
 * every dialer and messaging-app importer. Usernames are written without `@`
 * (they start with a letter), so they never need the guard either.
 */
function csvText(value: string | null | undefined): string {
  const text = stripControlCharacters(value ?? '');
  const safe = FORMULA_PREFIX.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** E.164 is `+` plus digits only, so it can be written as-is. */
function csvPhone(value: string | null): string {
  return value && /^\+\d{7,15}$/.test(value) ? value : '';
}

/** A username is `[a-z][a-z0-9_]{4,31}` by construction; anything else is dropped, never guarded. */
function csvUsername(value: string | null): string {
  return value && /^[a-z][a-z0-9_]{4,31}$/.test(value) ? value : '';
}

function vcfEscape(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

function fileStem(value: string): string {
  const ascii = value
    .toLocaleLowerCase('en-US')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return ascii.length >= 3 ? ascii : 'leads';
}

const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm',
  н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch',
  ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya', қ: 'q', ғ: 'g', ҳ: 'h', ў: 'o',
};
function transliterate(value: string): string {
  return [...value.toLowerCase()].map((char) => TRANSLIT[char] ?? char).join('');
}

/** Back-compatible projection: the first mobile and the best clean username. */
export function buildExportRows(leads: readonly LeadRadarLead[]): ExportRow[] {
  return buildLeadExport(leads, { includeLandlineOnly: false }).rows.map((row) => ({
    company: row.company,
    phone: row.phoneMobile1,
    telegram: row.telegramUsername ? `@${row.telegramUsername}` : null,
    website: row.website,
    address: row.address,
    city: row.city,
    priority: row.priority,
    score: row.score,
  }));
}

export const EXPORT_CSV_HEADER = [
  'company', 'niche', 'city', 'phone_mobile_1', 'phone_mobile_2', 'phone_landline',
  'telegram_username', 'telegram_url', 'telegram_type', 'contact_status',
  'source', 'source_url', 'source_date', 'stale', 'website', 'address', 'priority', 'score',
] as const;

export function renderCsv(rows: readonly ExportRowV2[]): string {
  const lines = [EXPORT_CSV_HEADER.join(',')];
  for (const row of rows) {
    lines.push([
      csvText(row.company),
      csvText(row.niche),
      csvText(row.city),
      csvPhone(row.phoneMobile1),
      csvPhone(row.phoneMobile2),
      csvPhone(row.phoneLandline),
      csvUsername(row.telegramUsername),
      row.telegramUsername && csvUsername(row.telegramUsername) ? `https://t.me/${row.telegramUsername}` : '',
      row.telegramType ?? '',
      row.contactStatus,
      row.source,
      csvText(row.sourceUrl),
      row.sourceDate ? row.sourceDate.slice(0, 10) : '',
      row.stale ? 'yes' : '',
      csvText(row.website),
      csvText(row.address),
      csvText(row.priority),
      String(row.score),
    ].join(','));
  }
  // CRLF keeps Excel happy; the BOM keeps Cyrillic names from turning into
  // mojibake on a Windows machine without an explicit UTF-8 import.
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

export function renderVcf(rows: readonly ExportRowV2[]): string {
  return rows
    .map((row) => [
      'BEGIN:VCARD',
      'VERSION:3.0',
      `FN:${vcfEscape(row.company)}`,
      `ORG:${vcfEscape(row.company)}`,
      ...(row.phoneMobile1 ? [`TEL;TYPE=CELL,WORK:${row.phoneMobile1}`] : []),
      ...(row.phoneMobile2 ? [`TEL;TYPE=CELL,WORK:${row.phoneMobile2}`] : []),
      ...(row.phoneLandline ? [`TEL;TYPE=WORK,VOICE:${row.phoneLandline}`] : []),
      ...(row.website ? [`URL:${vcfEscape(row.website)}`] : []),
      ...(row.address || row.city ? [`ADR;TYPE=WORK:;;${vcfEscape(row.address ?? row.city)};;;;`] : []),
      ...(row.telegramUsername ? [`NOTE:${vcfEscape(`Telegram @${row.telegramUsername} https://t.me/${row.telegramUsername}`)}`] : []),
      'END:VCARD',
    ].join('\r\n'))
    .join('\r\n') + (rows.length ? '\r\n' : '');
}

/** Niche identity that survives spelling variants («Стоматология», «Стоматологии», «Stomatologia»). */
export function exportNicheKey(niche: string): string {
  const intent = resolveLeadRadarIntent(niche);
  return intent.canonicalId ?? `text:${normalizeLeadRadarIntentText(niche)}`;
}

export function exportCityKey(city: string): string {
  const normalized = transliterate(normalizeLeadRadarIntentText(city)).replace(/[^a-z0-9]+/g, '');
  return normalized === 'toshkent' ? 'tashkent' : normalized;
}

function handlesOf(leads: readonly LeadRadarLead[]): string[] {
  const handles = new Set<string>();
  const add = (value: string | null | undefined) => {
    if (!value) return;
    const locator = parseLeadRadarTelegramLocator(value.startsWith('@') || value.startsWith('http') || value.startsWith('tg:') ? value : `@${value}`);
    if (locator?.kind === 'username') handles.add(locator.value.toLowerCase());
  };
  for (const lead of leads) {
    add(lead.telegramContact?.username);
    add(lead.telegramUrl);
    for (const evidence of lead.evidence) if (evidence.fieldPath.startsWith('web.telegram.')) add(evidence.value);
    for (const candidate of lead.contactCandidates ?? []) if (candidate.kind === 'telegram') add(candidate.value);
  }
  return [...handles];
}

function summaryHeader(summary: ExportSummary, checked: number): string {
  // ASCII-only JSON: header values must stay Latin-1 safe.
  return JSON.stringify({ ...summary, publicChecks: checked });
}

export async function handleExportRequest(
  ctx: OwnerHandlerContext,
  parts: string[],
  orgId: string,
): Promise<Response> {
  if (ctx.request.method !== 'GET') return ownerError('method_not_allowed', ctx.requestId, 405);
  try {
    await assertLeadRadarRuntimeSchema(ctx.db);
  } catch (error) {
    if (error instanceof LeadRadarSchemaUnavailableError) {
      const response = ownerError(error.code, ctx.requestId, 503);
      response.headers.set('Retry-After', '300');
      return response;
    }
    throw error;
  }

  const format: ExportFormat = ctx.url.searchParams.get('format') === 'vcf' ? 'vcf' : 'csv';
  const scope: ExportScope = ctx.url.searchParams.get('scope') === 'niche' ? 'niche' : 'search';
  const runPublicCheck = ctx.url.searchParams.get('check') !== '0';
  const searchId = parts[1];
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(searchId)) return ownerError('search_not_found', ctx.requestId, 404);

  const store = new LeadRadarStore(ctx.db);
  const result = await store.getSearch(orgId, searchId);
  if (!result) return ownerError('search_not_found', ctx.requestId, 404);
  const input = result.search.input;

  let leads: LeadRadarLead[] = result.leads;
  let searchesUsed = 1;
  if (scope === 'niche') {
    const nicheKey = exportNicheKey(input.niche ?? '');
    const cityKey = exportCityKey(input.city ?? '');
    // The newest 12 matching searches, read in one company query and one
    // evidence query (the D1 budget is 50 queries per invocation).
    const peers = (await store.listSearchesForExport(orgId, 80))
      .filter((item) => item.id !== searchId && exportNicheKey(item.input.niche ?? '') === nicheKey
        && exportCityKey(item.input.city ?? '') === cityKey)
      .slice(0, 12);
    if (peers.length && leads.length < 1500) {
      leads = leads.concat(await store.getLeadsForSearches(orgId, peers.map((peer) => peer.id), 1500 - leads.length));
      searchesUsed += peers.length;
    }
  }

  let verdicts = await readTelegramHandleVerdicts(ctx.db, handlesOf(leads));
  let checked = 0;
  if (runPublicCheck) {
    const pending = exportHandlesNeedingCheck(leads, verdicts);
    if (pending.length) {
      const fresh = await checkTelegramHandlesPublicly(ctx.db, pending, { limit: 40, budgetMs: 15000 });
      checked = fresh.size;
      if (fresh.size) verdicts = new Map<string, TelegramHandleKind>([...verdicts, ...fresh]);
    }
  }

  const niche = input.niche ?? '';
  const { rows, summary } = buildLeadExport(leads, { niche, verdicts });
  const stem = fileStem(`${transliterate(niche || 'leads')}-${transliterate(input.city ?? '')}${scope === 'niche' ? '-all' : ''}`);
  const date = new Date().toISOString().slice(0, 10);

  const body = format === 'vcf' ? renderVcf(rows) : renderCsv(rows);
  const filename = `leads-${stem}-${date}.${format}`;
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': format === 'vcf'
        ? 'text/vcard; charset=utf-8'
        : 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
      'X-Export-Rows': String(rows.length),
      'X-Export-Leads': String(leads.length),
      'X-Export-Searches': String(searchesUsed),
      'X-Export-Summary': summaryHeader(summary, checked),
      'Access-Control-Expose-Headers': 'X-Export-Rows, X-Export-Leads, X-Export-Searches, X-Export-Summary, Content-Disposition',
    },
  });
}
