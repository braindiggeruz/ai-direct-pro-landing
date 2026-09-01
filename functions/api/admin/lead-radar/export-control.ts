import { ownerError, type OwnerHandlerContext } from '../../../platform/admin';
import {
  assertLeadRadarRuntimeSchema,
  LeadRadarSchemaUnavailableError,
  LeadRadarStore,
} from '../../../platform/lead-radar';
import type { LeadRadarLead } from '../../../../src/shared/lead-radar';
import { recipientContactChoices } from '../../../../src/shared/lead-radar-recipient-contacts';

/**
 * Outreach export.
 *
 * Lead Radar can dispatch through the Telegram bridge only, which needs a
 * connected account and a resolved corporate endpoint. Most discovered
 * businesses never reach that state, so a discovery result the owner cannot
 * act on is wasted work. This route turns a search into a contact list the
 * owner can actually use: import into a phone book, a dialer or WhatsApp.
 *
 * It is read-only and owner-scoped. It never marks anything as contacted,
 * never sends anything, and never widens the DNC rules.
 */

type ExportFormat = 'csv' | 'vcf';

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

/**
 * Quote and neutralize a free-text cell.
 *
 * OSM `name`, `address` and `website` tags are contributed by the public and
 * can legitimately begin with `=`. Written verbatim into a CSV they become a
 * formula when the owner opens the file. E.164 phone values are not passed
 * through here: they are digits plus a leading `+` produced by our own
 * normalizer, so they are structurally safe, and prefixing them would break
 * every dialer and messaging-app importer.
 */
function csvText(value: string | null | undefined): string {
  const text = (value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ');
  const safe = FORMULA_PREFIX.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** E.164 is `+` plus digits only, so it can be written as-is. */
function csvPhone(value: string | null): string {
  return value ?? '';
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

/**
 * Build the export rows from a search result.
 *
 * `recipientContactChoices` is reused rather than reimplemented: it already
 * applies the DNC/suppression rules, collects phones from the lead, its
 * evidence and its contact candidates, and deduplicates into E.164 form.
 */
export function buildExportRows(leads: readonly LeadRadarLead[]): ExportRow[] {
  const rows: ExportRow[] = [];
  const seen = new Set<string>();
  for (const lead of leads) {
    const choices = recipientContactChoices(lead);
    if (!choices.selectable) continue;
    const phone = choices.mobilePhones[0] ?? null;
    const telegram = choices.usernames[0] ? `@${choices.usernames[0]}` : null;
    // One business per reachable channel. Two leads sharing a phone are the
    // same recipient, and sending twice is the fastest way to get blocked.
    const key = phone ? `phone:${phone}` : `tg:${telegram}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      company: lead.name,
      phone,
      telegram,
      website: lead.website,
      address: lead.address,
      city: lead.city,
      priority: lead.priority,
      score: lead.score,
    });
  }
  return rows;
}

export function renderCsv(rows: readonly ExportRow[]): string {
  const header = ['company', 'phone', 'telegram', 'website', 'address', 'city', 'priority', 'score'];
  const lines = [header.join(',')];
  for (const row of rows) {
    lines.push([
      csvText(row.company),
      csvPhone(row.phone),
      csvText(row.telegram),
      csvText(row.website),
      csvText(row.address),
      csvText(row.city),
      csvText(row.priority),
      String(row.score),
    ].join(','));
  }
  // CRLF keeps Excel happy; the BOM keeps Cyrillic names from turning into
  // mojibake on a Windows machine without an explicit UTF-8 import.
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

export function renderVcf(rows: readonly ExportRow[]): string {
  return rows
    .map((row) => [
      'BEGIN:VCARD',
      'VERSION:3.0',
      `FN:${vcfEscape(row.company)}`,
      `ORG:${vcfEscape(row.company)}`,
      ...(row.phone ? [`TEL;TYPE=CELL,WORK:${row.phone}`] : []),
      ...(row.website ? [`URL:${vcfEscape(row.website)}`] : []),
      ...(row.address || row.city ? [`ADR;TYPE=WORK:;;${vcfEscape(row.address ?? row.city)};;;;`] : []),
      ...(row.telegram ? [`NOTE:${vcfEscape(row.telegram)}`] : []),
      'END:VCARD',
    ].join('\r\n'))
    .join('\r\n') + '\r\n';
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
  const searchId = parts[1];
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(searchId)) return ownerError('search_not_found', ctx.requestId, 404);

  const store = new LeadRadarStore(ctx.db);
  const result = await store.getSearch(orgId, searchId);
  if (!result) return ownerError('search_not_found', ctx.requestId, 404);

  const rows = buildExportRows(result.leads);
  const input = result.search.input;
  const stem = fileStem(`${input.niche ?? 'leads'}-${input.city ?? ''}`);
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
      'X-Export-Leads': String(result.leads.length),
    },
  });
}
