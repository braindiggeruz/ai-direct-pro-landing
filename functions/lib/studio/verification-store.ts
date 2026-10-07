import { STUDIO_ORG } from "./schema";
import { ensureStudioOperationsSchema } from "./operations-schema";

export const VERIFICATION_LEASE_MS = 7_000; // Siteverify times out after 5 s.
export const VERIFICATION_IP_CONCURRENCY = 4;
export const VERIFICATION_SITE_CONCURRENCY = 32;

export class VerificationStore {
  constructor(readonly db: D1Database, readonly org = STUDIO_ORG) {}
  async claim(address: string, tokenHash: string, now = Date.now()): Promise<string | null> {
    await ensureStudioOperationsSchema(this.db);
    // Keep consumed tokens through Turnstile's five-minute lifetime. Cleanup
    // is bounded and cannot extend a neighbour's lease or retain raw tokens.
    await this.db.prepare("DELETE FROM studio_verifications WHERE rowid IN (SELECT rowid FROM studio_verifications WHERE org_id=? AND expires_at<=? LIMIT 100)").bind(this.org, now).run();
    const id = crypto.randomUUID();
    const row = await this.db.prepare(`INSERT INTO studio_verifications(org_id,id,address,token_hash,lease_until,expires_at)
      SELECT ?,?,?,?,?,? WHERE
      (SELECT COUNT(*) FROM studio_verifications WHERE org_id=? AND lease_until>?)<? AND
      (SELECT COUNT(*) FROM studio_verifications WHERE org_id=? AND address=? AND lease_until>?)<?
      ON CONFLICT(org_id,token_hash) DO NOTHING RETURNING id`)
      .bind(this.org, id, address, tokenHash, now + VERIFICATION_LEASE_MS, now + 600_000, this.org, now, VERIFICATION_SITE_CONCURRENCY, this.org, address, now, VERIFICATION_IP_CONCURRENCY).first<{id: string}>();
    return row?.id ?? null;
  }
  async release(id: string): Promise<void> {
    await this.db.prepare("UPDATE studio_verifications SET lease_until=0 WHERE org_id=? AND id=?").bind(this.org, id).run();
  }
}

export async function challengeHash(secret: string, token: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(`studio-challenge-v1:${token}`));
  return Array.from(new Uint8Array(mac), n => n.toString(16).padStart(2,"0")).join("");
}
