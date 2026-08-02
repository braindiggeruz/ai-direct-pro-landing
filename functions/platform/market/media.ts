const MEDIA_HANDLE_VERSION = 1;
const MAX_MEDIA_BYTES = 10 * 1024 * 1024;

export interface MarketMediaHandle {
  productId: string;
  index: number;
}

function encode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decode(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
      + '='.repeat((4 - value.length % 4) % 4);
    return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

async function key(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

export async function issueMediaHandle(
  secret: string,
  input: MarketMediaHandle,
): Promise<string> {
  const payload = encode(new TextEncoder().encode(JSON.stringify({
    v: MEDIA_HANDLE_VERSION,
    p: input.productId,
    i: input.index,
  })));
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      'HMAC',
      await key(secret),
      new TextEncoder().encode(payload),
    ),
  ).slice(0, 16);
  return `${payload}.${encode(signature)}`;
}

export async function verifyMediaHandle(
  secret: string,
  handle: string,
): Promise<MarketMediaHandle | null> {
  const [payload, encodedSignature, extra] = handle.split('.');
  if (!payload || !encodedSignature || extra) return null;
  const signature = decode(encodedSignature);
  const bytes = decode(payload);
  if (!signature || signature.length !== 16 || !bytes) return null;
  const expected = new Uint8Array(
    await crypto.subtle.sign(
      'HMAC',
      await key(secret),
      new TextEncoder().encode(payload),
    ),
  ).slice(0, 16);
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) {
    difference |= expected[index] ^ signature[index];
  }
  if (difference !== 0) return null;
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
  const parsed = value as Record<string, unknown>;
  if (
    !parsed
    || parsed.v !== MEDIA_HANDLE_VERSION
    || typeof parsed.p !== 'string'
    || !/^[a-z0-9][a-z0-9._-]{0,119}$/.test(parsed.p)
    || !Number.isInteger(parsed.i)
    || Number(parsed.i) < 0
    || Number(parsed.i) > 7
  ) {
    return null;
  }
  return { productId: parsed.p, index: Number(parsed.i) };
}

export async function proxyTelegramMedia(
  botToken: string,
  fileId: string,
): Promise<Response | null> {
  const metadata = await fetch(`https://api.telegram.org/bot${botToken}/getFile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file_id: fileId }),
    redirect: 'error',
  });
  if (!metadata.ok) return null;
  const body = await metadata.json() as {
    ok?: boolean;
    result?: { file_path?: string; file_size?: number };
  };
  const path = body.result?.file_path;
  const declared = body.result?.file_size;
  if (
    body.ok !== true
    || typeof path !== 'string'
    || !/^[A-Za-z0-9_./-]{1,240}$/.test(path)
    || path.includes('..')
    || (declared !== undefined && declared > MAX_MEDIA_BYTES)
  ) {
    return null;
  }
  const upstream = await fetch(
    `https://api.telegram.org/file/bot${botToken}/${path}`,
    { redirect: 'error' },
  );
  const contentType = upstream.headers.get('Content-Type') ?? '';
  const contentLength = Number(upstream.headers.get('Content-Length') ?? 0);
  if (
    !upstream.ok
    || !/^image\/(?:jpeg|png|webp|gif)$/i.test(contentType)
    || (Number.isFinite(contentLength) && contentLength > MAX_MEDIA_BYTES)
  ) {
    return null;
  }
  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'private, max-age=300',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

export const MARKET_MEDIA_MAX_BYTES = MAX_MEDIA_BYTES;
