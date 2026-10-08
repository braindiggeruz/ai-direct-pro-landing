/** Durable trial allowance, independent of the 93-day turn telemetry retention. */
export const FREE_TRIAL_LIMIT = 3;
// Longer than the upstream's whole-call deadline (60 s + bounded fallback).
// Orphaned work eventually frees a slot; successful usage never expires.
export const TRIAL_LEASE_MS = 10 * 60_000;
export const TRIAL_DDL = [
  `CREATE TABLE IF NOT EXISTS gpt_trial_usage (org_id TEXT NOT NULL, identity_key TEXT NOT NULL, used INTEGER NOT NULL DEFAULT 0 CHECK(used BETWEEN 0 AND 3), updated_at INTEGER NOT NULL, PRIMARY KEY(org_id,identity_key))`,
  `CREATE INDEX IF NOT EXISTS idx_gpt_turn_trial ON gpt_turn_reservations(org_id,trial_key,status,expires_at)`,
  `CREATE TRIGGER IF NOT EXISTS gpt_trial_settle AFTER UPDATE OF status ON gpt_turn_reservations
   WHEN OLD.status='reserved' AND NEW.status='done' AND NEW.period_id IS NULL AND NEW.trial_key IS NOT NULL
   BEGIN
     INSERT INTO gpt_trial_usage(org_id,identity_key,used,updated_at) VALUES(NEW.org_id,NEW.trial_key,1,NEW.created_at)
       ON CONFLICT(org_id,identity_key) DO UPDATE SET used=MIN(3,used+1),updated_at=excluded.updated_at;
     INSERT INTO gpt_trial_usage(org_id,identity_key,used,updated_at)
       SELECT NEW.org_id,NEW.subject,1,NEW.created_at WHERE NEW.subject<>NEW.trial_key
       ON CONFLICT(org_id,identity_key) DO UPDATE SET used=MIN(3,used+1),updated_at=excluded.updated_at;
   END`,
];

/** Binds: org, key, org, key, key, now. Used inside the SAME admission INSERT. */
export const TRIAL_COUNT_SQL = `(COALESCE((SELECT used FROM gpt_trial_usage WHERE org_id=? AND identity_key=?),0)
  +(SELECT COUNT(*) FROM gpt_turn_reservations WHERE org_id=? AND (trial_key=? OR subject=?)
    AND trial_key IS NOT NULL AND status='reserved' AND expires_at>?))`;

export class TrialStore {
  constructor(readonly db: D1Database, readonly org: string) {}
  keys(device: string, subject: string) { return [...new Set([device, subject])]; }
  guards(device: string, subject: string, now: number) {
    return { sql: this.keys(device, subject).map(() => `${TRIAL_COUNT_SQL}<${FREE_TRIAL_LIMIT}`),
      binds: this.keys(device, subject).flatMap(key => [this.org, key, this.org, key, key, now]) };
  }
  /** Link current browser and retained account history. Never invent an IP user's history. */
  async initialize(device: string, subject: string, now = Date.now()) {
    if (subject === device) return;
    await this.db.prepare(`INSERT INTO gpt_trial_usage(org_id,identity_key,used,updated_at)
      SELECT ?,?,MIN(3,MAX(
        COALESCE((SELECT used FROM gpt_trial_usage WHERE org_id=? AND identity_key=?),0),
        (SELECT COUNT(*) FROM gpt_turn_reservations WHERE org_id=? AND subject=? AND status='done' AND period_id IS NULL AND id NOT LIKE 'acct-free:%'))),?
      ON CONFLICT(org_id,identity_key) DO UPDATE SET used=MAX(used,excluded.used),updated_at=excluded.updated_at`)
      .bind(this.org, subject, this.org, device, this.org, subject, now).run();
    // Signing out in the same browser must not give back its account's used trial.
    await this.db.prepare(`INSERT INTO gpt_trial_usage(org_id,identity_key,used,updated_at)
      SELECT org_id,?,used,? FROM gpt_trial_usage WHERE org_id=? AND identity_key=?
      ON CONFLICT(org_id,identity_key) DO UPDATE SET used=MAX(used,excluded.used),updated_at=excluded.updated_at`)
      .bind(device, now, this.org, subject).run();
  }
  async summary(device: string, subject: string, now = Date.now()) {
    const keys = this.keys(device, subject);
    const rows = await Promise.all(keys.map(key => this.db.prepare(`SELECT
      COALESCE((SELECT used FROM gpt_trial_usage WHERE org_id=? AND identity_key=?),0) AS used,
      ${TRIAL_COUNT_SQL} AS occupied`).bind(this.org, key, this.org, key, this.org, key, key, now)
      .first<{ used: number; occupied: number }>()));
    const used = Math.max(0, ...rows.map(row => row?.used ?? 0));
    const occupied = Math.max(used, ...rows.map(row => row?.occupied ?? 0));
    return { limit: FREE_TRIAL_LIMIT, used, remaining: Math.max(0, FREE_TRIAL_LIMIT - used),
      available: Math.max(0, FREE_TRIAL_LIMIT - occupied), resets: 'never' as const };
  }
}
