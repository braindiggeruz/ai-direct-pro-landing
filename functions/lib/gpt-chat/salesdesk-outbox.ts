import { genId, readJsonLimited } from './http';
import type { LeadValidation } from './validate';

export const SALESDESK_ENDPOINT = 'https://gptbot-salesdesk.braindigger-uz.workers.dev/integrations/website/leads';
const INGRESS_PATH = '/integrations/website/leads';
export const SALESDESK_PAGE = '/uz/instagram-target-yoqish/';
export interface SalesdeskEnv { GPT_SALESDESK_INGRESS_SECRET?: string }
type ValidLead = NonNullable<LeadValidation['value']>;
export interface SalesdeskPayload {
  schemaVersion: 1; origin: 'https://gptbot.uz'; pagePath: typeof SALESDESK_PAGE;
  service: 'target'; source: 'page_form'; leadId: string; requestId: string;
  acceptedAt: string; locale: 'ru' | 'uz'; mode: 'live' | 'backfill';
  contact: { type: 'phone' | 'telegram' | 'email'; value: string };
  name?: string; phone?: string; telegram?: string; intent?: string; budget?: string;
  attribution: { campaignId?: string; adsetId?: string; adId?: string; landingVariant?: string; fbclid?: string; utm?: Record<string, string> };
}

export function isSalesdeskTargetLead(lead: ValidLead): boolean {
  return lead.source === 'page_form' && lead.service === 'target' && lead.pageUrl === SALESDESK_PAGE;
}
function text(value: unknown, max: number, multiline = false): string | undefined {
  if (typeof value !== 'string') return undefined;
  const clean = Array.from(value, char => {
    const code = char.charCodeAt(0);
    return (code < 32 || code === 127) && !(multiline && (code === 10 || code === 13)) ? ' ' : char;
  }).join('').trim().slice(0, max);
  return clean || undefined;
}
/** Freeze only the accepted, validated entity. Never infer missing ad IDs. */
export function buildSalesdeskPayload(lead: ValidLead, meta: {
  leadId: string; requestId: string; acceptedAt: string; locale: 'ru' | 'uz'; mode?: 'live' | 'backfill';
}): SalesdeskPayload | null {
  if (!isSalesdeskTargetLead(lead)) return null;
  if (!['phone', 'telegram', 'email'].includes(lead.contactType) || !/^[A-Za-z0-9_-]{16,80}$/.test(meta.requestId)) throw new Error('crm_invalid_entity');
  let utm: Record<string, unknown> = {};
  try { const parsed: unknown = JSON.parse(lead.utmJson || '{}'); if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) utm = parsed as Record<string, unknown>; } catch { /* Missing attribution remains missing. */ }
  const attribution: SalesdeskPayload['attribution'] = {};
  for (const [input, output] of [['campaign_id', 'campaignId'], ['adset_id', 'adsetId'], ['ad_id', 'adId']] as const) {
    const value = utm[input]; if (typeof value === 'string' && /^[0-9]{5,30}$/.test(value)) attribution[output] = value;
  }
  if (typeof utm.landing_variant === 'string' && /^[A-Za-z0-9_-]{1,120}$/.test(utm.landing_variant)) attribution.landingVariant = utm.landing_variant;
  const tags: Record<string, string> = {};
  for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'utm_id']) {
    const value = text(utm[key], 500); if (value) tags[key] = value;
  }
  if (Object.keys(tags).length) attribution.utm = tags;
  if (lead.attribution?.fbclid) attribution.fbclid = lead.attribution.fbclid;
  const payload: SalesdeskPayload = {
    schemaVersion: 1, origin: 'https://gptbot.uz', pagePath: SALESDESK_PAGE, service: 'target', source: 'page_form',
    ...meta, mode: meta.mode || 'live', contact: { type: lead.contactType as SalesdeskPayload['contact']['type'], value: lead.contactValue }, attribution,
  };
  for (const [key, max] of [['name', 120], ['phone', 40], ['telegram', 64], ['intent', 1000], ['budget', 80]] as const) {
    // The accepted primary contact is authoritative. Older callers may also
    // supply a different same-type optional contact; never replace primary.
    if ((key === 'phone' || key === 'telegram') && lead.contactType === key
      && lead[key]?.toLowerCase() !== lead.contactValue.toLowerCase()) continue;
    const value = text(lead[key], max, key === 'intent'); if (value) payload[key] = value;
  }
  return payload;
}

/** Include this statement in the SAME transaction as gpt_leads acceptance. */
export function salesdeskOutboxStatement(db: D1Database, payload: SalesdeskPayload): D1PreparedStatement {
  const raw = JSON.stringify(payload);
  if (new TextEncoder().encode(raw).byteLength > 16_384) throw new Error('crm_payload_too_large');
  return db.prepare(`INSERT INTO gpt_salesdesk_outbox
    (id, lead_id, request_id, payload_json, status, attempt_count, available_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'pending', 0, ?, ?, ?)`)
    .bind('crm_' + payload.leadId, payload.leadId, payload.requestId, raw, payload.acceptedAt, payload.acceptedAt, payload.acceptedAt);
}

type Outcome = 'completed' | 'pending' | 'blocked' | 'failed' | 'busy' | 'missing';
interface Row { id: string; request_id: string; payload_json: string; attempt_count: number; crm_operation_id: string | null }
function changes(result: D1Result): number { return Number(result.meta.changes || 0); }
function retryAt(now: Date, attempts: number): string {
  return new Date(now.getTime() + Math.min(3600, 30 * 2 ** Math.min(7, Math.max(0, attempts))) * 1000).toISOString();
}
async function signature(secret: string, timestamp: string, raw: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signed = await crypto.subtle.sign('HMAC', key, encoder.encode(`POST\n${INGRESS_PATH}\n${timestamp}\n${raw}`));
  return 'sha256=' + [...new Uint8Array(signed)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** No URL is configurable by visitor or env; redirects and response logs are forbidden. */
async function send(secret: string, raw: string, now: Date, fetcher: typeof fetch) {
  const timestamp = String(Math.floor(now.getTime() / 1000));
  const signed = await signature(secret, timestamp, raw);
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
        // Cloudflare Workers supports follow/manual; manual also keeps secrets
        // and private payloads from following a provider Location header.
        const response = await fetcher(SALESDESK_ENDPOINT, { method: 'POST', redirect: 'manual', signal: controller.signal,
          headers: { 'Content-Type': 'application/json', 'User-Agent': 'GPTBot-Website-Bridge/1.0', 'X-GPTBot-Timestamp': timestamp, 'X-GPTBot-Signature': signed }, body: raw });
        // The helper reads bounded bytes and releases its stream. Response and Request share that body contract.
        const parsed = await readJsonLimited<Record<string, unknown>>(response as unknown as Request, 16_384);
        return { status: response.status, body: parsed.ok ? parsed.value : null, retryAfter: response.headers.get('retry-after') };
      })(),
      new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('crm_timeout')); }, 4000); }),
    ]);
  } finally { clearTimeout(timer); }
}

/** Lease token fences a late response from an expired worker; receiver deduplicates requestId. */
export async function deliverSalesdeskOutboxItem(env: SalesdeskEnv, db: D1Database, outboxId: string, now = new Date(), fetcher: typeof fetch = fetch): Promise<Outcome> {
  const nowIso = now.toISOString(), token = genId('crmlease');
  const claim = await db.prepare(`UPDATE gpt_salesdesk_outbox SET status='sending',lease_token=?,lease_expires_at=?,updated_at=?
    WHERE id=? AND available_at<=? AND (status IN ('pending','blocked') OR (status='sending' AND lease_expires_at<=?))`)
    .bind(token, new Date(now.getTime() + 60_000).toISOString(), nowIso, outboxId, nowIso, nowIso).run();
  if (changes(claim) !== 1) return 'busy';
  const row = await db.prepare('SELECT id,request_id,payload_json,attempt_count,crm_operation_id FROM gpt_salesdesk_outbox WHERE id=? AND lease_token=?').bind(outboxId, token).first<Row>();
  if (!row) return 'missing';
  async function release(status: 'pending' | 'blocked' | 'failed', code: string, available = retryAt(now, row!.attempt_count + 1), attempted = true, operationId: string | null = null): Promise<Outcome> {
    const updated = await db.prepare(`UPDATE gpt_salesdesk_outbox SET status=?,attempt_count=attempt_count+?,available_at=?,last_error_code=?,crm_operation_id=COALESCE(crm_operation_id,?),lease_token=NULL,lease_expires_at=NULL,updated_at=?
      WHERE id=? AND status='sending' AND lease_token=?`).bind(status, attempted ? 1 : 0, available, code, operationId, nowIso, outboxId, token).run();
    if (changes(updated) !== 1) return 'busy';
    if (status === 'failed') console.warn(JSON.stringify({ event: 'gpt_salesdesk_terminal', code }));
    return status;
  }
  const secret = env.GPT_SALESDESK_INGRESS_SECRET;
  if (!secret || secret.trim().length < 32) return release('blocked', 'crm_unconfigured', retryAt(now, 7), false);
  let response: Awaited<ReturnType<typeof send>>;
  try { response = await send(secret, row.payload_json, now, fetcher); }
  catch { return release('pending', 'crm_transport'); }
  const body = response.body;
  const matching = body?.requestId === row.request_id && body?.accepted === true;
  const operationMatches = typeof body?.operationId === 'string' && /^[A-Za-z0-9_-]{8,128}$/.test(body.operationId)
    && (!row.crm_operation_id || row.crm_operation_id === body.operationId);
  if (response.status === 200 && matching && body?.state === 'completed' && body?.notifications === false
    && operationMatches
    && typeof body.leadId === 'number' && Number.isSafeInteger(body.leadId) && body.leadId > 0) {
    const ack = await db.prepare(`UPDATE gpt_salesdesk_outbox SET status='completed',attempt_count=attempt_count+1,delivered_at=?,crm_operation_id=?,crm_lead_id=?,last_error_code=NULL,lease_token=NULL,lease_expires_at=NULL,updated_at=?
      WHERE id=? AND status='sending' AND lease_token=?`).bind(nowIso, body.operationId, String(body.leadId), nowIso, outboxId, token).run();
    return changes(ack) === 1 ? 'completed' : 'busy';
  }
  if (response.status === 202 && matching && body?.state === 'pending' && body?.notifications === false && operationMatches)
    return release('pending', 'crm_pending', retryAt(now, row.attempt_count + 1), true, body.operationId as string);
  if (response.status === 422 && matching && body?.state === 'failed') return release('failed', 'crm_failed');
  if ([400, 409, 413, 415, 422].includes(response.status)) return release('failed', `crm_http_${response.status}`);
  if ([401, 403, 404, 405].includes(response.status)) return release('blocked', `crm_http_${response.status}`, retryAt(now, 7));
  if (response.status === 429 && /^\d+$/.test(response.retryAfter || '')) {
    return release('pending', 'crm_http_429', new Date(now.getTime() + Math.max(60, Math.min(3600, Number(response.retryAfter))) * 1000).toISOString());
  }
  return release('pending', response.status >= 500 ? 'crm_unavailable' : 'crm_invalid_receipt');
}

export async function drainSalesdeskOutbox(env: SalesdeskEnv, db: D1Database, limit = 3, now = new Date(), fetcher: typeof fetch = fetch) {
  const rows = await db.prepare(`SELECT id FROM gpt_salesdesk_outbox WHERE available_at<=?
    AND (status IN ('pending','blocked') OR (status='sending' AND lease_expires_at<=?)) ORDER BY created_at,id LIMIT ?`)
    .bind(now.toISOString(), now.toISOString(), Math.max(1, Math.min(5, Math.trunc(limit) || 1))).all<{ id: string }>();
  const counts = { attempted: 0, completed: 0, pending: 0, blocked: 0, failed: 0 };
  for (const row of rows.results || []) {
    counts.attempted++;
    const outcome = await deliverSalesdeskOutboxItem(env, db, row.id, now, fetcher);
    if (outcome === 'completed' || outcome === 'pending' || outcome === 'blocked' || outcome === 'failed') counts[outcome]++;
  }
  return counts;
}

/** Persistent aggregate health: terminal failures must not vanish after one tick. */
export async function salesdeskOutboxHealth(db: D1Database) {
  const counts = { pending: 0, sending: 0, blocked: 0, failed: 0, completed: 0 };
  const rows = await db.prepare('SELECT status,COUNT(*) AS total FROM gpt_salesdesk_outbox GROUP BY status').all<{status: string; total: number}>();
  for (const row of rows.results || []) if (Object.prototype.hasOwnProperty.call(counts, row.status)) counts[row.status as keyof typeof counts] = Number(row.total);
  return counts;
}
