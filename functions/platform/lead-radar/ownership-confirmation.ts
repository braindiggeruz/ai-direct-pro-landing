import { safePublicHttpUrl } from './validation';

export interface OwnershipConfirmationResult {
  confirmed: boolean;
  reason: 'confirmed' | 'already_confirmed' | 'company_not_found' | 'no_confirmable_endpoint' | 'do_not_contact';
  confirmedEndpoints: number;
}

function randomId(): string {
  return crypto.randomUUID().replaceAll('-', '');
}

function sameOrigin(a: string, b: URL): boolean {
  try { return new URL(a).origin === b.origin; } catch { return false; }
}

const EVIDENCE_INSERT = `INSERT INTO lead_radar_evidence
  (id,org_id,company_id,field_path,value,source_url,source_type,observed_at,confidence,classification)
  VALUES (?,?,?,?,?,?,?,?,?,?)`;

/** R4 (free-discovery roadmap): an operator who eyeballed the company's own
 * website records that the published endpoint belongs to that company. The
 * confirmation is written as ordinary website evidence, so every existing
 * gate — proof digests, strict Bridge verification, authorization, DNC,
 * account binding — keeps working unchanged. No new trust tier, no migration. */
export async function confirmCompanyWebsiteOwnership(input: {
  db: D1Database; orgId: string; companyId: string; operatorId: string; now?: Date;
}): Promise<OwnershipConfirmationResult> {
  const operatorId = input.operatorId.trim().slice(0, 120);
  const now = (input.now ?? new Date()).toISOString();
  const company = await input.db.prepare(
    `SELECT id, website, suppressed, lifecycle FROM lead_radar_companies WHERE org_id=? AND id=?`,
  ).bind(input.orgId, input.companyId)
    .first<{ id: string; website: string | null; suppressed: number; lifecycle: string }>();
  if (!company) return { confirmed: false, reason: 'company_not_found', confirmedEndpoints: 0 };
  if (company.suppressed === 1 || company.lifecycle === 'do_not_contact') {
    return { confirmed: false, reason: 'do_not_contact', confirmedEndpoints: 0 };
  }
  const site = safePublicHttpUrl(company.website);
  if (!site) return { confirmed: false, reason: 'no_confirmable_endpoint', confirmedEndpoints: 0 };
  const rows = (await input.db.prepare(
    `SELECT field_path, value, source_url, source_type, confidence FROM lead_radar_evidence
     WHERE org_id=? AND company_id=? AND (field_path='web.company_binding' OR field_path LIKE 'web.telegram.%')`,
  ).bind(input.orgId, input.companyId)
    .all<{ field_path: string; value: string; source_url: string; source_type: string; confidence: number }>()).results ?? [];
  if (rows.some((row) => row.field_path === 'web.company_binding' && row.value.startsWith('operator_confirmed:'))) {
    return { confirmed: false, reason: 'already_confirmed', confirmedEndpoints: 0 };
  }
  // Only endpoints the company's own origin publishes. Personal, bot, channel
  // and group markers are never re-classified, so a stray personal link in a
  // footer cannot be promoted into a corporate endpoint.
  const endpoints = rows.filter((row) => row.field_path.startsWith('web.telegram.')
    && !['web.telegram.human', 'web.telegram.bot', 'web.telegram.channel', 'web.telegram.group'].includes(row.field_path)
    && row.source_type === 'company_website'
    && row.source_url && sameOrigin(row.source_url, site));
  if (!endpoints.length) return { confirmed: false, reason: 'no_confirmable_endpoint', confirmedEndpoints: 0 };
  const statements = [
    input.db.prepare(EVIDENCE_INSERT).bind(`ev_${randomId()}`, input.orgId, input.companyId,
      'web.company_binding', `operator_confirmed:${operatorId}`, site.toString(), 'company_website', now, 0.9, 'fact'),
  ];
  for (const endpoint of endpoints.slice(0, 3)) {
    statements.push(input.db.prepare(EVIDENCE_INSERT).bind(`ev_${randomId()}`, input.orgId, input.companyId,
      'web.telegram.business', endpoint.value, endpoint.source_url, 'company_website', now,
      Math.max(0.9, endpoint.confidence), 'fact'));
  }
  await input.db.batch(statements);
  return { confirmed: true, reason: 'confirmed', confirmedEndpoints: statements.length - 1 };
}
