/** Kept only in memory: the fingerprint can contain contact details. Never log or persist it. */
export interface LeadRequestAttempt {
  requestId: string;
  fingerprint: string;
}

/**
 * One key for the submitted details, not just the contact. A retry after an
 * uncertain result reuses it; changed details cannot masquerade as a replay.
 * Standalone so the prerendered page form can embed this same implementation.
 */
export function prepareLeadRequest(
  payload: object,
  previous: LeadRequestAttempt | null,
  prefix: string,
): LeadRequestAttempt {
  const fingerprint = JSON.stringify(payload, function (_key, value: unknown) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const sorted: Record<string, unknown> = {};
      for (const field of Object.keys(value).sort()) {
        // The root is sorted before the replacer visits its children.
        if (value === payload && (field === 'requestId' || field === 'turnstileToken')) continue;
        sorted[field] = (value as Record<string, unknown>)[field];
      }
      return sorted;
    }
    return value;
  });
  if (previous?.fingerprint === fingerprint) return previous;
  let random: string;
  try {
    random = crypto.randomUUID().replace(/-/g, '');
  } catch {
    random = `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
  }
  return { requestId: `${prefix}_${random}`.padEnd(24, '0').slice(0, 80), fingerprint };
}

/**
 * Only lead submissions use this deadline; long-running chat calls are unchanged.
 * Race the whole response (including JSON) so a stalled body also unlocks the UI.
 * Aborting a connection cannot prove that the server did not store the lead.
 */
export async function postLeadJson<T>(
  url: string,
  payload: object,
  fetcher: typeof fetch = fetch,
  timeoutMs = 18_000,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      const error = new Error('lead_timeout');
      error.name = 'LeadTimeoutError';
      reject(error);
      controller.abort();
    }, timeoutMs);
  });
  try {
    return await Promise.race([
      fetcher(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(payload),
        signal: controller.signal,
      }).then((response) => response.json() as Promise<T>),
      deadline,
    ]);
  } finally {
    clearTimeout(timer);
  }
}
