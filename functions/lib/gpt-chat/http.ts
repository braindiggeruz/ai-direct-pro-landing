// Small HTTP helpers shared by the /api/gpt/* + /api/payments/* handlers.
// Never leak stack traces to the client; always no-store.

export function json(
  data: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
      ...extraHeaders,
    },
  });
}

/** Friendly error envelope. `code` is a stable machine tag for the client. */
export function fail(
  code: string,
  message: string,
  status = 400,
  extra: Record<string, unknown> = {},
): Response {
  return json({ ok: false, code, message, ...extra }, status);
}

export async function readJson<T = Record<string, unknown>>(
  request: Request,
): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

export async function readJsonLimited<T>(
  request: Request,
  maxBytes: number,
): Promise<
  { ok: true; value: T } | { ok: false; code: "bad_json" | "payload_too_large" }
> {
  const text = await readTextLimited(request, maxBytes);
  if (!text.ok) return text;
  try { return { ok: true, value: JSON.parse(text.value) as T }; }
  catch { return { ok: false, code: 'bad_json' }; }
}

export async function readTextLimited(request: Request, maxBytes: number): Promise<
  { ok: true; value: string } | { ok: false; code: 'bad_json' | 'payload_too_large' }
> {
  const declared = Number(request.headers.get("content-length") || "0");
  if (Number.isFinite(declared) && declared > maxBytes)
    return { ok: false, code: "payload_too_large" };
  try {
    if (!request.body) return { ok: false, code: "bad_json" };
    const reader = request.body.getReader();
    const decoder = new TextDecoder();
    let bytes = 0;
    let raw = "";
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > maxBytes) {
          await reader.cancel();
          return { ok: false, code: "payload_too_large" };
        }
        raw += decoder.decode(value, { stream: true });
      }
      raw += decoder.decode();
    } finally {
      reader.releaseLock();
    }
    return { ok: true, value: raw };
  } catch {
    return { ok: false, code: "bad_json" };
  }
}

export function genId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
}
