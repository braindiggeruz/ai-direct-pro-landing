// Privacy: we NEVER store raw IPs. hashedIp = SHA-256(ip + salt), hex.
// Deterministic per (ip, salt) so daily/hourly quota rows collate correctly.

export async function hashIp(ip: string | undefined, salt: string): Promise<string> {
  const input = `${ip || 'unknown'}${salt}`;
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Cloudflare-provided real client IP; falls back to X-Forwarded-For head. */
export function getClientIp(request: Request): string | undefined {
  return (
    request.headers.get('CF-Connecting-IP') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    undefined
  );
}
