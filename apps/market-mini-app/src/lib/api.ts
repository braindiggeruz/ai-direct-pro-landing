import { telegramInitData } from '../platform/telegram';
import type { MarketLaunch, SessionExchange, VoiceSearchResult } from '../types';
import type { VoiceRecording } from './voice';

// The Mini App is hosted on its own static Pages project. A relative
// production URL would therefore hit the SPA fallback instead of the BFF.
// Keep the canonical BFF hostname as the production-safe default; local
// development may still point at a local Worker through VITE_MARKET_API_BASE_URL.
export const PRODUCTION_MARKET_API_BASE_URL =
  'https://gptbot.uz/api/market/v1';

const baseUrl = (import.meta.env.VITE_MARKET_API_BASE_URL
  ?? (import.meta.env.PROD ? PRODUCTION_MARKET_API_BASE_URL : '/api/market/v1'))
  .replace(/\/$/, '');
let sessionToken = '';
const REQUEST_TIMEOUT_MS = 15_000;
const LAUNCH_TIMEOUT_MS = 15_000;
// Speech recognition owns 12s of this on the server; the rest covers the
// upload of a short recording on a slow mobile link.
const VOICE_TIMEOUT_MS = 25_000;

export class MarketApiError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    public readonly requestId: string | null,
  ) {
    super(code);
    this.name = 'MarketApiError';
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  command?: boolean;
  signal?: AbortSignal;
  timeoutMs?: number;
}

async function fixtureRequest<T>(path: string, options: RequestOptions): Promise<T> {
  const module = await import('../dev/synthetic');
  return module.syntheticRequest<T>(path, options);
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  if (import.meta.env.DEV && import.meta.env.VITE_MARKET_DEV_MODE === 'fixture') {
    return fixtureRequest<T>(path, options);
  }
  const headers = new Headers({ Accept: 'application/json' });
  if (sessionToken) headers.set('Authorization', `Bearer ${sessionToken}`);
  if (options.body !== undefined) headers.set('Content-Type', 'application/json');
  if (options.command) headers.set('Idempotency-Key', crypto.randomUUID());
  let response: Response;
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (options.signal?.aborted) abort();
  else options.signal?.addEventListener('abort', abort, { once: true });
  const timeout = globalThis.setTimeout(
    abort,
    options.timeoutMs ?? REQUEST_TIMEOUT_MS,
  );
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
  } catch {
    throw new MarketApiError('network_error', 0, null);
  } finally {
    globalThis.clearTimeout(timeout);
    options.signal?.removeEventListener('abort', abort);
  }
  if (response.status === 204) return undefined as T;
  const contentType = response.headers.get('Content-Type')?.toLowerCase() ?? '';
  const isJson = contentType.includes('application/json');
  const data = isJson
    ? await response.json().catch(() => ({})) as Record<string, unknown>
    : {};
  if (!response.ok) {
    throw new MarketApiError(
      typeof data.error === 'string' ? data.error : 'network_error',
      response.status,
      typeof data.request_id === 'string' ? data.request_id : null,
    );
  }
  if (!isJson) {
    throw new MarketApiError('invalid_response', 502, null);
  }
  return data as T;
}

export async function exchangeSession(): Promise<SessionExchange> {
  if (import.meta.env.DEV && import.meta.env.VITE_MARKET_DEV_MODE === 'fixture') {
    const session = await fixtureRequest<SessionExchange>('/session/exchange', {
      method: 'POST', body: { initData: 'fixture' },
    });
    sessionToken = session.token;
    return session;
  }
  const initData = telegramInitData();
  if (!initData) throw new MarketApiError('unsupported_environment', 403, null);
  const session = await request<SessionExchange>('/session/exchange', {
    method: 'POST', body: { initData },
  });
  sessionToken = session.token;
  return session;
}

export async function exchangeLaunch(): Promise<MarketLaunch> {
  if (import.meta.env.DEV && import.meta.env.VITE_MARKET_DEV_MODE === 'fixture') {
    const launch = await fixtureRequest<MarketLaunch>('/session/launch', {
      method: 'POST', body: { initData: 'fixture' },
    });
    sessionToken = launch.session.token;
    return launch;
  }
  const initData = telegramInitData();
  if (!initData) throw new MarketApiError('unsupported_environment', 403, null);
  const launch = await request<MarketLaunch>('/session/launch', {
    method: 'POST', body: { initData }, timeoutMs: LAUNCH_TIMEOUT_MS,
  });
  sessionToken = launch.session.token;
  return launch;
}

export const launchQueryOptions = {
  queryKey: ['launch'] as const,
  queryFn: exchangeLaunch,
  retry: (count: number, error: Error) => error instanceof MarketApiError
    ? error.status >= 500 && count < 2
    : count < 2,
  staleTime: Infinity,
  networkMode: 'always' as const,
};

export async function refreshSession(): Promise<SessionExchange> {
  const session = await request<SessionExchange>('/session/refresh', {
    method: 'POST', body: { initData: telegramInitData() },
  });
  sessionToken = session.token;
  return session;
}

export async function setSessionLocale(locale: 'ru' | 'uz'): Promise<void> {
  const response = await request<{ token: string }>('/session/locale', {
    method: 'POST', body: { locale }, command: true,
  });
  sessionToken = response.token;
}

export function clearSession(): void {
  sessionToken = '';
}

export async function fetchMedia(handle: string, signal?: AbortSignal): Promise<string> {
  if (import.meta.env.DEV && import.meta.env.VITE_MARKET_DEV_MODE === 'fixture') {
    return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 3"><rect width="4" height="3" fill="#e8dccb"/><path d="M.5 2.5 1.5 1.3l.7.7.5-.5.8 1z" fill="#0b3b36"/></svg>`)}`;
  }
  const response = await fetch(`${baseUrl}/media/${encodeURIComponent(handle)}`, {
    headers: { Authorization: `Bearer ${sessionToken}` }, signal,
  });
  if (!response.ok) throw new MarketApiError('resource_not_found', response.status, null);
  return URL.createObjectURL(await response.blob());
}

/**
 * Uploads one recording as a raw audio body. The blob is sent once and then
 * dropped: nothing is written to storage, and the bearer stays in the header
 * exactly as for every other Market call.
 */
export async function voiceSearch(
  recording: VoiceRecording,
  signal?: AbortSignal,
): Promise<VoiceSearchResult> {
  if (import.meta.env.DEV && import.meta.env.VITE_MARKET_DEV_MODE === 'fixture') {
    return fixtureRequest<VoiceSearchResult>('/voice/search', { method: 'POST' });
  }
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  else signal?.addEventListener('abort', abort, { once: true });
  const timeout = globalThis.setTimeout(abort, VOICE_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(
      `${baseUrl}/voice/search?durationMs=${Math.round(recording.durationMs)}`,
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': recording.mimeType,
          ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
        },
        body: recording.blob,
        signal: controller.signal,
      },
    );
  } catch {
    throw new MarketApiError('network_error', 0, null);
  } finally {
    globalThis.clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
  const data = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    throw new MarketApiError(
      typeof data.error === 'string' ? data.error : 'network_error',
      response.status,
      typeof data.request_id === 'string' ? data.request_id : null,
    );
  }
  return data as unknown as VoiceSearchResult;
}

export const marketApi = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>(path, { signal }),
  post: <T>(path: string, body?: unknown) => request<T>(path, {
    method: 'POST', body, command: true,
  }),
  put: <T>(path: string, body: unknown) => request<T>(path, {
    method: 'PUT', body, command: true,
  }),
  patch: <T>(path: string, body: unknown) => request<T>(path, {
    method: 'PATCH', body, command: true,
  }),
  delete: <T>(path: string) => request<T>(path, {
    method: 'DELETE', command: true,
  }),
};
