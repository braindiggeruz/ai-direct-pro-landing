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

export function genId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;
}
