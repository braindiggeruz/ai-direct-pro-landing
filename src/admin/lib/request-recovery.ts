type RequestFailure = Error & { code?: string; status?: number; requestId?: string; causeCode?: string; retryAfterSeconds?: number };

export function parseRetryAfter(value: string | null, now = Date.now()): number | undefined {
  if (value === null) return undefined;
  const seconds = value.trim() ? Number(value) : NaN;
  if (Number.isFinite(seconds)) return Math.max(0, Math.ceil(seconds));
  const date = Date.parse(value);
  // Even an unrecognised explicit backoff must not trigger an immediate retry.
  return Number.isFinite(date) ? Math.max(0, Math.ceil((date - now) / 1000)) : 0;
}

/** Safe metadata only: never expose response bodies, credentials or raw error text. */
export function classifyRequestFailure(failure: unknown, cancelled = false): RequestFailure {
  const original = failure as Partial<RequestFailure> | null;
  const code = cancelled ? 'request_cancelled'
    : typeof original?.code === 'string' ? original.code
      : original?.name === 'AbortError' ? 'request_timeout'
        : original?.name === 'SyntaxError' ? 'response_invalid'
          : original?.name === 'TypeError' ? 'network_unavailable' : 'request_failed';
  return Object.assign(new Error(code), { code, status: original?.status,
    requestId: original?.requestId, causeCode: original?.causeCode, retryAfterSeconds: original?.retryAfterSeconds });
}

export function requestFailureHint(failure: unknown): string {
  const error = classifyRequestFailure(failure);
  const code = error.causeCode ?? error.code;
  const descriptions: Record<string, string> = {
    network_unavailable: 'Нет ответа по сети (LR-NETWORK). Проверьте соединение с сайтом.',
    request_timeout: 'Сервер не ответил за отведённое время (LR-TIMEOUT).',
    request_cancelled: 'Запрос отменён (LR-CANCELLED).',
    response_invalid: 'Получен ответ неожиданного формата (LR-RESPONSE).',
    request_failed: 'Не удалось завершить запрос (LR-REQUEST).',
  };
  const status = Number.isInteger(error.status) && error.status! >= 400 && error.status! <= 599
    ? `Сервер вернул HTTP ${error.status}.` : '';
  const requestId = typeof error.requestId === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(error.requestId)
    ? `Код проверки: ${error.requestId}.` : '';
  return [descriptions[code ?? ''], status, requestId].filter(Boolean).join(' ');
}

/** Retry only these pure reads, once, within the ORIGINAL deadline. Never replay writes. */
export async function withLeadRadarReadRecovery<T>(run: (remainingMs?: number) => Promise<T>, input: {
  method: string; path: string; timeoutMs?: number; signal?: AbortSignal;
  now?: () => number; wait?: (ms: number) => Promise<void>;
}): Promise<T> {
  const now = input.now ?? Date.now;
  const start = now();
  const path = input.path.split('?')[0];
  const allowed = input.method === 'GET' && /^\/api\/admin\/lead-radar(?:\/overview|\/telegram-contacts|\/audiences(?:\/aud_[a-zA-Z0-9_-]+)?)?$/.test(path);
  const timeoutMs = input.timeoutMs ?? (allowed ? 15000 : undefined);
  const remaining = () => timeoutMs ? Math.max(0, timeoutMs - (now() - start)) : undefined;
  try { return await run(remaining()); }
  catch (failure) {
    const error = classifyRequestFailure(failure, input.signal?.aborted);
    const transient = error.code === 'network_unavailable' || [502, 503, 504].includes(error.status ?? 0);
    const budget = remaining();
    if (!allowed || !transient || input.signal?.aborted || error.retryAfterSeconds !== undefined
      || (budget !== undefined && budget <= 1000)) throw error;
    await (input.wait ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))))(500);
    if (input.signal?.aborted) throw classifyRequestFailure(failure, true);
    const nextBudget = remaining();
    if (nextBudget !== undefined && nextBudget <= 0) throw classifyRequestFailure({ name: 'AbortError' });
    try { return await run(nextBudget); }
    catch (retryFailure) { throw classifyRequestFailure(retryFailure, input.signal?.aborted); }
  }
}
