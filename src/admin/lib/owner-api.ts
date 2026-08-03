// API client for the P3.1 Owner Control Center.
//
// Separate from `api` in ./api so the platform-owner surface has its own thin
// wrapper and its own error shape (a closed-list token plus a request id),
// instead of widening the SEO admin client.
import { getToken, setToken } from './api';
import type {
  OwnerAuditAction,
  OwnerAuditEvent,
  OwnerAutomationJobRow,
  OwnerHandoffRow,
  OwnerMutationResult,
  OwnerOrderRow,
  OwnerOverviewResponse,
  OwnerPilotRecord,
  OwnerReasonCode,
  OwnerStoreSummary,
} from '../../shared/owner-control-center';

const BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') || '';

export interface OwnerApiError extends Error {
  code: string;
  requestId: string | null;
  status: number;
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (res.status === 401) {
    setToken(null);
    window.location.assign('/admin-tools/login');
    throw Object.assign(new Error('missing_token'), {
      code: 'missing_token',
      requestId: res.headers.get('x-request-id'),
      status: 401,
    }) as OwnerApiError;
  }

  if (!res.ok) {
    let code = `http_${res.status}`;
    try {
      const parsed = await res.json() as { error?: unknown };
      if (typeof parsed.error === 'string') code = parsed.error;
    } catch { /* a non-JSON error body stays the generic code */ }
    throw Object.assign(new Error(code), {
      code,
      requestId: res.headers.get('x-request-id'),
      status: res.status,
    }) as OwnerApiError;
  }

  return res.json() as Promise<T>;
}

function query(params: Record<string, string | number | null | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '') continue;
    search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

export interface OwnerMutationInput {
  reasonCode: OwnerReasonCode;
  idempotencyKey: string;
  confirmation?: string;
}

function mutationBody(input: OwnerMutationInput): Record<string, unknown> {
  return {
    reason_code: input.reasonCode,
    idempotency_key: input.idempotencyKey,
    ...(input.confirmation === undefined ? {} : { confirmation: input.confirmation }),
  };
}

export const ownerApi = {
  overview: () => call<OwnerOverviewResponse>('GET', '/api/admin/agents/overview'),

  stores: (opts: { limit?: number; offset?: number; status?: string; pilotState?: string } = {}) =>
    call<{ stores: OwnerStoreSummary[]; count: number }>(
      'GET',
      `/api/admin/agents/stores${query({
        limit: opts.limit, offset: opts.offset, status: opts.status, pilot_state: opts.pilotState,
      })}`,
    ),

  store: (storeId: string) =>
    call<{
      store: OwnerStoreSummary;
      recent_orders: OwnerOrderRow[];
      recent_handoffs: OwnerHandoffRow[];
      audit_trail: OwnerAuditEvent[];
    }>('GET', `/api/admin/agents/stores/${encodeURIComponent(storeId)}`),

  suspendStore: (storeId: string, input: OwnerMutationInput) =>
    call<OwnerMutationResult & { store: OwnerStoreSummary }>(
      'POST',
      `/api/admin/agents/stores/${encodeURIComponent(storeId)}/suspend`,
      mutationBody(input),
    ),

  restoreStore: (storeId: string, input: OwnerMutationInput) =>
    call<OwnerMutationResult & { store: OwnerStoreSummary }>(
      'POST',
      `/api/admin/agents/stores/${encodeURIComponent(storeId)}/restore`,
      mutationBody(input),
    ),

  orders: (opts: { limit?: number; offset?: number; status?: string; storeId?: string } = {}) =>
    call<{ orders: OwnerOrderRow[]; count: number; projection: string }>(
      'GET',
      `/api/admin/agents/orders${query({
        limit: opts.limit, offset: opts.offset, status: opts.status, store_id: opts.storeId,
      })}`,
    ),

  handoffs: (opts: { limit?: number; offset?: number; status?: string; storeId?: string } = {}) =>
    call<{ handoffs: OwnerHandoffRow[]; count: number; projection: string }>(
      'GET',
      `/api/admin/agents/handoffs${query({
        limit: opts.limit, offset: opts.offset, status: opts.status, store_id: opts.storeId,
      })}`,
    ),

  automation: (opts: { limit?: number; offset?: number; status?: string } = {}) =>
    call<{
      jobs: OwnerAutomationJobRow[];
      totals: Record<string, number>;
      failed: number;
      retrying: number;
      first_party_automation_enabled: boolean;
    }>('GET', `/api/admin/agents/automation${query({
      limit: opts.limit, offset: opts.offset, status: opts.status,
    })}`),

  replayJob: (jobId: string, input: OwnerMutationInput) =>
    call<OwnerMutationResult & { job: OwnerAutomationJobRow | null }>(
      'POST',
      '/api/admin/agents/automation/replay',
      { job_id: jobId, ...mutationBody(input) },
    ),

  audit: (opts: {
    limit?: number;
    offset?: number;
    action?: OwnerAuditAction;
    targetId?: string;
    actorEmail?: string;
    actorRole?: string;
  } = {}) =>
    call<{ events: OwnerAuditEvent[]; total: number; append_only: true }>(
      'GET',
      `/api/admin/agents/audit${query({
        limit: opts.limit,
        offset: opts.offset,
        action: opts.action,
        target_id: opts.targetId,
        actor_email: opts.actorEmail,
        actor_role: opts.actorRole,
      })}`,
    ),

  pilot: (opts: { limit?: number; offset?: number; state?: string } = {}) =>
    call<{ pilot: OwnerPilotRecord[]; count: number; r1_target_stores: string }>(
      'GET',
      `/api/admin/agents/pilot${query({ limit: opts.limit, offset: opts.offset, state: opts.state })}`,
    ),

  /**
   * Mint the one-time code that lets a Telegram account claim seller authority.
   *
   * The only argument is the canary key, and it still names nothing: the target
   * store is resolved server-side from the owner's own authorization, so there
   * is no field here that could point the grant at a different store. The key
   * is the operator proving this is the one ceremony that was approved, not a
   * selector — it is required only while the global switch is off, it is folded
   * into a digest the server already holds, and it is not stored anywhere on
   * this side.
   *
   * The response carries the raw code exactly once. It is never written down by
   * us: the table holds its SHA-256, so nothing can hand it back afterwards.
   */
  createSellerBindingChallenge: (canary?: string) =>
    call<{
      challenge: string;
      expiresAt: string;
      storeName: string;
      instructions: string;
    }>('POST', '/api/admin/seller-binding/challenge', canary ? { canary } : undefined),

  setPilot: (
    storeId: string,
    operation: 'activate' | 'pause',
    input: OwnerMutationInput,
  ) =>
    call<OwnerMutationResult & { pilot: OwnerPilotRecord | null }>(
      'POST',
      '/api/admin/agents/pilot',
      { store_id: storeId, operation, ...mutationBody(input) },
    ),
};
