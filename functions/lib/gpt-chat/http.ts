// Small HTTP helpers shared by the /api/gpt/* + /api/payments/* handlers.
// Never leak stack traces to the client; always no-store.

export function json(data: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      ...extraHeaders,
    },
  });
}

/** Friendly error envelope. `code` is a stable machine tag for the client. */
export function fail(code: string, message: string, status = 400, extra: Record<string, unknown> = {}): Response {
  return json({ ok: false, code, message, ...extra }, status);
}

export async function readJson<T = Record<string, unknown>>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

export async function readJsonLimited<T>(
  request: Request,
  maxBytes: number,
): Promise<{ ok: true; value: T } | { ok: false; code: 'bad_json' | 'payload_too_large' }> {
  const declared = Number(request.headers.get('content-length') || '0');
  if (Number.isFinite(declared) && declared > maxBytes) return { ok: false, code: 'payload_too_large' };
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > maxBytes) return { ok: false, code: 'payload_too_large' };
    return { ok: true, value: JSON.parse(raw) as T };
  } catch {
    return { ok: false, code: 'bad_json' };
  }
}

export function genId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;
}
