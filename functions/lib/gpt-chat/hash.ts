// Privacy: we NEVER store raw IPs. hashedIp = SHA-256(ip + salt), hex.
// Deterministic per (ip, salt) so daily/hourly quota rows collate correctly.

/** SHA-256 of a string as lowercase hex. */
export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function hashIp(ip: string | undefined, salt: string): Promise<string> {
  return sha256Hex(`${ip || 'unknown'}${salt}`);
}

/** Cloudflare-provided real client IP; falls back to X-Forwarded-For head. */
export function getClientIp(request: Request): string | undefined {
  return (
    request.headers.get('CF-Connecting-IP') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    undefined
  );
}
