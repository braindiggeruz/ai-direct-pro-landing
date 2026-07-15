// Privacy helpers. Never store raw IP / anon token — only salted SHA-256.
import { createHash, randomUUID } from 'node:crypto';

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export function hashIp(ip: string | undefined, salt: string): string {
  return sha256Hex(`${ip || 'unknown'}${salt}`);
}

export function hashToken(token: string, salt: string): string {
  return sha256Hex(`${token}${salt}`);
}

export function newAnonToken(): string {
  return randomUUID().replace(/-/g, '');
}

/** Best client IP from proxy chain (Cloudflare gateway forwards it). */
export function clientIp(headers: Record<string, string | string[] | undefined>): string | undefined {
  const h = (k: string) => {
    const v = headers[k];
    return Array.isArray(v) ? v[0] : v;
  };
  return (
    h('cf-connecting-ip') ||
    h('x-forwarded-for')?.split(',')[0]?.trim() ||
    h('x-real-ip') ||
    undefined
  );
}
