const SIGNATURE_PREFIX = 'sha256=';

function hexBytes(value: string): Uint8Array | null {
  if (!/^[a-f0-9]{64}$/i.test(value)) return null;
  const bytes = new Uint8Array(32);
  for (let index = 0; index < value.length; index += 2) {
    bytes[index / 2] = Number.parseInt(value.slice(index, index + 2), 16);
  }
  return bytes;
}

export async function verifyBunzySignature(
  rawBody: ArrayBuffer,
  secret: string,
  signatureHeader: string | null,
): Promise<boolean> {
  if (!secret || !signatureHeader?.startsWith(SIGNATURE_PREFIX)) return false;
  const signature = hexBytes(signatureHeader.slice(SIGNATURE_PREFIX.length));
  if (!signature) return false;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  return crypto.subtle.verify('HMAC', key, signature, rawBody);
}

export async function sha256Hex(rawBody: ArrayBuffer): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', rawBody));
  return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
